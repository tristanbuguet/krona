import { Transaction, FixedIncomeSettings, AccountInfo, BankSessionInfo, isRegularisationCategory } from "./types";
import { computeBankRefreshQuota, sanitizeAndDeduplicateTransactions } from "./bankDeduplication";

export { sanitizeAndDeduplicateTransactions };

export interface GoogleUserProfile {
  id: string;
  name: string;
  givenName?: string;
  familyName?: string;
  email: string;
  picture?: string;
  photoURL?: string;
  image?: string;
  avatar_url?: string;
  user_metadata?: {
    avatar_url?: string;
    picture?: string;
  };
}

/**
 * Extrait l'URL de la photo de profil Google quelle que soit la structure du provider OAuth
 * (Google Identity, Firebase `photoURL`, Supabase `user_metadata`, NextAuth `image`).
 */
export function resolveUserAvatarUrl(
  user?: Partial<GoogleUserProfile> | null
): string | undefined {
  if (!user) return undefined;
  const candidate =
    user.photoURL ||
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    user.image ||
    user.avatar_url ||
    user.picture;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

export interface UserFinancialSettings {
  monthlyCap: number | null;
  monthlyLimitConfig: { type: "amount" | "percent"; value: number };
  incomeSettings: FixedIncomeSettings;
  categoryBudgets: Record<string, number>;
  ignoredSubscriptions?: string[];
  selectedBank?: "bourso" | "ca";
  selectedMonth?: string | null;
  bankSession?: BankSessionInfo | null;
}

export type LearningRuleMap = Record<
  string,
  {
    categorie: string;
    isSubscription?: boolean;
    isInternalTransfer?: boolean;
    excludeFromSpending?: boolean;
    excludeFromIncome?: boolean;
    updatedAt?: string;
  }
>;

/**
 * Contrat de données unifié pour la persistance Cloud et Local-First par compte Google.
 */
export interface UserFinancialPayload {
  transactions: Transaction[];
  accounts: AccountInfo[];
  settings: UserFinancialSettings;
  learningRules: LearningRuleMap;
  lastUpdated: string;
  monthlyCap?: number | null;
  incomeSettings?: FixedIncomeSettings;
  bankSession?: BankSessionInfo | null;
  // Champs de compatibilité directe à la racine
  categoryBudgets: Record<string, number>;
  fixedIncomeSettings: FixedIncomeSettings;
  ignoredSubscriptions: string[];
  merchantKnowledge: LearningRuleMap;
  monthlyLimitConfig: { type: "amount" | "percent"; value: number };
  monthlySpendingLimit?: number | null;
  selectedBank?: "bourso" | "ca";
  selectedMonth?: string | null;
  updatedAt: string;
}

export type CloudSyncPayload = UserFinancialPayload;

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

  // 2. Fusionner les transactions locales (priorité aux modifications plus récentes ou nouveaux ajouts locaux)
  for (const tx of localTxs) {
    if (tx && tx.id) {
      const existingCloud = byId.get(tx.id);
      if (!existingCloud) {
        byId.set(tx.id, tx);
      } else {
        const localTime = tx.updatedAt ? new Date(tx.updatedAt).getTime() : 0;
        const cloudTime = existingCloud.updatedAt ? new Date(existingCloud.updatedAt).getTime() : 0;
        if (localTime >= cloudTime) {
          byId.set(tx.id, tx);
        }
      }
    }
  }

  // 3. Déduplication par signature comptable et assainissement des doublons historiques
  const mergedList = Array.from(byId.values());
  return sanitizeAndDeduplicateTransactions(mergedList);
}

/**
 * Fusionne sans perte deux états complets de données financières (Local-First + Cloud)
 * selon le contrat unifié UserFinancialPayload.
 */
