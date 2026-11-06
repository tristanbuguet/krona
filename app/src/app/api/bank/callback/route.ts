import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

import {
  authorizeOrGetSession,
  fetchTransactions,
  fetchAccountBalance,
  normalizeEnableBankingTransactions,
  formatBankDisplayName,
  computeBankRefreshQuota,
  ENABLE_BANKING_DEFAULT_ASPSP,
} from "@/lib/enableBanking";
import { executeBankIngestionPipeline } from "@/lib/bankPipeline";
import { getSql, ensureUserSyncTable } from "@/lib/db";
import {
  UserFinancialPayload,
  mergeCloudAndLocalData,
  normalizeUserFinancialPayload,
} from "@/lib/cloudSync";
import { AccountInfo, BankSessionInfo, Transaction } from "@/lib/types";
import { RawTransaction } from "@/lib/lclParser";

const DATA_DIR = path.join(process.cwd(), ".krona-cloud");
const STORE_FILE = path.join(DATA_DIR, "users-cloud-store.json");

function readLocalCloudStore(): Record<string, UserFinancialPayload> {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, UserFinancialPayload>;
  } catch {
    return {};
  }
}

function writeLocalCloudStore(store: Record<string, UserFinancialPayload>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tmpFile, STORE_FILE);
  } catch {
    // Ignore local write errors
  }
}

