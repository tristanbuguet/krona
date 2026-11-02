import {
  Transaction,
  FixedIncomeSettings,
  isInternalTransferTransaction,
  isInternalTransferCategory,
  isRegularisationCategory,
  isRegularisationTransaction,
  isSalaryTransaction,
  isAidTransaction,
  isSubscriptionCategory,
} from "./types";

export interface FinancialCalculationOptions {
  transactions: Transaction[];
  incomeSettings?: Partial<FixedIncomeSettings>;
  selectedMonth?: string;
  isTxSubscription?: (tx: Transaction) => boolean;
}

export interface FinancialMetrics {
  expenses: number;
  income: number;
  balance: number;
  subs: number;
  internalTransfersSaved: number;
  categoryExpenses: Record<string, number>;
  fixedCharges: {
    rent: number;
    loans: number;
    subscriptions: number;
    utilities: number;
    total: number;
  };
  disposableIncome: number;
  autoAppliedInfo: string | null;
}

/**
 * Calcul financier centralisé et unifié :
 * - Traitement rigoureusement neutre des virements internes (isInternalTransferTransaction).
 * - Les débits internes (ex: virement vers livret) n'augmentent JAMAIS les dépenses nettes.
 * - Les crédits internes (ex: virement depuis livret) n'augmentent JAMAIS les revenus réels ni le salaire.
 * - Le solde et le reste à vivre restent rigoureusement neutres face aux flux internes.
 */
