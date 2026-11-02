import { Transaction, FixedIncomeSettings, AccountInfo } from "./types";

export interface GoogleUserProfile {
  id: string;
  name: string;
  givenName?: string;
  familyName?: string;
  email: string;
  picture?: string;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

export interface CloudSyncPayload {
  transactions: Transaction[];
  categoryBudgets: Record<string, number>;
  fixedIncomeSettings: FixedIncomeSettings;
  ignoredSubscriptions: string[];
  merchantKnowledge: Record<string, { categorie: string; isSubscription?: boolean }>;
  monthlyLimitConfig: { type: "amount" | "percent"; value: number };
  monthlySpendingLimit?: number | null;
  accounts?: AccountInfo[];
  selectedBank?: "bourso" | "ca";
  selectedMonth?: string | null;
  updatedAt: string;
}

export const DEFAULT_INCOME_SETTINGS: FixedIncomeSettings = {
  salary: 0,
  aids: 0,
  autoApply: false,
  savingsGoal: 0,
  rent: undefined,
  loans: undefined,
  utilities: undefined,
};

/**
 * Fusionne sans perte (union dédupliquée) les transactions locales et cloud.
 * Préserve les opérations locales lors de la première connexion et évite tout écrasement.
 */
export function mergeTransactionsLossless(
  localTxs: Transaction[],
  cloudTxs: Transaction[]
): Transaction[] {
  const byId = new Map<string, Transaction>();

  // 1. Charger d'abord le cloud
  for (const tx of cloudTxs) {
    if (tx && tx.id) {
      byId.set(tx.id, tx);
    }
  }

  // 2. Fusionner les transactions locales (priorité aux modifications locales récentes ou ajouts locaux)
  for (const tx of localTxs) {
    if (tx && tx.id) {
      byId.set(tx.id, tx);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * Fusionne sans perte deux états complets de données financières (Local-First + Cloud).
 */
export function mergeCloudAndLocalData(
  local: Partial<CloudSyncPayload>,
  cloud: Partial<CloudSyncPayload> | null
): CloudSyncPayload {
  const localTxs = Array.isArray(local.transactions) ? local.transactions : [];
  const cloudTxs = cloud && Array.isArray(cloud.transactions) ? cloud.transactions : [];
  const mergedTransactions = mergeTransactionsLossless(localTxs, cloudTxs);

  const mergedBudgets: Record<string, number> = {
    ...(cloud?.categoryBudgets || {}),
    ...(local.categoryBudgets || {}),
  };
  delete mergedBudgets["Revenus & Aides"];
  delete mergedBudgets["Épargne & Trésorerie"];

  const localIncome = local.fixedIncomeSettings;
  const cloudIncome = cloud?.fixedIncomeSettings;
  const hasLocalIncome =
    localIncome &&
    (localIncome.salary > 0 ||
      localIncome.aids > 0 ||
      localIncome.autoApply ||
      localIncome.rent !== undefined ||
      localIncome.loans !== undefined ||
      localIncome.utilities !== undefined);

  const mergedIncomeSettings: FixedIncomeSettings = hasLocalIncome
    ? { ...DEFAULT_INCOME_SETTINGS, ...cloudIncome, ...localIncome }
    : { ...DEFAULT_INCOME_SETTINGS, ...localIncome, ...cloudIncome };

  const mergedIgnoredSubs = Array.from(
    new Set([
      ...(cloud?.ignoredSubscriptions || []),
      ...(local.ignoredSubscriptions || []),
    ])
  );

  const mergedKnowledge = {
    ...(cloud?.merchantKnowledge || {}),
    ...(local.merchantKnowledge || {}),
  };

  const mergedLimitConfig =
    local.monthlyLimitConfig ||
    cloud?.monthlyLimitConfig || { type: "amount", value: 2200 };

  const mergedSpendingLimit =
    local.monthlySpendingLimit !== undefined && local.monthlySpendingLimit !== null
      ? local.monthlySpendingLimit
      : cloud?.monthlySpendingLimit ?? null;

  // Fusion des comptes par ID
  const localAccounts = Array.isArray(local.accounts) ? local.accounts : [];
  const cloudAccounts = cloud && Array.isArray(cloud.accounts) ? cloud.accounts : [];
  const accMap = new Map<string, AccountInfo>();
  cloudAccounts.forEach((a) => {
    if (a && a.id) accMap.set(a.id, a);
  });
  localAccounts.forEach((a) => {
    if (a && a.id) accMap.set(a.id, a);
  });
  const mergedAccounts = accMap.size > 0 ? Array.from(accMap.values()) : undefined;

  return {
    transactions: mergedTransactions,
    categoryBudgets: mergedBudgets,
    fixedIncomeSettings: mergedIncomeSettings,
    ignoredSubscriptions: mergedIgnoredSubs,
    merchantKnowledge: mergedKnowledge,
    monthlyLimitConfig: mergedLimitConfig,
    monthlySpendingLimit: mergedSpendingLimit,
    accounts: mergedAccounts,
    selectedBank: local.selectedBank || cloud?.selectedBank || "bourso",
    selectedMonth: local.selectedMonth || cloud?.selectedMonth || null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Lit l'ensemble des données financières présentes dans le localStorage.
 */
export function readLocalFinancialData(): Partial<CloudSyncPayload> {
  if (typeof window === "undefined") return {};

  const safeParse = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const spendingRaw = localStorage.getItem("krona_monthly_spending_limit");
  const spendingLimit = spendingRaw ? parseFloat(spendingRaw) : null;

  const bankRaw = localStorage.getItem("krona_selected_bank");
  const selectedBank = bankRaw === "ca" ? "ca" : "bourso";

  return {
    transactions: safeParse<Transaction[]>("financeTransactions_v1", []),
    categoryBudgets: safeParse<Record<string, number>>("categoryBudgets", {}),
    fixedIncomeSettings: safeParse<FixedIncomeSettings>(
      "fixedIncomeSettings",
      DEFAULT_INCOME_SETTINGS
    ),
    ignoredSubscriptions: safeParse<string[]>("krona_ignored_subscriptions", []),
    merchantKnowledge: safeParse<
      Record<string, { categorie: string; isSubscription?: boolean }>
    >("krona_merchant_knowledge", {}),
    monthlyLimitConfig: safeParse<{ type: "amount" | "percent"; value: number }>(
      "krona_monthly_limit_config",
      { type: "amount", value: 2200 }
    ),
    monthlySpendingLimit:
      spendingLimit !== null && !isNaN(spendingLimit) ? spendingLimit : null,
    accounts: safeParse<AccountInfo[] | undefined>("krona_accounts_v1", undefined),
    selectedBank,
    selectedMonth: localStorage.getItem("krona_selected_month"),
  };
}

/**
 * Écrit un payload synchronisé dans le localStorage sans écraser de manière destructive.
 */
export function writeLocalFinancialData(payload: CloudSyncPayload): void {
  if (typeof window === "undefined") return;
  try {
    if (payload.transactions.length > 0) {
      localStorage.setItem(
        "financeTransactions_v1",
        JSON.stringify(payload.transactions)
      );
    }
    localStorage.setItem(
      "categoryBudgets",
      JSON.stringify(payload.categoryBudgets || {})
    );
    localStorage.setItem(
      "fixedIncomeSettings",
      JSON.stringify(payload.fixedIncomeSettings || DEFAULT_INCOME_SETTINGS)
    );
    localStorage.setItem(
      "krona_ignored_subscriptions",
      JSON.stringify(payload.ignoredSubscriptions || [])
    );
    localStorage.setItem(
      "krona_merchant_knowledge",
      JSON.stringify(payload.merchantKnowledge || {})
    );
    if (payload.monthlyLimitConfig) {
      localStorage.setItem(
        "krona_monthly_limit_config",
        JSON.stringify(payload.monthlyLimitConfig)
      );
    }
    if (
      payload.monthlySpendingLimit !== undefined &&
      payload.monthlySpendingLimit !== null
    ) {
      localStorage.setItem(
        "krona_monthly_spending_limit",
        String(payload.monthlySpendingLimit)
      );
    }
    if (payload.accounts && payload.accounts.length > 0) {
      localStorage.setItem("krona_accounts_v1", JSON.stringify(payload.accounts));
    }
    if (payload.selectedBank) {
      localStorage.setItem("krona_selected_bank", payload.selectedBank);
    }
    if (payload.selectedMonth) {
      localStorage.setItem("krona_selected_month", payload.selectedMonth);
    }
  } catch (e) {
    console.warn("[Krona Sync] Impossible d'écrire dans le stockage local:", e);
  }
}

