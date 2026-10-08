"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Area, AreaChart, LineChart, Line, Legend, ResponsiveContainer, Tooltip, XAxis, PieChart, Pie, Cell, BarChart, Bar, ReferenceLine } from "recharts";
import { CSVUploader } from "./CSVUploader";
import { SubscriptionManager } from "./SubscriptionManager";
import { useState, useMemo, useEffect } from "react";
import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, RefreshCcw, Loader2, ChevronDown, Trash2, X, Wallet, Repeat, Check, Sparkles, AlertCircle, CheckCircle2, Info, Activity, PieChart as PieChartIcon, CreditCard, ArrowRightLeft, Download, UploadCloud, ShieldCheck, Flag, ShoppingCart, Utensils, ShoppingBag, Train, Monitor, Ticket, HeartPulse, Home, Star, CalendarDays } from "lucide-react";

type Transaction = {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  month: string;
  isSubscription?: boolean;
  isInternalTransfer?: boolean;
};

type FixedIncomeSettings = {
  salary: number;
  salaryDay: number;
  aids: number;
  autoApply: boolean;
  savingsGoal?: number;
};

function parseAndFormatDate(dateStr: string) {
  let parsedDate = new Date(dateStr);
  if (isNaN(parsedDate.getTime()) && dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
  }
  
  if (isNaN(parsedDate.getTime())) {
    return null;
  }
  
  const yyyy = parsedDate.getFullYear();
  const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const dd = String(parsedDate.getDate()).padStart(2, '0');
  
  return {
    date: `${yyyy}-${mm}-${dd}`,
    month: `${yyyy}-${mm}`
  };
}

const OFFICIAL_CATEGORIES = [
  "Alimentation & Courses",
  "Restos & Fast-Food",
  "Sorties & Soirées",
  "Shopping & Mode",
  "Transports",
  "Abonnements & Forfaits",
  "Santé & Soins",
  "Virements proches & Remboursements",
  "Revenus & Aides",
  "Épargne & Trésorerie"
];

function getLocalFallback(categoryBourso: string, name: string, cache: Record<string, any>) {
  const cat = categoryBourso.toLowerCase();
  const nam = name.toLowerCase();
  
  // Intercept savings and internal transfers immediately, bypassing cache
  if (
    cat.includes("mouvements internes") ||
    cat.includes("comptes à comptes") ||
    nam.includes("livret") ||
    nam.includes("bourso+") ||
    nam.includes("epargne") ||
    nam.includes("épargne") ||
    nam.includes("virement interne") ||
    nam.includes("virement vers") ||
    nam.includes("virement depuis")
  ) {
    return { type: "Épargne & Trésorerie", isSub: false, isInternalTransfer: true };
  }

  if (cache[name] && cache[name].categorie) {
    return {
      type: cache[name].categorie,
      isSub: cache[name].isSubscription || false,
      isInternalTransfer: false
    };
  }

  let type = "Autre";
  let isSub = false;
  let isInternalTransfer = false;

  // 1. Dictionnaire natif prioritaire
  if (/ile-de-france|idfm|ratp|sncf|uber \*trip|bolt|total|esso/i.test(nam)) type = "Transports";
  else if (/mcdonald|burger king|uber eats|deliveroo|crous|tasty|starbucks|kebab|boulangerie/i.test(nam)) type = "Restos & Fast-Food";
  else if (/u express|monoprix|carrefour|auchan|lidl|aldi|franprix|intermarche/i.test(nam)) type = "Alimentation & Courses";
  else if (/basic-fit|bouygues|free|orange|sfr|spotify|netflix|apple\.com\/bill|icloud/i.test(nam)) {
    type = "Abonnements & Forfaits";
    isSub = true;
  }
  else if (/uniqlo|zara|galeries lafayette|asos|amazon|ikea|normal/i.test(nam)) type = "Shopping & Mode";
  else if (/pharmacie|doctolib|livi|laboratoire/i.test(nam)) type = "Santé & Soins";

  // 2. Mots clés BoursoBank
  if (type === "Autre") {
    if (cat.includes("restaurant") || cat.includes("bar") || cat.includes("discothèque")) type = "Restos & Fast-Food";
    else if (cat.includes("alimentation")) type = "Alimentation & Courses";
    else if (cat.includes("vêtement") || cat.includes("mobilier") || cat.includes("décoration")) type = "Shopping & Mode";
    else if (cat.includes("transport") || cat.includes("taxi")) type = "Transports";
    else if (cat.includes("téléphonie") || cat.includes("club") || cat.includes("association")) type = "Abonnements & Forfaits";
    else if (cat.includes("médecin") || cat.includes("frais médicaux") || cat.includes("santé")) type = "Santé & Soins";
    else if (cat.includes("virement émis") || cat.includes("virement reçu") || cat.includes("don") || cat.includes("cadeau")) type = "Virements proches & Remboursements";
    else if (cat.includes("allocation") || cat.includes("salaire")) type = "Revenus & Aides";
  }

  if (type === "Abonnements & Forfaits") isSub = true;

  return { type, isSub, isInternalTransfer };
}