export function mergeCloudAndLocalData(
  local: Partial<UserFinancialPayload>,
  cloud: Partial<UserFinancialPayload> | null
): UserFinancialPayload {
  const localTxs = Array.isArray(local.transactions) ? local.transactions : [];
  const cloudTxs = cloud && Array.isArray(cloud.transactions) ? cloud.transactions : [];
  const rawMergedTransactions = mergeTransactionsLossless(localTxs, cloudTxs);
  const mergedTransactions = rawMergedTransactions.map((tx) => {
    if (tx.type === "Régularisation" || isRegularisationCategory(tx.type)) {
      return {
        ...tx,
        type: "Virement interne",
        isInternalTransfer: true,
        excludeFromSpending: true,
        excludeFromIncome: true,
      };
    }
    return tx;
  });

  const cloudBudgets =
    cloud?.settings?.categoryBudgets || cloud?.categoryBudgets || {};
  const localBudgets =
    local.settings?.categoryBudgets || local.categoryBudgets || {};
  const mergedBudgets: Record<string, number> = {
    ...cloudBudgets,
    ...localBudgets,
  };
  delete mergedBudgets["Revenus & Aides"];
  delete mergedBudgets["Épargne & Trésorerie"];
  delete mergedBudgets["Virement interne"];
  delete mergedBudgets["Régularisation"];

  const localIncome =
    local.settings?.incomeSettings ||
    local.fixedIncomeSettings ||
    local.incomeSettings;
  const cloudIncome =
    cloud?.settings?.incomeSettings ||
    cloud?.fixedIncomeSettings ||
    cloud?.incomeSettings;
  const hasLocalIncome =
    localIncome &&
    (localIncome.salary > 0 ||
      localIncome.aids > 0 ||
      localIncome.autoApply ||
      (localIncome.savingsGoal !== undefined && localIncome.savingsGoal > 0) ||
      localIncome.rent !== undefined ||
      localIncome.loans !== undefined ||
      localIncome.utilities !== undefined);

  const mergedIncomeSettings: FixedIncomeSettings = hasLocalIncome
    ? { ...DEFAULT_INCOME_SETTINGS, ...cloudIncome, ...localIncome }
    : { ...DEFAULT_INCOME_SETTINGS, ...localIncome, ...cloudIncome };

  const cloudIgnored =
    cloud?.settings?.ignoredSubscriptions || cloud?.ignoredSubscriptions || [];
  const localIgnored =
    local.settings?.ignoredSubscriptions || local.ignoredSubscriptions || [];
  const mergedIgnoredSubs = Array.from(new Set([...cloudIgnored, ...localIgnored]));

  const cloudRules = cloud?.learningRules || cloud?.merchantKnowledge || {};
  const localRules = local.learningRules || local.merchantKnowledge || {};
  const allRuleKeys = new Set([...Object.keys(cloudRules), ...Object.keys(localRules)]);
  const mergedKnowledge: LearningRuleMap = {};
  for (const k of allRuleKeys) {
    const cRule = cloudRules[k];
    const lRule = localRules[k];
    if (cRule && !lRule) {
      mergedKnowledge[k] = { ...cRule };
    } else if (lRule && !cRule) {
      mergedKnowledge[k] = { ...lRule };
    } else if (cRule && lRule) {
      const cTime = cRule.updatedAt ? new Date(cRule.updatedAt).getTime() : 0;
      const lTime = lRule.updatedAt ? new Date(lRule.updatedAt).getTime() : 0;
      mergedKnowledge[k] = lTime >= cTime ? { ...lRule } : { ...cRule };
    }
  }
  Object.keys(mergedKnowledge).forEach((k) => {
    if (mergedKnowledge[k]?.categorie === "Régularisation" || isRegularisationCategory(mergedKnowledge[k]?.categorie)) {
      mergedKnowledge[k].categorie = "Virement interne";
      mergedKnowledge[k].isInternalTransfer = true;
      mergedKnowledge[k].excludeFromSpending = true;
      mergedKnowledge[k].excludeFromIncome = true;
    }
  });

  const localLimitConfig =
    local.settings?.monthlyLimitConfig || local.monthlyLimitConfig;
  const cloudLimitConfig =
    cloud?.settings?.monthlyLimitConfig || cloud?.monthlyLimitConfig;
  const mergedLimitConfig =
    localLimitConfig ||
    cloudLimitConfig || { type: "amount", value: 0 };

  const localCap =
    local.settings?.monthlyCap !== undefined && local.settings?.monthlyCap !== null
      ? local.settings.monthlyCap
      : local.monthlySpendingLimit !== undefined && local.monthlySpendingLimit !== null
        ? local.monthlySpendingLimit
        : local.monthlyCap !== undefined && local.monthlyCap !== null
          ? local.monthlyCap
          : null;
  const cloudCap =
    cloud?.settings?.monthlyCap !== undefined && cloud?.settings?.monthlyCap !== null
      ? cloud.settings.monthlyCap
      : cloud?.monthlySpendingLimit !== undefined && cloud?.monthlySpendingLimit !== null
        ? cloud.monthlySpendingLimit
        : cloud?.monthlyCap !== undefined && cloud?.monthlyCap !== null
          ? cloud.monthlyCap
          : null;

  const mergedSpendingLimit =
    localCap !== null
      ? localCap
      : cloudCap !== null
        ? cloudCap
        : mergedLimitConfig.type === "amount"
          ? mergedLimitConfig.value
          : null;

  // Fusion des comptes par ID avec résolution par horodatage
  const localAccounts = Array.isArray(local.accounts) ? local.accounts : [];
  const cloudAccounts = cloud && Array.isArray(cloud.accounts) ? cloud.accounts : [];
  const accMap = new Map<string, AccountInfo>();
  cloudAccounts.forEach((a) => {
    if (a && a.id) accMap.set(a.id, a);
  });
  localAccounts.forEach((a) => {
    if (a && a.id) {
      const existing = accMap.get(a.id);
      if (!existing) {
        accMap.set(a.id, a);
      } else {
        const localTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const cloudTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        if (localTime >= cloudTime) {
          accMap.set(a.id, a);
        }
      }
    }
  });
  const mergedAccounts = Array.from(accMap.values());

  const mergedBank =
    local.settings?.selectedBank ||
    local.selectedBank ||
    cloud?.settings?.selectedBank ||
    cloud?.selectedBank ||
    "bourso";

  const mergedMonth =
    local.settings?.selectedMonth ||
    local.selectedMonth ||
    cloud?.settings?.selectedMonth ||
    cloud?.selectedMonth ||
    null;

  const localBankSession =
    local.settings?.bankSession !== undefined
      ? local.settings.bankSession
      : local.bankSession;
  const cloudBankSession =
    cloud?.settings?.bankSession !== undefined
      ? cloud.settings.bankSession
      : cloud?.bankSession;

  let mergedBankSession: BankSessionInfo | null = null;
  if (localBankSession && cloudBankSession) {
    // Si la session existe des deux côtés, fusionner les horodatages de quota
    // et privilégier la version la plus récemment synchronisée ou connectée
    const localTime = Date.parse(localBankSession.lastSyncedAt || localBankSession.connectedAt || "0");
    const cloudTime = Date.parse(cloudBankSession.lastSyncedAt || cloudBankSession.connectedAt || "0");
    const primary = localTime >= cloudTime ? localBankSession : cloudBankSession;
    const secondary = localTime >= cloudTime ? cloudBankSession : localBankSession;
    const combinedTimestamps = Array.from(new Set([
      ...(primary.refreshTimestamps || primary.refreshQuota?.timestamps || []),
      ...(secondary.refreshTimestamps || secondary.refreshQuota?.timestamps || []),
    ]));
    const quota = computeBankRefreshQuota(combinedTimestamps);
    mergedBankSession = {
      ...primary,
      refreshTimestamps: quota.timestamps,
      refreshQuota: quota,
    };
  } else {
    // Si l'un des deux seulement a une session (ex. premier login Google sur nouvel appareil),
    // ne pas écraser une session active par un null local !
    mergedBankSession = localBankSession || cloudBankSession || null;
  }

  const nowIso = new Date().toISOString();

  return {
    transactions: mergedTransactions,
    accounts: mergedAccounts,
    settings: {
      monthlyCap: mergedSpendingLimit,
      monthlyLimitConfig: mergedLimitConfig,
      incomeSettings: mergedIncomeSettings,
      categoryBudgets: mergedBudgets,
      ignoredSubscriptions: mergedIgnoredSubs,
      selectedBank: mergedBank,
      selectedMonth: mergedMonth,
      bankSession: mergedBankSession,
    },
    learningRules: mergedKnowledge,
    lastUpdated: nowIso,
    monthlyCap: mergedSpendingLimit,
    incomeSettings: mergedIncomeSettings,
    bankSession: mergedBankSession,
    // Champs racine rétrocompatibles
    categoryBudgets: mergedBudgets,
    fixedIncomeSettings: mergedIncomeSettings,
    ignoredSubscriptions: mergedIgnoredSubs,
    merchantKnowledge: mergedKnowledge,
    monthlyLimitConfig: mergedLimitConfig,
    monthlySpendingLimit: mergedSpendingLimit,
    selectedBank: mergedBank,
    selectedMonth: mergedMonth,
    updatedAt: nowIso,
  };
}

