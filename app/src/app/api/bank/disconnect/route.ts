import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

import { getSql, ensureUserSyncTable } from "@/lib/db";
import { UserFinancialPayload } from "@/lib/cloudSync";
import {
  deleteSession,
  formatBankDisplayName,
  isLinkedBankTransaction,
  isLinkedBankAccount,
} from "@/lib/enableBanking";
import { BankSessionInfo, Transaction, AccountInfo } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".krona-cloud");
const STORE_FILE = path.join(DATA_DIR, "users-cloud-store.json");

function readLocalCloudStore(): Record<string, UserFinancialPayload> {
  try {
    if (!fs.existsSync(STORE_FILE)) return {};
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

function purgeBankDataFromPayload(
  payload: UserFinancialPayload,
  externalBankSession?: BankSessionInfo | null
): {
  updatedPayload: UserFinancialPayload;
  purgedCount: number;
  remainingTransactions: Transaction[];
  remainingAccounts: AccountInfo[];
} {
  const activeSession: BankSessionInfo | null =
    externalBankSession ||
    payload.bankSession ||
    payload.settings?.bankSession ||
    null;

  const bankNames = new Set<string>();
  if (activeSession?.aspspName) {
    bankNames.add(activeSession.aspspName);
    bankNames.add(formatBankDisplayName(activeSession.aspspName));
  }
  if (activeSession?.accountName) {
    bankNames.add(activeSession.accountName);
    bankNames.add(formatBankDisplayName(activeSession.accountName));
  }
  bankNames.add("BoursoBank");
  bankNames.add("BoursoBank (Sandbox)");
  bankNames.add("Mock ASPSP");
  bankNames.add("Banque Sandbox");

  if (Array.isArray(activeSession?.accounts)) {
    for (const acc of activeSession.accounts) {
      if (acc.name) bankNames.add(acc.name);
    }
  }

  const existingTxs: Transaction[] = Array.isArray(payload.transactions)
    ? payload.transactions
    : [];
  const remainingTransactions = existingTxs.filter(
    (tx) => !isLinkedBankTransaction(tx, bankNames)
  );
  const purgedCount = existingTxs.length - remainingTransactions.length;

  const existingAccs: AccountInfo[] = Array.isArray(payload.accounts)
    ? payload.accounts
    : [];
  const remainingAccounts = existingAccs.filter(
    (acc) => !isLinkedBankAccount(acc, bankNames)
  );

  const updated: UserFinancialPayload = {
    ...payload,
    transactions: remainingTransactions,
    accounts: remainingAccounts,
    bankSession: null,
  };

  // Suppression des métadonnées de liaison Open Banking
  delete (updated as unknown as Record<string, unknown>).enableBankingSession;
  delete (updated as unknown as Record<string, unknown>).lastSyncedAt;
  delete (updated as unknown as Record<string, unknown>).linked_bank_accounts;
  delete (updated as unknown as Record<string, unknown>).linkedBankAccounts;

  if (updated.settings) {
    updated.settings = {
      ...updated.settings,
      bankSession: null,
    };
    delete (updated.settings as unknown as Record<string, unknown>).enableBankingSession;
    delete (updated.settings as unknown as Record<string, unknown>).lastSyncedAt;
    delete (updated.settings as unknown as Record<string, unknown>).linked_bank_accounts;
    delete (updated.settings as unknown as Record<string, unknown>).linkedBankAccounts;
  }

  if (remainingTransactions.length === 0) {
    updated.selectedMonth = null;
    if (updated.settings) {
      updated.settings.selectedMonth = null;
    }
  }

  const nowIso = new Date().toISOString();
  updated.updatedAt = nowIso;
  updated.lastUpdated = nowIso;

  return {
    updatedPayload: updated,
    purgedCount,
    remainingTransactions,
    remainingAccounts,
  };
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

    const incomingBankSession = (
      body.bankSession && typeof body.bankSession === "object"
        ? (body.bankSession as BankSessionInfo)
        : null
    );

    // 1. Révocation de la session côté Enable Banking API si sessionId disponible
    const sessionIdToRevoke =
      incomingBankSession?.sessionId ||
      (typeof body.sessionId === "string" ? body.sessionId : undefined);

    if (sessionIdToRevoke) {
      await deleteSession(sessionIdToRevoke).catch(() => false);
    }

    let finalRemainingTransactions: Transaction[] = [];
    let finalRemainingAccounts: AccountInfo[] = [];
    let totalPurged = 0;

    const sql = getSql();
    if (sql) {
      await ensureUserSyncTable(sql);
      const rows = await sql.query(
        "SELECT data FROM user_sync WHERE user_id = $1 LIMIT 1;",
        [userId]
      );
      if (rows.length > 0) {
        const row = rows[0] as unknown as { data: unknown };
        const existing = (
          typeof row.data === "string" ? JSON.parse(row.data) : row.data
        ) as UserFinancialPayload;

        const dbSession =
          existing.bankSession || existing.settings?.bankSession || null;
        if (dbSession?.sessionId && dbSession.sessionId !== sessionIdToRevoke) {
          await deleteSession(dbSession.sessionId).catch(() => false);
        }

        const {
          updatedPayload,
          purgedCount,
          remainingTransactions,
          remainingAccounts,
        } = purgeBankDataFromPayload(existing, incomingBankSession || dbSession);

        finalRemainingTransactions = remainingTransactions;
        finalRemainingAccounts = remainingAccounts;
        totalPurged = purgedCount;

        await sql.query(
          `UPDATE user_sync SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2;`,
          [JSON.stringify(updatedPayload), userId]
        );
      }
    }

    // Mise à jour également dans le store local pour cohérence dev/sandbox
    const store = readLocalCloudStore();
    const targetsToPurge = new Set<string>([userId]);
    if (userId === "guest_sandbox_user") {
      targetsToPurge.add("default_sandbox_user");
    }

    for (const targetId of targetsToPurge) {
      if (store[targetId]) {
        const localTargetSession =
          store[targetId].bankSession ||
          store[targetId].settings?.bankSession ||
          null;
        const {
          updatedPayload,
          purgedCount,
          remainingTransactions,
          remainingAccounts,
        } = purgeBankDataFromPayload(
          store[targetId],
          incomingBankSession || localTargetSession
        );

        store[targetId] = updatedPayload;
        if (!sql) {
          finalRemainingTransactions = remainingTransactions;
          finalRemainingAccounts = remainingAccounts;
          totalPurged = Math.max(totalPurged, purgedCount);
        }
      }
    }
    writeLocalCloudStore(store);

    return NextResponse.json(
      {
        success: true,
        purgedCount: totalPurged,
        transactions: finalRemainingTransactions,
        accounts: finalRemainingAccounts,
        bankSession: null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de la déconnexion bancaire.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
