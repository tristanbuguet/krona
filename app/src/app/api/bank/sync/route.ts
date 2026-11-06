import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

import {
  fetchTransactions,
  fetchAccountBalance,
  authorizeOrGetSession,
  normalizeEnableBankingTransactions,
  formatBankDisplayName,
  computeBankRefreshQuota,
  consumeBankRefreshQuota,
} from "@/lib/enableBanking";
import { executeBankIngestionPipeline } from "@/lib/bankPipeline";
import { Transaction, BankSessionInfo, AccountInfo } from "@/lib/types";
import {
  UserFinancialPayload,
  LearningRuleMap,
  mergeCloudAndLocalData,
  normalizeUserFinancialPayload,
} from "@/lib/cloudSync";
import { getSql, ensureUserSyncTable } from "@/lib/db";
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

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      const parsed = (await req.json()) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object") {
        body = parsed;
      }
    } catch {
      // Allow empty POST body
    }

    const userId = (
      (typeof body.userId === "string" ? body.userId : "") ||
      req.headers.get("x-krona-user-id") ||
      req.headers.get("x-user-id") ||
      "guest_sandbox_user"
    ).trim();

    const sql = getSql();
    let existingPayload: UserFinancialPayload | null = null;

    if (sql) {
      await ensureUserSyncTable(sql);
      const rows = await sql.query(
        "SELECT data FROM user_sync WHERE user_id = $1 LIMIT 1;",
        [userId]
      );
      if (rows.length > 0) {
        const row = rows[0] as unknown as { data: unknown };
        existingPayload = (
          typeof row.data === "string" ? JSON.parse(row.data) : row.data
        ) as UserFinancialPayload;
      }
    } else {
      const store = readLocalCloudStore();
      existingPayload = store[userId] || null;
    }

    // Récupérer la session existante ou fournie
    const storedSession =
      existingPayload?.bankSession || existingPayload?.settings?.bankSession || null;

    const incomingSession =
      body.bankSession && typeof body.bankSession === "object"
        ? (body.bankSession as BankSessionInfo)
        : null;

    // 1. Vérification réglementaire du quota DSP2 (max 4 actualisations / 24h)
    const nowMs = Date.now();
    const combinedTimestamps = Array.from(
      new Set([
        ...(storedSession?.refreshTimestamps || []),
        ...(storedSession?.refreshQuota?.timestamps || []),
        ...(incomingSession?.refreshTimestamps || []),
        ...(incomingSession?.refreshQuota?.timestamps || []),
        ...(Array.isArray(body.refreshTimestamps)
          ? body.refreshTimestamps.filter((t): t is string => typeof t === "string")
          : []),
      ])
    );

    const preQuota = computeBankRefreshQuota(combinedTimestamps, nowMs);
    if (preQuota.remaining <= 0) {
      const blockedSession: BankSessionInfo | null = storedSession
        ? {
            ...storedSession,
            refreshTimestamps: preQuota.timestamps,
            refreshQuota: preQuota,
          }
        : incomingSession
          ? {
              ...incomingSession,
              refreshTimestamps: preQuota.timestamps,
              refreshQuota: preQuota,
            }
          : null;

      return NextResponse.json(
        {
          success: false,
          quotaExceeded: true,
          refreshQuota: preQuota,
          bankSession: blockedSession,
          error:
            "La limite réglementaire quotidienne de 4 actualisations bancaires (DSP2) est atteinte. Un nouveau rafraîchissement sera disponible un peu plus tard.",
        },
        { status: 429 }
      );
    }

    const sessionId = (
      (typeof body.sessionId === "string" ? body.sessionId : "") ||
      (typeof body.session_id === "string" ? body.session_id : "") ||
      storedSession?.sessionId ||
      incomingSession?.sessionId ||
      ""
    ).trim();

    let accountIds: string[] = [];
    if (typeof body.accountId === "string" && body.accountId.trim().length > 0) {
      accountIds = [body.accountId.trim()];
    } else if (Array.isArray(body.accountIds)) {
      accountIds = body.accountIds
        .map((id) => String(id || "").trim())
        .filter((id) => id.length > 0);
    } else if (storedSession && Array.isArray(storedSession.accounts) && storedSession.accounts.length > 0) {
      accountIds = storedSession.accounts.map((a) => a.uid).filter(Boolean);
    } else if (incomingSession && Array.isArray(incomingSession.accounts) && incomingSession.accounts.length > 0) {
      accountIds = incomingSession.accounts.map((a) => a.uid).filter(Boolean);
    }

    if (accountIds.length === 0 && sessionId) {
      const remoteSession = await authorizeOrGetSession(sessionId, false);
      accountIds = remoteSession.accounts.map((a) => a.uid).filter(Boolean);
    }

    if (accountIds.length === 0 && !sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: "Aucune session bancaire active trouvée. Veuillez d'abord connecter votre banque.",
        },
        { status: 400 }
      );
    }

    const rawAspspLabel =
      (typeof body.accountName === "string" && body.accountName.trim().length > 0
        ? body.accountName.trim()
        : storedSession?.aspspName || incomingSession?.aspspName) || "BoursoBank";

    const aspspLabel = formatBankDisplayName(rawAspspLabel);

    const rawTransactionsList: RawTransaction[] = [];
    const fetchedBalances = new Map<string, number>();

    for (const accUid of accountIds) {
      try {
        const ebTxs = await fetchTransactions(sessionId, accUid);
        const normalizedBatch = normalizeEnableBankingTransactions(ebTxs, aspspLabel);
        rawTransactionsList.push(...normalizedBatch);
      } catch (fetchErr) {
        console.warn(`[Enable Banking Sync] fetchTransactions (${accUid}):`, fetchErr);
      }

      const bal = await fetchAccountBalance(accUid);
      if (bal !== null) {
        fetchedBalances.set(accUid, bal);
      }
    }

    const existingTransactions: Transaction[] = existingPayload?.transactions || [];
    const learningRules: LearningRuleMap = {
      ...(existingPayload?.learningRules || existingPayload?.merchantKnowledge || {}),
    };

    if (body.learningRules && typeof body.learningRules === "object") {
      Object.assign(learningRules, body.learningRules as LearningRuleMap);
    }

    // Inclure d'éventuelles transactions transmises par le frontend pour éviter tout doublon
    const combinedExisting = [...existingTransactions];
    if (Array.isArray(body.existingTransactions)) {
      for (const item of body.existingTransactions) {
        if (item && typeof item === "object" && "id" in item && "date" in item && "amount" in item && "name" in item) {
          const t = item as Transaction;
          if (!combinedExisting.some((ex) => ex.id === t.id)) {
            combinedExisting.push(t);
          }
        }
      }
    }

    // Exécuter le pipeline unifié
    const skipAi = body.skipAi === true;
    const isSandboxSession =
      rawAspspLabel.toLowerCase().includes("mock") ||
      rawAspspLabel.toLowerCase().includes("sandbox");

    const pipelineResult = await executeBankIngestionPipeline({
      rawTransactions: rawTransactionsList,
      existingTransactions: combinedExisting,
      learningRules,
      aspspLabel,
      enableSandboxFallback: isSandboxSession,
      skipAiEnrichment: skipAi,
    });

    // Consommer 1 crédit d'actualisation dans le quota 24h
    const consumed = consumeBankRefreshQuota({ refreshTimestamps: combinedTimestamps }, nowMs);
    const updatedQuota = consumed.quota;
    const nowIso = new Date(nowMs).toISOString();

    const baseSession = storedSession || incomingSession;
    const updatedAccountsInSession: BankSessionInfo["accounts"] = baseSession?.accounts?.length
      ? baseSession.accounts.map((acc) => ({
          ...acc,
          balance: fetchedBalances.has(acc.uid) ? fetchedBalances.get(acc.uid) : acc.balance,
        }))
      : accountIds.map((uid) => ({
          uid,
          balance: fetchedBalances.get(uid),
        }));

    const updatedBankSession: BankSessionInfo | null = baseSession
      ? {
          ...baseSession,
          aspspName: aspspLabel,
          accounts: updatedAccountsInSession,
          lastSyncedAt: nowIso,
          refreshTimestamps: updatedQuota.timestamps,
          refreshQuota: updatedQuota,
        }
      : sessionId
        ? {
            sessionId,
            aspspName: aspspLabel,
            aspspCountry: "FR",
            accounts: updatedAccountsInSession,
            connectedAt: nowIso,
            lastSyncedAt: nowIso,
            refreshTimestamps: updatedQuota.timestamps,
            refreshQuota: updatedQuota,
          }
        : null;

    // Mise à jour du solde des comptes liés
    const existingAccounts: AccountInfo[] = Array.isArray(existingPayload?.accounts)
      ? existingPayload.accounts
      : [];
    const updatedKronaAccounts: AccountInfo[] = existingAccounts.map((acc) => {
      if (acc.id.startsWith("eb_acc_")) {
        const uid = acc.id.replace(/^eb_acc_/, "");
        const newBal = fetchedBalances.get(uid);
        if (newBal !== undefined) {
          return {
            ...acc,
            initialBalance: newBal,
            updatedAt: nowIso,
          };
        }
      }
      return acc;
    });

    for (const [uid, bal] of fetchedBalances.entries()) {
      const targetId = `eb_acc_${uid}`;
      if (!updatedKronaAccounts.some((a) => a.id === targetId)) {
        const metaAcc = updatedAccountsInSession.find((a) => a.uid === uid);
        updatedKronaAccounts.push({
          id: targetId,
          name: metaAcc?.name || `Compte ${aspspLabel}`,
          bank: "BoursoBank",
          type: "Compte courant",
          accountNumber: metaAcc?.iban ? `•••• ${metaAcc.iban.slice(-4)}` : "•••• BOURSOBANK",
          initialBalance: bal,
          updatedAt: nowIso,
        });
      }
    }

    const incomingUpdate: Partial<UserFinancialPayload> = {
      transactions: pipelineResult.allMergedTransactions,
      ...(updatedKronaAccounts.length > 0 ? { accounts: updatedKronaAccounts } : {}),
      learningRules: pipelineResult.learningRules,
      bankSession: updatedBankSession,
      settings: {
        ...(existingPayload?.settings || {
          monthlyCap: null,
          monthlyLimitConfig: { type: "amount", value: 0 },
          incomeSettings: { salary: 0, aids: 0, autoApply: false },
          categoryBudgets: {},
        }),
        bankSession: updatedBankSession,
      },
    };

    const mergedPayload = existingPayload
      ? mergeCloudAndLocalData(incomingUpdate, existingPayload)
      : normalizeUserFinancialPayload(incomingUpdate);

    if (updatedBankSession) {
      mergedPayload.bankSession = updatedBankSession;
      mergedPayload.settings.bankSession = updatedBankSession;
    }
    mergedPayload.learningRules = pipelineResult.learningRules;
    mergedPayload.merchantKnowledge = pipelineResult.learningRules;

    if (sql) {
      await ensureUserSyncTable(sql);
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

    return NextResponse.json(
      {
        success: true,
        addedCount: pipelineResult.deduplicatedNewTransactions.length,
        totalFetched: rawTransactionsList.length,
        transactions: pipelineResult.deduplicatedNewTransactions,
        allTransactions: mergedPayload.transactions,
        accounts: mergedPayload.accounts,
        learningRules: mergedPayload.learningRules,
        bankSession: mergedPayload.bankSession,
        refreshQuota: updatedQuota,
        data: mergedPayload,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de la synchronisation bancaire Enable Banking.";
    const isExpired =
      message.toLowerCase().includes("401") ||
      message.toLowerCase().includes("403") ||
      message.toLowerCase().includes("404") ||
      message.toLowerCase().includes("expired") ||
      message.toLowerCase().includes("session");

    return NextResponse.json(
      {
        success: false,
        error: message,
        sessionExpired: isExpired,
      },
      { status: isExpired ? 401 : 500 }
    );
  }
}
