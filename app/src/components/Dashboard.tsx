"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Area, AreaChart, LineChart, Line, Legend, ResponsiveContainer, Tooltip, XAxis, PieChart, Pie, Cell, BarChart, Bar, ReferenceLine, CartesianGrid } from "recharts";
import { CSVUploader } from "./CSVUploader";
import { CsvAnalysisModal, ImportStep } from "./CsvAnalysisModal";
import { NormalizedTransaction, parseBoursoBankRows } from "@/lib/bankParser";
import { BoursoBankLogo, CreditAgricoleLogo } from "./BankSelectorPopover";
import { CloseButton } from "./ui/CloseButton";
import { SubscriptionManager, detectSubscriptions } from "./SubscriptionManager";
import { MonthlyLimitCard } from "./MonthlyLimitCard";
import { RealDisposableIncomeCard } from "./RealDisposableIncomeCard";
import { PaymentCardBanner } from "./PaymentCardBanner";
import { CardData, CARD_PRESETS, DEFAULT_BANK_CARDS } from "./CardSelectorModal";
import { useState, useMemo, useEffect, useRef } from "react";
import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, RefreshCcw, RotateCcw, ChevronDown, Trash2, X, Wallet, Repeat, Check, Sparkles, AlertCircle, CheckCircle2, Info, Activity, PieChart as PieChartIcon, CreditCard, ArrowRightLeft, Download, UploadCloud, ShieldCheck, Flag, ShoppingCart, Utensils, ShoppingBag, Train, Monitor, Ticket, HeartPulse, Home, Star, CalendarDays, ArrowRight, Search } from "lucide-react";
import { initialDemoTransactions } from "@/lib/types";
import { TrendsView } from "./views/TrendsView";
import { TransactionsView } from "./views/TransactionsView";
import { AccountsView } from "./views/AccountsView";

type Transaction = {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  month: string;
  isSubscription?: boolean;
  isInternalTransfer?: boolean;
  account?: "BoursoBank" | "Crédit Agricole" | string;
};

type FixedIncomeSettings = {
  salary: number;
  salaryDay: number;
  aids: number;
  autoApply: boolean;
  savingsGoal?: number;
  rent?: number;
  loans?: number;
  utilities?: number;
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
  "Logement & Maison",
  "Virements proches & Remboursements",
  "Revenus & Aides",
  "Épargne & Trésorerie"
];

