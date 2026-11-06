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
  isSessionExpiredError,
  EnableBankingError,
  mapCashAccountType,
  daysUntilConsentExpiry,
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

    // 2. Consentement DSP2 expiré : inutile de consommer un appel (ni un crédit de quota)
    const knownValidUntil = storedSession?.validUntil || incomingSession?.validUntil;
    const remainingDays = daysUntilConsentExpiry(knownValidUntil, nowMs);
    if (remainingDays !== null && remainingDays < 0) {
      return NextResponse.json(
        {
          success: false,
          sessionExpired: true,
          refreshQuota: preQuota,
          error: "Votre consentement bancaire (DSP2) a expiré. Reconnectez votre banque pour reprendre la synchronisation.",
        },
        { status: 401 }
      );
    }

    const sessionId = (
      (typeof body.sessionId === "string" ? body.sessionId : "") ||
      (typeof body.session_id === "string" ? body.session_id : "") ||
      storedSession?.sessionId ||
      incomingSession?.sessionId ||
      ""
    ).trim();

    // Multi-comptes : on synchronise TOUS les sous-comptes rattachés à la liaison (courant, épargne…),
    // et pas uniquement le premier transmis par le client.
    const accountIdSet = new Set<string>();
    if (Array.isArray(body.accountIds)) {
      body.accountIds.forEach((id) => accountIdSet.add(String(id || "").trim()));
    }
    storedSession?.accounts?.forEach((a) => accountIdSet.add(a.uid));
    incomingSession?.accounts?.forEach((a) => accountIdSet.add(a.uid));
    if (typeof body.accountId === "string") accountIdSet.add(body.accountId.trim());
    accountIdSet.delete("");
    let accountIds: string[] = Array.from(accountIdSet);

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
    const fetchErrors: unknown[] = [];
    const syncWarnings: string[] = [];
    const sessionAccountsMeta = storedSession?.accounts || incomingSession?.accounts || [];

    // Appels parallèles par sous-compte (transactions + solde), une erreur isolée ne bloque pas les autres
    await Promise.all(
      accountIds.map(async (accUid) => {
        const meta = sessionAccountsMeta.find((a) => a.uid === accUid);
        const [txResult, balResult] = await Promise.allSettled([
          fetchTransactions(sessionId, accUid),
          fetchAccountBalance(accUid),
        ]);
        if (txResult.status === "fulfilled") {
          rawTransactionsList.push(...normalizeEnableBankingTransactions(txResult.value, aspspLabel, accUid));
        } else {
          console.warn(`[Enable Banking Sync] fetchTransactions (${accUid}):`, txResult.reason);
          fetchErrors.push(txResult.reason);
          syncWarnings.push(`${meta?.name || "Un compte"} n'a pas pu être actualisé.`);
        }
        if (balResult.status === "fulfilled" && balResult.value !== null) {
          fetchedBalances.set(accUid, balResult.value);
        }
      })
    );

    // Aucun compte n'a répondu : on ne consomme pas de crédit de quota et on ne touche pas aux données
    if (accountIds.length > 0 && fetchErrors.length === accountIds.length) {
      const expired = fetchErrors.some(isSessionExpiredError);
      return NextResponse.json(
        {
          success: false,
          sessionExpired: expired,
          retryable: !expired,
          refreshQuota: preQuota,
          error: expired
            ? "Votre accès bancaire a expiré ou a été révoqué. Reconnectez votre banque pour reprendre la synchronisation."
            : "La banque est momentanément indisponible. Vos données restent intactes, réessayez dans quelques minutes (aucune actualisation décomptée).",
        },
        { status: expired ? 401 : 503 }
      );
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

    // Fenêtre d'extraction couverte par la banque (90 jours) - info renvoyée au client
    const historyDates = rawTransactionsList.map((t) => t.date).sort();

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
          .concat(
            accountIds
              .filter((uid) => !baseSession.accounts.some((a) => a.uid === uid))
              .map((uid) => ({ uid, balance: fetchedBalances.get(uid) }))
          )
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
          lastSyncWarnings: syncWarnings,
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
          type: mapCashAccountType(metaAcc?.cashAccountType, metaAcc?.name),
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

    // Le pipeline a déjà fusionné cloud + client et purgé les doublons : la fusion « lossless »
    // ne doit pas réintroduire les doublons supprimés.
    mergedPayload.transactions = pipelineResult.allMergedTransactions;

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
        addedCount: pipelineResult.addedCount,
        totalFetched: rawTransactionsList.length,
        transactions: pipelineResult.deduplicatedNewTransactions,
        allTransactions: mergedPayload.transactions,
        accounts: mergedPayload.accounts,
        learningRules: mergedPayload.learningRules,
        bankSession: mergedPayload.bankSession,
        refreshQuota: updatedQuota,
        removedDuplicatesCount: pipelineResult.removedDuplicatesCount,
        warnings: syncWarnings,
        historyFrom: historyDates[0] || null,
        historyTo: historyDates[historyDates.length - 1] || null,
        consentDaysLeft: remainingDays,
        data: mergedPayload,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur lors de la synchronisation bancaire Enable Banking.";
    // Ancienne heuristique ("session" dans le message) : toute erreur /sessions était prise pour une expiration
    const isExpired = isSessionExpiredError(err);
    const isTransient = err instanceof EnableBankingError && err.isTransient;

    return NextResponse.json(
      {
        success: false,
        error: isExpired
          ? "Votre accès bancaire a expiré ou a été révoqué. Reconnectez votre banque."
          : isTransient
            ? "La banque est momentanément indisponible. Réessayez dans quelques minutes."
            : message,
        sessionExpired: isExpired,
        retryable: isTransient,
      },
      { status: isExpired ? 401 : isTransient ? 503 : 500 }
    );
  }
}