/**
 * Normalise un payload entrant (en mode overwrite ou lecture API) vers un UserFinancialPayload complet.
 */
export function normalizeUserFinancialPayload(
  input?: Partial<UserFinancialPayload> | null
): UserFinancialPayload {
  return mergeCloudAndLocalData(input || {}, null);
}

/**
 * Lit l'ensemble des données financières et paramètres présents dans le localStorage.
 */
export function readLocalFinancialData(): Partial<UserFinancialPayload> {
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
  const resolvedMonthlyCap =
    spendingLimit !== null && !isNaN(spendingLimit) ? spendingLimit : null;

  const bankRaw = localStorage.getItem("krona_selected_bank");
  const selectedBank =
    bankRaw === "ca" ? "ca" : bankRaw === "bourso" ? "bourso" : undefined;

  const limitConfigRaw = localStorage.getItem("krona_monthly_limit_config");
  let monthlyLimitConfig: { type: "amount" | "percent"; value: number } | undefined =
    undefined;
  if (limitConfigRaw) {
    try {
      const parsed = JSON.parse(limitConfigRaw);
      if (
        parsed &&
        (parsed.type === "amount" || parsed.type === "percent") &&
        typeof parsed.value === "number"
      ) {
        monthlyLimitConfig = parsed;
      }
    } catch {}
  }

  const transactions = safeParse<Transaction[]>("financeTransactions_v1", []);
  const categoryBudgets = safeParse<Record<string, number>>("categoryBudgets", {});
  const fixedIncomeSettings = safeParse<FixedIncomeSettings>(
    "fixedIncomeSettings",
    DEFAULT_INCOME_SETTINGS
  );
  const ignoredSubscriptions = safeParse<string[]>("krona_ignored_subscriptions", []);
  const merchantKnowledge = safeParse<LearningRuleMap>(
    "krona_merchant_knowledge",
    {}
  );
  const accounts = safeParse<AccountInfo[]>("krona_accounts_v1", []);
  const selectedMonth = localStorage.getItem("krona_selected_month");
  const bankSession = safeParse<BankSessionInfo | null>("krona_bank_session_v1", null);
  const nowIso = new Date().toISOString();

  const fallbackLimitConfig = { type: "amount" as const, value: 0 };

  return {
    transactions,
    accounts,
    learningRules: merchantKnowledge,
    monthlyCap: resolvedMonthlyCap,
    incomeSettings: fixedIncomeSettings,
    bankSession,
    settings: {
      monthlyCap: resolvedMonthlyCap,
      monthlyLimitConfig: monthlyLimitConfig ?? fallbackLimitConfig,
      incomeSettings: fixedIncomeSettings,
      categoryBudgets,
      ignoredSubscriptions,
      selectedBank,
      selectedMonth,
      bankSession,
    },
    lastUpdated: nowIso,
    categoryBudgets,
    fixedIncomeSettings,
    ignoredSubscriptions,
    merchantKnowledge,
    monthlyLimitConfig: monthlyLimitConfig ?? fallbackLimitConfig,
    monthlySpendingLimit: resolvedMonthlyCap,
    selectedBank,
    selectedMonth,
    updatedAt: nowIso,
  };
}