export function calculateFinancialMetrics({
  transactions,
  incomeSettings = {},
  selectedMonth,
  isTxSubscription,
}: FinancialCalculationOptions): FinancialMetrics {
  let exp = 0;
  let totalRealIncome = 0;
  let hasRealSalary = false;
  let hasRealAids = false;
  let subTotal = 0;
  let internalSaved = 0;
  const catMap: Record<string, number> = {};

  const isSub = (tx: Transaction) => {
    if (isTxSubscription) return isTxSubscription(tx);
    return Boolean(tx.isSubscription || isSubscriptionCategory(tx.type));
  };

  transactions.forEach((tx) => {
    const isInternal = isInternalTransferTransaction(tx);
    const isRegul = isRegularisationTransaction(tx);

    // RÈGLE MÉTIER STRICTE : Exclusion totale des flux de trésorerie internes et des opérations de régularisation
    if (
      isInternal ||
      isRegul ||
      tx.isInternalTransfer ||
      tx.excludeFromSpending ||
      tx.excludeFromIncome ||
      isInternalTransferCategory(tx.type) ||
      isRegularisationCategory(tx.type)
    ) {
      if (!isRegul && !isRegularisationCategory(tx.type) && !isRegularisationTransaction(tx)) {
        internalSaved += tx.amount;
      }
      return;
    }

    if (tx.amount < 0) {
      // Dépense opérationnelle
      const absAmount = Math.abs(tx.amount);
      exp += absAmount;

      if (tx.type !== "Revenus & Aides") {
        catMap[tx.type] = (catMap[tx.type] || 0) + absAmount;
      }

      if (isSub(tx)) {
        subTotal += absAmount;
      }
    } else {
      // Montant créditeur (Revenu opérationnel ou Remboursement)
      const nam = (tx.name || "").toLowerCase();
      const raw = (tx.rawName || "").toLowerCase();
      const combined = `${nam} ${raw}`;

      // Double garde-fou absolu pour exclure tout virement interne ou régularisation résiduel
      const isInternalOrRegulGuard = 
        isInternal || 
        isRegul || 
        tx.isInternalTransfer || 
        tx.excludeFromSpending || 
        tx.excludeFromIncome ||
        isInternalTransferCategory(tx.type) ||
        isRegularisationCategory(tx.type);

      if (isInternalOrRegulGuard) {
        return;
      }

      const isAids =
        isAidTransaction(tx) ||
        Boolean(combined.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide|allocation/i));

      const isRefundLabel = Boolean(combined.match(/remboursement|avoir/i));

      const matchesSalaryKeywords = Boolean(
        combined.match(/salaire|paie|paye|virement sepa|vir sepa|remuneration|rémunération|appointement|appointements|galeries|employeur/i)
      );

      const refSalary = incomeSettings.salary || 0;
      const isSignificantIncome =
        tx.type === "Revenus & Aides" &&
        (tx.amount >= 500 || (refSalary > 0 && tx.amount >= refSalary * 0.5));

      const isSalary =
        !isRefundLabel &&
        !isAids &&
        (matchesSalaryKeywords || isSignificantIncome || isSalaryTransaction(tx, refSalary));

      const isIncome = isSalary || isAids || tx.type === "Revenus & Aides";
      const isRefund = !isIncome && !isInternalOrRegulGuard;

      if (isRefund) {
        // Remboursement opérationnel venant déduire les dépenses
        exp -= tx.amount;
        if (exp < 0) exp = 0;

        if (isSub(tx)) {
          subTotal -= tx.amount;
          if (subTotal < 0) subTotal = 0;
        }

        catMap[tx.type] = Math.max(0, (catMap[tx.type] || 0) - tx.amount);
      } else {
        totalRealIncome += tx.amount;
        if (isSalary) hasRealSalary = true;
        if (isAids) hasRealAids = true;
      }
    }
  });

  exp = Math.round(Math.max(0, exp) * 100) / 100;
  totalRealIncome = Math.round(Math.max(0, totalRealIncome) * 100) / 100;
  subTotal = Math.round(Math.max(0, subTotal) * 100) / 100;

  let injectedSalary = 0;
  let injectedAids = 0;
  let autoAppliedInfo: string | null = null;

  if (incomeSettings.autoApply && selectedMonth && selectedMonth !== "Tout") {
    const msgs: string[] = [];
    if (!hasRealSalary && (incomeSettings.salary || 0) > 0) {
      injectedSalary = incomeSettings.salary || 0;
      msgs.push(`Salaire (${injectedSalary.toLocaleString("fr-FR")} €)`);
    }
    if (!hasRealAids && (incomeSettings.aids || 0) > 0) {
      injectedAids = incomeSettings.aids || 0;
      msgs.push(`Aides (${injectedAids.toLocaleString("fr-FR")} €)`);
    }
    if (msgs.length > 0) {
      autoAppliedInfo = `Inclus : ${msgs.join(" & ")}`;
    }
  }

  const effectiveIncome = Math.round((totalRealIncome + injectedSalary + injectedAids) * 100) / 100;
  const balance = Math.round((effectiveIncome - exp) * 100) / 100;

  // Calcul des charges fixes incompressibles
  let autoRent = 0;
  let autoLoans = 0;
  let autoUtilities = 0;

  transactions.forEach((tx) => {
    if (
      tx.amount >= 0 ||
      isInternalTransferTransaction(tx) ||
      isRegularisationTransaction(tx) ||
      tx.excludeFromSpending
    ) return;
    const abs = Math.abs(tx.amount);
    const nam = (tx.name || "").toLowerCase();

    if (
      nam.includes("loyer") ||
      nam.includes("bail") ||
      nam.includes("syndic") ||
      nam.includes("propriétaire") ||
      (tx.type === "Logement & Maison" && abs >= 200)
    ) {
      autoRent += abs;
    } else if (
      nam.includes("credit") ||
      nam.includes("crédit") ||
      nam.includes("pret") ||
      nam.includes("prêt") ||
      nam.includes("emprunt") ||
      nam.includes("mensualite") ||
      nam.includes("mensualité")
    ) {
      autoLoans += abs;
    } else if (
      nam.includes("edf") ||
      nam.includes("engie") ||
      nam.includes("totalenergies") ||
      nam.includes("assurance") ||
      nam.includes("mutuelle") ||
      nam.includes("veolia") ||
      nam.includes("suez") ||
      nam.includes("impots") ||
      nam.includes("impôts")
    ) {
      autoUtilities += abs;
    }
  });

  const rent = incomeSettings.rent !== undefined ? incomeSettings.rent : autoRent;
  const loans = incomeSettings.loans !== undefined ? incomeSettings.loans : autoLoans;
  const utilities = incomeSettings.utilities !== undefined ? incomeSettings.utilities : autoUtilities;
  const fixedTotal = rent + loans + subTotal + utilities;

  const baseIncome = effectiveIncome > 0 ? effectiveIncome : ((incomeSettings.salary || 0) + (incomeSettings.aids || 0));
  const disposableIncome = Math.round((baseIncome - fixedTotal) * 100) / 100;

  return {
    expenses: exp,
    income: effectiveIncome,
    balance,
    subs: subTotal,
    internalTransfersSaved: internalSaved,
    categoryExpenses: catMap,
    fixedCharges: {
      rent,
      loans,
      subscriptions: subTotal,
      utilities,
      total: fixedTotal,
    },
    disposableIncome,
    autoAppliedInfo,
  };
}

