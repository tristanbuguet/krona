export type Transaction = {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  month: string;
  isSubscription?: boolean;
  isRecurring?: boolean;
  isInternalTransfer?: boolean;
  excludeFromSpending?: boolean;
  excludeFromIncome?: boolean;
  account?: "BoursoBank" | "Crédit Agricole" | "Caisse d'Épargne" | string;
  rawName?: string;
};

export type FixedIncomeSettings = {
  salary: number;
  aids: number;
  autoApply: boolean;
  savingsGoal?: number;
  rent?: number;
  loans?: number;
  utilities?: number;
};

export type AccountInfo = {
  id: string;
  name: string;
  bank: "BoursoBank" | "Crédit Agricole" | "Caisse d'Épargne" | "Autre";
  type: "Compte courant" | "Livret d'épargne" | "Carte bancaire";
  accountNumber?: string;
  initialBalance?: number;
  color?: string;
  updatedAt?: string;
};

export const OFFICIAL_CATEGORIES = [
  "Alimentation & Courses",
  "Restos & Fast-Food",
  "Sorties & Soirées",
  "Shopping & Mode",
  "Transports",
  "Abonnements & Forfaits",
  "Santé & Soins",
  "Logement & Maison",
  "Virements proches & Remboursements",
  "Revenus & Aides",
  "Épargne & Trésorerie",
  "Virement interne",
  "Régularisation",
  "Autre"
] as const;

export const INTERNAL_TRANSFER_CATEGORY = "Virement interne";
export const REGULARISATION_CATEGORY = "Régularisation";

export const isRegularisationCategory = (category?: string): boolean => {
  if (!category) return false;
  const c = category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return (
    c === "regularisation" ||
    c === "regularisations" ||
    c === "regul" ||
    c === "reguls" ||
    c === "ajustement" ||
    c === "ajustements" ||
    c === "ajustement comptable" ||
    c === "ajustements comptables" ||
    c === "regularisation & ajustement" ||
    c === "regularisation de compte" ||
    c === "regularisation de solde" ||
    c === "ajustement de solde" ||
    c === "ajustement de compte" ||
    c.includes("regularisation") ||
    c.includes("ajustement")
  );
};

export const isRegularisationTransaction = (
  tx: {
    name?: string;
    type?: string;
    rawName?: string;
    excludeFromIncome?: boolean;
    excludeFromSpending?: boolean;
    isInternalTransfer?: boolean;
  }
): boolean => {
  if (isRegularisationCategory(tx.type)) return true;
  const nam = (tx.name || "").toLowerCase();
  const raw = (tx.rawName || "").toLowerCase();
  const combined = `${nam} ${raw}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return Boolean(
    combined.match(/\b(regularisation|regul|reguls|ajustement|ajustements)\b/i) ||
    combined.includes("regularisation") ||
    combined.includes("ajustement") ||
    combined.includes("regul ") ||
    combined.startsWith("regul") ||
    combined.includes(" vir regul")
  );
};

export const isInternalTransferCategory = (category?: string): boolean => {
  if (!category) return false;
  if (isRegularisationCategory(category)) return true;
  const c = category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return (
    c === "virement interne" ||
    c === "virements internes" ||
    c === "epargne & tresorerie" ||
    c === "epargne interne" ||
    c === "virement compte a compte" ||
    c === "comptes a comptes" ||
    c === "mouvements internes" ||
    c === "transfert interne" ||
    c === "transferts internes" ||
    c.includes("virement interne") ||
    c.includes("compte a compte") ||
    c.includes("mouvements internes") ||
    c.includes("transfert interne")
  );
};

export const isInternalTransferTransaction = (
  tx: {
    name?: string;
    type?: string;
    rawName?: string;
    isInternalTransfer?: boolean;
    excludeFromSpending?: boolean;
    excludeFromIncome?: boolean;
  }
): boolean => {
  if (Boolean(tx.isInternalTransfer || tx.excludeFromSpending || tx.excludeFromIncome)) return true;
  if (isInternalTransferCategory(tx.type)) return true;
  if (isRegularisationCategory(tx.type)) return true;
  if (isRegularisationTransaction(tx)) return true;

  // Détection exhaustive par mot-clé pour parer aux données non enrichies
  const nam = (tx.name || "").toLowerCase();
  const raw = (tx.rawName || "").toLowerCase();
  const combined = `${nam} ${raw}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  return Boolean(
    combined.includes("livret") ||
    combined.includes("bourso+") ||
    combined.includes("virement vers") ||
    combined.includes("virement depuis") ||
    combined.includes("epargne") ||
    combined.includes("virement interne") ||
    combined.includes("comptes a comptes") ||
    combined.includes("compte a compte") ||
    combined.includes("mouvements internes") ||
    combined.includes("transfert interne") ||
    combined.match(/\b(vir interne|vir compte|vir vers|vir depuis|vir regul|regul|regularisation|ajustement)\b/i)
  );
};

export const isSubscriptionCategory = (category?: string): boolean => {
  if (!category) return false;
  const c = category.toLowerCase().trim();
  return (
    c === "abonnements & forfaits" ||
    c === "abonnements" ||
    c === "subscriptions" ||
    c === "forfaits" ||
    c.startsWith("abonnement") ||
    c.startsWith("subscription")
  );
};