const formatMonthLabel = (yyyyMM: string) => {
  if (yyyyMM === "Tout") return "Toutes les périodes";
  const [yyyy, mm] = yyyyMM.split("-");
  const date = new Date(parseInt(yyyy), parseInt(mm) - 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
};

const initialTransactions: Transaction[] = [
  { id: "1", name: "Netflix", type: "Abonnements & Forfaits", amount: -15.99, date: "2026-10-15", month: "2026-10", isSubscription: true },
  { id: "2", name: "Uber Eats", type: "Restos & Fast-Food", amount: -25.50, date: "2026-10-12", month: "2026-10" },
  { id: "3", name: "Virement Salaire", type: "Revenus & Aides", amount: 2800.00, date: "2026-10-01", month: "2026-10" },
];

function Card({ children, className = "", noPadding = false }: { children: React.ReactNode; className?: string, noPadding?: boolean }) {
  return (
    <div className={`bg-card border border-border rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col ${noPadding ? "" : "p-6 xl:p-8"} ${className}`}>
      {children}
    </div>
  );
}

export const CATEGORY_COLORS: Record<string, { ring: string; fill: string; dot: string }> = {
  "Transports": { ring: "#3B82F6", fill: "bg-blue-500", dot: "bg-blue-500" },
  "Restos & Fast-Food": { ring: "#F97316", fill: "bg-orange-500", dot: "bg-orange-500" },
  "Alimentation & Courses": { ring: "#10B981", fill: "bg-emerald-500", dot: "bg-emerald-500" },
  "Shopping & Mode": { ring: "#EC4899", fill: "bg-pink-500", dot: "bg-pink-500" },
  "Abonnements & Forfaits": { ring: "#8B5CF6", fill: "bg-purple-500", dot: "bg-purple-500" },
  "Santé & Soins": { ring: "#EF4444", fill: "bg-rose-500", dot: "bg-rose-500" },
  "Sorties & Soirées": { ring: "#06B6D4", fill: "bg-cyan-500", dot: "bg-cyan-500" },
  "Logement & Maison": { ring: "#EAB308", fill: "bg-yellow-500", dot: "bg-yellow-500" },
  "Virements proches & Remboursements": { ring: "#8B5CF6", fill: "bg-purple-500", dot: "bg-purple-500" },
  "Revenus & Aides": { ring: "#10B981", fill: "bg-emerald-500", dot: "bg-emerald-500" },
  "Épargne & Trésorerie": { ring: "#3B82F6", fill: "bg-blue-500", dot: "bg-blue-500" },
  "Autre": { ring: "#71717A", fill: "bg-zinc-500", dot: "bg-zinc-500" },
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.dateFormatted) return null;
    return (
      <div className="bg-neutral-900/90 dark:bg-black/90 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-3 shadow-xl min-w-[180px]">
        <div className="text-xs text-neutral-400 font-medium mb-1">{data.dateFormatted}</div>
        <div className="text-base font-bold text-white mb-1">{data.amount.toFixed(2)} €</div>
        {!data.rawMonth && <div className="text-xs text-neutral-400 mb-2">Total cumulé : {data.cumulative.toFixed(2)} €</div>}
        {data.topTx && data.topTx.length > 0 && (
          <div className="pt-2 border-t border-white/[0.1] flex flex-col gap-1.5 mt-1">
            {data.topTx.map((tx: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-[11px]">
                <span className="text-neutral-300 truncate pr-3 max-w-[120px]">{tx.name}</span>
                <span className="text-neutral-400 whitespace-nowrap">{tx.amount.toFixed(2)} €</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
};

const CustomRaceTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const sorted = [...payload].sort((a, b) => b.value - a.value);
    return (
      <div className="bg-neutral-900/90 dark:bg-black/90 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-3 shadow-xl min-w-[180px]">
        <div className="text-xs text-neutral-400 font-medium mb-3">Jour {data.day}</div>
        <div className="flex flex-col gap-1.5">
          {sorted.map((entry, i) => (
            <div key={i} className="flex justify-between items-center text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-neutral-300 truncate max-w-[90px]">{formatMonthLabel(entry.dataKey)}</span>
              </div>
              <span className="text-neutral-100 font-medium whitespace-nowrap pl-3">{entry.value.toFixed(2)} €</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const CategoryIcon = ({ type, isSubscription, isInternalTransfer }: { type: string, isSubscription?: boolean, isInternalTransfer?: boolean }) => {
  const color = CATEGORY_COLORS[type]?.ring || "#A1A1AA";
  const iconProps = { size: 16, strokeWidth: 2, style: { color } };

  if (isSubscription || type === "Abonnements & Forfaits") return <Repeat {...iconProps} />;
  if (isInternalTransfer || type === "Épargne & Trésorerie" || type === "Revenus & Aides" || type === "Virements proches & Remboursements") return <ArrowRightLeft {...iconProps} />;

  switch (type) {
    case "Alimentation & Courses": return <ShoppingCart {...iconProps} />;
    case "Restos & Fast-Food": return <Utensils {...iconProps} />;
    case "Shopping & Mode": return <ShoppingBag {...iconProps} />;
    case "Transports": return <Train {...iconProps} />;
    case "Sorties & Soirées": return <Ticket {...iconProps} />;
    case "Santé & Soins": return <HeartPulse {...iconProps} />;
    case "Logement & Maison": return <Home {...iconProps} />;
    default: return <Star {...iconProps} />;
  }
};

const TransactionRow = ({ tx, hideDescription }: { tx: Transaction, hideDescription?: boolean }) => {
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }} 
      className="flex items-center justify-between min-h-[58px] px-4 py-3 rounded-2xl cursor-pointer group hover:bg-neutral-50 dark:hover:bg-muted/40 transition-all border border-transparent hover:border-black/5 dark:hover:border-white/5"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-neutral-800/80 dark:bg-white/[0.06] border border-white/[0.06] flex items-center justify-center shrink-0">
          <CategoryIcon type={tx.type} isSubscription={tx.isSubscription} isInternalTransfer={tx.isInternalTransfer} />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm xl:text-base text-foreground truncate max-w-[120px] xl:max-w-[180px]">{tx.name}</div>
          {!hideDescription && tx.type && (
            <div className="flex items-center gap-2 mt-0.5">
              {tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer ? (
                <span className="text-[10px] uppercase font-bold bg-neutral-200/50 dark:bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full shrink-0">Virement interne</span>
              ) : (
                <div className="text-xs xl:text-sm text-muted-foreground truncate max-w-[120px] xl:max-w-[180px]">
                  {tx.type}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-bold text-sm xl:text-base text-foreground`}>
          {tx.amount > 0 ? "+" : ""}{tx.amount.toFixed(2)} €
        </div>
        <div className="text-xs xl:text-sm text-muted-foreground mt-0.5">{tx.date}</div>
      </div>
    </motion.div>
  );
};

const SHOW_AI_COACH = false;

const CalendarModal = ({ 
  isOpen, 
  onClose, 
  transactions, 
  selectedMonth, 
  onSelectMonth 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  transactions: Transaction[], 
  selectedMonth: string,
  onSelectMonth: (m: string) => void 
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(transactions.map(t => parseInt(t.date.slice(0, 4)))));
    if (years.length === 0) return [new Date().getFullYear()];
    return years.sort((a, b) => a - b);
  }, [transactions]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear) && availableYears.length > 0) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, selectedYear]);

  const monthlyStats = useMemo(() => {
    const stats: Record<string, { count: number, expenses: number, balance: number }> = {};
    for (let i = 1; i <= 12; i++) {
      const mm = i.toString().padStart(2, '0');
      stats[`${selectedYear}-${mm}`] = { count: 0, expenses: 0, balance: 0 };
    }

    transactions.forEach(tx => {
      if (tx.date.startsWith(`${selectedYear}-`)) {
        const m = tx.month;
        if (stats[m]) {
          stats[m].count++;
          if (tx.amount < 0 && !tx.isInternalTransfer && tx.type !== "Épargne & Trésorerie") {
            stats[m].expenses += Math.abs(tx.amount);
          }
          if (tx.amount > 0 || (!tx.isInternalTransfer && tx.type !== "Épargne & Trésorerie")) {
             stats[m].balance += tx.amount;
          }
        }
      }
    });
    return stats;
  }, [transactions, selectedYear]);

  if (!isOpen) return null;

  const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-4xl bg-neutral-900 border border-white/[0.08] rounded-3xl p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh]"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/10 transition-colors">
          <X size={20} className="text-neutral-400 hover:text-white" />
        </button>

        <h2 className="text-2xl font-bold tracking-tight text-white mb-6">Vue annuelle</h2>
        
        <div className="flex gap-2 mb-8 border-b border-white/[0.06] pb-4">
          {availableYears.map(y => (
            <button 
              key={y} 
              onClick={() => setSelectedYear(y)}
              className={clsx(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                selectedYear === y ? "bg-white text-black" : "text-neutral-400 hover:text-white hover:bg-white/5"
              )}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
            {months.map((monthName, i) => {
              const mm = (i + 1).toString().padStart(2, '0');
              const key = `${selectedYear}-${mm}`;
              const stat = monthlyStats[key];
              const isActive = stat.count > 0;
              const isSelected = selectedMonth === key;

              return (
                <div 
                  key={key} 
                  onClick={() => {
                    if (isActive) {
                      onSelectMonth(key);
                      onClose();
                    }
                  }}
                  className={clsx(
                    "rounded-2xl border transition-all p-4 flex flex-col justify-between h-[110px]",
                    isActive ? "bg-neutral-900/60 cursor-pointer hover:bg-neutral-800" : "bg-transparent border-dashed border-white/[0.04] opacity-30 pointer-events-none",
                    isSelected ? "border-white/40 ring-1 ring-white/20" : isActive ? "border-white/[0.06] hover:border-white/20" : ""
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-white truncate pr-2">{monthName}</span>
                    {isActive && <span className="text-[10px] bg-white/[0.08] text-neutral-300 px-2 py-0.5 rounded-full shrink-0">{stat.count} op</span>}
                  </div>
                  {isActive && (
                    <div className="mt-auto flex justify-between items-end">
                      <div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Dépenses</div>
                        <div className="text-sm font-bold text-white">{stat.expenses.toFixed(0)} €</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Solde</div>
                        <div className={clsx("text-sm font-bold", stat.balance >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {stat.balance > 0 ? "+" : ""}{stat.balance.toFixed(0)} €
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [processState, setProcessState] = useState<null | "reading" | "analyzing" | "calculating">(null);
  const [toastMessage, setToastMessage] = useState<{ text: string, visible: boolean } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("Tout");
  const [showResetModal, setShowResetModal] = useState(false);
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"income" | "subs" | "budgets">("income");
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  
  const [coachTips, setCoachTips] = useState<{type: string, text: string}[] | null>(null);
  const [isCoachLoading, setIsCoachLoading] = useState(false);

  const [incomeSettings, setIncomeSettings] = useState<FixedIncomeSettings>({
    salary: 1300,
    salaryDay: 28,
    aids: 195,
    autoApply: false,
    savingsGoal: 0
  });

  // Settings & Inbox Modal Listeners
  useEffect(() => {
    const handleOpenSettings = () => setShowSettingsModal(true);
    const handleOpenInbox = () => setShowInbox(true);
    const handleNav = (e: any) => setActiveTab(e.detail.tab);
    window.addEventListener("open-settings", handleOpenSettings);
    window.addEventListener("open-inbox", handleOpenInbox);
    window.addEventListener("navigate-tab", handleNav);
    return () => {
      window.removeEventListener("open-settings", handleOpenSettings);
      window.removeEventListener("open-inbox", handleOpenInbox);
      window.removeEventListener("navigate-tab", handleNav);
    };
  }, []);

  // Load transactions and settings from localStorage on mount
  useEffect(() => {
    const savedTx = localStorage.getItem('financeTransactions_v1');
    if (savedTx) {
      let parsed = JSON.parse(savedTx) as Transaction[];
      
      // Auto-migrate old internal transfer transactions
      let hasMutated = false;
      parsed = parsed.map(tx => {
        const nam = tx.name.toLowerCase();
        const isInternal = nam.includes("livret") || 
           nam.includes("bourso+") || 
           nam.includes("virement vers") || 
           nam.includes("virement depuis") || 
           nam.includes("epargne") || 
           nam.includes("épargne") || 
           nam.includes("virement interne") ||
           tx.type === "Épargne & Trésorerie";

        if (isInternal && (!tx.isInternalTransfer || tx.type !== "Épargne & Trésorerie")) {
          hasMutated = true;
          return { ...tx, type: "Épargne & Trésorerie", isInternalTransfer: true };
        }
        return tx;
      });

      setTransactions(parsed);
      
      const months = Array.from(new Set(parsed.map(tx => tx.month))).sort().reverse();
      if (months.length > 0) {
        setSelectedMonth(months[0]);
      }
      
      if (hasMutated) {
        localStorage.setItem('financeTransactions_v1', JSON.stringify(parsed));
      }

    } else {
      setTransactions([]);
    }

    const savedBudgets = localStorage.getItem('categoryBudgets');
    if (savedBudgets) {
      try { setCategoryBudgets(JSON.parse(savedBudgets)); } catch(e) {}
    }

    const savedIncome = localStorage.getItem('fixedIncomeSettings');
    if (savedIncome) {
      setIncomeSettings(JSON.parse(savedIncome));
    }
  }, []);

  // Keyboard Shortcuts for Modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettingsModal(false);
        setShowResetModal(false);
      }
      
      if (e.key === "Enter" && showResetModal) {
        confirmReset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSettingsModal, showResetModal, showInbox]);

  const confirmReset = () => {
    setTransactions(prev => {
      const updated = prev.filter(tx => tx.month !== selectedMonth);
      if (updated.length === 0) {
        localStorage.removeItem('financeTransactions_v1');
      } else {
        localStorage.setItem('financeTransactions_v1', JSON.stringify(updated));
      }
      return updated;
    });
    setSelectedMonth("Tout");
    setShowResetModal(false);
  };

  // Save to localStorage whenever transactions change
  useEffect(() => {
    if (transactions.length > 0) {
      localStorage.setItem('financeTransactions_v1', JSON.stringify(transactions));
    }
    window.dispatchEvent(new CustomEvent("finance-data-state"));
  }, [transactions]);

  const hasData = transactions && transactions.length > 0;
  const activeTransactions = hasData ? transactions : initialTransactions;

  const availableMonths = useMemo(() => {
    const months = Array.from(new Set(activeTransactions.map(tx => tx.month))).sort().reverse();
    return ["Tout", ...months];
  }, [activeTransactions]);

  const handleUpload = async (data: any[]) => {
    try {
      setProcessState("reading");
      
      // Artificial slight delay for smoothness
      await new Promise(r => setTimeout(r, 600));

      const cache = JSON.parse(localStorage.getItem('financeCategoryCache_v2') || '{}');

      const parsedRows = data
        .filter((row: any[], i: number) => {
          if (i === 0 && typeof row[0] === "string" && row[0].includes("Date")) return false;
          // Accept lines with at least a date and an amount column, even if missing trailing columns
          return row.length >= 6 && row[0] && (row[6] !== undefined || row[5] !== undefined);
        })
        .map((row: any[]) => {
          const dateStr = String(row[0]).trim();
          const rawLibelle = String(row[2] || "").trim();
          const suggLibelle = String(row[3] || "").trim();
          const categoryBourso = String(row[4] || "").trim();
          const rawAmount = String(row[6] !== undefined ? row[6] : row[5] || "0").trim();
          
          const name = suggLibelle || rawLibelle || "Unknown";
          const fallback = getLocalFallback(categoryBourso, name, cache);
          
          const cleanedAmount = rawAmount.replace(/\s/g, '').replace('€', '').replace(',', '.');
          const amount = parseFloat(cleanedAmount);
          const dateInfo = parseAndFormatDate(dateStr);
          
          if (!dateInfo) {
            console.warn("Ligne ignorée, date invalide :", row);
            return null;
          }

          const rawId = `${dateInfo.date}_${amount}_${name.trim().toLowerCase()}_${categoryBourso}`;
          
          return {
            id: rawId,
            name,
            type: fallback.type,
            amount: isNaN(amount) ? 0 : amount,
            date: dateInfo.date,
            month: dateInfo.month,
            isSubscription: fallback.isSub,
            isInternalTransfer: fallback.isInternalTransfer,
          };
        })
        .filter((row): row is Transaction => row !== null && row.amount !== 0);

      const unknownLabels = Array.from(new Set(
        parsedRows
          .filter(r => r.type === "Autre")
          .map(r => r.name)
      ));

      setProcessState("analyzing");
      
      let newMapping: Record<string, { categorie: string, isSubscription: boolean }> = {};
      
      if (unknownLabels.length > 0) {
        console.log("Labels envoyés à Gemini:", unknownLabels);
        try {
          const res = await fetch("/api/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ labels: unknownLabels }),
          });
          
          console.log("Status de l'API Gemini:", res.status);
          if (res.ok) {
            const result = await res.json();
            if (result.classifications && Array.isArray(result.classifications)) {
              result.classifications.forEach((item: any) => {
                // Ensure Gemini returned an official category
                if (OFFICIAL_CATEGORIES.includes(item.categorie)) {
                  newMapping[item.libelle] = {
                    categorie: item.categorie,
                    isSubscription: item.isSubscription || false
                  };
                }
              });
              
              const updatedCache = { ...cache, ...newMapping };
              localStorage.setItem('financeCategoryCache_v2', JSON.stringify(updatedCache));
            }
          } else {
            console.warn("L'API Gemini a retourné un statut:", res.status);
          }
        } catch (apiErr) {
          console.error("Erreur de connexion à l'API Gemini:", apiErr);
        }
      }

      setProcessState("calculating");
      await new Promise(r => setTimeout(r, 500));

      const finalCache = { ...cache, ...newMapping };

      const newTransactions = parsedRows.map(row => {
        // Absolute rule: internal transfers must never be overridden by cache
        if (row.isInternalTransfer) {
          return {
            ...row,
            type: "Épargne & Trésorerie",
            isSubscription: false,
            isInternalTransfer: true,
          };
        }

        const cachedData = finalCache[row.name];
        return {
          ...row,
          type: cachedData ? cachedData.categorie : row.type, // Fallback local
          isSubscription: cachedData ? cachedData.isSubscription : row.isSubscription,
        };
      });

      let addedCount = 0;
      let duplicatesCount = 0;
      const uniqueMonths = new Set<string>();

      let majorityMonth = "Tout";
      setTransactions(prev => {
        const prevHashes = new Set(prev.map(p => p.id));
        const actuallyNew: Transaction[] = [];

        newTransactions.forEach(tx => {
          if (prevHashes.has(tx.id)) {
            duplicatesCount++;
          } else {
            actuallyNew.push(tx);
            prevHashes.add(tx.id);
            addedCount++;
            uniqueMonths.add(tx.month);
          }
        });

        // Auto redirect to majority month of newly added transactions
        if (actuallyNew.length > 0) {
          const monthCounts = actuallyNew.reduce((acc, tx) => {
            acc[tx.month] = (acc[tx.month] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          let maxCount = 0;
          for (const [m, c] of Object.entries(monthCounts)) {
            if (c > maxCount) {
              maxCount = c;
              majorityMonth = m;
            }
          }
        }

        return [...actuallyNew, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      const allNewDates = newTransactions.map(t => new Date(t.date).getTime()).filter(t => !isNaN(t)).sort();
      const oldestDate = allNewDates.length ? new Date(allNewDates[0]).toLocaleDateString("fr-FR") : "?";
      const newestDate = allNewDates.length ? new Date(allNewDates[allNewDates.length - 1]).toLocaleDateString("fr-FR") : "?";
      console.log(`Importé : ${newTransactions.length} opérations sur ${uniqueMonths.size} mois (du ${oldestDate} au ${newestDate})`);

      if (majorityMonth !== "Tout") {
        setSelectedMonth(majorityMonth);
      } else if (newTransactions.length > 0) {
        // Fallback to the most recent month if no new tx but we still want to select something
        const sortedMonths = Array.from(new Set(newTransactions.map(t => t.month))).sort().reverse();
        setSelectedMonth(sortedMonths[0]);
      }

      setProcessState(null);
      setToastMessage({
        text: `Import réussi : ${addedCount} nouvelles opérations ajoutées sur ${uniqueMonths.size} mois (${duplicatesCount} doublons ignorés).`,
        visible: true
      });
      
      setTimeout(() => {
        setToastMessage(prev => prev ? { ...prev, visible: false } : null);
        setTimeout(() => setToastMessage(null), 400); // Wait for exit animation
      }, 5000);
      
    } catch (e) {
      console.error("Upload error", e);
      setProcessState(null);
    }
  };

  const handleUpdateSubscription = (merchantName: string, isSub: boolean) => {
    // 1. Update cache so future imports remember this
    const cache = JSON.parse(localStorage.getItem('financeCategoryCache_v2') || '{}');
    if (cache[merchantName]) {
      cache[merchantName].isSubscription = isSub;
    } else {
      const tx = transactions.find(t => t.name === merchantName);
      cache[merchantName] = { categorie: tx?.type || "Autre", isSubscription: isSub };
    }
    localStorage.setItem('financeCategoryCache_v2', JSON.stringify(cache));

    // 2. Update existing transactions and save
    setTransactions(prev => {
      const updated = prev.map(tx => tx.name === merchantName ? { ...tx, isSubscription: isSub } : tx);
      localStorage.setItem('financeTransactions_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSaveIncomeSettings = (newSettings: FixedIncomeSettings) => {
    setIncomeSettings(newSettings);
    localStorage.setItem('fixedIncomeSettings', JSON.stringify(newSettings));
  };

  const handleSaveBudget = (cat: string, val: number) => {
    setCategoryBudgets(prev => {
      const next = { ...prev };
      if (val <= 0 || isNaN(val)) delete next[cat];
      else next[cat] = val;
      localStorage.setItem('categoryBudgets', JSON.stringify(next));
      return next;
    });
  };

  const handleSaveSettingsClick = () => {
    // Both income and subscriptions are already saved to state/cache upon edit.
    // This button serves as a clear confirmation for the user.
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      setShowSettingsModal(false);
    }, 800);
  };

  const filteredTransactions = useMemo(() => {
    if (selectedMonth === "Tout") return activeTransactions;
    return activeTransactions.filter(tx => tx.month === selectedMonth);
  }, [activeTransactions, selectedMonth]);

  const inboxTx = useMemo(() => {
    return filteredTransactions.filter(tx => tx.type === "Autre");
  }, [filteredTransactions]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("update-inbox-count", { detail: { count: inboxTx.length } }));
  }, [inboxTx.length]);


  const isAllTime = selectedMonth === "Tout";
  const monthsCount = useMemo(() => {
    return Math.max(1, new Set(transactions.map(t => t.date.slice(0, 7))).size);
  }, [transactions]);

  const { expenses, income, balance, subs, categoryData, expensesTimeline, autoAppliedInfo } = useMemo(() => {
    let exp = 0;
    let inc = 0;
    let subTotal = 0;
    const catMap: Record<string, number> = {};
    const timeMap: Record<string, number> = {};
    
    let hasSalary = false;
    let hasAids = false;

    filteredTransactions.forEach(tx => {
      const isInternal = tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer;
      const nam = tx.name.toLowerCase();
      
      if (isInternal) return; // Completely ignore

      if (tx.amount < 0) {
        // Normal expenses
        exp += Math.abs(tx.amount);
        
        if (tx.type !== "Revenus & Aides") {
          catMap[tx.type] = (catMap[tx.type] || 0) + Math.abs(tx.amount);
        }
        
        if (tx.isSubscription || tx.type === "Abonnements & Forfaits") {
          subTotal += Math.abs(tx.amount);
        }

        const day = tx.date.split("-").slice(1).join("/");
        const label = selectedMonth === "Tout" ? tx.month : tx.date.split("-")[2];
        timeMap[label] = (timeMap[label] || 0) + Math.abs(tx.amount);
      } else {
        // Positive amounts (Refunds or Incomes)
        const isSalary = 
          tx.amount >= incomeSettings.salary * 0.6 ||
          nam.includes("salaire") ||
          nam.includes("remuneration") ||
          nam.includes("rémunération") ||
          nam.includes("paye") ||
          nam.includes("vir sepa societe") ||
          nam.includes("employeur");

        const isAids = 
          nam.includes("caf") ||
          nam.includes("allocation") ||
          nam.includes("cpam") ||
          nam.includes("pole emploi") ||
          nam.includes("france travail");

        const isRefund = 
          (!isSalary && !isAids && tx.type !== "Revenus & Aides") ||
          nam.includes("avoir") || 
          nam.includes("remboursement") || 
          nam.includes("annulation") || 
          nam.includes("retour") ||
          tx.type === "Virements proches & Remboursements";

        if (isRefund) {
          // It's a refund! Deduct from expenses instead of counting as income
          exp -= tx.amount;
          if (exp < 0) exp = 0;
          
          if (catMap[tx.type] !== undefined) {
            catMap[tx.type] -= tx.amount;
            if (catMap[tx.type] < 0) catMap[tx.type] = 0;
          }
          
          const day = tx.date.split("-").slice(1).join("/");
          const label = selectedMonth === "Tout" ? tx.month : tx.date.split("-")[2];
          if (timeMap[label] !== undefined) {
            timeMap[label] -= tx.amount;
            if (timeMap[label] < 0) timeMap[label] = 0;
          }
        } else {
          // It's a real income
          inc += tx.amount;
          if (isSalary) hasSalary = true;
          if (isAids) hasAids = true;
        }
      }
    });

    let autoAppliedInfo: string | null = null;
    if (incomeSettings.autoApply && selectedMonth !== "Tout") {
      let added = 0;
      let msgs = [];
      if (!hasSalary && incomeSettings.salary > 0) {
        added += incomeSettings.salary;
        msgs.push(`Salaire (${incomeSettings.salary.toLocaleString("fr-FR")} €)`);
      }
      if (!hasAids && incomeSettings.aids > 0) {
        added += incomeSettings.aids;
        msgs.push(`Aides (${incomeSettings.aids.toLocaleString("fr-FR")} €)`);
      }
      
      if (added > 0) {
        inc += added;
        autoAppliedInfo = `Inclus : ${msgs.join(" & ")}`;
      }
    }

    const sortedCats = Object.entries(catMap)
      .filter(([name]) => name !== "Épargne & Trésorerie")
      .map(([name, value]) => ({ name, value: isAllTime ? value / monthsCount : value, max: exp > 0 ? exp : 1 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    let timeline: any[] = [];
    if (selectedMonth !== "Tout") {
      const [yyyy, mm] = selectedMonth.split("-");
      const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
      let cumulative = 0;
      for (let i = 1; i <= lastDay; i++) {
        const dayStr = i.toString().padStart(2, '0');
        const amount = timeMap[dayStr] || 0;
        cumulative += amount;
        
        const dateObj = new Date(parseInt(yyyy), parseInt(mm) - 1, i);
        const dateFormatted = dateObj.toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'short' });

        const dayTransactions = filteredTransactions.filter(tx => 
          tx.date.endsWith(`-${dayStr}`) && 
          tx.amount < 0 && 
          !tx.isInternalTransfer &&
          tx.type !== "Épargne & Trésorerie"
        ).sort((a, b) => a.amount - b.amount);

        timeline.push({
          day: dayStr,
          dateFormatted: dateFormatted.replace(/^\w/, c => c.toUpperCase()),
          amount,
          cumulative,
          topTx: dayTransactions.slice(0, 2).map(t => ({ name: t.name, amount: Math.abs(t.amount) }))
        });
      }
    } else {
      let cumulative = 0;
      timeline = Object.entries(timeMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, amount]) => {
          cumulative += amount;
          const [yyyy, mm] = day.split("-");
          const dateObj = new Date(parseInt(yyyy), parseInt(mm) - 1, 1);
          const shortMonth = dateObj.toLocaleDateString("fr-FR", { month: 'short' });
          const label = `${shortMonth.charAt(0).toUpperCase() + shortMonth.slice(1)} ${yyyy.slice(2)}`;
          return { day: label, dateFormatted: formatMonthLabel(day), amount, cumulative, rawMonth: day, topTx: [] };
        });
    }

    return {
      expenses: exp,
      income: inc,
      balance: inc - exp,
      subs: subTotal,
      categoryData: sortedCats,
      expensesTimeline: timeline.length > 0 ? timeline : [{day: 'N/A', amount: 0, cumulative: 0, dateFormatted: '', topTx: []}],
      autoAppliedInfo
    };
  }, [filteredTransactions, selectedMonth, incomeSettings]);

  const dailyPace = useMemo(() => {
    if (selectedMonth === "Tout") return null;
    const [yyyy, mm] = selectedMonth.split("-");
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === parseInt(yyyy) && now.getMonth() + 1 === parseInt(mm);
    
    if (isCurrentMonth) {
      // Days remaining including today
      const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
      const today = now.getDate();
      const daysRemaining = (lastDay - today) + 1;
      return { type: "current", amount: balance / daysRemaining, isNegative: balance < 0 };
    } else {
      return { type: "past", amount: balance };
    }
  }, [selectedMonth, balance]);

  const activeSubscriptions = useMemo(() => {
    let sourceTx = filteredTransactions;
    if (isAllTime) {
      const recentMonths = Array.from(new Set(transactions.map(t => t.month))).sort().reverse().slice(0, 3);
      sourceTx = transactions.filter(t => recentMonths.includes(t.month));
    }
    const subs = sourceTx
      .filter(tx => tx.isSubscription || tx.type === "Abonnements & Forfaits")
      .map(tx => {
        return { ...tx, amount: -Math.abs(tx.amount) };
      });
      
    const uniqueSubs = Array.from(new Map(subs.map(item => [item.name, item])).values());
    return uniqueSubs.slice(0, 10);
  }, [filteredTransactions, transactions, isAllTime]);

  const generateFallbackTips = () => {
    const tips: { type: string; text: string }[] = [];
    if (balance >= 0) {
      tips.push({ type: "success", text: `Super gestion : il te reste ${balance.toFixed(0)} € pour finir le mois sereinement.` });
    } else {
      tips.push({ type: "warning", text: `Attention : ton solde est débiteur de ${Math.abs(balance).toFixed(0)} €.` });
    }

    if (categoryData && categoryData.length > 0) {
      tips.push({ type: "tip", text: `Ton premier poste de dépense est ${categoryData[0].name} avec ${categoryData[0].value.toFixed(0)} €.` });
    }

    if (subs > 0 && tips.length < 3) {
      tips.push({ type: "tip", text: `Tes abonnements fixes représentent ${subs.toFixed(0)} € par mois.` });
    }
    
    return tips;
  };

  const fetchTips = async () => {
    if (expenses === 0 && income === 0) {
      setCoachTips(null);
      return;
    }
    setIsCoachLoading(true);

    const savedAmount = filteredTransactions
      .filter(tx => tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer)
      .reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
    
    const merchantMap: Record<string, number> = {};
    filteredTransactions.filter(tx => tx.amount < 0 && tx.type !== "Épargne & Trésorerie").forEach(tx => {
      merchantMap[tx.name] = (merchantMap[tx.name] || 0) + Math.abs(tx.amount);
    });
    const topMerchants = Object.entries(merchantMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ income, expenses, balance, dailyPace, categoryData, savedAmount, topMerchants, subs })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tips && data.tips.length > 0) {
          setCoachTips(data.tips);
        } else {
          setCoachTips(generateFallbackTips());
        }
      } else {
        setCoachTips(generateFallbackTips());
      }
    } catch (err) {
      console.error("AI Tips Network Error:", err);
      setCoachTips(generateFallbackTips());
    }
    setIsCoachLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(fetchTips, 1000);
    return () => clearTimeout(timer);
  }, [selectedMonth, income, expenses, balance]);

  return (
    <div className="w-full px-8 xl:px-12 pt-28 pb-10 h-full flex flex-col overflow-hidden relative">
      <AnimatePresence>
        {toastMessage && toastMessage.visible && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] bg-neutral-900/80 dark:bg-black/80 backdrop-blur-2xl saturate-150 border border-white/[0.1] shadow-2xl rounded-full px-5 py-3 flex items-center gap-3"
          >
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Check size={14} strokeWidth={3} />
            </div>
            <span className="text-sm font-medium text-white">{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {processState && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 z-[100] bg-black/40 dark:bg-black/60 backdrop-blur-md flex items-center justify-center flex-col text-white"
          >
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} className="mb-6">
              <Loader2 className="w-10 h-10 text-white" />
            </motion.div>
            
            <div className="h-8 relative overflow-hidden flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={processState}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="font-medium text-lg tracking-tight absolute text-center"
                >
                  Analyse des opérations...
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Empty State */}
      {!hasData && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-transparent">
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative z-50 w-full max-w-xl mx-auto p-8 bg-neutral-900/80 dark:bg-black/80 backdrop-blur-2xl border border-white/[0.1] rounded-3xl shadow-2xl text-center"
          >
            {/* Logo */}
            <div className="w-12 h-12 mx-auto mb-5 rounded-2xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-white">
              <svg viewBox="0 0 48 48" fill="none" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
                <mask id="mask0_empty" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
                  <rect width="48" height="48" fill="#D9D9D9"/>
                </mask>
                <g mask="url(#mask0_empty)">
                  <path d="M23.2335 4.16299L31.7073 4.15991C31.4734 5.06138 31.1832 6.09483 30.8764 6.97572C30.1612 9.01702 29.2238 10.9732 28.0811 12.809C23.2291 20.5663 15.0014 24.8882 6.19107 26.485C6.55881 26.498 7.66306 26.3771 8.06439 26.3262C12.1265 25.812 16.0894 24.5393 19.7264 22.6791C27.3158 18.7973 32.5755 12.27 35.1642 4.16286L41.8804 4.16192L41.8784 8.71949C41.8778 10.2935 42.023 10.2165 41.3689 11.6459C37.9432 19.1315 30.5631 23.7696 23.0482 26.3872C20.5489 27.2392 17.9961 27.9243 15.4064 28.4386C15.8156 28.4593 16.3174 28.4463 16.7327 28.4461L19.0955 28.444C19.3018 28.4453 19.6022 28.4513 19.8052 28.4373C20.2254 28.4084 20.7343 28.2817 21.1481 28.1845C22.0767 27.9662 22.9981 27.7181 23.9109 27.4407C30.6382 25.4471 37.1473 22.1025 41.8911 16.8256C41.8668 17.1161 41.8804 17.5995 41.8804 17.9052L41.881 19.833C41.881 22.145 41.912 24.5319 41.881 26.8364C41.4741 27.2215 40.9507 27.6181 40.5006 27.9508C38.1977 29.6266 35.64 30.9189 32.926 31.7778C32.0348 32.0631 31.0969 32.2797 30.1875 32.4927C30.3673 32.5002 30.5666 32.4996 30.7471 32.4959C31.8072 32.4746 32.8894 32.5276 33.9465 32.4877C34.1433 32.9524 34.3337 33.5115 34.5164 33.9912L35.5438 36.6707L38.022 43.1516C37.126 43.1673 36.1987 43.1559 35.3009 43.1561L30.3568 43.1568C30.0538 42.5296 29.7815 41.8759 29.503 41.2375L28.3274 38.5546C27.663 37.0299 26.9362 35.4697 26.3006 33.9391L5.89478 33.9395L5.89686 22.9505C11.2806 21.8278 16.1931 19.0601 19.3992 14.5111C21.536 11.4794 22.8502 7.84619 23.2335 4.16299Z" fill="currentColor"/>
                </g>
              </svg>
            </div>
            
            <h2 className="text-2xl font-bold tracking-tight text-white">Bienvenue sur krona</h2>
            <p className="text-sm text-neutral-400 mt-1 mb-8">Gère ton argent simplement, sans jargon et en toute confidentialité.</p>

            <div className="flex flex-col gap-3 mb-6">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-left flex items-start gap-4">
                <div className="mt-0.5 p-2 rounded-full bg-white/[0.06] text-white shrink-0"><Download size={16} /></div>
                <div>
                  <div className="text-sm font-semibold text-white mb-0.5">1. Télécharge ton relevé</div>
                  <div className="text-xs text-neutral-400 leading-relaxed">Récupère ton fichier d'opérations (CSV) sur ton compte BoursoBank.</div>
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-left flex items-start gap-4">
                <div className="mt-0.5 p-2 rounded-full bg-white/[0.06] text-white shrink-0"><UploadCloud size={16} /></div>
                <div>
                  <div className="text-sm font-semibold text-white mb-0.5">2. Dépose-le ici</div>
                  <div className="text-xs text-neutral-400 leading-relaxed">Glisse-dépose le fichier ou clique sur le bouton ci-dessous.</div>
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-left flex items-start gap-4">
                <div className="mt-0.5 p-2 rounded-full bg-white/[0.06] text-white shrink-0"><Sparkles size={16} /></div>
                <div>
                  <div className="text-sm font-semibold text-white mb-0.5">3. Tout se classe tout seul</div>
                  <div className="text-xs text-neutral-400 leading-relaxed">krona isole ton salaire, tes abonnements et tes vraies dépenses.</div>
                </div>
              </div>
            </div>

            <div 
              onClick={() => window.dispatchEvent(new CustomEvent("trigger-csv-upload"))}
              className="border-2 border-dashed border-white/20 hover:border-white/40 rounded-2xl p-6 transition-colors cursor-pointer mt-6 mb-4 flex flex-col items-center justify-center group"
            >
              <span className="text-sm text-neutral-400 group-hover:text-neutral-300 transition-colors">Glisse ton relevé CSV ici ou</span>
              <button type="button" className="mt-3 px-5 py-2.5 rounded-full bg-white text-black font-semibold hover:bg-neutral-200 active:scale-95 transition-all cursor-pointer">
                Choisir un fichier CSV
              </button>
            </div>

            <button 
              type="button" 
              onClick={() => {
                setTransactions(initialTransactions);
                localStorage.setItem('financeTransactions_v1', JSON.stringify(initialTransactions));
              }} 
              className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
            >
              Charger un exemple pour tester
            </button>

            <div className="text-[11px] text-neutral-500 flex items-center justify-center gap-1.5 mt-8">
              <ShieldCheck size={14} />
              <span>Vos données restent 100 % sur votre machine. Aucun compte bancaire connecté, aucun serveur externe.</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Main Content Area (Blurred when empty) */}
      <div className={`flex flex-col flex-1 h-full min-h-0 w-full transition-all duration-700 ${!hasData ? 'blur-[3px] opacity-15 pointer-events-none select-none' : ''}`}>
      {/* Header & Month Selector */}
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h1 className="text-xl font-bold text-foreground">
          {activeTab === "budgets" ? "Budgets & Plafonds" : "Vue d'ensemble"}
        </h1>
        
        <div className={clsx("flex items-center gap-3 transition-opacity", !hasData && "opacity-0")}>
          {selectedMonth !== "Tout" && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowResetModal(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              title="Réinitialiser ce mois"
              aria-label="Réinitialiser ce mois"
            >
              <Trash2 size={16} />
            </motion.button>
          )}
          
          <div className="relative">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none bg-card border border-border text-foreground font-medium text-sm py-2 pl-4 pr-10 rounded-full shadow-sm outline-none hover:bg-black/[0.04] dark:hover:bg-white/[0.08] hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
              aria-label="Sélectionner la période"
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>{formatMonthLabel(m)}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <ChevronDown size={16} className="text-muted-foreground" />
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => setShowCalendarModal(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.08] hover:border-black/20 dark:hover:border-white/20 transition-all cursor-pointer"
            title="Vue annuelle"
          >
            <CalendarDays size={16} />
          </button>
        </div>
      </div>

      {activeTab === "budgets" ? (
        <div className="flex-1 min-h-0 flex flex-col space-y-6 overflow-y-auto no-scrollbar pb-6">
          <Card className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 xl:p-8 shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Synthèse globale</h2>
              <div className="text-sm text-muted-foreground">
                Budget dépensé : {Object.entries(categoryBudgets).reduce((acc, [cat, budget]) => {
                  const spent = categoryData.find(c => c.name === cat)?.value || 0;
                  return acc + Math.min(spent, budget);
                }, 0).toFixed(0)} € / {Object.values(categoryBudgets).reduce((a, b) => a + b, 0).toFixed(0)} € alloués
              </div>
            </div>
            <div className="mt-4 md:mt-0 text-right">
              <div className="text-sm text-muted-foreground mb-1">Reste à allouer (Mensuel)</div>
              <div className="text-2xl font-bold text-foreground">
                {((incomeSettings.salary || 0) + (incomeSettings.aids || 0) - (incomeSettings.savingsGoal || 0) - Object.values(categoryBudgets).reduce((a, b) => a + b, 0)).toFixed(2)} €
              </div>
            </div>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 flex-1 min-h-0 content-start">
            {Object.keys(categoryBudgets).map((cat) => {
               const budget = categoryBudgets[cat];
               const spent = categoryData.find(c => c.name === cat)?.value || 0;
               const isExceeded = spent > budget;
               const progress = Math.min(100, (spent / budget) * 100);
               return (
                 <Card key={cat} className="flex flex-col justify-between p-6 h-full transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.02]">
                   <div className="flex justify-between items-start mb-6">
                     <div className="flex items-center gap-3">
                       <div className={`w-3 h-3 rounded-full ${CATEGORY_COLORS[cat]?.dot || CATEGORY_COLORS["Autre"].dot}`} />
                       <h3 className="font-semibold text-foreground">{cat}</h3>
                     </div>
                     {isExceeded && (
                       <span className="text-[10px] uppercase font-bold text-rose-500 bg-rose-500/10 px-2 py-1 rounded-sm shrink-0">
                         +{(spent - budget).toFixed(0)} €
                       </span>
                     )}
                   </div>
                   <div>
                     <div className="flex justify-between items-end mb-2">
                       <div className="text-2xl font-bold text-foreground">{spent.toFixed(0)} €</div>
                       <div className="text-sm text-muted-foreground font-medium mb-1">/ {budget} €</div>
                     </div>
                     <div className="h-1.5 w-full bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${progress}%` }}
                         className={`h-full rounded-full ${isExceeded ? "bg-rose-500/80" : (CATEGORY_COLORS[cat]?.fill || CATEGORY_COLORS["Autre"].fill)}`}
                       />
                     </div>
                     <div className="text-xs text-muted-foreground mt-3 text-right">
                       {isExceeded ? "Budget dépassé" : `Reste ${(budget - spent).toFixed(2)} €`}
                     </div>
                   </div>
                 </Card>
               );
            })}
            {Object.keys(categoryBudgets).length === 0 && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-white/[0.04] border border-border flex items-center justify-center mb-4 text-neutral-400">
                  <Flag size={20} />
                </div>
                <h3 className="text-base font-medium text-foreground mb-1">Aucun plafond configuré</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">Définissez vos budgets dans les paramètres pour suivre vos objectifs.</p>
                <button onClick={() => { setSettingsTab("budgets"); setShowSettingsModal(true); }} className="px-5 py-2.5 rounded-full bg-black text-white dark:bg-white dark:text-black text-sm font-semibold hover:opacity-90 transition-opacity">
                  Configurer mes budgets
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-6 shrink-0">
        {[
          { 
            label: isAllTime ? "Moyenne gagnée" : "Revenus & Entrées", 
            value: isAllTime ? `${(income / monthsCount).toFixed(2)} € / mois` : `${income.toFixed(2)} €`, 
            change: isAllTime ? "Revenu net moyen par mois" : (autoAppliedInfo || "Total crédité"), 
            pos: true, 
            actionIcon: <ArrowDownLeft size={16} /> 
          },
          { 
            label: isAllTime ? "Moyenne dépensée" : "Dépenses", 
            value: isAllTime ? `${(expenses / monthsCount).toFixed(2)} € / mois` : `${expenses.toFixed(2)} €`, 
            change: isAllTime ? "Train de vie mensuel lissé" : "Total débité net", 
            pos: false, 
            actionIcon: <ArrowUpRight size={16} /> 
          },
          { 
            label: isAllTime ? "Total épargné" : "Reste à vivre (Solde)", 
            value: (
              <span className={balance < 0 ? "text-rose-500 dark:text-rose-400" : ""}>
                {isAllTime ? `${balance > 0 ? "+" : ""}${balance.toFixed(2)} €` : `${balance.toFixed(2)} €`}
              </span>
            ), 
            change: isAllTime ? "Économisé sur l'ensemble de la période" : (dailyPace ? (
              dailyPace.type === "current" ? (
                dailyPace.isNegative ? "Dépassement de budget" : `soit ~${dailyPace.amount.toFixed(2)} € / jour disponible`
              ) : (
                `Mois clôturé (${dailyPace.amount > 0 ? '+' : ''}${dailyPace.amount.toFixed(0)} € épargnés)`
              )
            ) : "Net calculé"), 
            pos: balance >= 0,
            actionIcon: <Wallet size={16} />
          },
          { 
            label: isAllTime ? "Poids annuel" : "Abonnements récurrents", 
            value: isAllTime ? `${(subs / monthsCount * 12).toFixed(2)} € / an` : `${subs.toFixed(2)} €`, 
            change: isAllTime ? "Coût estimé sur une année complète" : `${activeSubscriptions.length} identifiés`, 
            pos: true, 
            icon: !isAllTime ? <RefreshCcw size={14} className="inline mr-1" /> : null, 
            actionIcon: <Repeat size={16} /> 
          },
        ].map((stat, i) => (
          <motion.div whileTap={{ scale: 0.98 }} key={i}>
            <Card className="h-full justify-between transition-colors hover:bg-neutral-50 dark:hover:bg-muted/50 cursor-pointer">
              <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400">
                  {stat.actionIcon}
                </div>
              </div>
              <div>
                {hasData ? (
                  <>
                    <div className="text-3xl xl:text-4xl font-semibold mb-2 tracking-tight text-foreground">{stat.value}</div>
                    <div className="text-sm font-medium flex items-center">
                      {stat.icon}
                      <span className={stat.pos ? "text-foreground" : "text-muted-foreground"}>{stat.change}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-9 w-28 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse mb-2" />
                    <div className="h-4 w-20 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                  </>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Col 1: Main Chart */}
        <Card className="flex flex-col min-h-0 h-full">
          <div className="flex justify-between items-center mb-8 shrink-0">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-1">Évolution des dépenses</h2>
              <div className="flex items-baseline gap-2">
                {hasData ? (
                  <div className="text-3xl font-semibold text-foreground">{expenses.toFixed(2)} €</div>
                ) : (
                  <div className="h-9 w-28 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse" />
                )}
                <div className="text-sm font-medium text-muted-foreground">{isAllTime ? "Total cumulé toutes périodes" : "Dépensés sur le mois"}</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400">
                <Activity size={16} />
              </div>
            </div>
          </div>
          
          <div className="flex-1 w-full min-h-[200px]">
            {hasData ? (
              <ResponsiveContainer width="100%" height="100%">
                {isAllTime ? (
                  <BarChart data={expensesTimeline} margin={{ top: 10, right: 0, left: 0, bottom: 20 }}>
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'monospace' }} 
                      dy={10} 
                    />
                    <Tooltip 
                      content={<CustomTooltip />}
                      cursor={{ fill: 'var(--foreground)', opacity: 0.04 }}
                    />
                    <ReferenceLine 
                      y={expenses / monthsCount} 
                      stroke="#A1A1AA" 
                      strokeDasharray="3 3" 
                      strokeOpacity={0.4} 
                    />
                    <Bar 
                      dataKey="amount" 
                      fill="#FFFFFF" 
                      fillOpacity={0.8} 
                      radius={[4, 4, 0, 0]}
                      className="cursor-pointer transition-opacity hover:opacity-100"
                      onClick={(data) => {
                        if (data && data.rawMonth) {
                          setSelectedMonth(data.rawMonth);
                        }
                      }}
                    />
                  </BarChart>
                ) : (
                  <AreaChart data={expensesTimeline} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--foreground)" stopOpacity={0.12}/>
                        <stop offset="95%" stopColor="var(--foreground)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'monospace' }} 
                      dy={10} 
                      ticks={['01', '05', '10', '15', '20', '25', '30']}
                    />
                    <Tooltip 
                      content={<CustomTooltip />}
                      cursor={{ stroke: 'var(--foreground)', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.3 }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cumulative" 
                      stroke="var(--foreground)" 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill="url(#colorValue)"
                      activeDot={{ r: 4, strokeWidth: 0, fill: "var(--foreground)" }}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full bg-black/5 dark:bg-white/5 rounded-xl animate-pulse" />
            )}
          </div>
        </Card>

        {/* Col 2: Categories & Subscriptions */}
        <div className="flex flex-col gap-6 min-h-0 h-full">
          <Card className="flex-1 min-h-0 flex flex-col">
            <div className="flex justify-between items-start mb-6 shrink-0">
              <div>
                <h3 className="text-base font-medium text-foreground">Répartition</h3>
                <div className="text-xs text-muted-foreground mt-0.5">Top 5 de tes dépenses</div>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0">
                <PieChartIcon size={16} />
              </div>
            </div>
            
            {!hasData ? (
              <div className="flex-1 grid grid-cols-1 2xl:grid-cols-2 gap-8 items-center">
                <div className="relative w-full h-[260px] flex items-center justify-center">
                  <div className="w-48 h-48 rounded-full border-[14px] border-black/5 dark:bg-transparent dark:border-white/5 animate-pulse" />
                </div>
                <div className="flex flex-col justify-center space-y-5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-black/5 dark:bg-white/5 animate-pulse" />
                          <div className="h-4 w-24 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                        </div>
                        <div className="h-4 w-12 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                      </div>
                      <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden" />
                    </div>
                  ))}
                </div>
              </div>
            ) : categoryData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Aucune dépense catégorisée</div>
            ) : (
              <div className="flex-1 grid grid-cols-1 2xl:grid-cols-2 gap-8 items-center">
                <div className="relative w-full h-[260px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[{ value: 1 }]}
                        cx="50%" cy="50%"
                        innerRadius={94}
                        outerRadius={112}
                        stroke="none"
                        fill="var(--pie-track)"
                        isAnimationActive={false}
                      />
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={94}
                        outerRadius={112}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        cornerRadius={10}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name]?.ring || CATEGORY_COLORS["Autre"].ring} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', color: 'var(--foreground)', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}
                        itemStyle={{ color: 'var(--foreground)', fontWeight: 600, fontSize: '13px' }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} €`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                    <span className="text-[10px] font-medium text-neutral-400 tracking-wider mb-0.5">{isAllTime ? "MOYENNE MENS." : "DÉPENSÉ"}</span>
                    <span className="font-bold text-3xl tracking-tight text-foreground">{isAllTime ? (expenses / monthsCount).toFixed(0) : expenses.toFixed(0)} €</span>
                  </div>
                </div>

                <div className="flex flex-col justify-center space-y-4">
                  {categoryData.map((cat, i) => {
                    const budget = categoryBudgets[cat.name];
                    const hasBudget = budget && budget > 0;
                    const isExceeded = hasBudget && cat.value > budget;
                    const progress = hasBudget ? Math.min(100, (cat.value / budget) * 100) : (cat.value / cat.max) * 100;
                    
                    return (
                      <div key={i} className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center min-w-0">
                            <div className={`w-2 h-2 rounded-full mr-2.5 shrink-0 ${CATEGORY_COLORS[cat.name]?.dot || CATEGORY_COLORS["Autre"].dot}`} />
                            <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate" title={cat.name}>{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            {isExceeded && (
                              <span className="text-[10px] uppercase font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-sm">
                                +{(cat.value - budget).toFixed(0)} €
                              </span>
                            )}
                            <span className="font-semibold text-neutral-900 dark:text-white" title={hasBudget && !isExceeded ? `Reste ${(budget - cat.value).toFixed(2)} €` : undefined}>
                              {hasBudget ? `${cat.value.toFixed(0)} € / ${budget} €` : (isAllTime ? `~${cat.value.toFixed(0)} € / mois` : `${cat.value.toFixed(0)} €`)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1 w-full bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.1 }}
                            className={`h-full rounded-full ${isExceeded ? "bg-rose-500/80" : (CATEGORY_COLORS[cat.name]?.fill || CATEGORY_COLORS["Autre"].fill)}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          <Card noPadding className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 xl:p-8 pb-4 shrink-0 border-b border-border">
              <h3 className="text-base font-medium text-foreground">Abonnements</h3>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0">
                <CreditCard size={16} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 xl:p-6 space-y-1 relative">
              {!hasData ? (
                <>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center justify-between min-h-[58px] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/5 animate-pulse shrink-0" />
                        <div className="h-4 w-28 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="h-4 w-16 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                        <div className="h-3 w-12 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </>
              ) : activeSubscriptions.length === 0 ? (
                <div className="text-sm text-muted-foreground flex h-full items-center justify-center">Aucun abonnement détecté</div>
              ) : activeSubscriptions.map((sub, i) => (
                <TransactionRow key={`sub-${i}`} tx={sub} hideDescription />
              ))}
            </div>
          </Card>
        </div>

        {/* Col 3: Transactions & CSV */}
        <div className="flex flex-col gap-6 min-h-0 h-full">
          {/* Coach Card */}
          {SHOW_AI_COACH && (
            <div className="bg-neutral-900/40 dark:bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 xl:p-8 shrink-0">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-foreground">
                  Le coup d'œil du mois
                </h3>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-amber-400/90 shrink-0">
                    <Sparkles size={14} />
                  </div>
                  <button onClick={fetchTips} disabled={isCoachLoading} className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50 text-muted-foreground hover:text-foreground shrink-0">
                    <RefreshCcw size={14} className={isCoachLoading ? "animate-spin" : ""} />
                  </button>
                  <span className="text-[10px] uppercase font-bold bg-neutral-200/50 dark:bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full shrink-0">Coach</span>
                </div>
              </div>
              {isCoachLoading ? (
                <div className="flex flex-col gap-3 py-1">
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800/50 rounded animate-pulse w-3/4"></div>
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800/50 rounded animate-pulse w-full"></div>
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800/50 rounded animate-pulse w-5/6"></div>
                </div>
              ) : coachTips && (
                <div className="space-y-3">
                  {coachTips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-3">
                      {tip.type === "warning" && <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />}
                      {tip.type === "success" && <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />}
                      {tip.type === "tip" && <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />}
                      <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-snug">{tip.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Card noPadding className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 xl:p-8 pb-4 shrink-0 border-b border-border">
              <h3 className="text-base font-medium text-foreground">Transactions</h3>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0">
                <ArrowRightLeft size={16} />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto no-scrollbar p-4 xl:p-6 space-y-1 relative">
              {!hasData ? (
                <>
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="flex items-center justify-between min-h-[58px] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-black/5 dark:bg-white/5 animate-pulse shrink-0" />
                        <div className="flex flex-col gap-1.5">
                          <div className="h-4 w-32 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                          <div className="h-3 w-20 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="h-4 w-16 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                        <div className="h-3 w-12 bg-black/5 dark:bg-white/5 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </>
              ) : filteredTransactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          </Card>
          
          <CSVUploader onUpload={handleUpload} />
        </div>
      </div>
      </>
      )}

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm"
              onClick={() => setShowSettingsModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-card border border-border rounded-3xl shadow-xl w-full max-w-5xl h-[85vh] md:h-[80vh] relative z-10 mx-4 flex overflow-hidden"
            >
              {/* Sidebar */}
              <div className="w-[240px] shrink-0 border-r border-border bg-neutral-50/50 dark:bg-neutral-900/20 flex flex-col">
                <div className="p-6 pb-6">
                  <h2 className="text-xl font-bold text-foreground">Paramètres</h2>
                </div>
                <div className="flex-1 px-4 space-y-1">
                  <button 
                    onClick={() => setSettingsTab("income")} 
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${settingsTab === "income" ? "bg-neutral-200/60 dark:bg-white/[0.08] text-foreground" : "text-muted-foreground hover:bg-neutral-100 dark:hover:bg-white/[0.04]"}`}
                  >
                    <Wallet size={16} />
                    Revenus de référence
                  </button>
                  <button 
                    onClick={() => setSettingsTab("subs")} 
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${settingsTab === "subs" ? "bg-neutral-200/60 dark:bg-white/[0.08] text-foreground" : "text-muted-foreground hover:bg-neutral-100 dark:hover:bg-white/[0.04]"}`}
                  >
                    <Repeat size={16} />
                    Abonnements
                  </button>
                  <button 
                    onClick={() => setSettingsTab("budgets")} 
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${settingsTab === "budgets" ? "bg-neutral-200/60 dark:bg-white/[0.08] text-foreground" : "text-muted-foreground hover:bg-neutral-100 dark:hover:bg-white/[0.04]"}`}
                  >
                    <Flag size={16} />
                    Plafonds & Budgets
                  </button>
                </div>
              </div>

              {/* Main Content */}
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSaveSettingsClick(); }} 
                className="flex-1 flex flex-col min-w-0 bg-card relative"
              >
                <button type="button" onClick={() => setShowSettingsModal(false)} className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition-colors p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full z-10">
                  <X size={18} />
                </button>
                
                <div className="flex-1 overflow-y-auto no-scrollbar p-8 xl:p-10 pt-16 flex flex-col min-h-0">
                  {settingsTab === "income" ? (
                    <div className="max-w-xl space-y-8 w-full">
                      <div className="mb-8">
                        <h3 className="text-lg font-semibold text-foreground mb-1">Revenus mensuels attendus</h3>
                        <p className="text-sm text-muted-foreground">Définissez vos revenus de référence pour ajuster le solde du mois en cours.</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-3">Salaire mensuel habituel</label>
                        <div className="flex gap-4">
                          <div className="relative flex-1">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.salary || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, salary: parseFloat(e.target.value) || 0 })}
                              className="w-full pl-8 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-border focus:outline-none focus:border-neutral-400 text-foreground" 
                            />
                          </div>
                          <div className="relative w-32 shrink-0">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Le</span>
                            <input 
                              type="number" 
                              value={incomeSettings.salaryDay || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, salaryDay: parseInt(e.target.value) || 1 })}
                              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-border focus:outline-none focus:border-neutral-400 text-foreground" 
                              min="1" max="31"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-3">Aides & Allocations (CAF, etc.)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                          <input 
                            type="number" 
                            value={incomeSettings.aids || ""} 
                            onChange={e => handleSaveIncomeSettings({ ...incomeSettings, aids: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-8 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-border focus:outline-none focus:border-neutral-400 text-foreground" 
                          />
                        </div>
                      </div>
                      <div className="pt-4 flex items-start gap-4">
                        <input 
                          type="checkbox" 
                          id="autoApply"
                          checked={incomeSettings.autoApply}
                          onChange={e => handleSaveIncomeSettings({ ...incomeSettings, autoApply: e.target.checked })}
                          className="mt-1 w-5 h-5 rounded border-border text-foreground focus:ring-black accent-black dark:accent-white cursor-pointer"
                        />
                        <label htmlFor="autoApply" className="text-sm text-foreground cursor-pointer leading-relaxed">
                          Appliquer automatiquement si aucun revenu n'est détecté dans le relevé du mois affiché.<br/>
                          <span className="text-muted-foreground">Pratique pour les mois en cours si la paie n'est pas encore tombée.</span>
                        </label>
                      </div>
                    </div>
                  ) : settingsTab === "subs" ? (
                    <div className="flex-1 flex flex-col h-full min-h-0">
                      <div className="mb-6 shrink-0">
                        <h3 className="text-lg font-semibold text-foreground mb-1">Abonnements récurrents</h3>
                        <p className="text-sm text-muted-foreground">Glissez vos abonnements dans la bonne colonne pour ajuster votre budget fixe.</p>
                      </div>
                      <SubscriptionManager transactions={transactions} onUpdate={handleUpdateSubscription} />
                    </div>
                  ) : settingsTab === "budgets" ? (
                    <div className="flex-1 flex flex-col h-full min-h-0">
                      <div className="mb-6 shrink-0">
                        <h3 className="text-lg font-semibold text-foreground mb-1">Plafonds & Budgets</h3>
                        <p className="text-sm text-muted-foreground">Définissez vos plafonds mensuels par catégorie.</p>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
                        <div className="bg-neutral-50 dark:bg-white/[0.02] border border-border rounded-2xl p-5">
                          <h4 className="text-sm font-semibold mb-4">Objectif d'épargne global</h4>
                          <div className="relative max-w-sm">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.savingsGoal || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, savingsGoal: parseFloat(e.target.value) || 0 })}
                              className="w-full pl-8 pr-4 py-3 rounded-xl bg-white dark:bg-neutral-900 border border-border focus:outline-none focus:border-neutral-400 text-foreground text-sm" 
                              placeholder="0"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold px-1">Plafonds mensuels (Catégories)</h4>
                          {Object.keys(CATEGORY_COLORS).filter(c => c !== "Autre" && c !== "Épargne & Trésorerie").map(cat => (
                            <div key={cat} className="flex items-center justify-between p-4 bg-white dark:bg-card border border-border rounded-xl">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${CATEGORY_COLORS[cat].dot}`} />
                                <span className="text-sm font-medium">{cat}</span>
                              </div>
                              <div className="relative w-32">
                                <input 
                                  type="number"
                                  value={categoryBudgets[cat] || ""}
                                  onChange={e => handleSaveBudget(cat, parseFloat(e.target.value))}
                                  placeholder="Illimité"
                                  className="w-full pl-3 pr-8 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-border focus:outline-none focus:border-neutral-400 text-sm text-right font-medium"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="mt-6 p-4 bg-neutral-50 dark:bg-white/[0.02] border border-border rounded-2xl shrink-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-muted-foreground">Total des plafonds configurés</span>
                          <span className="font-semibold">{Object.values(categoryBudgets).reduce((a, b) => a + b, 0).toFixed(2)} €</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Budget dépensable (Revenus - Épargne)</span>
                          <span className="font-semibold">{((incomeSettings.salary || 0) + (incomeSettings.aids || 0) - (incomeSettings.savingsGoal || 0)).toFixed(2)} €</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3 bg-card shrink-0">
                  <button 
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="px-5 py-2.5 rounded-xl font-medium text-sm text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-black text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity"
                  >
                    {isSaved ? <><Check size={16} /> Enregistré</> : "Enregistrer"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm"
              onClick={() => setShowResetModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-card border border-border p-6 rounded-3xl shadow-xl w-full max-w-sm relative z-10 mx-4"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center shrink-0">
                  <Trash2 size={18} />
                </div>
                <button onClick={() => setShowResetModal(false)} className="text-muted-foreground hover:text-foreground transition-colors p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full shrink-0">
                  <X size={18} />
                </button>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Réinitialiser {formatMonthLabel(selectedMonth)} ?
              </h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Toutes les opérations importées pour ce mois seront effacées du dashboard. Vos autres mois resteront intacts.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-2.5 rounded-full font-medium text-sm text-foreground bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  Annuler
                </button>
                <button 
                  onClick={confirmReset}
                  className="flex-1 py-2.5 rounded-full font-medium text-sm text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inbox Popover */}
      <AnimatePresence>
        {showInbox && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowInbox(false)}
              className="fixed inset-0 z-[100]" 
            />
            <motion.div 
              initial={{ opacity: 0, y: -10, scale: 0.95 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: -10, scale: 0.95 }} 
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="fixed top-20 right-6 sm:right-12 w-80 sm:w-96 bg-card/90 backdrop-blur-2xl border border-border rounded-3xl shadow-2xl z-[101] overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-border flex justify-between items-center bg-card/50">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  Opérations à vérifier
                  {inboxTx.length > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{inboxTx.length}</span>}
                </h3>
                <button onClick={() => setShowInbox(false)} className="p-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors">
                  <X size={16} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto max-h-[60vh] p-4 space-y-3 no-scrollbar">
                {inboxTx.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-3">
                      <Check size={24} strokeWidth={3} />
                    </div>
                    <p className="font-semibold text-foreground text-sm">Toutes vos dépenses sont classées</p>
                    <p className="text-xs text-muted-foreground mt-1">Votre Inbox est vide ✓</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {inboxTx.map(tx => (
                      <motion.div 
                        key={tx.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-2xl border border-black/5 dark:border-white/5"
                      >
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm text-foreground truncate" title={tx.name}>{tx.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{tx.date}</div>
                          </div>
                          <div className="font-bold text-sm text-foreground shrink-0 text-right">{tx.amount.toFixed(2)} €</div>
                        </div>
                        <div className="relative">
                          <select
                            className="w-full h-10 appearance-none text-sm bg-neutral-100 dark:bg-white/[0.04] border border-neutral-200/60 dark:border-white/[0.08] rounded-xl pl-3 pr-10 outline-none hover:border-black/10 dark:hover:border-white/20 transition-colors text-foreground cursor-pointer"
                            value=""
                            onChange={(e) => {
                              const newType = e.target.value;
                              // Update cache
                              const cache = JSON.parse(localStorage.getItem('financeCategoryCache_v2') || '{}');
                              cache[tx.name] = { ...cache[tx.name], categorie: newType };
                              localStorage.setItem('financeCategoryCache_v2', JSON.stringify(cache));
                              
                              // Update transactions state
                              setTransactions(prev => {
                                const updated = prev.map(t => t.name === tx.name ? { ...t, type: newType } : t);
                                localStorage.setItem('financeTransactions_v1', JSON.stringify(updated));
                                return updated;
                              });
                            }}
                          >
                            <option value="" disabled>Choisir une catégorie...</option>
                            {OFFICIAL_CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCalendarModal && (
          <CalendarModal 
            isOpen={showCalendarModal}
            onClose={() => setShowCalendarModal(false)}
            transactions={transactions}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
        )}
      </AnimatePresence>

      </div>
    </div>
  );
}