export const LOCAL_FINANCIAL_STORAGE_KEYS = [
  "financeTransactions_v1",
  "categoryBudgets",
  "fixedIncomeSettings",
  "krona_ignored_subscriptions",
  "krona_merchant_knowledge",
  "krona_selected_month",
  "krona_monthly_limit_config",
  "krona_monthly_spending_limit",
  "krona_selected_card",
  "krona_accounts_v1",
  "krona_selected_bank",
  "krona_onboarding_sync_dismissed",
  "krona_bank_session_v1",
] as const;

/**
 * Purge toutes les clés locales de données financières lors de la déconnexion,
 * sans toucher aux backups cloud ni aux préférences globales (ex. thème).
 */
export function clearLocalFinancialData(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LOCAL_FINANCIAL_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn("[Krona Sync] Impossible de purger le stockage local:", e);
  }
}

/**
 * Écrit un payload synchronisé dans le localStorage sans écraser de manière destructive.
 */
export function writeLocalFinancialData(payload: UserFinancialPayload): void {
  if (typeof window === "undefined") return;
  try {
    if (Array.isArray(payload.transactions)) {
      localStorage.setItem(
        "financeTransactions_v1",
        JSON.stringify(payload.transactions)
      );
      if (payload.transactions.length === 0) {
        localStorage.removeItem("krona_selected_month");
      }
    }

    const budgets =
      payload.settings?.categoryBudgets || payload.categoryBudgets || {};
    localStorage.setItem("categoryBudgets", JSON.stringify(budgets));

    const income =
      payload.settings?.incomeSettings ||
      payload.fixedIncomeSettings ||
      DEFAULT_INCOME_SETTINGS;
    localStorage.setItem("fixedIncomeSettings", JSON.stringify(income));

    const ignored =
      payload.settings?.ignoredSubscriptions ||
      payload.ignoredSubscriptions ||
      [];
    localStorage.setItem(
      "krona_ignored_subscriptions",
      JSON.stringify(ignored)
    );

    const rules = payload.learningRules || payload.merchantKnowledge || {};
    localStorage.setItem("krona_merchant_knowledge", JSON.stringify(rules));

    const limitCfg =
      payload.settings?.monthlyLimitConfig || payload.monthlyLimitConfig;
    if (limitCfg) {
      localStorage.setItem(
        "krona_monthly_limit_config",
        JSON.stringify(limitCfg)
      );
    }

    const monthlyCap =
      payload.settings?.monthlyCap !== undefined &&
      payload.settings?.monthlyCap !== null
        ? payload.settings.monthlyCap
        : payload.monthlySpendingLimit;
    if (monthlyCap !== undefined && monthlyCap !== null) {
      localStorage.setItem("krona_monthly_spending_limit", String(monthlyCap));
    }

    if (Array.isArray(payload.accounts)) {
      if (payload.accounts.length > 0) {
        localStorage.setItem(
          "krona_accounts_v1",
          JSON.stringify(payload.accounts)
        );
      } else {
        localStorage.removeItem("krona_accounts_v1");
      }
    }

    const selectedBank =
      payload.settings?.selectedBank || payload.selectedBank;
    if (selectedBank) {
      localStorage.setItem("krona_selected_bank", selectedBank);
    }

    const selectedMonth =
      payload.settings?.selectedMonth || payload.selectedMonth;
    if (selectedMonth) {
      localStorage.setItem("krona_selected_month", selectedMonth);
    }

    const bankSession =
      payload.settings?.bankSession !== undefined
        ? payload.settings.bankSession
        : payload.bankSession;
    if (bankSession) {
      localStorage.setItem(
        "krona_bank_session_v1",
        JSON.stringify(bankSession)
      );
    } else {
      localStorage.removeItem("krona_bank_session_v1");
    }
  } catch (e) {
    console.warn("[Krona Sync] Impossible d'écrire dans le stockage local:", e);
  }
}