export const isSalaryTransaction = (
  tx: { name: string; amount: number; type?: string; rawName?: string; isInternalTransfer?: boolean; excludeFromSpending?: boolean; excludeFromIncome?: boolean },
  referenceSalary = 0
): boolean => {
  if (tx.amount <= 0 || isInternalTransferTransaction(tx) || isRegularisationTransaction(tx) || tx.excludeFromIncome) return false;
  const nam = (tx.name || "").toLowerCase();
  const raw = (tx.rawName || "").toLowerCase();
  const combined = `${nam} ${raw}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Les régularisations ne sont jamais des salaires
  if (combined.match(/\b(regularisation|regul|reguls|ajustement|ajustements)\b/i)) return false;

  // Les aides sociales ou remboursements ne sont pas des salaires
  const isAids = Boolean(combined.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide|allocation/i));
  if (isAids) return false;

  const isRefund = Boolean(combined.match(/remboursement|avoir/i));
  if (isRefund) return false;

  // 1. Mots-clés de rémunération
  const matchesKeyword = Boolean(
    combined.match(/salaire|paie|paye|virement sepa|vir sepa|remuneration|rémunération|appointement|appointements|galeries|employeur/i)
  );

  // 2. Montant créditeur significatif en Revenus & Aides (>= 500 € ou >= 50% du salaire de référence)
  const isSignificantIncome =
    tx.type === "Revenus & Aides" &&
    (tx.amount >= 500 || (referenceSalary > 0 && tx.amount >= referenceSalary * 0.5));

  return matchesKeyword || isSignificantIncome;
};

export const isAidTransaction = (
  tx: { name: string; amount: number; type?: string; rawName?: string; isInternalTransfer?: boolean; excludeFromSpending?: boolean; excludeFromIncome?: boolean }
): boolean => {
  if (tx.amount <= 0 || isInternalTransferTransaction(tx) || isRegularisationTransaction(tx) || tx.excludeFromIncome) return false;
  const nam = (tx.name || "").toLowerCase();
  const raw = (tx.rawName || "").toLowerCase();
  const combined = `${nam} ${raw}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Les régularisations ne sont jamais des aides
  if (combined.match(/\b(regularisation|regul|reguls|ajustement|ajustements)\b/i)) return false;

  return Boolean(
    combined.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide|allocation/i)
  );
};

export const CATEGORY_COLORS: Record<string, { ring: string; fill: string; dot: string; bgSoft: string; textSoft: string }> = {
  "Transports": { ring: "#3B82F6", fill: "bg-blue-500", dot: "bg-blue-500", bgSoft: "bg-blue-500/10", textSoft: "text-blue-500" },
  "Restos & Fast-Food": { ring: "#F97316", fill: "bg-orange-500", dot: "bg-orange-500", bgSoft: "bg-orange-500/10", textSoft: "text-orange-500" },
  "Alimentation & Courses": { ring: "#10B981", fill: "bg-emerald-500", dot: "bg-emerald-500", bgSoft: "bg-emerald-500/10", textSoft: "text-emerald-500" },
  "Shopping & Mode": { ring: "#EC4899", fill: "bg-pink-500", dot: "bg-pink-500", bgSoft: "bg-pink-500/10", textSoft: "text-pink-500" },
  "Abonnements & Forfaits": { ring: "#8B5CF6", fill: "bg-purple-500", dot: "bg-purple-500", bgSoft: "bg-purple-500/10", textSoft: "text-purple-500" },
  "Santé & Soins": { ring: "#EF4444", fill: "bg-rose-500", dot: "bg-rose-500", bgSoft: "bg-rose-500/10", textSoft: "text-rose-500" },
  "Sorties & Soirées": { ring: "#06B6D4", fill: "bg-cyan-500", dot: "bg-cyan-500", bgSoft: "bg-cyan-500/10", textSoft: "text-cyan-500" },
  "Logement & Maison": { ring: "#EAB308", fill: "bg-yellow-500", dot: "bg-yellow-500", bgSoft: "bg-yellow-500/10", textSoft: "text-yellow-500" },
  "Virements proches & Remboursements": { ring: "#8B5CF6", fill: "bg-purple-500", dot: "bg-purple-500", bgSoft: "bg-purple-500/10", textSoft: "text-purple-500" },
  "Revenus & Aides": { ring: "#10B981", fill: "bg-emerald-500", dot: "bg-emerald-500", bgSoft: "bg-emerald-500/10", textSoft: "text-emerald-500" },
  "Épargne & Trésorerie": { ring: "#3B82F6", fill: "bg-blue-500", dot: "bg-blue-500", bgSoft: "bg-blue-500/10", textSoft: "text-blue-500" },
  "Virement interne": { ring: "#64748B", fill: "bg-slate-500", dot: "bg-slate-500", bgSoft: "bg-slate-500/10", textSoft: "text-slate-500" },
  "Régularisation": { ring: "#64748B", fill: "bg-slate-500", dot: "bg-slate-500", bgSoft: "bg-slate-500/10", textSoft: "text-slate-500" },
  "Autre": { ring: "#71717A", fill: "bg-zinc-500", dot: "bg-zinc-500", bgSoft: "bg-zinc-500/10", textSoft: "text-zinc-500" },
};

export const formatMonthLabel = (yyyyMM: string) => {
  if (!yyyyMM || yyyyMM === "Tout" || yyyyMM === "all") return "Aucun relevé";
  if (yyyyMM === "demo-month") return "Octobre 2026";
  const [yyyy, mm] = yyyyMM.split("-");
  if (!yyyy || !mm) return yyyyMM;
  const date = new Date(parseInt(yyyy), parseInt(mm) - 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
};

export const formatAmount = (val: number, showSign = true) => {
  const formatted = Math.abs(val).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!showSign) return `${formatted} €`;
  if (val > 0) return `+${formatted} €`;
  if (val < 0) return `-${formatted} €`;
  return `0,00 €`;
};

// Liste initiale vide : aucune transaction de démonstration codée en dur
export const initialDemoTransactions: Transaction[] = [];