function parseStateMetadata(stateStr: string): { userId?: string; aspspTitle?: string } {
  if (!stateStr || stateStr.startsWith("krona_")) {
    return {};
  }
  try {
    const decoded = Buffer.from(stateStr, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded) as { userId?: string; aspspTitle?: string };
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin || "http://localhost:3000";

  try {
    const code = (req.nextUrl.searchParams.get("code") || "").trim();
    const directSessionId = (
      req.nextUrl.searchParams.get("session_id") ||
      req.nextUrl.searchParams.get("sessionId") ||
      ""
    ).trim();
    const stateParam = (req.nextUrl.searchParams.get("state") || "").trim();
    const errorParam = (req.nextUrl.searchParams.get("error") || "").trim();

    if (errorParam) {
      const redirectErrUrl = new URL("/", origin);
      redirectErrUrl.searchParams.set("bank_linked", "false");
      redirectErrUrl.searchParams.set("bank_error", errorParam);
      return NextResponse.redirect(redirectErrUrl);
    }

    if (!code && !directSessionId) {
      const redirectErrUrl = new URL("/", origin);
      redirectErrUrl.searchParams.set("bank_linked", "false");
      redirectErrUrl.searchParams.set("bank_error", "missing_code");
      return NextResponse.redirect(redirectErrUrl);
    }

    const sessionData = code
      ? await authorizeOrGetSession(code, true)
      : await authorizeOrGetSession(directSessionId, false);

    const stateMeta = parseStateMetadata(stateParam);
    const rawUserId = (
      stateMeta.userId ||
      req.nextUrl.searchParams.get("userId") ||
      req.headers.get("x-krona-user-id") ||
      ""
    ).trim();

    const isGuest = !rawUserId;
    const userId = rawUserId || "guest_sandbox_user";

    const rawAspspName = sessionData.aspsp?.name || stateMeta.aspspTitle || ENABLE_BANKING_DEFAULT_ASPSP;
    const firstAccName = sessionData.accounts[0]?.name || "";
    const aspspName = formatBankDisplayName(rawAspspName, firstAccName);
    const aspspCountry = sessionData.aspsp?.country || "FR";
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const accountBalances = new Map<string, number>();
    for (const acc of sessionData.accounts) {
      const bal = await fetchAccountBalance(acc.uid);
      if (bal !== null) {
        accountBalances.set(acc.uid, bal);
      }
    }

    const mappedAccounts = sessionData.accounts.map((acc) => ({
      uid: acc.uid,
      iban: acc.account_id?.iban || acc.account_id?.other?.identification,
      name: acc.name || `Compte ${aspspName}`,
      currency: acc.currency || "EUR",
      balance: accountBalances.get(acc.uid),
    }));

    // Récupérer l'état actuel de l'utilisateur pour fusionner sans perte et préserver le quota existant
    const sql = getSql();
    let existingCloud: Partial<UserFinancialPayload> | null = null;

    if (sql) {
      await ensureUserSyncTable(sql);
      const rows = await sql.query(
        "SELECT data FROM user_sync WHERE user_id = $1 LIMIT 1;",
        [userId]
      );
      if (rows.length > 0) {
        const row = rows[0] as unknown as { data: unknown };
        existingCloud = (
          typeof row.data === "string" ? JSON.parse(row.data) : row.data
        ) as Partial<UserFinancialPayload>;
      }
    } else {
      const store = readLocalCloudStore();
      existingCloud = store[userId] || null;
    }

    const prevSession = existingCloud?.bankSession || existingCloud?.settings?.bankSession || null;
    const prevTimestamps = prevSession?.refreshTimestamps || prevSession?.refreshQuota?.timestamps || [];
    const currentQuota = computeBankRefreshQuota(prevTimestamps, nowMs);

    const bankSession: BankSessionInfo = {
      sessionId: sessionData.session_id,
      aspspName,
      aspspCountry,
      accounts: mappedAccounts,
      connectedAt: nowIso,
      lastSyncedAt: nowIso,
      refreshTimestamps: currentQuota.timestamps,
      refreshQuota: currentQuota,
    };

    const kronaAccounts: AccountInfo[] = mappedAccounts.map((acc) => {
      const ibanSuffix = acc.iban ? `•••• ${acc.iban.slice(-4)}` : "•••• BOURSOBANK";
      const bankBrand: AccountInfo["bank"] = aspspName.toLowerCase().includes("agricole")
        ? "Crédit Agricole"
        : aspspName.toLowerCase().includes("epargne")
          ? "Caisse d'Épargne"
          : aspspName.toLowerCase().includes("lcl")
            ? "LCL"
            : "BoursoBank";

      return {
        id: `eb_acc_${acc.uid}`,
        name: acc.name || `Compte ${aspspName}`,
        bank: bankBrand,
        type: "Compte courant",
        accountNumber: ibanSuffix,
        initialBalance: acc.balance ?? 0,
        updatedAt: nowIso,
      };
    });

    // 1. Déclencher immédiatement l'aspiration des transactions pour tous les comptes
    const rawTransactionsList: RawTransaction[] = [];
    for (const acc of sessionData.accounts) {
      try {
        const ebTxs = await fetchTransactions(sessionData.session_id, acc.uid);
        const normalizedBatch = normalizeEnableBankingTransactions(ebTxs, aspspName);
        rawTransactionsList.push(...normalizedBatch);
      } catch (fetchErr) {
        console.warn(`[Enable Banking Callback] fetchTransactions (${acc.uid}):`, fetchErr);
      }
    }

    const existingTransactions: Transaction[] = existingCloud?.transactions || [];
    const existingRules = existingCloud?.learningRules || existingCloud?.merchantKnowledge || {};

    // 2. Passer l'ensemble des transactions dans le pipeline standard
    const isSandboxSession = rawAspspName.toLowerCase().includes("mock") || rawAspspName.toLowerCase().includes("sandbox");
    const pipelineResult = await executeBankIngestionPipeline({
      rawTransactions: rawTransactionsList,
      existingTransactions,
      learningRules: existingRules,
      aspspLabel: aspspName,
      enableSandboxFallback: isSandboxSession,
      skipAiEnrichment: true,
    });

    const incomingUpdate: Partial<UserFinancialPayload> = {
      transactions: pipelineResult.allMergedTransactions,
      accounts: kronaAccounts,
      learningRules: pipelineResult.learningRules,
      bankSession,
      settings: {
        monthlyCap: null,
        monthlyLimitConfig: { type: "amount", value: 0 },
        incomeSettings: { salary: 0, aids: 0, autoApply: false },
        categoryBudgets: {},
        bankSession,
      },
    };

    const mergedPayload = existingCloud
      ? mergeCloudAndLocalData(incomingUpdate, existingCloud)
      : normalizeUserFinancialPayload(incomingUpdate);

    mergedPayload.bankSession = bankSession;
    mergedPayload.settings.bankSession = bankSession;
    mergedPayload.learningRules = pipelineResult.learningRules;
    mergedPayload.merchantKnowledge = pipelineResult.learningRules;

    // 3. Persistance dans la base Neon PostgreSQL (ou fallback store)
    if (sql) {
      await sql.query(
        `INSERT INTO user_sync (user_id, email, data, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id)
         DO UPDATE SET
           data = EXCLUDED.data,
           updated_at = CURRENT_TIMESTAMP;`,
        [userId, null, JSON.stringify(mergedPayload)]
      );
    } else {
      const store = readLocalCloudStore();
      store[userId] = mergedPayload;
      writeLocalCloudStore(store);
    }

    const firstAccountUid = mappedAccounts[0]?.uid || "";
    const redirectSuccessUrl = new URL("/", origin);
    redirectSuccessUrl.searchParams.set("bank_linked", "true");
    redirectSuccessUrl.searchParams.set("bank_connected", "true");
    redirectSuccessUrl.searchParams.set("session_id", sessionData.session_id);
    if (firstAccountUid) {
      redirectSuccessUrl.searchParams.set("account_id", firstAccountUid);
    }
    if (isGuest) {
      redirectSuccessUrl.searchParams.set("is_guest", "true");
    }

    return NextResponse.redirect(redirectSuccessUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "callback_failed";
    const redirectErrUrl = new URL("/", origin);
    redirectErrUrl.searchParams.set("bank_linked", "false");
    redirectErrUrl.searchParams.set("bank_error", message);
    return NextResponse.redirect(redirectErrUrl);
  }
}
