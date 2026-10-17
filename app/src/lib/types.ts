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
  account?: "BoursoBank" | "Crédit Agricole" | string;
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
  bank: "BoursoBank" | "Crédit Agricole" | "Autre";
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
  "Autre"
] as const;

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
  tx: { name: string; amount: number; type?: string; rawName?: string },
  referenceSalary = 0
): boolean => {
  if (tx.amount <= 0) return false;
  const nam = (tx.name || "").toLowerCase();
  const raw = (tx.rawName || "").toLowerCase();
  const combined = `${nam} ${raw}`;

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
  tx: { name: string; amount: number; type?: string; rawName?: string }
): boolean => {
  if (tx.amount <= 0) return false;
  const nam = (tx.name || "").toLowerCase();
  const raw = (tx.rawName || "").toLowerCase();
  return Boolean(
    nam.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide|allocation/i) ||
    raw.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide|allocation/i)
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

// Rich multi-month sample transactions for demo mode (Aug, Sep, Oct 2026)
export const initialDemoTransactions: Transaction[] = [
  // --- OCTOBRE 2026 (Mois en cours) ---
  { id: "demo-oct-1", name: "Employeur · Salaire", type: "Revenus & Aides", amount: 3200.00, date: "2026-10-01", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-2", name: "Netflix", type: "Abonnements & Forfaits", amount: -15.99, date: "2026-10-02", month: "2026-10", isSubscription: true, account: "BoursoBank" },
  { id: "demo-oct-3", name: "Loyer", type: "Logement & Maison", amount: -950.00, date: "2026-10-02", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-4", name: "Carrefour Market", type: "Alimentation & Courses", amount: -84.20, date: "2026-10-03", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-5", name: "Uber", type: "Transports", amount: -12.50, date: "2026-10-04", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-6", name: "Spotify", type: "Abonnements & Forfaits", amount: -10.99, date: "2026-10-05", month: "2026-10", isSubscription: true, account: "BoursoBank" },
  { id: "demo-oct-7", name: "Boulangerie Artisanale", type: "Alimentation & Courses", amount: -4.50, date: "2026-10-05", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-8", name: "Orange Fibre", type: "Abonnements & Forfaits", amount: -39.99, date: "2026-10-06", month: "2026-10", isSubscription: true, account: "Crédit Agricole" },
  { id: "demo-oct-9", name: "Pharmacie Principale", type: "Santé & Soins", amount: -14.20, date: "2026-10-08", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-10", name: "Restaurant Le Sud", type: "Restos & Fast-Food", amount: -45.00, date: "2026-10-09", month: "2026-10", account: "Crédit Agricole" },
  { id: "demo-oct-11", name: "Monoprix", type: "Alimentation & Courses", amount: -32.10, date: "2026-10-10", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-12", name: "Amazon", type: "Shopping & Mode", amount: -29.90, date: "2026-10-12", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-13", name: "Basic Fit", type: "Abonnements & Forfaits", amount: -29.99, date: "2026-10-14", month: "2026-10", isSubscription: true, account: "BoursoBank" },
  { id: "demo-oct-14", name: "Navigo Pass RATP", type: "Transports", amount: -84.10, date: "2026-10-15", month: "2026-10", isSubscription: true, account: "BoursoBank" },
  { id: "demo-oct-15", name: "Franprix", type: "Alimentation & Courses", amount: -18.40, date: "2026-10-17", month: "2026-10", account: "Crédit Agricole" },
  { id: "demo-oct-16", name: "Uber Eats", type: "Restos & Fast-Food", amount: -22.50, date: "2026-10-18", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-17", name: "Cinéma Gaumont", type: "Sorties & Soirées", amount: -28.00, date: "2026-10-20", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-18", name: "Virement Livret A", type: "Épargne & Trésorerie", amount: -350.00, date: "2026-10-22", month: "2026-10", isInternalTransfer: true, account: "BoursoBank" },
  { id: "demo-oct-19", name: "Leclerc Drive", type: "Alimentation & Courses", amount: -115.30, date: "2026-10-24", month: "2026-10", account: "Crédit Agricole" },
  { id: "demo-oct-20", name: "Remboursement Sécu", type: "Santé & Soins", amount: 18.50, date: "2026-10-26", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-21", name: "Asos", type: "Shopping & Mode", amount: -65.00, date: "2026-10-27", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-22", name: "Starbucks", type: "Restos & Fast-Food", amount: -6.50, date: "2026-10-28", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-23", name: "Boulangerie Artisanale", type: "Alimentation & Courses", amount: -3.20, date: "2026-10-29", month: "2026-10", account: "BoursoBank" },
  { id: "demo-oct-24", name: "Uber", type: "Transports", amount: -18.00, date: "2026-10-30", month: "2026-10", account: "BoursoBank" },

  // --- SEPTEMBRE 2026 ---
  { id: "demo-sep-1", name: "Employeur · Salaire", type: "Revenus & Aides", amount: 3200.00, date: "2026-09-01", month: "2026-09", account: "BoursoBank" },
  { id: "demo-sep-2", name: "Netflix", type: "Abonnements & Forfaits", amount: -15.99, date: "2026-09-02", month: "2026-09", isSubscription: true, account: "BoursoBank" },
  { id: "demo-sep-3", name: "Loyer", type: "Logement & Maison", amount: -950.00, date: "2026-09-02", month: "2026-09", account: "BoursoBank" },
  { id: "demo-sep-4", name: "Carrefour Market", type: "Alimentation & Courses", amount: -92.40, date: "2026-09-04", month: "2026-09", account: "BoursoBank" },
  { id: "demo-sep-5", name: "Spotify", type: "Abonnements & Forfaits", amount: -10.99, date: "2026-09-05", month: "2026-09", isSubscription: true, account: "BoursoBank" },
  { id: "demo-sep-6", name: "Orange Fibre", type: "Abonnements & Forfaits", amount: -39.99, date: "2026-09-06", month: "2026-09", isSubscription: true, account: "Crédit Agricole" },
  { id: "demo-sep-7", name: "Basic Fit", type: "Abonnements & Forfaits", amount: -29.99, date: "2026-09-14", month: "2026-09", isSubscription: true, account: "BoursoBank" },
  { id: "demo-sep-8", name: "Navigo Pass RATP", type: "Transports", amount: -84.10, date: "2026-09-15", month: "2026-09", isSubscription: true, account: "BoursoBank" },
  { id: "demo-sep-9", name: "Zara", type: "Shopping & Mode", amount: -112.50, date: "2026-09-16", month: "2026-09", account: "BoursoBank" },
  { id: "demo-sep-10", name: "Leclerc Drive", type: "Alimentation & Courses", amount: -128.00, date: "2026-09-19", month: "2026-09", account: "Crédit Agricole" },
  { id: "demo-sep-11", name: "Restaurant Italien", type: "Restos & Fast-Food", amount: -58.00, date: "2026-09-21", month: "2026-09", account: "BoursoBank" },
  { id: "demo-sep-12", name: "Virement Livret A", type: "Épargne & Trésorerie", amount: -400.00, date: "2026-09-25", month: "2026-09", isInternalTransfer: true, account: "BoursoBank" },
  { id: "demo-sep-13", name: "Pharmacie", type: "Santé & Soins", amount: -22.30, date: "2026-09-28", month: "2026-09", account: "BoursoBank" },

  // --- AOÛT 2026 ---
  { id: "demo-aou-1", name: "Employeur · Salaire", type: "Revenus & Aides", amount: 3200.00, date: "2026-08-01", month: "2026-08", account: "BoursoBank" },
  { id: "demo-aou-2", name: "Netflix", type: "Abonnements & Forfaits", amount: -15.99, date: "2026-08-02", month: "2026-08", isSubscription: true, account: "BoursoBank" },
  { id: "demo-aou-3", name: "Loyer", type: "Logement & Maison", amount: -950.00, date: "2026-08-02", month: "2026-08", account: "BoursoBank" },
  { id: "demo-aou-4", name: "SNCF Connect", type: "Transports", amount: -145.00, date: "2026-08-05", month: "2026-08", account: "BoursoBank" },
  { id: "demo-aou-5", name: "Spotify", type: "Abonnements & Forfaits", amount: -10.99, date: "2026-08-05", month: "2026-08", isSubscription: true, account: "BoursoBank" },
  { id: "demo-aou-6", name: "Orange Fibre", type: "Abonnements & Forfaits", amount: -39.99, date: "2026-08-06", month: "2026-08", isSubscription: true, account: "Crédit Agricole" },
  { id: "demo-aou-7", name: "Carrefour Market", type: "Alimentation & Courses", amount: -76.80, date: "2026-08-10", month: "2026-08", account: "BoursoBank" },
  { id: "demo-aou-8", name: "Basic Fit", type: "Abonnements & Forfaits", amount: -29.99, date: "2026-08-14", month: "2026-08", isSubscription: true, account: "BoursoBank" },
  { id: "demo-aou-9", name: "Navigo Pass RATP", type: "Transports", amount: -84.10, date: "2026-08-15", month: "2026-08", isSubscription: true, account: "BoursoBank" },
  { id: "demo-aou-10", name: "Restaurant Plage", type: "Restos & Fast-Food", amount: -72.00, date: "2026-08-18", month: "2026-08", account: "Crédit Agricole" },
  { id: "demo-aou-11", name: "Virement Livret A", type: "Épargne & Trésorerie", amount: -500.00, date: "2026-08-25", month: "2026-08", isInternalTransfer: true, account: "BoursoBank" }
];