function cleanMerchantName(rawLabel: string) {
  let name = rawLabel.toUpperCase();
  name = name.replace(/^(PAIEMENT\sPAR\sCARTE|CARTE\sX\d{4}\s\d{2}\/\d{2}|CARTE\s|CB\*\s|PAIEMENT\sCB\s|PRLV\sSEPA\s|PRLV\sDE\s|PRELEVEMENT\sDE\s|PRELEVEMENT\s|VIR\sSEPA\sRECU\sDE\s|VIR\sSEPA\sRECU\s|VIR\sRECU\s|VIR\sSEPA\s|VIR\sEMIS\s|VIREMENT\sEN\sVOTRE\sFAVEUR\sDE\s|VIREMENT\sEN\sVOTRE\sFAVEUR\s|VIREMENT\sEMIS\sPOUR\s|VIREMENT\sEMIS\s|VIREMENT\sDE\s|VIREMENT\sVERS\s|RETRAIT\sDAB\s|RETRAIT\sAU\sDISTRIBUTEUR\s|COTISATION\sMENSUELLE\s|COTISATION\s)/, "");
  name = name.replace(/\s\d{2}\/\d{2}(\/\d{2,4})?(\s|$)/g, " ");
  name = name.replace(/\s[A-Z0-9]{8,}\s*$/, "");
  name = name.replace(/\s+/g, " ").trim();
  if (!name) return "Inconnu";
  return name.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

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
    nam.includes("virement depuis") ||
    nam.includes("tristan buguet") ||
    nam.includes("virement de m tristan buguet")
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
  if (!yyyyMM || yyyyMM === "Tout" || yyyyMM === "all") return "Mois sélectionné";
  if (yyyyMM === "demo-month") return "Octobre 2026";
  const [yyyy, mm] = yyyyMM.split("-");
  if (!yyyy || !mm) return yyyyMM;
  const date = new Date(parseInt(yyyy), parseInt(mm) - 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
};

const initialTransactions: Transaction[] = initialDemoTransactions;

function Card({ children, className = "", noPadding = false, onClick }: { children: React.ReactNode; className?: string; noPadding?: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col ${noPadding ? "" : "p-4 sm:p-5"} ${className}`}>
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
      <div className="bg-neutral-900/90 dark:bg-black/90 backdrop-blur-xl backdrop-saturate-150 border border-white/[0.1] rounded-2xl p-3 shadow-xl min-w-[180px]">
        <div className="text-xs text-neutral-400 font-medium mb-1">{data.dateFormatted}</div>
        <div className="text-base font-bold text-white mb-1 tabular-nums">{data.amount.toFixed(2)} €</div>
        {!data.rawMonth && <div className="text-xs text-neutral-400 mb-2">Total cumulé : <span className="tabular-nums">{data.cumulative.toFixed(2)} €</span></div>}
        {data.topTx && data.topTx.length > 0 && (
          <div className="pt-2 border-t border-white/[0.1] flex flex-col gap-1.5 mt-1">
            {data.topTx.map((tx: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-[11px]">
                <span className="text-neutral-300 truncate pr-3 max-w-[120px]">{tx.name}</span>
                <span className="text-neutral-400 tabular-nums whitespace-nowrap">{tx.amount.toFixed(2)} €</span>
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
      <div className="bg-neutral-900/90 dark:bg-black/90 backdrop-blur-xl backdrop-saturate-150 border border-white/[0.1] rounded-2xl p-3 shadow-xl min-w-[180px]">
        <div className="text-xs text-neutral-400 font-medium mb-3">Jour {data.day}</div>
        <div className="flex flex-col gap-1.5">
          {sorted.map((entry, i) => (
            <div key={i} className="flex justify-between items-center text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-neutral-300 truncate max-w-[90px]">{formatMonthLabel(entry.dataKey)}</span>
              </div>
              <span className="text-neutral-100 font-medium tabular-nums whitespace-nowrap pl-3">{entry.value.toFixed(2)} €</span>
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

const TransactionRow = ({ tx, hideDescription, isSubscription }: { tx: Transaction, hideDescription?: boolean, isSubscription?: boolean }) => {
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }} 
      className="flex items-center justify-between py-3.5 px-2 cursor-pointer group hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors rounded-xl"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.06] flex items-center justify-center shrink-0">
          <CategoryIcon type={tx.type} isSubscription={isSubscription ?? tx.isSubscription} isInternalTransfer={tx.isInternalTransfer} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-foreground truncate max-w-[140px] sm:max-w-[240px] xl:max-w-[300px]">{tx.name}</div>
          {!hideDescription && tx.type && (
            <div className="flex items-center gap-2 mt-0.5">
              {tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer ? (
                <span className="text-[10px] bg-black/5 dark:bg-white/[0.06] text-neutral-400 px-1.5 py-0.5 rounded tracking-wide">VIREMENT INTERNE</span>
              ) : (
                <div className="text-xs text-neutral-500 truncate max-w-[140px] sm:max-w-[240px] xl:max-w-[300px]">
                  {tx.type}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium tabular-nums text-foreground">
          {tx.amount > 0 ? "+" : ""}{tx.amount.toFixed(2)} €
        </div>
        <div className="text-xs text-neutral-500 mt-0.5">{tx.date}</div>
      </div>
    </motion.div>
  );
};

const SHOW_AI_COACH = false;

const CalendarModal = ({ 
  isOpen = true, 
  onClose, 
  transactions, 
  selectedMonth, 
  onSelectMonth 
}: { 
  isOpen?: boolean, 
  onClose: () => void, 
  transactions: Transaction[], 
  selectedMonth: string | null,
  onSelectMonth: (m: string) => void 
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

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
          if (!tx.isInternalTransfer && tx.type !== "Épargne & Trésorerie") {
             stats[m].balance += tx.amount;
          }
        }
      }
    });
    return stats;
  }, [transactions, selectedYear]);

  const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop translucide Apple avec animation fluide d'ouverture et de fermeture */}
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Contenu de la modale avec animation spring scale & fade */}
      <motion.div 
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-card border border-border dark:border-white/[0.08] rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl relative z-10 flex flex-col max-h-[90vh] mx-2 sm:mx-4"
      >
        <CloseButton onClick={onClose} className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10" iconSize={18} />

        <h2 className="text-2xl font-bold tracking-tight text-foreground mb-6">Vue annuelle</h2>
        
        <div className="flex gap-2 mb-8 border-b border-border pb-4">
          {availableYears.map(y => (
            <button 
              key={y} 
              type="button"
              onClick={() => setSelectedYear(y)}
              className={clsx(
                "h-9 px-4 rounded-full text-sm font-medium transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer",
                selectedYear === y 
                  ? "bg-foreground text-background shadow-sm" 
                  : "text-neutral-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
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
                    isActive ? "bg-black/[0.02] dark:bg-white/[0.03] cursor-pointer hover:bg-black/[0.05] dark:hover:bg-white/[0.06]" : "bg-transparent border-dashed border-border/40 opacity-30 pointer-events-none",
                    isSelected ? "border-foreground/40 ring-1 ring-foreground/20" : isActive ? "border-border hover:border-foreground/20" : ""
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-foreground truncate pr-2">{monthName}</span>
                    {isActive && <span className="text-[10px] bg-black/5 dark:bg-white/[0.08] text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded-full shrink-0 font-medium">{stat.count} op</span>}
                  </div>
                  {isActive && (
                    <div className="mt-auto flex justify-between items-end">
                      <div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Dépenses</div>
                        <div className="text-sm font-bold text-foreground tabular-nums">{stat.expenses.toFixed(0)} €</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Solde</div>
                        <div className={clsx("text-sm font-bold tabular-nums", stat.balance >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400")}>
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

interface DashboardProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isDemoMode?: boolean;
  showWelcomeModal?: boolean;
  onDismissWelcome?: () => void;
  onExitDemo?: () => void;
}

export function Dashboard({
  activeTab: propActiveTab,
  onTabChange,
  isDemoMode: propIsDemoMode,
  showWelcomeModal: propShowWelcomeModal,
  onDismissWelcome,
  onExitDemo,
}: DashboardProps = {}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [importStep, setImportStep] = useState<ImportStep | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string, visible: boolean } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [internalWelcomeOpen, setInternalWelcomeOpen] = useState(true);
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  const [showInbox, setShowInbox] = useState(false);
  const inboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showInbox && inboxRef.current && !inboxRef.current.contains(target)) {
        if (!target.closest('[aria-label="Notifications"]')) {
          setShowInbox(false);
        }
      }
    };
    if (showInbox) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showInbox]);

  const [showTransactionsDrawer, setShowTransactionsDrawer] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [drawerFilter, setDrawerFilter] = useState("all");
  const [settingsTab, setSettingsTab] = useState<"income" | "fixed" | "subs" | "budgets" | "card">("income");
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [activeBank, setActiveBank] = useState<string>("bourso");
  const [isSaved, setIsSaved] = useState(false);
  const [internalActiveTab, setInternalActiveTab] = useState("dashboard");
  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab;
  const setActiveTab = (tab: string) => {
    setInternalActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  const [ignoredSubscriptions, setIgnoredSubscriptions] = useState<string[]>([]);
  
  const [coachTips, setCoachTips] = useState<{type: string, text: string}[] | null>(null);
  const [isCoachLoading, setIsCoachLoading] = useState(false);

  const [incomeSettings, setIncomeSettings] = useState<FixedIncomeSettings>({
    salary: 1300,
    salaryDay: 28,
    aids: 195,
    autoApply: false,
    savingsGoal: 0,
    rent: 0,
    loans: 0,
    utilities: 0
  });

  // Settings, Inbox & Navigation Listeners
  useEffect(() => {
    const handleOpenSettings = () => setShowSettingsModal(true);
    const handleOpenInbox = () => setShowInbox(true);
    const handleNav = (e: any) => setActiveTab(e.detail.tab);
    const handleExitDemo = () => {
      setDemoMode(false);
      setInternalWelcomeOpen(true);
      setActiveTab("dashboard");
    };
    window.addEventListener("open-settings", handleOpenSettings);
    window.addEventListener("open-inbox", handleOpenInbox);
    window.addEventListener("navigate-tab", handleNav);
    window.addEventListener("exit-demo-mode", handleExitDemo);
    return () => {
      window.removeEventListener("open-settings", handleOpenSettings);
      window.removeEventListener("open-inbox", handleOpenInbox);
      window.removeEventListener("navigate-tab", handleNav);
      window.removeEventListener("exit-demo-mode", handleExitDemo);
    };
  }, []);

  // Synchronisation du visuel de carte bancaire et de l'établissement actif
  useEffect(() => {
    const syncCard = () => {
      try {
        const savedBank = localStorage.getItem("krona_selected_bank") || "bourso";
        setActiveBank(savedBank);
        const saved = localStorage.getItem("krona_selected_card");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.isCustom) {
            setSelectedCard(parsed);
          } else {
            const matched = CARD_PRESETS.find(
              (p) => p.id === parsed.id || p.imageUrl === parsed.imageUrl || p.bank?.toLowerCase() === parsed.bank?.toLowerCase()
            );
            if (matched) {
              setSelectedCard(matched);
            } else {
              const defaultCard = DEFAULT_BANK_CARDS[savedBank] || CARD_PRESETS[0];
              setSelectedCard(defaultCard);
              localStorage.setItem("krona_selected_card", JSON.stringify(defaultCard));
            }
          }
        } else {
          const defaultCard = DEFAULT_BANK_CARDS[savedBank] || CARD_PRESETS[0];
          setSelectedCard(defaultCard);
        }
      } catch (e) {
        setSelectedCard(CARD_PRESETS[0]);
      }
    };
    syncCard();
    window.addEventListener("krona-card-updated", syncCard);
    window.addEventListener("krona-bank-changed", syncCard);
    return () => {
      window.removeEventListener("krona-card-updated", syncCard);
      window.removeEventListener("krona-bank-changed", syncCard);
    };
  }, []);

  const handleSettingsCardSelect = (card: CardData) => {
    try {
      localStorage.setItem("krona_selected_card", JSON.stringify(card));
      window.dispatchEvent(new CustomEvent("krona-card-updated"));
    } catch (err) {}
    setSelectedCard(card);
  };

  const handleSettingsCardUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          const customCard: CardData = {
            id: "custom",
            name: "Carte personnalisée",
            bank: "BoursoBank",
            accountType: "Compte courant",
            last4: "4821",
            imageUrl: result,
            isCustom: true,
          };
          handleSettingsCardSelect(customCard);
        }
      };
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = "";
  };

  const handleSettingsCardRemove = () => {
    try {
      localStorage.removeItem("krona_selected_card");
      window.dispatchEvent(new CustomEvent("krona-card-updated"));
    } catch (err) {}
    setSelectedCard(null);
  };

  // Sync demo mode state with Navbar
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isCurrentlyDemo = propIsDemoMode !== undefined ? propIsDemoMode : (transactions.length === 0);
      (window as any).__IS_DEMO_MODE__ = isCurrentlyDemo;
      window.dispatchEvent(new CustomEvent("demo-mode-state", { detail: { isDemoMode: isCurrentlyDemo } }));
    }
  }, [transactions.length, propIsDemoMode]);

  // Load transactions and settings from localStorage on mount
  useEffect(() => {
    try {
      const cache = JSON.parse(localStorage.getItem('krona_merchant_knowledge') || '{}');
      let changed = false;
      Object.keys(cache).forEach(k => {
        const lowerK = k.toLowerCase();
        if (lowerK.includes('galeries lafayette') || lowerK.includes('societe anonyme des galeries la')) {
           if (cache[k].categorie !== 'Revenus & Aides') {
             cache[k].categorie = 'Revenus & Aides';
             changed = true;
           }
        }
      });
      if (changed) localStorage.setItem('krona_merchant_knowledge', JSON.stringify(cache));
    } catch (e) {}

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

    const savedIgnoredSubs = localStorage.getItem('krona_ignored_subscriptions');
    if (savedIgnoredSubs) {
      try { setIgnoredSubscriptions(JSON.parse(savedIgnoredSubs)); } catch(e) {}
    }
  }, []);

  // Keyboard Shortcuts for Modals & Drawers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettingsModal(false);
        setShowResetModal(false);
        setShowInbox(false);
        setShowCalendarModal(false);
        setShowTransactionsDrawer(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const confirmReset = () => {
    if (!selectedMonth || selectedMonth === "Tout" || selectedMonth === "all") return;
    let remainingMonths: string[] = [];
    setTransactions(prev => {
      const updated = prev.filter(tx => tx.month !== selectedMonth);
      remainingMonths = Array.from(new Set(updated.map(tx => tx.month))).sort().reverse();
      if (updated.length === 0) {
        localStorage.removeItem('financeTransactions_v1');
      } else {
        localStorage.setItem('financeTransactions_v1', JSON.stringify(updated));
      }
      return updated;
    });
    if (remainingMonths.length >= 1) {
      setSelectedMonth(remainingMonths[0]);
    } else {
      setSelectedMonth(null);
    }
    setShowResetModal(false);
  };

  const confirmResetAll = () => {
    localStorage.removeItem('financeTransactions_v1');
    localStorage.removeItem('categoryBudgets');
    localStorage.removeItem('fixedIncomeSettings');
    localStorage.removeItem('krona_ignored_subscriptions');
    localStorage.removeItem('krona_merchant_knowledge');
    setTransactions([]);
    setSelectedMonth(null);
    setDemoMode(false);
    setInternalWelcomeOpen(true);
    setCategoryBudgets({});
    setIgnoredSubscriptions([]);
    setActiveTab("dashboard");
    window.dispatchEvent(new CustomEvent("finance-data-state"));
    window.dispatchEvent(new CustomEvent("welcome-modal-state", { detail: { isOpen: true } }));
    window.dispatchEvent(new CustomEvent("demo-mode-state", { detail: { isDemoMode: true } }));
    setShowResetModal(false);
  };

  // Save to localStorage whenever transactions change
  useEffect(() => {
    if (transactions.length > 0) {
      localStorage.setItem('financeTransactions_v1', JSON.stringify(transactions));
    }
    window.dispatchEvent(new CustomEvent("finance-data-state"));
  }, [transactions]);

  const hasRealData = Boolean(transactions && transactions.length > 0);
  const isDemo = propIsDemoMode !== undefined ? propIsDemoMode : !hasRealData;
  const isWelcomeOpen = !hasRealData && (propShowWelcomeModal !== undefined ? propShowWelcomeModal : internalWelcomeOpen);
  const activeTransactions = hasRealData ? transactions : initialTransactions;

  const uniqueMonths = useMemo(() => {
    return Array.from(new Set(activeTransactions.map(tx => tx.month))).sort().reverse();
  }, [activeTransactions]);

  // Verrouillage mensuel strict du Dashboard : JAMAIS de "Tout" ni "Toutes les périodes"
  const availableMonths = useMemo(() => {
    return uniqueMonths;
  }, [uniqueMonths]);

  // Synchronisation stricte : toujours un seul mois sélectionné à la fois
  useEffect(() => {
    if (uniqueMonths.length > 0) {
      if (!selectedMonth || selectedMonth === "Tout" || selectedMonth === "all" || !uniqueMonths.includes(selectedMonth)) {
        setSelectedMonth(uniqueMonths[0]);
      }
    }
  }, [uniqueMonths, selectedMonth]);

  const handleUpload = async (data: NormalizedTransaction[] | any[]) => {
    try {
      // Étape 1 : Lecture et validation du relevé…
      setImportStep("reading");
      const readStartTime = Date.now();

      const cache = JSON.parse(localStorage.getItem('krona_merchant_knowledge') || '{}');

      // Détecter si les données sont déjà normalisées (via bankParser) ou brutes
      const isNormalized = Array.isArray(data) && data.length > 0 && "account" in data[0] && "label" in data[0];
      const normalizedItems: NormalizedTransaction[] = isNormalized 
        ? (data as NormalizedTransaction[])
        : parseBoursoBankRows(data as string[][]);

      const parsedRows = normalizedItems.map((item, index) => {
        const name = cleanMerchantName(item.label);
        const fallback = getLocalFallback(item.categoryBourso || "", name, cache);

        // Règle métier stricte : Galeries Lafayette
        const lowerName = name.toLowerCase();
        if (lowerName.includes('galeries lafayette') || lowerName.includes('societe anonyme des galeries la')) {
          if (item.amount > 0) {
            fallback.type = "Revenus & Aides";
          } else {
            fallback.type = "Shopping & Mode";
          }
        }

        const rawId = `${item.date}_${item.amount}_${name.trim().toLowerCase()}_${item.account}_${index}`;

        return {
          id: rawId,
          name,
          type: fallback.type,
          amount: isNaN(item.amount) ? 0 : item.amount,
          date: item.date,
          month: item.month,
          isSubscription: fallback.isSub,
          isInternalTransfer: fallback.isInternalTransfer,
          account: item.account,
        } as Transaction;
      }).filter(row => row !== null && row.amount !== 0) as Transaction[];

      const unknownLabels = Array.from(new Set(
        parsedRows
          .filter(r => r.type === "Autre")
          .map(r => r.name)
      ));

      // Rythme naturel pour l'étape 1
      const readElapsed = Date.now() - readStartTime;
      if (readElapsed < 650) {
        await new Promise(r => setTimeout(r, 650 - readElapsed));
      }

      // Étape 2 : Catégorisation intelligente par l'IA…
      setImportStep("categorizing");
      const catStartTime = Date.now();
      
      let newMapping: Record<string, { categorie: string, isSubscription: boolean }> = {};
      
      if (unknownLabels.length > 0) {
        console.log("Labels envoyés à Gemini:", unknownLabels);
        try {
          const res = await fetch("/api/categorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactions: unknownLabels }),
          });
          
          console.log("Status de l'API Gemini:", res.status);
          if (res.ok) {
            const result = await res.json();
            if (result.categorized && Array.isArray(result.categorized)) {
              result.categorized.forEach((item: any) => {
                // Ensure Gemini returned an official category
                if (OFFICIAL_CATEGORIES.includes(item.category)) {
                  newMapping[item.raw] = {
                    categorie: item.category,
                    isSubscription: item.isSubscription || false
                  };
                }
              });
              
              const updatedCache = { ...cache, ...newMapping };
              localStorage.setItem('krona_merchant_knowledge', JSON.stringify(updatedCache));
            }
          } else {
            console.warn("L'API Gemini a retourné un statut:", res.status);
          }
        } catch (apiErr) {
          console.error("Erreur de connexion à l'API Gemini:", apiErr);
        }
      }

      // Rythme naturel pour l'étape 2
      const catElapsed = Date.now() - catStartTime;
      if (catElapsed < 850) {
        await new Promise(r => setTimeout(r, 850 - catElapsed));
      }

      // Étape 3 : Détection des abonnements et charges fixes…
      setImportStep("subscriptions");
      const subStartTime = Date.now();

      const finalCache = { ...cache, ...newMapping };

      const newTransactions: Transaction[] = parsedRows.map(row => {
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

      // Rythme naturel pour l'étape 3
      const subElapsed = Date.now() - subStartTime;
      if (subElapsed < 700) {
        await new Promise(r => setTimeout(r, 700 - subElapsed));
      }

      // Étape 4 : Finalisation de ton espace…
      setImportStep("finalizing");
      const finalStartTime = Date.now();

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

        const combined = [...actuallyNew, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Rattachement intelligent des salaires versés en début de mois
        const salaryMonths = new Set<string>();
        combined.forEach(tx => {
          const nam = tx.name.toLowerCase();
          const isSalary = tx.amount > 0 && (nam.includes("salaire") || nam.includes("employeur") || /\b(paie|paye)\b/i.test(nam) || nam.includes("remuneration") || nam.includes("rémunération"));
          if (isSalary) {
            salaryMonths.add(tx.month);
          }
        });

        const adjusted = combined.map(tx => {
          const nam = tx.name.toLowerCase();
          const isSalary = tx.amount > 0 && (nam.includes("salaire") || nam.includes("employeur") || /\b(paie|paye)\b/i.test(nam) || nam.includes("remuneration") || nam.includes("rémunération"));
          
          if (isSalary) {
            const day = parseInt(tx.date.split("-")[2], 10);
            const isLatePayment = incomeSettings.salaryDay > 15 ? day < 15 : day <= 5;
            
            if (isLatePayment) {
              const [yyyy, mm] = tx.month.split("-");
              const prevMonthObj = new Date(parseInt(yyyy), parseInt(mm) - 2, 1);
              const prevMonthStr = `${prevMonthObj.getFullYear()}-${(prevMonthObj.getMonth() + 1).toString().padStart(2, '0')}`;
              
              if (!salaryMonths.has(prevMonthStr)) {
                // Shift this salary to the previous month
                salaryMonths.add(prevMonthStr);
                return { ...tx, month: prevMonthStr };
              }
            }
          }
          return tx;
        });

        return adjusted;
      });

      const allNewDates = newTransactions.map(t => new Date(t.date).getTime()).filter(t => !isNaN(t)).sort();
      const oldestDate = allNewDates.length ? new Date(allNewDates[0]).toLocaleDateString("fr-FR") : "?";
      const newestDate = allNewDates.length ? new Date(allNewDates[allNewDates.length - 1]).toLocaleDateString("fr-FR") : "?";
      console.log(`Importé : ${newTransactions.length} opérations sur ${uniqueMonths.size} mois (du ${oldestDate} au ${newestDate})`);

      const allResultMonths = Array.from(new Set(newTransactions.map(t => t.month))).sort().reverse();
      if (allResultMonths.length === 1) {
        setSelectedMonth(allResultMonths[0]);
      } else if (majorityMonth !== "Tout" && majorityMonth !== "all") {
        setSelectedMonth(majorityMonth);
      } else if (allResultMonths.length > 0) {
        setSelectedMonth(allResultMonths[0]);
      }

      // Palier 100% avec temps de complétion Apple style
      const finalElapsed = Date.now() - finalStartTime;
      if (finalElapsed < 600) {
        await new Promise(r => setTimeout(r, 600 - finalElapsed));
      }
      await new Promise(r => setTimeout(r, 350));

      // Persistance de l'établissement actif et synchronisation automatique de "Votre carte"
      const detectedBank = (normalizedItems[0]?.account === "Crédit Agricole" || (data as any)[0]?.account === "Crédit Agricole") ? "ca" : "bourso";
      localStorage.setItem("krona_selected_bank", detectedBank);
      setActiveBank(detectedBank);

      const currentCardStr = localStorage.getItem("krona_selected_card");
      let shouldUpdateCard = true;
      if (currentCardStr) {
        try {
          const parsedCard = JSON.parse(currentCardStr);
          if (parsedCard.isCustom) {
            shouldUpdateCard = false;
          }
        } catch (e) {}
      }
      if (shouldUpdateCard) {
        const defaultCard = DEFAULT_BANK_CARDS[detectedBank] || CARD_PRESETS[0];
        localStorage.setItem("krona_selected_card", JSON.stringify(defaultCard));
        setSelectedCard(defaultCard);
      }
      window.dispatchEvent(new CustomEvent("krona-bank-changed", { detail: { bank: detectedBank } }));
      window.dispatchEvent(new CustomEvent("krona-card-updated"));

      setImportStep(null);
      setDemoMode(false);
      setInternalWelcomeOpen(false);
      window.dispatchEvent(new CustomEvent("welcome-modal-state", { detail: { isOpen: false } }));
      window.dispatchEvent(new CustomEvent("demo-mode-state", { detail: { isDemoMode: false } }));
      setToastMessage({
        text: `Relevé importé · ${addedCount} opérations`,
        visible: true
      });
      
      setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      
    } catch (e) {
      console.error("Upload error", e);
      setImportStep(null);
    }
  };

  const handleIgnoreSubscription = (merchantName: string) => {
    setIgnoredSubscriptions(prev => {
      const updated = [...prev, merchantName];
      localStorage.setItem('krona_ignored_subscriptions', JSON.stringify(updated));
      return updated;
    });
  };

  const activeSubscriptionMerchants = useMemo(() => {
    return detectSubscriptions(activeTransactions, ignoredSubscriptions);
  }, [activeTransactions, ignoredSubscriptions]);

  const isTxSubscription = (tx: Transaction) => {
    if (ignoredSubscriptions.includes(tx.name)) return false;
    return activeSubscriptionMerchants.has(tx.name) || tx.type === "Abonnements & Forfaits";
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
    if (selectedMonth && selectedMonth !== "Tout" && selectedMonth !== "all") {
      return activeTransactions.filter(tx => tx.month === selectedMonth);
    }
    if (uniqueMonths.length > 0) {
      return activeTransactions.filter(tx => tx.month === uniqueMonths[0]);
    }
    return activeTransactions;
  }, [activeTransactions, selectedMonth, uniqueMonths]);

  const inboxTx = useMemo(() => {
    return filteredTransactions.filter(tx => tx.type === "Autre");
  }, [filteredTransactions]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("update-inbox-count", { detail: { count: inboxTx.length } }));
  }, [inboxTx.length]);

  const handleRecategorizeTransaction = (txId: string, merchantName: string, newType: string) => {
    try {
      const cache = JSON.parse(localStorage.getItem('krona_merchant_knowledge') || '{}');
      cache[merchantName] = { ...(cache[merchantName] || {}), categorie: newType };
      localStorage.setItem('krona_merchant_knowledge', JSON.stringify(cache));
    } catch (e) {}

    setTransactions(prev => {
      const source = prev.length > 0 ? prev : initialDemoTransactions;
      const updated = source.map(t => {
        if (t.id === txId || t.name === merchantName) {
          return { ...t, type: newType };
        }
        return t;
      });
      localStorage.setItem('financeTransactions_v1', JSON.stringify(updated));
      return updated;
    });

    setToastMessage({
      text: `Catégorie mise à jour · ${merchantName} → ${newType}`,
      visible: true
    });
    setTimeout(() => setToastMessage(null), 3000);
    window.dispatchEvent(new CustomEvent("finance-data-state"));
  };

  // Le Dashboard est strictement verrouillé sur le mois unique sélectionné
  const isAllTime = false;
  const monthsCount = 1;

  const { expenses, income, balance, subs, categoryData, expensesTimeline, autoAppliedInfo } = useMemo(() => {
    let exp = 0;
    let inc = 0;
    let subTotal = 0;
    let saved = 0;
    const catMap: Record<string, number> = {};
    const timeMap: Record<string, number> = {};
    
    let hasSalary = false;
    let hasAids = false;

    filteredTransactions.forEach(tx => {
      const isInternal = tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer;
      const nam = tx.name.toLowerCase();
      
      if (isInternal) {
        saved += tx.amount;
        return;
      }

      if (tx.amount < 0) {
        // Normal expenses
        exp += Math.abs(tx.amount);
        
        if (tx.type !== "Revenus & Aides") {
          catMap[tx.type] = (catMap[tx.type] || 0) + Math.abs(tx.amount);
        }
        
        if (isTxSubscription(tx)) {
          subTotal += Math.abs(tx.amount);
        }

        const day = tx.date.split("-").slice(1).join("/");
        const label = (selectedMonth === "Tout" || !selectedMonth) ? tx.month : tx.date.split("-")[2];
        timeMap[label] = (timeMap[label] || 0) + Math.abs(tx.amount);
      } else {
        // Positive amounts (Refunds or Incomes)
        const isSalary = 
          nam.includes("salaire") ||
          nam.includes("remuneration") ||
          nam.includes("rémunération") ||
          /\b(paie|paye)\b/i.test(nam) ||
          nam.includes("employeur") ||
          (nam.includes("vir sepa") && tx.amount >= incomeSettings.salary * 0.6);

        const isAids = 
          nam.includes("caf") ||
          nam.includes("allocation") ||
          nam.includes("pole emploi") ||
          nam.includes("france travail");

        const isIncome = isSalary || isAids || tx.type === "Revenus & Aides";

        const isRefund = !isIncome;

        if (isRefund) {
          // It's a refund! Deduct from expenses instead of counting as income
          exp -= tx.amount;
          if (exp < 0) exp = 0;
          
          if (isTxSubscription(tx)) {
            subTotal -= tx.amount;
            if (subTotal < 0) subTotal = 0;
          }
          
          if (catMap[tx.type] !== undefined) {
            catMap[tx.type] -= tx.amount;
            if (catMap[tx.type] < 0) catMap[tx.type] = 0;
          }
          
          const day = tx.date.split("-").slice(1).join("/");
          const label = (selectedMonth === "Tout" || !selectedMonth) ? tx.month : tx.date.split("-")[2];
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
    if (incomeSettings.autoApply && selectedMonth && selectedMonth !== "Tout") {
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

    const allSortedCats = Object.entries(catMap)
      .filter(([name]) => name !== "Épargne & Trésorerie")
      .map(([name, value]) => ({ name, value: isAllTime ? value / monthsCount : value, max: exp > 0 ? exp : 1 }))
      .sort((a, b) => b.value - a.value);

    let sortedCats = allSortedCats;
    if (allSortedCats.length > 5) {
      const top4 = allSortedCats.slice(0, 4);
      const restValue = allSortedCats.slice(4).reduce((sum, cat) => sum + cat.value, 0);
      sortedCats = [...top4, { name: "Autre", value: restValue, max: exp > 0 ? exp : 1 }];
    }

    let timeline: any[] = [];
    if (selectedMonth && selectedMonth !== "Tout") {
      let yyyy: string, mm: string;
      if (selectedMonth === "demo-month") {
        yyyy = "2026";
        mm = "10";
      } else {
        [yyyy, mm] = selectedMonth.split("-");
      }
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
    if (!selectedMonth || selectedMonth === "Tout") return null;
    let yyyy: string, mm: string;
    if (selectedMonth === "demo-month") {
      yyyy = "2026";
      mm = "10";
    } else {
      [yyyy, mm] = selectedMonth.split("-");
    }
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === parseInt(yyyy) && now.getMonth() + 1 === parseInt(mm);
    
    const totalBudget = Object.values(categoryBudgets).reduce((a, b) => a + b, 0);
    const hasBudgets = totalBudget > 0;
    const referenceValue = hasBudgets ? (totalBudget - expenses) : balance;

    if (isCurrentMonth) {
      // Days remaining including today
      const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
      const today = now.getDate();
      const daysRemaining = (lastDay - today) + 1;
      return { type: "current", amount: referenceValue / daysRemaining, isNegative: referenceValue < 0 };
    } else {
      return { type: "past", amount: referenceValue };
    }
  }, [selectedMonth, balance, expenses, categoryBudgets]);

  const activeSubscriptions = useMemo(() => {
    let sourceTx = filteredTransactions;
    if (isAllTime) {
      const recentMonths = Array.from(new Set(transactions.map(t => t.month))).sort().reverse().slice(0, 3);
      sourceTx = transactions.filter(t => recentMonths.includes(t.month));
    }
    const subs = sourceTx
      .filter(tx => isTxSubscription(tx))
      .map(tx => {
        return { ...tx, amount: -Math.abs(tx.amount) };
      });
      
    const uniqueSubs = Array.from(new Map(subs.map(item => [item.name, item])).values());
    return uniqueSubs;
  }, [filteredTransactions, transactions, isAllTime]);

  const topMerchants = useMemo(() => {
    const merchantMap: Record<string, {
      name: string;
      total: number;
      count: number;
      category: string;
    }> = {};

    filteredTransactions.forEach(tx => {
      if (tx.isInternalTransfer || tx.type === "Épargne & Trésorerie") return;
      if (isTxSubscription(tx) || tx.isSubscription || tx.type === "Abonnements & Forfaits") return;

      const rawMerchant = tx.name;
      
      const namLower = tx.name.toLowerCase();
      const isIncome = 
        namLower.includes("salaire") ||
        namLower.includes("remuneration") ||
        namLower.includes("rémunération") ||
        /\b(paie|paye)\b/i.test(namLower) ||
        namLower.includes("employeur") ||
        (namLower.includes("vir sepa") && tx.amount >= incomeSettings.salary * 0.6) ||
        namLower.includes("caf") ||
        namLower.includes("allocation") ||
        namLower.includes("pole emploi") ||
        namLower.includes("france travail") ||
        tx.type === "Revenus & Aides";

      if (tx.amount > 0 && isIncome) return;

      if (!merchantMap[rawMerchant]) {
        merchantMap[rawMerchant] = {
          name: rawMerchant,
          total: 0,
          count: 0,
          category: tx.type,
        };
      }

      merchantMap[rawMerchant].total -= tx.amount;
      merchantMap[rawMerchant].count += 1;
    });

    return Object.values(merchantMap)
      .filter(m => m.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
  }, [filteredTransactions, activeSubscriptionMerchants, ignoredSubscriptions, incomeSettings]);

  const spendingCadence = useMemo(() => {
    const savingsGoal = incomeSettings.savingsGoal || 0;
    const savingsPercentage = income > 0 && savingsGoal > 0 ? Math.round((savingsGoal / income) * 100) : null;
    
    const now = new Date();
    let daysRemaining = 0;
    let isCurrentMonth = false;
    let isPastMonth = false;
    let totalDaysInMonth = 30;
    let currentDayNumber = 15;

    if (selectedMonth && selectedMonth !== "Tout" && selectedMonth !== "all") {
      if (selectedMonth === "demo-month") {
        isCurrentMonth = true;
        totalDaysInMonth = 30;
        currentDayNumber = 12;
        daysRemaining = 18;
      } else {
        const [yyyy, mm] = selectedMonth.split("-").map(Number);
        totalDaysInMonth = new Date(yyyy, mm, 0).getDate();
        const isSameYear = now.getFullYear() === yyyy;
        const isSameMonth = (now.getMonth() + 1) === mm;

        if (isSameYear && isSameMonth) {
          isCurrentMonth = true;
          currentDayNumber = now.getDate();
          daysRemaining = Math.max(1, totalDaysInMonth - currentDayNumber + 1);
        } else if (now.getFullYear() > yyyy || (isSameYear && (now.getMonth() + 1) > mm)) {
          isPastMonth = true;
          currentDayNumber = totalDaysInMonth;
          daysRemaining = 0;
        } else {
          currentDayNumber = 1;
          daysRemaining = totalDaysInMonth;
        }
      }
    } else {
      totalDaysInMonth = 30;
      currentDayNumber = 30;
      daysRemaining = 30;
    }

    // Calcul projection de fin de mois (Directive Vague 2)
    const daysInMonth = totalDaysInMonth;
    const currentDay = currentDayNumber;
    const remainingDaysForProjection = Math.max(0, daysInMonth - currentDay);
    const dailyAverageForProjection = currentDay > 0 ? (expenses / currentDay) : 0;
    const projectedEndOfMonthBalance = balance - (dailyAverageForProjection * remainingDaysForProjection);

    const totalBudget = Object.keys(categoryBudgets).length > 0 ? Object.values(categoryBudgets).reduce((a, b) => a + b, 0) : 0;
    const refValue = totalBudget > 0 ? (totalBudget - expenses) : balance;
    const baseAmount = Math.max(0, refValue);
    
    const dailyBudget = daysRemaining > 0 ? (baseAmount / daysRemaining) : 0;
    const pastDailyAverage = totalDaysInMonth > 0 ? (expenses / totalDaysInMonth) : 0;
    const isTight = !isPastMonth && (refValue <= 0 || dailyBudget <= 0);

    const weekTotals = [0, 0, 0, 0];
    
    if (expensesTimeline && expensesTimeline.length > 0 && !isAllTime) {
      expensesTimeline.forEach((entry: any) => {
        const day = parseInt(entry.day, 10);
        if (isNaN(day)) return;
        const amount = entry.amount;
        if (day >= 1 && day <= 7) weekTotals[0] += amount;
        else if (day >= 8 && day <= 14) weekTotals[1] += amount;
        else if (day >= 15 && day <= 21) weekTotals[2] += amount;
        else if (day >= 22) weekTotals[3] += amount;
      });
    }

    const maxWeekAmount = Math.max(...weekTotals, 1);
    const peakWeekIndex = weekTotals.indexOf(Math.max(...weekTotals));

    const weeks = [
      { id: "s1", label: "S1", dates: "J1–7", amount: weekTotals[0], pct: Math.round((weekTotals[0] / maxWeekAmount) * 100), isPeak: peakWeekIndex === 0 && weekTotals[0] > 0 },
      { id: "s2", label: "S2", dates: "J8–14", amount: weekTotals[1], pct: Math.round((weekTotals[1] / maxWeekAmount) * 100), isPeak: peakWeekIndex === 1 && weekTotals[1] > 0 },
      { id: "s3", label: "S3", dates: "J15–21", amount: weekTotals[2], pct: Math.round((weekTotals[2] / maxWeekAmount) * 100), isPeak: peakWeekIndex === 2 && weekTotals[2] > 0 },
      { id: "s4", label: "S4", dates: "J22–Fin", amount: weekTotals[3], pct: Math.round((weekTotals[3] / maxWeekAmount) * 100), isPeak: peakWeekIndex === 3 && weekTotals[3] > 0 },
    ];

    return {
      savingsGoal,
      savingsPercentage,
      disposableRemaining: refValue,
      daysRemaining,
      isCurrentMonth,
      isPastMonth,
      dailyBudget,
      pastDailyAverage,
      isTight,
      weeks,
      maxWeekAmount,
      peakWeekIndex,
      projectedEndOfMonthBalance
    };
  }, [filteredTransactions, balance, income, expenses, expensesTimeline, isAllTime, incomeSettings, selectedMonth, categoryBudgets]);

  const displayedDrawerTx = useMemo(() => {
    let list = filteredTransactions;

    if (drawerFilter === "debit") {
      list = list.filter(tx => tx.amount < 0 && !tx.isInternalTransfer && tx.type !== "Épargne & Trésorerie");
    } else if (drawerFilter === "credit") {
      list = list.filter(tx => tx.amount > 0);
    } else if (drawerFilter === "sub") {
      list = list.filter(tx => isTxSubscription(tx) || tx.type === "Abonnements & Forfaits");
    } else if (drawerFilter === "transfer") {
      list = list.filter(tx => tx.isInternalTransfer || tx.type === "Épargne & Trésorerie");
    }

    if (drawerSearch.trim()) {
      const q = drawerSearch.toLowerCase().trim();
      list = list.filter(tx => 
        tx.name.toLowerCase().includes(q) || 
        tx.type.toLowerCase().includes(q) ||
        cleanMerchantName(tx.name).toLowerCase().includes(q)
      );
    }

    return list;
  }, [filteredTransactions, drawerFilter, drawerSearch, activeSubscriptionMerchants, ignoredSubscriptions]);

  const { drawerDebitsTotal, drawerCreditsTotal } = useMemo(() => {
    let deb = 0;
    let cred = 0;
    displayedDrawerTx.forEach(tx => {
      if (tx.amount < 0) deb += Math.abs(tx.amount);
      else cred += tx.amount;
    });
    return { drawerDebitsTotal: deb, drawerCreditsTotal: cred };
  }, [displayedDrawerTx]);

  const generateFallbackTips = () => {
    const tips: { type: string; text: string }[] = [];
    if (balance >= 0) {
      tips.push({ type: "success", text: `Excellente gestion : tu as mis ${balance.toFixed(0)} € de côté ce mois-ci.` });
    } else {
      tips.push({ type: "warning", text: `Attention : ton bilan mensuel est en déficit de ${Math.abs(balance).toFixed(0)} €.` });
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
    const coachMerchants = Object.entries(merchantMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));

    try {
      // Coach temporairement désactivé
      // const res = await fetch('/api/coach', { ...
      setCoachTips(generateFallbackTips());
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
    <div className={clsx(
      "w-full px-4 sm:px-[40px] pt-28 sm:pt-[128px] pb-4 sm:pb-[40px] min-h-screen flex flex-col relative",
      activeTab === "dashboard" ? "lg:h-screen lg:max-h-screen lg:overflow-hidden overflow-y-auto" : "overflow-y-auto"
    )}>
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/90 border border-white/[0.08] backdrop-blur-md text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-sm"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Check size={14} strokeWidth={3} />
            </div>
            <span className="font-medium text-white">{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern Apple/Linear style AI Analysis Modal */}
      <CsvAnalysisModal step={importStep} />
      <CSVUploader onUpload={handleUpload} />

      {/* Onboarding Empty State */}
      {isWelcomeOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-transparent">
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative z-50 w-full max-w-xl mx-auto p-5 sm:p-8 max-h-[92vh] overflow-y-auto no-scrollbar bg-neutral-900/80 dark:bg-black/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/[0.1] rounded-2xl shadow-2xl text-center"
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
            
            <h2 className="text-2xl font-bold tracking-tight text-white font-sans">Bienvenue sur krona</h2>
            <p className="text-sm text-neutral-400 mt-1 mb-8 font-sans">Gère ton argent simplement, sans jargon et en toute confidentialité.</p>

            <div className="flex flex-col gap-3 mb-6">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-left flex items-start gap-4">
                <div className="mt-0.5 p-2 rounded-full bg-white/[0.06] text-white shrink-0"><Download size={16} /></div>
                <div>
                  <div className="text-sm font-semibold text-white mb-0.5 font-sans">1. Télécharge ton relevé</div>
                  <div className="text-xs text-neutral-400 leading-relaxed font-sans">Récupère ton fichier d'opérations CSV sur ton compte BoursoBank ou Crédit Agricole.</div>
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-left flex items-start gap-4">
                <div className="mt-0.5 p-2 rounded-full bg-white/[0.06] text-white shrink-0"><UploadCloud size={16} /></div>
                <div>
                  <div className="text-sm font-semibold text-white mb-0.5 font-sans">2. Dépose-le ici</div>
                  <div className="text-xs text-neutral-400 leading-relaxed font-sans">Glisse-dépose le fichier ou choisis ta banque ci-dessous.</div>
                </div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 text-left flex items-start gap-4">
                <div className="mt-0.5 p-2 rounded-full bg-white/[0.06] text-white shrink-0"><Sparkles size={16} /></div>
                <div>
                  <div className="text-sm font-semibold text-white mb-0.5 font-sans">3. Tout se classe tout seul</div>
                  <div className="text-xs text-neutral-400 leading-relaxed font-sans">krona isole ton salaire, tes abonnements et tes vraies dépenses.</div>
                </div>
              </div>
            </div>

            <div className="border-2 border-dashed border-white/20 hover:border-white/40 rounded-2xl p-6 transition-colors mt-6 mb-4 flex flex-col items-center justify-center">
              <span className="text-sm text-neutral-400 font-sans mb-3 text-center">Glisse ton relevé CSV ici ou choisis ta banque :</span>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button 
                  type="button" 
                  onClick={() => window.dispatchEvent(new CustomEvent("trigger-csv-upload", { detail: { bank: "bourso" } }))}
                  className="px-4 py-2.5 rounded-full bg-white text-black font-semibold hover:bg-neutral-200 active:scale-95 transition-all cursor-pointer font-sans text-xs sm:text-sm flex items-center gap-2"
                >
                  <BoursoBankLogo className="w-4 h-4 text-black" />
                  <span>BoursoBank</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => window.dispatchEvent(new CustomEvent("trigger-csv-upload", { detail: { bank: "ca" } }))}
                  className="px-4 py-2.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white font-semibold active:scale-95 transition-all cursor-pointer font-sans text-xs sm:text-sm flex items-center gap-2"
                >
                  <CreditAgricoleLogo className="w-4 h-4 text-white" />
                  <span>Crédit Agricole</span>
                </button>
              </div>
            </div>

            <button 
              type="button" 
              onClick={() => {
                setDemoMode(true);
                setInternalWelcomeOpen(false);
                if (onDismissWelcome) onDismissWelcome();
                window.dispatchEvent(new CustomEvent("welcome-modal-state", { detail: { isOpen: false } }));
              }} 
              className="text-xs text-neutral-400 hover:text-white underline underline-offset-4 transition-colors cursor-pointer font-sans"
            >
              Charger un exemple pour tester
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-neutral-400 mt-4 font-sans">
              <ShieldCheck className="text-neutral-300 w-4 h-4" />
              <span>Vos données restent 100 % sur votre machine. Aucun compte, aucun serveur.</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Main Content Area (Blurred when empty) */}
      <div className={`flex flex-col flex-1 w-full min-h-0 transition-all duration-700 ${isWelcomeOpen ? 'blur-[6px] opacity-25 pointer-events-none select-none' : ''}`}>
        
      {/* Header & Month Selector (Dashboard and Budgets only) */}
      {(activeTab === "dashboard" || activeTab === "budgets") && (
        <div className="flex flex-row items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-3.5 lg:mb-4 shrink-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate font-sans">
            {activeTab === "budgets" ? "Budgets & Plafonds" : "Vue d'ensemble"}
          </h1>
          
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 transition-opacity">
            {hasRealData && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowResetModal(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
                title="Supprimer des données"
                aria-label="Supprimer des données"
              >
                <Trash2 size={16} />
              </motion.button>
            )}
            
            <div className="relative">
              <select 
                value={selectedMonth || uniqueMonths[0] || ""} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 appearance-none bg-card border border-border text-foreground font-medium text-sm py-1.5 pl-4 pr-10 rounded-full shadow-sm outline-none hover:bg-black/[0.04] dark:hover:bg-white/[0.08] hover:border-foreground/20 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
                aria-label="Sélectionner le mois"
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronDown size={14} className="text-neutral-400" />
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => setShowCalendarModal(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border text-foreground transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none hover:bg-black/[0.04] dark:hover:bg-white/[0.08] hover:border-foreground/20 cursor-pointer"
              title="Vue annuelle"
              aria-label="Vue annuelle"
            >
              <CalendarDays size={16} />
            </button>
          </div>
        </div>
      )}

      {activeTab === "transactions" ? (
        <TransactionsView 
          transactions={activeTransactions} 
          onRecategorize={handleRecategorizeTransaction} 
          onSelectMonth={setSelectedMonth} 
        />
      ) : activeTab === "trends" ? (
        <TrendsView 
          transactions={activeTransactions} 
          incomeSettings={incomeSettings} 
          categoryBudgets={categoryBudgets} 
          onSelectMonth={setSelectedMonth} 
        />
      ) : activeTab === "accounts" ? (
        <AccountsView 
          transactions={activeTransactions} 
          onTriggerUpload={(bank) => {
            const bankKey = bank.toLowerCase().includes("agricole") ? "ca" : "bourso";
            localStorage.setItem("krona_selected_bank", bankKey);
            window.dispatchEvent(new CustomEvent("trigger-csv-upload", { detail: { bank: bankKey } }));
          }} 
          onNavigateTransactions={() => setActiveTab("transactions")} 
        />
      ) : activeTab === "budgets" ? (
        <div className="flex-1 min-h-0 flex flex-col space-y-6 overflow-y-auto no-scrollbar pb-6">
          <Card className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 md:p-6 shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Synthèse globale</h2>
              <div className="text-sm text-neutral-400">
                Budget dépensé : <span className="tabular-nums text-foreground font-medium">{Object.entries(categoryBudgets).reduce((acc, [cat, budget]) => {
                  const spent = categoryData.find(c => c.name === cat)?.value || 0;
                  return acc + Math.min(spent, budget);
                }, 0).toFixed(0)} €</span> / <span className="tabular-nums text-neutral-400">{Object.values(categoryBudgets).reduce((a, b) => a + b, 0).toFixed(0)} € alloués</span>
              </div>
            </div>
            <div className="mt-4 md:mt-0 text-left md:text-right">
              <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Reste à allouer</div>
              <div className="text-2xl font-bold text-foreground tabular-nums">
                {((incomeSettings.salary || 0) + (incomeSettings.aids || 0) - (incomeSettings.savingsGoal || 0) - Object.values(categoryBudgets).reduce((a, b) => a + b, 0)).toFixed(2)} €
              </div>
            </div>
          </Card>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 flex-1 min-h-0 content-start">
            {Object.keys(categoryBudgets).map((cat) => {
               const budget = categoryBudgets[cat];
               const spent = categoryData.find(c => c.name === cat)?.value || 0;
               const isExceeded = spent > budget;
               const progress = Math.min(100, (spent / budget) * 100);
               return (
                 <Card key={cat} className="flex flex-col justify-between p-5 md:p-6 h-full transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.02]">
                   <div className="flex justify-between items-start mb-6">
                     <div className="flex items-center gap-3 min-w-0 pr-2">
                       <div className={`w-3 h-3 rounded-full shrink-0 ${CATEGORY_COLORS[cat]?.dot || CATEGORY_COLORS["Autre"].dot}`} />
                       <h3 className="font-semibold text-foreground truncate" title={cat}>{cat}</h3>
                     </div>
                     {isExceeded && (
                       <span className="text-[10px] uppercase font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                         +{(spent - budget).toFixed(0)} €
                       </span>
                     )}
                   </div>
                   <div>
                     <div className="flex justify-between items-end mb-2">
                       <div className="text-2xl font-bold text-foreground tabular-nums">{spent.toFixed(0)} €</div>
                       <div className="text-sm text-neutral-400 font-medium mb-0.5 tabular-nums">/ {budget} €</div>
                     </div>
                     <div className="h-1.5 w-full bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${progress}%` }}
                         className={`h-full rounded-full ${isExceeded ? "bg-rose-500/80" : (CATEGORY_COLORS[cat]?.fill || CATEGORY_COLORS["Autre"].fill)}`}
                       />
                     </div>
                     <div className="text-xs text-neutral-500 mt-3 text-right">
                       {isExceeded ? "Budget dépassé" : <>Reste <span className="tabular-nums font-medium text-foreground">{(budget - spent).toFixed(2)} €</span></>}
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
                <p className="text-sm text-neutral-400 max-w-sm mb-6">Définissez vos budgets dans les paramètres pour suivre vos objectifs.</p>
                <button 
                  type="button"
                  onClick={() => { setSettingsTab("budgets"); setShowSettingsModal(true); }} 
                  className="h-10 px-5 rounded-full bg-black text-white dark:bg-white dark:text-black text-sm font-medium hover:opacity-90 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer"
                >
                  Configurer mes budgets
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Top Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 lg:gap-4 xl:gap-5 mb-3.5 sm:mb-4 lg:mb-4 xl:mb-5 shrink-0">
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
            label: isAllTime ? "Total épargné" : "Épargne nette", 
            value: (
              <span className={balance < 0 ? "text-rose-500 dark:text-rose-400" : ""}>
                {balance > 0 ? "+" : ""}{balance.toFixed(2)} €
              </span>
            ), 
            change: isAllTime 
              ? "Épargne nette cumulée sur la période" 
              : (balance >= 0 ? "Mis de côté" : "Déficit net sur le mois"), 
            pos: balance >= 0,
            actionIcon: <Wallet size={16} />,
            gauge: (() => {
              const savingsRate = income > 0 ? Math.max(0, Math.min(100, Math.round((balance / income) * 100))) : 0;
              return { rate: savingsRate };
            })()
          },
          { 
            label: isAllTime ? "Poids annuel" : "Abonnements récurrents", 
            value: isAllTime ? `${(subs / monthsCount * 12).toFixed(2)} € / an` : `${subs.toFixed(2)} €`, 
            change: isAllTime ? "Coût estimé sur une année complète" : `${activeSubscriptions.length} abonnement${activeSubscriptions.length > 1 ? 's' : ''} identifié${activeSubscriptions.length > 1 ? 's' : ''}`, 
            pos: true, 
            icon: null, 
            actionIcon: <Repeat size={16} /> 
          },
        ].map((stat, i) => {
          const isSubsCard = i === 3;

          // 1. Cartes simples de présentation (dont Épargne nette) : aucun clic, aucune flèche
          if (!isSubsCard) {
            return (
              <div key={i} className="h-full">
                <Card className="h-full flex flex-col justify-between transition-all duration-200 hover:bg-black/[0.01] dark:hover:bg-white/[0.02]">
                  <div className="flex justify-between items-start mb-2 sm:mb-4">
                    <span className="text-xs sm:text-sm font-medium text-neutral-400 transition-colors font-sans">
                      {stat.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 transition-all">
                        {stat.actionIcon}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className="text-2xl sm:text-3xl xl:text-4xl font-semibold mb-1 sm:mb-2 tracking-tight text-foreground tabular-nums font-sans">
                      {stat.value}
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium w-full">
                      <div className="flex items-center">
                        {stat.icon}
                        <span className={stat.pos ? "text-neutral-400" : "text-neutral-500"}>{stat.change}</span>
                      </div>
                      {stat.gauge && stat.gauge.rate > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-10 h-1 bg-black/5 dark:bg-white/[0.08] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-500 ease-out" 
                              style={{ width: `${stat.gauge.rate}%` }} 
                            />
                          </div>
                          <span className="font-sans font-medium tabular-nums text-emerald-600 dark:text-emerald-400 text-[11px]">
                            {stat.gauge.rate}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            );
          }

          // 2. Carte "Abonnements récurrents" : Clic ouvrant la modale des transactions pré-filtrée
          return (
            <div key={i} className="h-full" title="Cliquer pour afficher les abonnements récurrents">
              <Card 
                className="h-full flex flex-col justify-between transition-all duration-200 group cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03] hover:border-black/20 dark:hover:border-white/20 active:scale-[0.99]"
                onClick={() => {
                  setDrawerSearch("");
                  setDrawerFilter("sub");
                  setShowTransactionsDrawer(true);
                }}
              >
                <div className="flex justify-between items-start mb-2 sm:mb-4">
                  <span className="text-xs sm:text-sm font-medium text-neutral-400 group-hover:text-foreground transition-colors font-sans">
                    {stat.label}
                  </span>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 group-hover:border-black/20 dark:group-hover:border-white/20 group-hover:text-foreground transition-all">
                    {stat.actionIcon}
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-2xl sm:text-3xl xl:text-4xl font-semibold mb-1 sm:mb-2 tracking-tight text-foreground tabular-nums font-sans">
                    {stat.value}
                  </div>
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium w-full">
                    <span className="text-neutral-400 font-sans">
                      {stat.change}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-4 lg:gap-4 xl:gap-5 flex-1 min-h-0">
        
        {/* Col 1: Main Chart */}
        <Card className="flex flex-col h-full min-h-[300px] lg:min-h-0">
          <div className="flex justify-between items-start mb-3 sm:mb-4 shrink-0">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">Évolution des dépenses</h3>
              <div className="text-xs text-neutral-400 mt-0.5 font-sans">
                {isAllTime ? "Total cumulé toutes périodes" : "Dépensés sur le mois"}
              </div>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0">
              <Activity size={16} />
            </div>
          </div>
          
          <div className="flex items-baseline gap-2 mb-2 shrink-0">
            <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums font-sans">{expenses.toFixed(2)} €</div>
          </div>
          
          <div className="flex-1 w-full min-h-0 bg-transparent flex flex-col">
            {expensesTimeline.length === 0 || expenses === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-400">
                <Activity size={32} className="stroke-1 text-neutral-400/40 mb-3" />
                <p className="text-sm font-medium text-foreground font-sans">Aucune dépense sur cette période</p>
                <p className="text-xs text-neutral-500 mt-0.5 font-sans">Les débits apparaîtront au fil de tes opérations</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" className="bg-transparent">
                {isAllTime ? (
                  <BarChart data={expensesTimeline} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-space-grotesk)' }} 
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
                      fill="#ffffff" 
                      fillOpacity={0.8} 
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                      className="cursor-pointer transition-opacity hover:opacity-100"
                      onClick={(data: any) => {
                        if (data && data.rawMonth) {
                          setSelectedMonth(data.rawMonth);
                        }
                      }}
                    />
                  </BarChart>
                ) : (
                  <AreaChart data={expensesTimeline} margin={{ top: 10, right: 10, left: 10, bottom: 6 }}>
                    <defs>
                      <linearGradient id="teaserGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.15}/>
                        <stop offset="100%" stopColor="#ffffff" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} fill="none" stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-space-grotesk)' }} 
                      dy={10} 
                      fill="none"
                      ticks={['01', '05', '10', '15', '20', '25', '30']}
                    />
                    <Tooltip 
                      content={<CustomTooltip />}
                      cursor={{ stroke: '#ffffff', strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.3, fill: 'none' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cumulative" 
                      stroke="#ffffff" 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill="url(#teaserGradient)"
                      activeDot={{ r: 4, strokeWidth: 0, fill: "#ffffff" }}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Col 2: Répartition, 2 Bannières & Votre carte */}
        <div className="flex flex-col gap-3.5 sm:gap-4 lg:gap-4 xl:gap-5 lg:col-span-1 h-full min-h-0">
          <Card className="flex flex-col flex-1 min-h-0 justify-between">
            <div className="flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">Répartition</h3>
                <div className="text-xs text-neutral-400 mt-0.5 font-sans">Top 5 de tes dépenses</div>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0">
                <PieChartIcon size={16} />
              </div>
            </div>
            
            {categoryData.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-400 mt-4">
                <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/[0.04] border border-border flex items-center justify-center mb-3 text-neutral-400">
                  <PieChartIcon size={18} />
                </div>
                <p className="text-sm font-medium text-foreground font-sans">Aucune dépense catégorisée</p>
                <p className="text-xs text-neutral-500 mt-0.5 font-sans">Les débits classés s'afficheront ici</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col sm:flex-row items-center gap-4 sm:gap-5 xl:gap-6 mt-3 sm:mt-4 my-auto">
                {/* Donut nettement agrandi en diamètre, anneau fin, précis et élégant */}
                <div className="relative w-44 h-44 sm:w-48 sm:h-48 lg:w-48 lg:h-48 xl:w-52 xl:h-52 shrink-0 flex items-center justify-center mx-auto sm:mx-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[{ value: 1 }]}
                        cx="50%" cy="50%"
                        innerRadius="88%"
                        outerRadius="97%"
                        stroke="none"
                        fill="var(--pie-track)"
                        isAnimationActive={false}
                      />
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius="88%"
                        outerRadius="97%"
                        paddingAngle={2.5}
                        dataKey="value"
                        stroke="none"
                        cornerRadius={2}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name]?.ring || CATEGORY_COLORS["Autre"].ring} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', color: 'var(--foreground)', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}
                        itemStyle={{ color: 'var(--foreground)', fontWeight: 600, fontSize: '13px' }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} €`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-center">
                    <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 uppercase tracking-widest mb-0.5 font-sans">{isAllTime ? "MOYENNE" : "DÉPENSÉ"}</span>
                    <span className="font-bold text-xl sm:text-2xl xl:text-3xl tracking-tight text-foreground tabular-nums font-sans">{isAllTime ? (expenses / monthsCount).toFixed(0) : expenses.toFixed(0)} €</span>
                  </div>
                </div>

                {/* Ventilation des catégories à droite */}
                <div className="flex-1 w-full flex flex-col justify-center gap-2.5 sm:gap-3 xl:gap-3.5 min-w-0">
                  {categoryData.map((cat, i) => {
                    const budget = categoryBudgets[cat.name];
                    const hasBudget = budget && budget > 0;
                    const isExceeded = hasBudget && cat.value > budget;
                    const progress = hasBudget ? Math.min(100, (cat.value / budget) * 100) : (cat.value / cat.max) * 100;
                    
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center min-w-0 mr-2">
                            <div className={`w-2 h-2 rounded-full mr-2 shrink-0 ${CATEGORY_COLORS[cat.name]?.dot || CATEGORY_COLORS["Autre"].dot}`} />
                            <span className="font-medium text-foreground truncate font-sans text-xs" title={cat.name}>{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isExceeded && (
                              <span className="text-[9px] uppercase font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded-sm tabular-nums font-sans">
                                +{(cat.value - budget).toFixed(0)} €
                              </span>
                            )}
                            <span className="font-semibold text-foreground tabular-nums text-xs font-sans" title={hasBudget && !isExceeded ? `Reste ${(budget - cat.value).toFixed(2)} €` : undefined}>
                              {hasBudget ? `${cat.value.toFixed(0)} € / ${budget} €` : (isAllTime ? `~${cat.value.toFixed(0)} € / mois` : `${cat.value.toFixed(0)} €`)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
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

          {/* Les 2 bannières compactes */}
          <MonthlyLimitCard 
            expenses={expenses}
            categoryBudgets={categoryBudgets}
            incomeSettings={incomeSettings}
            onOpenBudgetSettings={() => {
              setSettingsTab("budgets");
              setShowSettingsModal(true);
            }}
            className="shrink-0"
          />
          <RealDisposableIncomeCard 
            income={income}
            incomeSettings={incomeSettings}
            transactions={filteredTransactions}
            activeSubscriptions={activeSubscriptions}
            subs={subs}
            onOpenSettings={() => {
              setSettingsTab("fixed");
              setShowSettingsModal(true);
            }}
            className="shrink-0"
          />

          {/* Nouvelle carte compacte Votre carte (Design system unifié & support visuel PNG) */}
          <PaymentCardBanner 
            onOpenSettings={() => {
              setSettingsTab("card");
              setShowSettingsModal(true);
            }}
            className="shrink-0" 
          />
        </div>

        {/* Col 3: Top Merchants & Spending Cadence */}
        <div className="flex flex-col gap-3.5 sm:gap-4 lg:gap-4 xl:gap-5 lg:col-span-1 h-full min-h-0">
          {/* Carte 1: Top Commerçants (compacte) */}
          <Card className="flex flex-col relative overflow-hidden shrink-0">
            <div className="flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">Top Commerçants</h3>
                <div className="text-xs text-neutral-400 mt-0.5 font-sans">
                  {isAllTime ? "Enseignes les plus sollicitées" : "Principaux débits du mois"}
                </div>
              </div>
              <div 
                className="flex items-center shrink-0 cursor-pointer group active:scale-95 transition-transform"
                onClick={() => setShowTransactionsDrawer(true)}
              >
                <span className="text-xs font-medium text-neutral-400 group-hover:text-white transition-colors mr-2.5 font-sans">
                  Voir tout
                </span>
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0 group-hover:border-black/20 dark:group-hover:border-white/[0.15] transition-colors">
                  <ShoppingBag size={16} />
                </div>
              </div>
            </div>

            {topMerchants.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-400 mt-4">
                <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/[0.04] border border-border flex items-center justify-center mb-3 text-neutral-400">
                  <ShoppingBag size={18} />
                </div>
                <p className="text-sm font-medium text-foreground font-sans">Aucun débit marchand</p>
                <p className="text-xs text-neutral-500 mt-0.5 font-sans">Tes dépenses par enseigne apparaîtront ici</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:gap-2.5 mt-4">
                {topMerchants.slice(0, 4).map((merchant) => {
                  const maxSpent = topMerchants[0]?.total || 1;
                  const progressRatio = Math.max(6, Math.min(100, (merchant.total / maxSpent) * 100));

                  return (
                    <div
                      key={merchant.name}
                      onClick={() => {
                        setDrawerFilter("all");
                        setDrawerSearch(merchant.name);
                        setShowTransactionsDrawer(true);
                      }}
                      className="relative overflow-hidden flex items-center justify-between rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.04] hover:border-black/20 dark:hover:border-white/15 transition-all cursor-pointer group active:scale-[0.99] select-none"
                      title={`Voir toutes les opérations de ${merchant.name}`}
                    >
                      {/* Ligne de progression discrète en arrière-plan proportionnelle au 1er marchand */}
                      <div
                        className="absolute inset-y-0 left-0 bg-black/[0.03] dark:bg-white/[0.04] group-hover:bg-black/[0.05] dark:group-hover:bg-white/[0.06] pointer-events-none transition-all duration-500 ease-out"
                        style={{ width: `${progressRatio}%` }}
                      />

                      <div className="relative z-10 flex items-center justify-between gap-3 w-full">
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                          <div className="w-8 h-8 xl:w-9 xl:h-9 rounded-full bg-white dark:bg-neutral-800/80 border border-black/5 dark:border-white/[0.08] shadow-sm flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <CategoryIcon type={merchant.category} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs sm:text-sm text-foreground truncate font-sans group-hover:text-foreground" title={merchant.name}>
                              {merchant.name}
                            </div>
                            <div className="text-[11px] xl:text-xs text-neutral-500 truncate font-sans">
                              {merchant.count} passage{merchant.count > 1 ? "s" : ""} {isAllTime ? "au total" : "ce mois-ci"}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-xs sm:text-sm xl:text-base text-foreground tabular-nums font-sans">
                            {merchant.total.toFixed(2)} €
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Carte 2: Rythme de dépense (Style Apple Health / Linear) */}
          <Card className="flex flex-col flex-1 min-h-[170px] xl:min-h-[200px] relative overflow-hidden justify-between">
            <div className="flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">Rythme de dépense</h3>
                <div className="text-xs text-neutral-400 mt-0.5 font-sans">Décomposition hebdomadaire du mois</div>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0">
                <Activity size={16} />
              </div>
            </div>

            {/* Moyenne quotidienne réelle & pic éventuel */}
            <div className="flex items-baseline justify-between mt-3 mb-2 shrink-0">
              <div className="flex items-baseline">
                <span className="text-xl sm:text-2xl font-bold tabular-nums text-foreground font-sans">
                  {spendingCadence.pastDailyAverage.toFixed(2)} €
                </span>
                <span className="text-xs text-neutral-400 font-normal ml-2 font-sans">
                  / jour en moy.
                </span>
              </div>
              {spendingCadence.weeks.some(w => w.isPeak) && (
                <div className="inline-flex items-center text-[11px] text-neutral-300 font-medium tabular-nums font-sans bg-black/5 dark:bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-black/10 dark:border-white/[0.06]">
                  Pic S{spendingCadence.weeks.find(w => w.isPeak)?.label.replace('S', '')} · {spendingCadence.weeks.find(w => w.isPeak)?.amount.toFixed(0)} €
                </div>
              )}
            </div>

            {/* Visualiseur vertical 4 colonnes Apple Health / Linear */}
            <div className="flex-1 min-h-[120px] grid grid-cols-4 gap-2 sm:gap-3 pt-2 pb-0.5 items-stretch w-full">
              {spendingCadence.weeks.map((week) => (
                <div key={week.id} className="flex flex-col items-center justify-between h-full group select-none">
                  {/* Montant lisible en en-tête de colonne */}
                  <div className="text-[11px] sm:text-xs font-semibold tabular-nums text-neutral-400 group-hover:text-foreground transition-colors font-sans mb-1.5 shrink-0">
                    {week.amount > 0 ? `${week.amount.toFixed(0)} €` : "0 €"}
                  </div>

                  {/* Rail vertical large style Apple Health */}
                  <div className="w-full flex-1 min-h-[70px] bg-black/5 dark:bg-white/[0.04] rounded-xl sm:rounded-2xl p-1 relative flex flex-col justify-end overflow-hidden border border-black/[0.04] dark:border-white/[0.05] group-hover:border-black/15 dark:group-hover:border-white/15 transition-all">
                    {/* Colonne de remplissage de bas en haut */}
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(week.amount > 0 ? 8 : 0, Math.min(100, week.pct))}%` }}
                      transition={{ type: "spring", stiffness: 85, damping: 18 }}
                      className={clsx(
                        "w-full rounded-lg sm:rounded-xl transition-all duration-300",
                        week.isPeak
                          ? "bg-foreground shadow-[0_0_14px_rgba(255,255,255,0.25)]"
                          : week.amount > 0
                            ? "bg-neutral-300 dark:bg-white/70 group-hover:bg-neutral-400 dark:group-hover:bg-white/90"
                            : "bg-transparent"
                      )}
                    />
                  </div>

                  {/* Label discret en bas */}
                  <div className="text-xs font-semibold text-neutral-400 group-hover:text-foreground transition-colors font-sans mt-2 shrink-0">
                    {week.label}
                  </div>
                </div>
              ))}
            </div>
          </Card>
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
              className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
              onClick={() => setShowSettingsModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }} 
              className="bg-card border border-border dark:border-white/[0.08] rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] sm:h-[85vh] md:h-[80vh] relative z-10 mx-2 sm:mx-4 flex flex-col md:flex-row overflow-hidden"
            >
              {/* Sidebar */}
              <div className="w-full md:w-[240px] shrink-0 border-b md:border-b-0 md:border-r border-border bg-neutral-50/50 dark:bg-white/[0.02] flex flex-row md:flex-col">
                <div className="p-4 md:p-6 md:pb-6 flex items-center md:block">
                  <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground">Paramètres</h2>
                </div>
                <div className="flex-1 px-2 md:px-4 flex flex-row md:flex-col gap-1 md:gap-1.5 overflow-x-auto md:overflow-x-visible no-scrollbar pb-2 md:pb-0">
                  <button 
                    type="button"
                    onClick={() => setSettingsTab("income")} 
                    className={`flex items-center gap-2 md:gap-3 px-3 md:px-3.5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer whitespace-nowrap ${settingsTab === "income" ? "bg-foreground text-background shadow-sm" : "text-neutral-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/[0.04]"}`}
                  >
                    <Wallet size={16} />
                    Revenus de référence
                  </button>
                  <button 
                    type="button"
                    onClick={() => setSettingsTab("fixed")} 
                    className={`flex items-center gap-2 md:gap-3 px-3 md:px-3.5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer whitespace-nowrap ${settingsTab === "fixed" ? "bg-foreground text-background shadow-sm" : "text-neutral-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/[0.04]"}`}
                  >
                    <ShieldCheck size={16} />
                    Charges incompressibles
                  </button>
                  <button 
                    type="button"
                    onClick={() => setSettingsTab("subs")} 
                    className={`flex items-center gap-2 md:gap-3 px-3 md:px-3.5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer whitespace-nowrap ${settingsTab === "subs" ? "bg-foreground text-background shadow-sm" : "text-neutral-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/[0.04]"}`}
                  >
                    <Repeat size={16} />
                    Abonnements
                  </button>
                  <button 
                    type="button"
                    onClick={() => setSettingsTab("budgets")} 
                    className={`flex items-center gap-2 md:gap-3 px-3 md:px-3.5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer whitespace-nowrap ${settingsTab === "budgets" ? "bg-foreground text-background shadow-sm" : "text-neutral-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/[0.04]"}`}
                  >
                    <Flag size={16} />
                    Plafonds & Budgets
                  </button>
                  <button 
                    type="button"
                    onClick={() => setSettingsTab("card")} 
                    className={`flex items-center gap-2 md:gap-3 px-3 md:px-3.5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer whitespace-nowrap ${settingsTab === "card" ? "bg-foreground text-background shadow-sm" : "text-neutral-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/[0.04]"}`}
                  >
                    <CreditCard size={16} />
                    Carte bancaire
                  </button>
                </div>
              </div>

              {/* Main Content */}
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSaveSettingsClick(); }} 
                className="flex-1 flex flex-col min-w-0 bg-card relative"
              >
                <CloseButton onClick={() => setShowSettingsModal(false)} className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10" iconSize={18} />
                
                <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 md:p-8 xl:p-10 pt-12 sm:pt-16 flex flex-col min-h-0">
                  {settingsTab === "income" ? (
                    <div className="max-w-xl space-y-8 w-full">
                      <div className="mb-8">
                        <h3 className="text-lg font-semibold text-foreground mb-1">Revenus mensuels attendus</h3>
                        <p className="text-sm text-neutral-400">Définissez vos revenus de référence pour ajuster le solde du mois en cours.</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-3">Salaire mensuel habituel</label>
                        <div className="flex gap-4">
                          <div className="relative flex-1">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.salary || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, salary: parseFloat(e.target.value) || 0 })}
                              className="w-full pl-8 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-white/[0.03] border border-border focus:outline-none focus:border-foreground/30 text-foreground tabular-nums" 
                            />
                          </div>
                          <div className="relative w-32 shrink-0">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">Le</span>
                            <input 
                              type="number" 
                              value={incomeSettings.salaryDay || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, salaryDay: parseInt(e.target.value) || 1 })}
                              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-white/[0.03] border border-border focus:outline-none focus:border-foreground/30 text-foreground tabular-nums" 
                              min="1" max="31"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-3">Aides & Allocations</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">€</span>
                          <input 
                            type="number" 
                            value={incomeSettings.aids || ""} 
                            onChange={e => handleSaveIncomeSettings({ ...incomeSettings, aids: parseFloat(e.target.value) || 0 })}
                            className="w-full pl-8 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-white/[0.03] border border-border focus:outline-none focus:border-foreground/30 text-foreground tabular-nums" 
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
                          <span className="text-neutral-500">Pratique pour les mois en cours si la paie n'est pas encore tombée.</span>
                        </label>
                      </div>
                    </div>
                  ) : settingsTab === "fixed" ? (
                    <div className="max-w-xl space-y-6 w-full">
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold text-foreground mb-1 font-sans">Charges incompressibles</h3>
                        <p className="text-sm text-neutral-400 font-sans">
                          Renseignez vos charges fixes obligatoires pour calculer votre Budget de départ.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2 font-sans">Loyer ou mensualité logement</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.rent || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, rent: parseFloat(e.target.value) || 0 })}
                              placeholder="Détection automatique depuis les opérations si vide"
                              className="w-full pl-8 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-white/[0.03] border border-border focus:outline-none focus:border-foreground/30 text-foreground tabular-nums font-sans" 
                            />
                          </div>
                          <p className="text-xs text-neutral-500 mt-1 font-sans">Loyer, charges de copropriété ou syndic.</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2 font-sans">Remboursement de prêt & emprunts</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.loans || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, loans: parseFloat(e.target.value) || 0 })}
                              placeholder="Détection automatique depuis les opérations si vide"
                              className="w-full pl-8 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-white/[0.03] border border-border focus:outline-none focus:border-foreground/30 text-foreground tabular-nums font-sans" 
                            />
                          </div>
                          <p className="text-xs text-neutral-500 mt-1 font-sans">Prêt étudiant, crédit bancaire ou mensualités d'emprunt.</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2 font-sans">Autres prélèvements obligatoires fixes</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.utilities || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, utilities: parseFloat(e.target.value) || 0 })}
                              placeholder="Détection automatique depuis les opérations si vide"
                              className="w-full pl-8 pr-4 py-3 rounded-2xl bg-neutral-50 dark:bg-white/[0.03] border border-border focus:outline-none focus:border-foreground/30 text-foreground tabular-nums font-sans" 
                            />
                          </div>
                          <p className="text-xs text-neutral-500 mt-1 font-sans">Énergie, eau, mutuelle de santé, assurances obligatoires.</p>
                        </div>
                      </div>

                      <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-border rounded-2xl p-4 space-y-2.5 mt-6 font-sans text-xs">
                        <div className="flex justify-between items-center text-neutral-400">
                          <span>Abonnements récurrents identifiés</span>
                          <span className="font-medium text-foreground tabular-nums">{subs.toFixed(2)} €</span>
                        </div>
                        <div className="flex justify-between items-center text-neutral-400">
                          <span>Total des charges incompressibles</span>
                          <span className="font-semibold text-foreground tabular-nums">
                            {((incomeSettings.rent || 0) + (incomeSettings.loans || 0) + (incomeSettings.utilities || 0) + subs).toFixed(2)} €
                          </span>
                        </div>
                        <div className="pt-2 border-t border-border flex justify-between items-center font-medium">
                          <span className="text-neutral-300">Budget de départ calculé</span>
                          <span className="text-emerald-500 dark:text-emerald-400 font-bold tabular-nums">
                            {Math.max(0, ((income > 0 ? income : ((incomeSettings.salary || 0) + (incomeSettings.aids || 0))) - ((incomeSettings.rent || 0) + (incomeSettings.loans || 0) + (incomeSettings.utilities || 0) + subs))).toFixed(2)} €
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : settingsTab === "subs" ? (
                    <div className="flex-1 flex flex-col h-full min-h-0">
                      <div className="mb-6 shrink-0">
                        <h3 className="text-lg font-semibold text-foreground mb-1">Mes Abonnements</h3>
                        <p className="text-sm text-neutral-400">La détection est automatique et intelligente. Masquez les faux positifs d'un simple clic.</p>
                      </div>
                      <SubscriptionManager transactions={transactions} onIgnore={handleIgnoreSubscription} />
                    </div>
                  ) : settingsTab === "budgets" ? (
                    <div className="flex-1 flex flex-col h-full min-h-0">
                      <div className="mb-6 shrink-0">
                        <h3 className="text-lg font-semibold text-foreground mb-1">Plafonds & Budgets</h3>
                        <p className="text-sm text-neutral-400">Définissez vos plafonds mensuels par catégorie.</p>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
                        <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-border rounded-2xl p-5">
                          <h4 className="text-sm font-semibold mb-4 text-foreground">Objectif d'épargne global</h4>
                          <div className="relative max-w-sm">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.savingsGoal || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, savingsGoal: parseFloat(e.target.value) || 0 })}
                              className="w-full pl-8 pr-4 py-3 rounded-xl bg-card border border-border focus:outline-none focus:border-foreground/30 text-foreground text-sm tabular-nums" 
                              placeholder="0"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold px-1 text-foreground">Plafonds par catégorie</h4>
                          {Object.keys(CATEGORY_COLORS).filter(c => c !== "Autre" && c !== "Épargne & Trésorerie").map(cat => (
                            <div key={cat} className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
                              <div className="flex items-center gap-3 min-w-0 pr-3">
                                <div className={`w-3 h-3 rounded-full shrink-0 ${CATEGORY_COLORS[cat].dot}`} />
                                <span className="text-sm font-medium text-foreground truncate" title={cat}>{cat}</span>
                              </div>
                              <div className="relative w-32 shrink-0">
                                <input 
                                  type="number"
                                  value={categoryBudgets[cat] || ""}
                                  onChange={e => handleSaveBudget(cat, parseFloat(e.target.value))}
                                  placeholder="Illimité"
                                  className="w-full pl-3 pr-8 py-2 rounded-lg bg-neutral-50 dark:bg-white/[0.03] border border-border focus:outline-none focus:border-foreground/30 text-sm text-right font-medium tabular-nums"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">€</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="mt-6 p-4 bg-black/[0.02] dark:bg-white/[0.02] border border-border rounded-2xl shrink-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-neutral-400">Total des plafonds configurés</span>
                          <span className="font-semibold text-foreground tabular-nums">{Object.values(categoryBudgets).reduce((a, b) => a + b, 0).toFixed(2)} €</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-neutral-400">Budget disponible net</span>
                          <span className="font-semibold text-foreground tabular-nums">{((incomeSettings.salary || 0) + (incomeSettings.aids || 0) - (incomeSettings.savingsGoal || 0)).toFixed(2)} €</span>
                        </div>
                      </div>
                    </div>
                  ) : settingsTab === "card" ? (
                    <div className="max-w-xl space-y-6 w-full">
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold text-foreground mb-1 font-sans">Carte & Banque</h3>
                        <p className="text-sm text-neutral-400 font-sans">
                          Personnalisez votre établissement bancaire et le visuel de votre carte de paiement.
                        </p>
                      </div>

                      {/* Établissement bancaire par défaut */}
                      <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-border rounded-2xl p-4">
                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2.5 font-sans">
                          Établissement bancaire actif
                        </label>
                        <div className="flex gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem("krona_selected_bank", "bourso");
                              setActiveBank("bourso");
                              const def = DEFAULT_BANK_CARDS["bourso"];
                              if (def) {
                                localStorage.setItem("krona_selected_card", JSON.stringify(def));
                                setSelectedCard(def);
                              }
                              window.dispatchEvent(new CustomEvent("krona-bank-changed", { detail: { bank: "bourso" } }));
                              window.dispatchEvent(new CustomEvent("krona-card-updated"));
                            }}
                            className={clsx(
                              "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-medium font-sans transition-all active:scale-95 cursor-pointer",
                              activeBank === "bourso"
                                ? "bg-foreground text-background border-foreground font-semibold shadow-sm"
                                : "bg-card border-border text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                            )}
                          >
                            <BoursoBankLogo className="w-4 h-4" />
                            <span>BoursoBank</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem("krona_selected_bank", "ca");
                              setActiveBank("ca");
                              const def = DEFAULT_BANK_CARDS["ca"];
                              if (def) {
                                localStorage.setItem("krona_selected_card", JSON.stringify(def));
                                setSelectedCard(def);
                              }
                              window.dispatchEvent(new CustomEvent("krona-bank-changed", { detail: { bank: "ca" } }));
                              window.dispatchEvent(new CustomEvent("krona-card-updated"));
                            }}
                            className={clsx(
                              "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-medium font-sans transition-all active:scale-95 cursor-pointer",
                              activeBank === "ca"
                                ? "bg-foreground text-background border-foreground font-semibold shadow-sm"
                                : "bg-card border-border text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                            )}
                          >
                            <CreditAgricoleLogo className="w-4 h-4" />
                            <span>Crédit Agricole</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="block text-sm font-medium text-foreground font-sans">Modèle actuel</label>
                        {selectedCard ? (
                          <div className="relative w-full max-w-sm aspect-[1.586/1] rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-lg bg-neutral-900">
                            <img 
                              src={selectedCard.imageUrl} 
                              alt={selectedCard.name} 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-full max-w-sm aspect-[1.586/1] rounded-2xl border-2 border-dashed border-border/80 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col items-center justify-center gap-2 text-center p-4">
                            <CreditCard className="text-neutral-400" size={24} />
                            <span className="text-xs font-medium text-neutral-400 font-sans">
                              Aucune carte configurée
                            </span>
                          </div>
                        )}

                        <div className="pt-2">
                          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 font-sans">
                            Modèles disponibles
                          </label>
                          <div className="grid grid-cols-2 gap-3 max-w-md">
                            {CARD_PRESETS.map((preset) => {
                              const isCurrent = selectedCard?.id === preset.id ||
                                (selectedCard?.id === "bourso" && preset.id === "bourso-ultim") ||
                                (selectedCard?.id === "ca" && preset.id === "ca-premium") ||
                                (selectedCard?.bank === preset.bank);
                              return (
                                <button
                                  type="button"
                                  key={preset.id}
                                  onClick={() => handleSettingsCardSelect(preset)}
                                  className={`rounded-2xl p-2.5 border text-left transition-all cursor-pointer ${
                                    isCurrent
                                      ? "bg-black/[0.04] dark:bg-white/[0.06] border-foreground/40 ring-1 ring-foreground/20"
                                      : "bg-black/[0.02] dark:bg-white/[0.02] border-border hover:border-foreground/30 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div className="w-full aspect-[1.586/1] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 mb-2 relative bg-neutral-900">
                                    <img src={preset.imageUrl} alt={preset.name} className="w-full h-full object-cover" />
                                    {isCurrent && (
                                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center">
                                        <Check size={10} strokeWidth={3} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-xs font-semibold text-foreground font-sans truncate">{preset.name}</div>
                                  <div className="text-[11px] text-neutral-400 font-sans truncate">{preset.bank} · •••• {preset.last4}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="pt-2 flex flex-wrap items-center gap-3">
                          <input 
                            type="file"
                            onChange={handleSettingsCardUpload}
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            id="card-upload-input-settings"
                          />
                          <label
                            htmlFor="card-upload-input-settings"
                            className="h-10 px-4 rounded-full bg-foreground text-background font-medium text-sm flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all cursor-pointer select-none font-sans"
                          >
                            <UploadCloud size={16} />
                            Importer une image PNG
                          </label>

                          {selectedCard && (
                            <button
                              type="button"
                              onClick={handleSettingsCardRemove}
                              className="h-10 px-4 rounded-full bg-black/5 dark:bg-white/[0.06] border border-border text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all text-sm font-medium flex items-center gap-2 cursor-pointer font-sans"
                            >
                              <Trash2 size={14} />
                              Retirer la carte
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3 bg-card shrink-0">
                  <button 
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="h-10 px-5 rounded-full font-medium text-sm text-foreground hover:bg-black/5 dark:hover:bg-white/[0.08] active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="h-10 px-5 rounded-full font-medium text-sm bg-black text-white dark:bg-white dark:text-black hover:opacity-90 active:scale-95 transition-all flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer"
                  >
                    {isSaved ? <><Check size={16} /> Enregistré</> : "Enregistrer"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
              onClick={() => setShowResetModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }} 
              transition={{ type: "spring", duration: 0.35, bounce: 0 }}
              className="bg-card border border-border dark:border-white/[0.08] p-6 rounded-3xl shadow-2xl w-full max-w-sm relative z-10 mx-4"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-500 flex items-center justify-center shrink-0">
                  <Trash2 size={18} />
                </div>
                <CloseButton onClick={() => setShowResetModal(false)} />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-foreground mb-2">
                Supprimer des données
              </h3>
              <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
                Choisis si tu souhaites effacer uniquement ce mois ou réinitialiser l'ensemble de tes données.
              </p>
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  disabled={!selectedMonth || selectedMonth === "Tout" || selectedMonth === "all"}
                  onClick={confirmReset}
                  className={`h-10 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full px-4 text-sm font-medium transition-all flex-1 text-center select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none ${
                    (!selectedMonth || selectedMonth === "Tout" || selectedMonth === "all")
                      ? "opacity-40 pointer-events-none" 
                      : "cursor-pointer"
                  }`}
                >
                  Supprimer ce mois
                </button>
                <button 
                  type="button"
                  onClick={confirmResetAll}
                  className="h-10 bg-rose-500 hover:bg-rose-600 text-white rounded-full px-4 text-sm font-medium transition-all flex-1 text-center select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-rose-400/40 focus-visible:outline-none cursor-pointer"
                >
                  Tout réinitialiser
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inbox Popover */}
      <AnimatePresence>
        {showInbox && (
            <motion.div 
              ref={inboxRef}
              initial={{ opacity: 0, y: -10, scale: 0.95 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: -10, scale: 0.95 }} 
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="fixed top-[112px] right-4 sm:right-[40px] w-80 sm:w-96 bg-card dark:bg-[#0F0F11] border border-border dark:border-white/[0.08] shadow-2xl rounded-2xl z-[101] overflow-hidden flex flex-col"
            >
              <div className="p-4 px-5 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                  Opérations à vérifier
                  {inboxTx.length > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{inboxTx.length}</span>}
                </h3>
                <CloseButton onClick={() => setShowInbox(false)} iconSize={15} />
              </div>
              
              <div className="flex-1 overflow-y-auto max-h-[60vh] p-4 space-y-3 no-scrollbar">
                {inboxTx.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-neutral-400">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-3">
                      <Check size={22} strokeWidth={2.5} />
                    </div>
                    <p className="font-semibold text-foreground text-sm">Toutes vos dépenses sont classées</p>
                    <p className="text-xs text-neutral-500 mt-1">Votre Inbox est vide</p>
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
                        className="p-3.5 bg-neutral-50 dark:bg-white/[0.03] rounded-2xl border border-border"
                      >
                        <div className="flex items-center justify-between gap-3 mb-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm text-foreground truncate" title={tx.name}>{tx.name}</div>
                            <div className="text-xs text-neutral-500 mt-0.5">{tx.date}</div>
                          </div>
                          <div className="font-bold text-sm text-foreground shrink-0 text-right tabular-nums">{tx.amount.toFixed(2)} €</div>
                        </div>
                        <div className="relative">
                          <select
                            className="w-full h-9 appearance-none text-xs font-medium bg-neutral-100 dark:bg-white/[0.06] border border-border rounded-full pl-3.5 pr-8 outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all text-foreground cursor-pointer"
                            value=""
                            onChange={(e) => {
                              const newType = e.target.value;
                              // Update cache
                              const cache = JSON.parse(localStorage.getItem('krona_merchant_knowledge') || '{}');
                              cache[tx.name] = { ...cache[tx.name], categorie: newType };
                              localStorage.setItem('krona_merchant_knowledge', JSON.stringify(cache));
                              
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
                          <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCalendarModal && (
          <CalendarModal 
            key="calendar-modal"
            isOpen={showCalendarModal}
            onClose={() => setShowCalendarModal(false)}
            transactions={transactions}
            selectedMonth={selectedMonth || uniqueMonths[0] || ""}
            onSelectMonth={setSelectedMonth}
          />
        )}
      </AnimatePresence>

      {/* Modale des transactions détaillées (ex-Drawer) */}
      <AnimatePresence>
        {showTransactionsDrawer && (
          <div className="fixed inset-0 z-[70] flex justify-end p-2 sm:p-4 md:p-6">
            {/* Scrim avec blur translucide Apple */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowTransactionsDrawer(false)}
              className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
            />

            {/* Modale flottante latérale */}
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="relative z-10 h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] md:h-[calc(100vh-3rem)] w-full max-w-lg md:max-w-xl rounded-2xl sm:rounded-3xl bg-card/95 dark:bg-[#0F0F11]/95 backdrop-blur-2xl border border-border dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-border flex items-center justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-lg font-bold tracking-tight text-foreground font-sans">Toutes les opérations</h2>
                    <span className="bg-black/5 dark:bg-white/[0.08] text-neutral-600 dark:text-neutral-300 text-xs px-2.5 py-0.5 rounded-full font-medium tabular-nums font-sans">
                      {displayedDrawerTx.length !== filteredTransactions.length
                        ? `${displayedDrawerTx.length} sur ${filteredTransactions.length}`
                        : filteredTransactions.length}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 font-sans">
                    {formatMonthLabel(selectedMonth || "")}
                  </p>
                </div>
                <CloseButton onClick={() => setShowTransactionsDrawer(false)} />
              </div>

              {/* Barre de recherche et filtres */}
              <div className="px-4 sm:px-6 py-3 sm:py-4 shrink-0 space-y-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={drawerSearch}
                    onChange={(e) => setDrawerSearch(e.target.value)}
                    placeholder="Rechercher par libellé ou catégorie..."
                    className="w-full h-10 pl-9 pr-8 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm focus:outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 text-foreground placeholder:text-neutral-500 transition-all font-sans"
                  />
                  {drawerSearch && (
                    <button
                      type="button"
                      onClick={() => setDrawerSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-foreground p-1 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Chips de filtrage rapide */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {[
                    { id: "all", label: "Tout" },
                    { id: "debit", label: "Dépenses" },
                    { id: "credit", label: "Revenus" },
                    { id: "sub", label: "Abonnements" },
                    { id: "transfer", label: "Virements" },
                  ].map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setDrawerFilter(chip.id)}
                      className={`h-8 px-3.5 rounded-full text-xs font-medium transition-all shrink-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer font-sans ${
                        drawerFilter === chip.id
                          ? "bg-foreground text-background shadow-sm"
                          : "text-neutral-400 hover:text-foreground bg-transparent hover:bg-black/5 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Badge(s) de filtre / recherche actif avec bouton de réinitialisation */}
                {(drawerFilter !== "all" || drawerSearch.trim() !== "") && (
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {drawerFilter !== "all" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/[0.08] text-foreground border border-black/10 dark:border-white/10 font-sans">
                        <span>Filtre : {
                          drawerFilter === "sub" ? "Abonnements" :
                          drawerFilter === "debit" ? "Dépenses" :
                          drawerFilter === "credit" ? "Revenus" :
                          drawerFilter === "transfer" ? "Virements" : drawerFilter
                        }</span>
                        <button
                          type="button"
                          onClick={() => setDrawerFilter("all")}
                          className="text-neutral-400 hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                          title="Réinitialiser le filtre"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )}
                    {drawerSearch.trim() !== "" && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/[0.08] text-foreground border border-black/10 dark:border-white/10 font-sans max-w-[280px]">
                        <span className="truncate">Recherche : {drawerSearch.trim()}</span>
                        <button
                          type="button"
                          onClick={() => setDrawerSearch("")}
                          className="text-neutral-400 hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
                          title="Effacer la recherche"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )}
                    {(drawerFilter !== "all" && drawerSearch.trim() !== "") && (
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerFilter("all");
                          setDrawerSearch("");
                        }}
                        className="text-[11px] text-neutral-400 hover:text-foreground transition-colors cursor-pointer font-sans underline underline-offset-2 ml-1"
                      >
                        Tout effacer
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Liste des transactions */}
              <div className="flex-1 overflow-y-auto no-scrollbar px-6 flex flex-col">
                {displayedDrawerTx.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-neutral-400">
                    <ArrowRightLeft size={32} className="stroke-1 mb-3 opacity-40" />
                    <p className="text-sm font-medium text-foreground font-sans">Aucune opération trouvée</p>
                    <p className="text-xs text-neutral-500 mt-1 font-sans">Essaie d&apos;ajuster ta recherche ou tes filtres</p>
                    {(drawerFilter !== "all" || drawerSearch.trim() !== "") && (
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerFilter("all");
                          setDrawerSearch("");
                        }}
                        className="mt-3.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-foreground text-background hover:opacity-90 active:scale-95 transition-all font-sans cursor-pointer"
                      >
                        Effacer les filtres
                      </button>
                    )}
                  </div>
                ) : (
                  displayedDrawerTx.map(tx => (
                    <TransactionRow key={tx.id} tx={tx} isSubscription={isTxSubscription(tx)} />
                  ))
                )}
              </div>

              {/* Résumé en bas du tiroir */}
              <div className="p-4 px-6 border-t border-border bg-card dark:bg-[#0F0F11] flex items-center justify-between shrink-0 mt-auto">
                <span className="text-xs text-neutral-500">
                  {displayedDrawerTx.length} opération{displayedDrawerTx.length > 1 ? "s" : ""} au total
                </span>
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {drawerFilter === "debit" || drawerFilter === "all" ? (
                    `Dépenses nettes : ${drawerDebitsTotal.toFixed(2)} €`
                  ) : drawerFilter === "credit" ? (
                    `Revenus nets : ${drawerCreditsTotal.toFixed(2)} €`
                  ) : (
                    `Total : ${Math.abs(drawerDebitsTotal - drawerCreditsTotal).toFixed(2)} €`
                  )}
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      </div>
    </div>
  );
}

