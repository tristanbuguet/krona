"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Area, AreaChart, LineChart, Line, Legend, ResponsiveContainer, XAxis, PieChart, Pie, Cell, BarChart, Bar, ReferenceLine, CartesianGrid } from "recharts";
import { CSVUploader } from "./CSVUploader";
import { CsvAnalysisModal, ImportStep } from "./CsvAnalysisModal";
import { NormalizedTransaction, parseBoursoBankRows } from "@/lib/bankParser";
import { cleanMerchantName, categorizeLocally, normalizeText } from "@/lib/categorization";
import { BoursoBankLogo, CreditAgricoleLogo } from "./BankSelectorPopover";
import { CloseButton } from "./ui/CloseButton";
import { PageHeader } from "./ui/PageHeader";
import { Card } from "./ui/Card";
import { SubscriptionManager, detectSubscriptions } from "./SubscriptionManager";
import { MonthlyLimitCard, MonthlyLimitConfig } from "./MonthlyLimitCard";
import { RealDisposableIncomeCard, StartingBudgetCard } from "./RealDisposableIncomeCard";
import { SemiDonutGauge } from "./SemiDonutGauge";
import { ExpensesCurveChart } from "./ExpensesCurveChart";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import clsx from "clsx";
import { useTheme } from "./ThemeProvider";
import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, RefreshCcw, RotateCcw, ChevronDown, ChevronRight, Trash2, X, Wallet, Repeat, Check, Sparkles, AlertCircle, CheckCircle2, Info, Activity, PieChart as PieChartIcon, ArrowRightLeft, Download, UploadCloud, ShieldCheck, Flag, ShoppingCart, Utensils, ShoppingBag, Train, Monitor, Ticket, HeartPulse, Home, Star, CalendarDays, ArrowRight, Search, Plus } from "lucide-react";
import { TrendsView } from "./views/TrendsView";
import { TransactionsView } from "./views/TransactionsView";
import { AccountsView } from "./views/AccountsView";
import { Transaction, FixedIncomeSettings, isSubscriptionCategory, isSalaryTransaction, isAidTransaction } from "@/lib/types";

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

const RECATEGORIZATION_CATEGORIES = [
  "Alimentation & Courses",
  "Restos & Fast-Food",
  "Transports",
  "Abonnements & Forfaits",
  "Logement & Maison",
  "Sorties & Soirées",
  "Santé & Soins",
  "Shopping & Mode",
  "Revenus & Aides",
  "Virements proches & Remboursements",
  "Épargne & Trésorerie",
  "Autre"
] as const;

function getLocalFallback(categoryBourso: string, name: string, cache: Record<string, any>, amount: number = 0, rawLabel: string = "") {
  const result = categorizeLocally({
    label: name,
    rawLabel,
    amount,
    categoryBourso,
    cache,
  });
  return {
    type: result.category,
    isSub: result.isSubscription,
    isInternalTransfer: result.isInternalTransfer,
  };
}

const formatMonthLabel = (yyyyMM: string) => {
  if (!yyyyMM || yyyyMM === "Tout" || yyyyMM === "all") return "Aucun relevé";
  if (yyyyMM === "demo-month") return "Octobre 2026";
  const [yyyy, mm] = yyyyMM.split("-");
  if (!yyyy || !mm) return yyyyMM;
  const date = new Date(parseInt(yyyy), parseInt(mm) - 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
};


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


const CategoryIcon = ({ type, isSubscription, isInternalTransfer, iconSize = 16 }: { type: string, isSubscription?: boolean, isInternalTransfer?: boolean, iconSize?: number }) => {
  const color = CATEGORY_COLORS[type]?.ring || "#A1A1AA";
  const iconProps = { size: iconSize, strokeWidth: 1.75, style: { color } };

  if (isSubscription || type === "Abonnements & Forfaits") return <Repeat {...iconProps} />;
  if (type === "Revenus & Aides") return <ArrowDownLeft {...iconProps} />;
  if (isInternalTransfer || type === "Épargne & Trésorerie" || type === "Virements proches & Remboursements") return <ArrowRightLeft {...iconProps} />;

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

const TransactionRow = ({ 
  tx, 
  hideDescription, 
  isSubscription,
  isSelected,
  onClick
}: { 
  tx: Transaction; 
  hideDescription?: boolean; 
  isSubscription?: boolean;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) => {
  const txCatColor = CATEGORY_COLORS[tx.type] || CATEGORY_COLORS["Autre"];
  const txColorHex = txCatColor?.ring || "#71717A";

  return (
    <motion.div 
      whileTap={{ scale: 0.98 }} 
      onClick={onClick}
      data-transaction-row={tx.id}
      className={clsx(
        "flex items-center justify-between py-3 px-2.5 cursor-pointer group rounded-xl transition-colors duration-150 select-none hover:bg-neutral-100/70 dark:hover:bg-white/[0.03]",
        isSelected && "bg-neutral-100/70 dark:bg-white/[0.03]"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 max-w-[55%]">
        <div 
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `${txColorHex}15`,
            border: `1px solid ${txColorHex}25`
          }}
        >
          <CategoryIcon type={tx.type} isSubscription={isSubscription ?? tx.isSubscription} isInternalTransfer={tx.isInternalTransfer} iconSize={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-foreground truncate">{tx.name}</div>
          {!hideDescription && tx.type && (
            <div className="flex items-center gap-2 mt-0.5">
              {tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer ? (
                <span className="text-[10px] bg-black/5 dark:bg-white/[0.06] text-neutral-400 px-2 py-0.5 rounded-full tracking-wide">VIREMENT INTERNE</span>
              ) : (
                <div className="text-xs text-neutral-500 truncate">
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
          const isInternal = tx.isInternalTransfer || tx.type === "Épargne & Trésorerie";
          if (isInternal) return;

          const nam = tx.name.toLowerCase();
          const isSalary = 
            nam.includes("salaire") ||
            nam.includes("remuneration") ||
            nam.includes("rémunération") ||
            /\b(paie|paye)\b/i.test(nam) ||
            nam.includes("employeur");
          const isAids = 
            nam.includes("caf") ||
            nam.includes("allocation") ||
            nam.includes("pole emploi") ||
            nam.includes("france travail");
          const isIncome = isSalary || isAids || tx.type === "Revenus & Aides";

          if (tx.amount < 0) {
            stats[m].expenses += Math.abs(tx.amount);
            stats[m].balance += tx.amount;
          } else {
            if (isIncome) {
              stats[m].balance += tx.amount;
            } else {
              // Remboursement opérationnel : vient en déduction directe des dépenses
              stats[m].expenses = Math.max(0, stats[m].expenses - tx.amount);
              stats[m].balance += tx.amount;
            }
          }
        }
      }
    });

    Object.keys(stats).forEach(k => {
      stats[k].expenses = Math.round(stats[k].expenses * 100) / 100;
      stats[k].balance = Math.round(stats[k].balance * 100) / 100;
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
                  ? "bg-white text-zinc-950 font-medium shadow-sm" 
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
                    {isActive && <span className="text-[10px] bg-black/5 dark:bg-white/[0.08] text-muted-foreground px-2 py-0.5 rounded-full shrink-0 font-medium">{stat.count} op</span>}
                  </div>
                  {isActive && (
                    <div className="mt-auto flex justify-between items-end">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Dépenses</div>
                        <div className="text-sm font-bold text-foreground tabular-nums">{stat.expenses.toFixed(0)} €</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Solde</div>
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

function getInitialPersistedMonth(months: string[]): string | null {
  if (typeof window === "undefined" || months.length === 0) return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlMonth = urlParams.get("month") || urlParams.get("date");
    if (urlMonth && months.includes(urlMonth)) {
      return urlMonth;
    }
    const storedMonth = localStorage.getItem("krona_selected_month");
    if (storedMonth && months.includes(storedMonth)) {
      return storedMonth;
    }
  } catch (e) {}
  return months[0] || null;
}

interface DashboardProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function Dashboard({
  activeTab: propActiveTab,
  onTabChange,
}: DashboardProps = {}) {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [theme]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [importStep, setImportStep] = useState<ImportStep | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string, visible: boolean } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const handleMonthChange = useCallback((newMonth: string | null, pushToHistory = true) => {
    setSelectedMonth(newMonth);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (newMonth) {
        localStorage.setItem("krona_selected_month", newMonth);
        if (url.searchParams.get("month") !== newMonth) {
          url.searchParams.set("month", newMonth);
          if (pushToHistory) {
            window.history.pushState({}, "", url.toString());
          } else {
            window.history.replaceState({}, "", url.toString());
          }
        }
      } else {
        localStorage.removeItem("krona_selected_month");
        if (url.searchParams.has("month")) {
          url.searchParams.delete("month");
          if (pushToHistory) {
            window.history.pushState({}, "", url.toString());
          } else {
            window.history.replaceState({}, "", url.toString());
          }
        }
      }
    } catch (e) {}
  }, []);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  const [showInbox, setShowInbox] = useState(false);
  const inboxRef = useRef<HTMLDivElement>(null);
  const [bellPosition, setBellPosition] = useState<{ left: number; bottom: number } | null>(null);

  const updateBellPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const bellBtn = document.getElementById("sidebar-bell-btn") || document.querySelector('[aria-label="Notifications"]');
    if (bellBtn) {
      const rect = bellBtn.getBoundingClientRect();
      setBellPosition({
        left: Math.round(rect.right + 8),
        bottom: Math.round(window.innerHeight - rect.bottom),
      });
    }
  }, []);

  useEffect(() => {
    if (showInbox) {
      updateBellPosition();
      window.addEventListener("resize", updateBellPosition);
      return () => window.removeEventListener("resize", updateBellPosition);
    }
  }, [showInbox, updateBellPosition]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("krona-inbox-state-changed", { detail: { isOpen: showInbox } }));
  }, [showInbox]);

  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isImportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setIsImportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsImportMenuOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isImportMenuOpen]);

  useEffect(() => {
    if (!showInbox) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (inboxRef.current && !inboxRef.current.contains(target)) {
        if (!target.closest('[aria-label="Notifications"]') && !target.closest('#sidebar-bell-btn')) {
          setShowInbox(false);
        }
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowInbox(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showInbox]);

  const [showTransactionsDrawer, setShowTransactionsDrawer] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [drawerFilter, setDrawerFilter] = useState("all");
  const [selectedRowTx, setSelectedRowTx] = useState<Transaction | null>(null);
  const [popupTop, setPopupTop] = useState<number>(0);
  const recatPopupRef = useRef<HTMLDivElement>(null);
  const modalWrapperRef = useRef<HTMLDivElement>(null);
  const drawerScrollRef = useRef<HTMLDivElement>(null);
  const lastPopupClosedAtRef = useRef<number>(0);

  // Répartition interactive hover state & auto-scroll synchronisé
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);

  const handleArcHoverCategory = useCallback((catName: string | null) => {
    setHoveredCategory(catName);
    if (catName && categoryListRef.current) {
      const rowEl = categoryListRef.current.querySelector(
        `[data-category-row="${catName.replace(/"/g, '\\"')}"]`
      ) as HTMLElement | null;
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, []);

  // Dynamic positioning calculation with collision detection and adaptive vertical alignment
  const updatePopupPosition = useCallback((txId?: string) => {
    const id = txId || selectedRowTx?.id;
    if (!id || !modalWrapperRef.current) return;
    
    const rowEl = modalWrapperRef.current.querySelector(`[data-transaction-row="${id}"]`) as HTMLElement | null;
    if (!rowEl) return;

    const wrapperRect = modalWrapperRef.current.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    
    // Relative coordinates of the row within the modal wrapper
    const rowTop = rowRect.top - wrapperRect.top;
    const rowBottom = rowRect.bottom - wrapperRect.top;
    
    // Height of the popup (measured or fallback default ~380px)
    const popupH = recatPopupRef.current?.offsetHeight && recatPopupRef.current.offsetHeight > 50
      ? recatPopupRef.current.offsetHeight
      : 380;
    
    // Safety padding in pixels
    const padding = 16;
    
    // Maximum allowed top position in wrapper coordinates, respecting both wrapper bounds and viewport
    const maxTopWrapper = wrapperRect.height - popupH - padding;
    const maxTopViewport = window.innerHeight - wrapperRect.top - popupH - padding;
    const maxAllowedTop = Math.max(padding, Math.min(maxTopWrapper, maxTopViewport));
    
    // Check if normal top-alignment causes bottom collision / overflow
    let calculatedTop: number;
    if (rowTop <= maxAllowedTop) {
      // Normal case: space below is sufficient, align TOP of popup with TOP of row
      calculatedTop = rowTop;
    } else {
      // Critical bottom case: popup would overflow bottom, flip anchor to align BOTTOM of popup with BOTTOM of row
      calculatedTop = rowBottom - popupH;
    }
    
    // Strict clamp with safety margins: Math.max(16, Math.min(calculatedTop, maxAllowedTop))
    const clampedTop = Math.max(padding, Math.min(calculatedTop, maxAllowedTop));
    setPopupTop(Math.round(clampedTop));
  }, [selectedRowTx]);

  // Recalculate position when selected transaction changes
  useEffect(() => {
    if (selectedRowTx) {
      updatePopupPosition(selectedRowTx.id);
      const raf = requestAnimationFrame(() => {
        updatePopupPosition(selectedRowTx.id);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [selectedRowTx, updatePopupPosition]);

  // Recalculate on window resize
  useEffect(() => {
    if (!selectedRowTx) return;
    const handleResize = () => updatePopupPosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [selectedRowTx, updatePopupPosition]);

  // Clear selected transaction when search, filter, or selectedMonth changes, or when drawer closes
  useEffect(() => {
    setSelectedRowTx(null);
  }, [drawerSearch, drawerFilter, selectedMonth, showTransactionsDrawer]);

  // Fermeture automatique du pop-up lors du défilement dans la liste des opérations
  useEffect(() => {
    const scrollEl = drawerScrollRef.current;
    if (!scrollEl || !selectedRowTx) return;

    const handleScroll = () => {
      setSelectedRowTx(null);
    };

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener("scroll", handleScroll);
    };
  }, [selectedRowTx]);

  // Click outside to close lateral recategorization popup with complete event interception
  useEffect(() => {
    if (!showTransactionsDrawer) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!selectedRowTx) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Inside lateral popup: allow normal interactions
      if (recatPopupRef.current && recatPopupRef.current.contains(target)) {
        return;
      }

      // Clicking on a transaction row handles its own toggle / row switch
      if (target.closest('[data-transaction-row]')) {
        return;
      }

      // Explicit close button of the main drawer
      if (target.closest('[data-drawer-close]')) {
        return;
      }

      // Outside click detected! Intercept event and close ONLY the lateral popup
      e.stopPropagation();
      e.stopImmediatePropagation();
      lastPopupClosedAtRef.current = Date.now();
      setSelectedRowTx(null);
    };

    const handleClick = (e: MouseEvent) => {
      // Prevent click event leakage if the popup was closed in this gesture sequence (< 400ms)
      if (Date.now() - lastPopupClosedAtRef.current < 400) {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        if (recatPopupRef.current && recatPopupRef.current.contains(target)) {
          return;
        }

        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      if (selectedRowTx) {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        if (recatPopupRef.current && recatPopupRef.current.contains(target)) {
          return;
        }

        if (target.closest('[data-transaction-row]')) {
          return;
        }

        if (target.closest('[data-drawer-close]')) {
          return;
        }

        e.stopPropagation();
        e.stopImmediatePropagation();
        lastPopupClosedAtRef.current = Date.now();
        setSelectedRowTx(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("touchstart", handlePointerDown, { capture: true, passive: false });
    window.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("touchstart", handlePointerDown, true);
      window.removeEventListener("click", handleClick, true);
    };
  }, [showTransactionsDrawer, selectedRowTx]);

  // Escape key to dismiss lateral popup first
  useEffect(() => {
    if (!selectedRowTx) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        setSelectedRowTx(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [selectedRowTx]);
  const [settingsTab, setSettingsTab] = useState<"income_fixed" | "subscriptions" | "budgets_data">("income_fixed");
  const [internalActiveTab, setInternalActiveTab] = useState("dashboard");
  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab;
  const setActiveTab = (tab: string) => {
    setInternalActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  const [ignoredSubscriptions, setIgnoredSubscriptions] = useState<string[]>([]);
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>("all");

  const [incomeSettings, setIncomeSettings] = useState<FixedIncomeSettings>({
    salary: 0,
    aids: 0,
    autoApply: false,
    savingsGoal: 0,
    rent: undefined,
    loans: undefined,
    utilities: undefined
  });

  const [customSpendingLimit, setCustomSpendingLimit] = useState<number | null>(null);
  const [monthlyLimitConfig, setMonthlyLimitConfig] = useState<MonthlyLimitConfig>({
    type: "amount",
    value: 2200,
  });

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem("krona_monthly_limit_config");
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (
          parsed &&
          (parsed.type === "amount" || parsed.type === "percent") &&
          typeof parsed.value === "number" &&
          parsed.value > 0
        ) {
          setMonthlyLimitConfig(parsed);
        }
      }
      const saved = localStorage.getItem("krona_monthly_spending_limit");
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val > 0) setCustomSpendingLimit(val);
      }
    } catch (e) {}
  }, []);

  // Settings, Inbox & Navigation Listeners
  useEffect(() => {
    const handleOpenSettings = () => setShowSettingsModal(true);
    const handleOpenInbox = () => {
      updateBellPosition();
      setShowInbox(prev => !prev);
    };
    const handleNav = (e: any) => setActiveTab(e.detail.tab);
    window.addEventListener("open-settings", handleOpenSettings);
    window.addEventListener("open-inbox", handleOpenInbox);
    window.addEventListener("navigate-tab", handleNav);
    return () => {
      window.removeEventListener("open-settings", handleOpenSettings);
      window.removeEventListener("open-inbox", handleOpenInbox);
      window.removeEventListener("navigate-tab", handleNav);
    };
  }, [updateBellPosition]);

  // Load transactions and settings from localStorage on mount
  useEffect(() => {
    try {
      const cache = JSON.parse(localStorage.getItem('krona_merchant_knowledge') || '{}');
      let changed = false;
      Object.keys(cache).forEach(k => {
        if (!isSubscriptionCategory(cache[k].categorie) && cache[k].isSubscription) {
          cache[k].isSubscription = false;
          changed = true;
        }
      });
      if (changed) localStorage.setItem('krona_merchant_knowledge', JSON.stringify(cache));
    } catch (e) {}

    const savedTx = localStorage.getItem('financeTransactions_v1');
    if (savedTx) {
      let parsed = JSON.parse(savedTx) as Transaction[];
      
      // Auto-migrate old internal transfer transactions and sanitize subscription flags
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

        if (!isSubscriptionCategory(tx.type) && tx.name.toLowerCase() !== "navigo pass ratp" && tx.isSubscription) {
          hasMutated = true;
          return { ...tx, isSubscription: false, isRecurring: false };
        }

        return tx;
      });

      setTransactions(parsed);
      
      const months = Array.from(new Set(parsed.map(tx => tx.month))).sort().reverse();
      if (months.length > 0) {
        const targetMonth = getInitialPersistedMonth(months);
        handleMonthChange(targetMonth, false);
      }
      
      if (hasMutated) {
        localStorage.setItem('financeTransactions_v1', JSON.stringify(parsed));
      }

    } else {
      setTransactions([]);
    }

    const savedBudgets = localStorage.getItem('categoryBudgets');
    if (savedBudgets) {
      try {
        const parsed = JSON.parse(savedBudgets);
        delete parsed["Revenus & Aides"];
        delete parsed["Épargne & Trésorerie"];
        setCategoryBudgets(parsed);
      } catch(e) {}
    }

    const savedIncome = localStorage.getItem('fixedIncomeSettings');
    if (savedIncome) {
      try {
        const parsed = JSON.parse(savedIncome);
        setIncomeSettings({
          salary: typeof parsed.salary === "number" ? Math.max(0, parsed.salary) : 0,
          aids: typeof parsed.aids === "number" ? Math.max(0, parsed.aids) : 0,
          autoApply: Boolean(parsed.autoApply),
          savingsGoal: typeof parsed.savingsGoal === "number" ? Math.max(0, parsed.savingsGoal) : 0,
          rent: typeof parsed.rent === "number" ? Math.max(0, parsed.rent) : undefined,
          loans: typeof parsed.loans === "number" ? Math.max(0, parsed.loans) : undefined,
          utilities: typeof parsed.utilities === "number" ? Math.max(0, parsed.utilities) : undefined,
        });
      } catch(e) {}
    }

    const savedIgnoredSubs = localStorage.getItem('krona_ignored_subscriptions');
    if (savedIgnoredSubs) {
      try { setIgnoredSubscriptions(JSON.parse(savedIgnoredSubs)); } catch(e) {}
    }

    setIsDataLoaded(true);
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
      handleMonthChange(remainingMonths[0], false);
    } else {
      handleMonthChange(null, false);
    }
    setShowResetModal(false);
  };

  const confirmResetAll = () => {
    localStorage.removeItem('financeTransactions_v1');
    localStorage.removeItem('categoryBudgets');
    localStorage.removeItem('fixedIncomeSettings');
    localStorage.removeItem('krona_ignored_subscriptions');
    localStorage.removeItem('krona_merchant_knowledge');
    localStorage.removeItem('krona_selected_month');
    localStorage.removeItem('krona_monthly_limit_config');
    localStorage.removeItem('krona_monthly_spending_limit');
    localStorage.removeItem('krona_selected_card');
    localStorage.removeItem('krona_accounts_v1');
    localStorage.removeItem('krona_selected_bank');
    setTransactions([]);
    handleMonthChange(null, false);
    setCategoryBudgets({});
    setIgnoredSubscriptions([]);
    setCustomSpendingLimit(null);
    setMonthlyLimitConfig({ type: "amount", value: 2200 });
    setIncomeSettings({
      salary: 0,
      aids: 0,
      autoApply: false,
      savingsGoal: 0,
      rent: undefined,
      loans: undefined,
      utilities: undefined
    });
    setActiveTab("dashboard");
    setShowResetModal(false);
  };

  // Save to localStorage whenever transactions change
  useEffect(() => {
    if (transactions.length > 0) {
      localStorage.setItem('financeTransactions_v1', JSON.stringify(transactions));
    }
  }, [transactions]);

  const hasRealData = Boolean(transactions && transactions.length > 0);
  const activeTransactions = transactions;

  const uniqueMonths = useMemo(() => {
    return Array.from(new Set(activeTransactions.map(tx => tx.month))).sort().reverse();
  }, [activeTransactions]);

  // Verrouillage mensuel strict du Dashboard : JAMAIS de "Tout" ni "Toutes les périodes"
  const availableMonths = useMemo(() => {
    return uniqueMonths;
  }, [uniqueMonths]);

  // Synchronisation stricte : toujours un seul mois sélectionné à la fois (ou null si aucun relevé)
  useEffect(() => {
    if (!isDataLoaded) return;
    if (uniqueMonths.length > 0) {
      if (!selectedMonth || selectedMonth === "Tout" || selectedMonth === "all" || !uniqueMonths.includes(selectedMonth)) {
        const targetMonth = getInitialPersistedMonth(uniqueMonths);
        handleMonthChange(targetMonth, false);
      }
    } else {
      handleMonthChange(null, false);
    }
  }, [isDataLoaded, uniqueMonths, selectedMonth, handleMonthChange]);

  // Écoute de l'historique navigateur (boutons précédent / suivant)
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined" || uniqueMonths.length === 0) return;
      try {
        const params = new URLSearchParams(window.location.search);
        const urlMonth = params.get("month") || params.get("date");
        if (urlMonth && uniqueMonths.includes(urlMonth)) {
          setSelectedMonth(urlMonth);
          localStorage.setItem("krona_selected_month", urlMonth);
        } else if (!urlMonth && uniqueMonths.length > 0) {
          const target = uniqueMonths[0];
          setSelectedMonth(target);
          localStorage.setItem("krona_selected_month", target);
        }
      } catch (e) {}
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [uniqueMonths]);

  const handleUpload = async (data: NormalizedTransaction[] | any[]) => {
    try {
      setImportStep("importing");

      const cache = JSON.parse(localStorage.getItem('krona_merchant_knowledge') || '{}');

      // Détecter si les données sont déjà normalisées (via bankParser) ou brutes
      const isNormalized = Array.isArray(data) && data.length > 0 && "account" in data[0] && "label" in data[0];
      const normalizedItems: NormalizedTransaction[] = isNormalized 
        ? (data as NormalizedTransaction[])
        : parseBoursoBankRows(data as string[][]);

      if (!normalizedItems || normalizedItems.length === 0) {
        setImportStep(null);
        setToastMessage({ text: "Aucune opération valide trouvée dans le fichier.", visible: true });
        setTimeout(() => setToastMessage(null), 3000);
        return;
      }

      // Application immédiate du moteur de catégorisation local riche
      const occurrenceMap = new Map<string, number>();
      const parsedRows: Transaction[] = normalizedItems.map((item) => {
        const name = item.label || cleanMerchantName(item.rawLabel);
        const localCat = categorizeLocally({
          label: name,
          rawLabel: item.rawLabel,
          amount: item.amount,
          categoryBourso: item.categoryBourso,
          cache,
        });

        const slug = normalizeText(name).replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30) || "tx";
        const baseKey = `${item.date}_${item.amount}_${slug}`;
        const occ = (occurrenceMap.get(baseKey) || 0) + 1;
        occurrenceMap.set(baseKey, occ);

        const prefix = item.account === "Crédit Agricole" ? "ca" : "bourso";
        const rawId = item.id || `${prefix}_${baseKey}_${occ}`;

        return {
          id: rawId,
          name,
          type: localCat.isInternalTransfer ? "Épargne & Trésorerie" : localCat.category,
          amount: isNaN(item.amount) ? 0 : item.amount,
          date: item.date,
          month: item.month,
          isSubscription: localCat.isSubscription,
          isInternalTransfer: localCat.isInternalTransfer,
          account: item.account,
        };
      }).filter(row => row !== null && row.amount !== 0);

      // 1. INJECTION IMMÉDIATE DES TRANSACTIONS DANS LE STATE
      // Permet l'affichage instantané des métriques, cartes KPI, solde et listes
      let majorityMonth = "Tout";
      let addedCount = 0;
      const uniqueMonths = new Set<string>();

      setTransactions(prev => {
        const prevHashes = new Set(prev.map(p => p.id));
        const prevSignatureCounts = new Map<string, number>();
        prev.forEach(p => {
          const sig = `${p.date}_${p.amount}_${normalizeText(p.name).replace(/[^a-z0-9]/g, "").slice(0, 20)}`;
          prevSignatureCounts.set(sig, (prevSignatureCounts.get(sig) || 0) + 1);
        });

        const actuallyNew: Transaction[] = [];

        parsedRows.forEach(tx => {
          const sig = `${tx.date}_${tx.amount}_${normalizeText(tx.name).replace(/[^a-z0-9]/g, "").slice(0, 20)}`;
          const existingCount = prevSignatureCounts.get(sig) || 0;

          if (prevHashes.has(tx.id)) {
            return;
          }

          if (existingCount > 0) {
            prevSignatureCounts.set(sig, existingCount - 1);
            return;
          }

          actuallyNew.push(tx);
          prevHashes.add(tx.id);
          addedCount++;
          uniqueMonths.add(tx.month);
        });

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
        localStorage.setItem('financeTransactions_v1', JSON.stringify(combined));
        return combined;
      });

      if (majorityMonth !== "Tout") {
        handleMonthChange(majorityMonth);
      }

      // Persistance de l'établissement actif
      const detectedBank = (normalizedItems[0]?.account === "Crédit Agricole" || (data as any)[0]?.account === "Crédit Agricole") ? "ca" : "bourso";
      localStorage.setItem("krona_selected_bank", detectedBank);
      window.dispatchEvent(new CustomEvent("krona-bank-changed", { detail: { bank: detectedBank } }));

      // 2. PIPELINE DE CATÉGORISATION IA CIBLÉE SUR « AUTRE »
      const orphanTransactions = parsedRows.filter(r => r.type === "Autre");

      if (orphanTransactions.length > 0) {
        setImportStep("categorizing");
        console.log(`[Krona AI] Catégorisation de ${orphanTransactions.length} transactions...`);

        try {
          const res = await fetch("/api/categorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: orphanTransactions.map(tx => ({
                id: tx.id,
                label: tx.name,
              })),
            }),
          });

          if (res.ok) {
            const data = await res.json();
            console.log('[Krona AI] Réponse reçue:', data);

            const resultsList: Array<{ id: string; category: string }> = Array.isArray(data.mapping) 
              ? data.mapping 
              : (Array.isArray(data.results) ? data.results : []);

            if (Array.isArray(resultsList) && resultsList.length > 0) {
              const idToCategory = new Map<string, string>();
              resultsList.forEach(r => {
                if (r.id && r.category && r.category !== "Autre") {
                  idToCategory.set(r.id, r.category);
                }
              });

              if (idToCategory.size > 0) {
                const updatedKnowledge = { ...JSON.parse(localStorage.getItem('krona_merchant_knowledge') || '{}') };

                // Mise à jour immuable propre pour remplacer chaque catégorie « Autre »
                setTransactions(prev => {
                  let hasChanges = false;
                  const updated = prev.map(tx => {
                    const newCat = idToCategory.get(tx.id);
                    if (newCat && newCat !== tx.type) {
                      hasChanges = true;
                      const isSub = isSubscriptionCategory(newCat);
                      updatedKnowledge[tx.name] = {
                        categorie: newCat,
                        isSubscription: isSub,
                      };
                      return {
                        ...tx,
                        type: newCat,
                        isSubscription: isSub,
                        isRecurring: isSub,
                      };
                    }
                    return tx;
                  });

                  if (hasChanges) {
                    localStorage.setItem('krona_merchant_knowledge', JSON.stringify(updatedKnowledge));
                    localStorage.setItem('financeTransactions_v1', JSON.stringify(updated));
                    return [...updated];
                  }
                  return prev;
                });
              }
            }
          } else {
            console.warn("[Krona AI] Réponse statut non-OK :", res.status);
          }
        } catch (apiErr) {
          console.warn("[Krona AI] Erreur réseau non bloquante :", apiErr);
        }
      } else {
        console.log('[Krona AI] Toutes les opérations ont été catégorisées localement.');
      }

      // 3. FEEDBACK DE SUCCÈS (coche discrète + 'Relevé importé' pendant 800 ms puis fade-out)
      setImportStep("success");
      await new Promise(resolve => setTimeout(resolve, 800));
      setImportStep(null);
    } catch (e) {
      console.error("[Krona] Erreur lors de l'import :", e);
      setImportStep(null);
      setToastMessage({ text: "Erreur lors de l'import du relevé.", visible: true });
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleIgnoreSubscription = (merchantName: string) => {
    setIgnoredSubscriptions(prev => {
      const updated = [...prev, merchantName];
      try {
        localStorage.setItem('krona_ignored_subscriptions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleRestoreSubscription = (merchantName: string) => {
    setIgnoredSubscriptions(prev => {
      const updated = prev.filter(m => m !== merchantName);
      try {
        localStorage.setItem('krona_ignored_subscriptions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const activeSubscriptionMerchants = useMemo(() => {
    return detectSubscriptions(activeTransactions, ignoredSubscriptions);
  }, [activeTransactions, ignoredSubscriptions]);

  const isTxSubscription = useCallback((tx: Transaction) => {
    if (!tx || tx.amount >= 0) return false;
    if (ignoredSubscriptions.includes(tx.name)) return false;
    if (tx.isSubscription === false || tx.isRecurring === false) return false;

    const isCat = isSubscriptionCategory(tx.type);
    if (isCat) return true;
    if (tx.isSubscription === true) return true;
    if (activeSubscriptionMerchants.has(tx.name)) return true;
    return false;
  }, [activeSubscriptionMerchants, ignoredSubscriptions]);

  const handleSaveIncomeSettings = (newSettings: FixedIncomeSettings) => {
    const sanitized: FixedIncomeSettings = {
      salary: Math.max(0, newSettings.salary || 0),
      aids: Math.max(0, newSettings.aids || 0),
      autoApply: Boolean(newSettings.autoApply),
      savingsGoal: typeof newSettings.savingsGoal === "number" ? Math.max(0, newSettings.savingsGoal) : 0,
      rent: typeof newSettings.rent === "number" ? Math.max(0, newSettings.rent) : undefined,
      loans: typeof newSettings.loans === "number" ? Math.max(0, newSettings.loans) : undefined,
      utilities: typeof newSettings.utilities === "number" ? Math.max(0, newSettings.utilities) : undefined,
    };
    setIncomeSettings(sanitized);
    localStorage.setItem('fixedIncomeSettings', JSON.stringify(sanitized));
  };

  const handleSaveBudget = (cat: string, val: number) => {
    if (cat === "Revenus & Aides" || cat === "Épargne & Trésorerie") return;
    setCategoryBudgets(prev => {
      const next = { ...prev };
      if (val <= 0 || isNaN(val)) delete next[cat];
      else next[cat] = Math.max(0, Math.round(val));
      localStorage.setItem('categoryBudgets', JSON.stringify(next));
      return next;
    });
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

  const autoFixedCharges = useMemo(() => {
    let rent = 0;
    let loans = 0;
    let utils = 0;
    filteredTransactions.forEach(tx => {
      if (tx.amount >= 0 || tx.isInternalTransfer || tx.type === "Épargne & Trésorerie") return;
      const abs = Math.abs(tx.amount);
      const nam = tx.name.toLowerCase();
      if (nam.includes("loyer") || nam.includes("bail") || nam.includes("syndic") || nam.includes("propriétaire") || (tx.type === "Logement & Maison" && abs >= 200)) {
        rent += abs;
      } else if (nam.includes("credit") || nam.includes("crédit") || nam.includes("pret") || nam.includes("prêt") || nam.includes("emprunt") || nam.includes("mensualite") || nam.includes("mensualité")) {
        loans += abs;
      } else if (nam.includes("edf") || nam.includes("engie") || nam.includes("totalenergies") || nam.includes("assurance") || nam.includes("mutuelle") || nam.includes("veolia") || nam.includes("suez") || nam.includes("impots") || nam.includes("impôts")) {
        utils += abs;
      }
    });
    return { rent, loans, utils };
  }, [filteredTransactions]);

  const effectiveRent = incomeSettings.rent !== undefined ? incomeSettings.rent : autoFixedCharges.rent;
  const effectiveLoans = incomeSettings.loans !== undefined ? incomeSettings.loans : autoFixedCharges.loans;
  const effectiveUtilities = incomeSettings.utilities !== undefined ? incomeSettings.utilities : autoFixedCharges.utils;

  const inboxTx = useMemo(() => {
    return filteredTransactions.filter(tx => tx.type === "Autre");
  }, [filteredTransactions]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("update-inbox-count", { detail: { count: inboxTx.length } }));
  }, [inboxTx.length]);

  const handleRecategorizeTransaction = (txId: string, merchantName: string, newType: string) => {
    const isSub = isSubscriptionCategory(newType);

    try {
      const cache = JSON.parse(localStorage.getItem('krona_merchant_knowledge') || '{}');
      cache[merchantName] = { 
        ...(cache[merchantName] || {}), 
        categorie: newType,
        isSubscription: isSub,
      };
      localStorage.setItem('krona_merchant_knowledge', JSON.stringify(cache));
    } catch (e) {}

    // Si la transaction est déplacée vers Abonnements et qu'elle était ignorée, la réactiver
    if (isSub && ignoredSubscriptions.includes(merchantName)) {
      setIgnoredSubscriptions(prev => {
        const updated = prev.filter(m => m !== merchantName);
        localStorage.setItem('krona_ignored_subscriptions', JSON.stringify(updated));
        return updated;
      });
    }

    setTransactions(prev => {
      const source = prev;
      const updated = source.map(t => {
        if (t.id === txId || t.name === merchantName) {
          return { 
            ...t, 
            type: newType,
            isSubscription: isSub,
            isRecurring: isSub,
          };
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
  };

  const handleCategorySelect = (newCategory: string) => {
    if (!selectedRowTx) return;
    const tx = selectedRowTx;
    handleRecategorizeTransaction(tx.id, tx.name, newCategory);
    setSelectedRowTx(null);
  };

  // Le Dashboard est strictement verrouillé sur le mois unique sélectionné
  const isAllTime = false;
  const monthsCount = 1;

  const { expenses, income, balance, subs, categoryData, expensesTimeline, autoAppliedInfo } = useMemo(() => {
    let exp = 0;
    let totalRealIncome = 0;
    let hasRealSalary = false;
    let hasRealAids = false;
    let subTotal = 0;
    let saved = 0;
    const catMap: Record<string, number> = {};
    const timeMap: Record<string, number> = {};

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
        // 1. Détection granulaire par type de revenu dans le mois affiché
        const raw = (tx.rawName || "").toLowerCase();
        const combinedText = `${nam} ${raw}`;

        // Aides sociales / organismes publics prioritaires (ne doivent pas être confondues avec un salaire)
        const isAids = 
          isAidTransaction(tx) ||
          Boolean(combinedText.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide|allocation/i));

        // Remboursements explicites (viennent en déduction des dépenses)
        const isRefundLabel = Boolean(combinedText.match(/remboursement|avoir/i));

        // Détection élargie et pragmatique du salaire réel :
        // 1. Mots-clés de rémunération : salaire, paie, virement sepa, remuneration, appointement, galeries (ou nom d'employeur)
        const matchesSalaryKeywords = Boolean(
          combinedText.match(/salaire|paie|paye|virement sepa|vir sepa|remuneration|rémunération|appointement|appointements|galeries|employeur/i)
        );

        // 2. OU montant créditeur significatif reçu dans la catégorie « Revenus & Aides » (>= 500 € ou >= 50% du salaire de référence)
        const isSignificantIncome = 
          tx.type === "Revenus & Aides" &&
          (tx.amount >= 500 || (incomeSettings.salary > 0 && tx.amount >= incomeSettings.salary * 0.5));

        const isSalary = !isRefundLabel && !isAids && (
          matchesSalaryKeywords ||
          isSignificantIncome ||
          isSalaryTransaction(tx, incomeSettings.salary)
        );

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
          
          catMap[tx.type] = Math.max(0, (catMap[tx.type] || 0) - tx.amount);
          
          const label = (selectedMonth === "Tout" || !selectedMonth) ? tx.month : tx.date.split("-")[2];
          timeMap[label] = (timeMap[label] || 0) - tx.amount;
        } else {
          // It's a real income
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

    // 2. Règles d'injection indépendantes si incomeSettings.autoApply est activé :
    // - Injection Salaire : Si !hasRealSalary && (incomeSettings.salary > 0) -> injecter le salaire de référence
    // - Injection Aides : Si !hasRealAids && (incomeSettings.aids > 0) -> injecter les aides de référence
    if (incomeSettings.autoApply && selectedMonth && selectedMonth !== "Tout") {
      let msgs: string[] = [];
      if (!hasRealSalary && incomeSettings.salary > 0) {
        injectedSalary = incomeSettings.salary;
        msgs.push(`Salaire (${incomeSettings.salary.toLocaleString("fr-FR")} €)`);
      }
      if (!hasRealAids && incomeSettings.aids > 0) {
        injectedAids = incomeSettings.aids;
        msgs.push(`Aides (${incomeSettings.aids.toLocaleString("fr-FR")} €)`);
      }
      
      if (msgs.length > 0) {
        autoAppliedInfo = `Inclus : ${msgs.join(" & ")}`;
      }
    }

    // 3. Calcul unifié du revenu effectif
    const effectiveIncome = Math.round((totalRealIncome + injectedSalary + injectedAids) * 100) / 100;

    const allSortedCats = Object.entries(catMap)
      .filter(([name, value]) => name !== "Épargne & Trésorerie" && value > 0)
      .map(([name, value]) => ({ 
        name, 
        value: isAllTime ? Math.round((value / monthsCount) * 100) / 100 : Math.round(value * 100) / 100, 
        max: exp > 0 ? exp : 1 
      }))
      .sort((a, b) => b.value - a.value);

    // Conserve toutes les catégories individuelles classées par dépense pour la liste étendue et la répartition
    const sortedCats = allSortedCats;

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
        cumulative = Math.max(0, cumulative + amount);
        
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
      income: effectiveIncome,
      balance: Math.round((effectiveIncome - exp) * 100) / 100,
      subs: subTotal,
      categoryData: sortedCats,
      expensesTimeline: timeline.length > 0 ? timeline : [{day: 'N/A', amount: 0, cumulative: 0, dateFormatted: '', topTx: []}],
      autoAppliedInfo
    };
  }, [filteredTransactions, selectedMonth, incomeSettings, isTxSubscription]);

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
  }, [filteredTransactions, transactions, isAllTime, isTxSubscription]);

  const topMerchants = useMemo(() => {
    const merchantMap: Record<string, {
      name: string;
      total: number;
      count: number;
      category: string;
    }> = {};

    filteredTransactions.forEach(tx => {
      if (tx.isInternalTransfer || tx.type === "Épargne & Trésorerie") return;
      if (isTxSubscription(tx) || isSubscriptionCategory(tx.type)) return;

      const rawMerchant = tx.name;
      
      const namLower = tx.name.toLowerCase();
      const isIncome = 
        namLower.includes("salaire") ||
        namLower.includes("remuneration") ||
        namLower.includes("rémunération") ||
        /\b(paie|paye)\b/i.test(namLower) ||
        namLower.includes("employeur") ||
        (incomeSettings.salary > 0 && namLower.includes("vir sepa") && tx.amount >= incomeSettings.salary * 0.6) ||
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
        totalDaysInMonth = 31;
        currentDayNumber = 12;
        daysRemaining = 20;
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

    // Calcul projection de fin de mois réaliste :
    // Séparation des charges fixes récurrentes déjà décaissées des dépenses variables au quotidien
    let fixedChargesPaid = 0;
    filteredTransactions.forEach(tx => {
      if (tx.amount >= 0 || tx.isInternalTransfer || tx.type === "Épargne & Trésorerie") return;
      const nam = tx.name.toLowerCase();
      const isFixed = 
        tx.type === "Logement & Maison" ||
        tx.type === "Abonnements & Forfaits" ||
        isTxSubscription(tx) ||
        nam.includes("loyer") ||
        nam.includes("assurance") ||
        nam.includes("mutuelle") ||
        nam.includes("edf") ||
        nam.includes("engie") ||
        nam.includes("forfait") ||
        nam.includes("internet") ||
        nam.includes("fibre") ||
        nam.includes("credit") ||
        nam.includes("crédit") ||
        nam.includes("pret") ||
        nam.includes("prêt");
      if (isFixed) {
        fixedChargesPaid += Math.abs(tx.amount);
      }
    });

    const variableExpensesPaid = Math.max(0, expenses - fixedChargesPaid);
    const remainingDaysForProjection = Math.max(0, totalDaysInMonth - currentDayNumber);
    const variableDailyAverage = currentDayNumber > 0 ? (variableExpensesPaid / currentDayNumber) : 0;
    const projectedFutureVariableExpenses = variableDailyAverage * remainingDaysForProjection;
    const projectedEndOfMonthBalance = Math.round((balance - projectedFutureVariableExpenses) * 100) / 100;

    const totalBudget = Object.keys(categoryBudgets).length > 0 ? Object.values(categoryBudgets).reduce((a, b) => a + b, 0) : 0;
    const refValue = totalBudget > 0 ? (totalBudget - expenses) : balance;
    const baseAmount = Math.max(0, refValue);
    
    const dailyBudget = daysRemaining > 0 ? (baseAmount / daysRemaining) : 0;
    const pastDailyAverage = isCurrentMonth
      ? (currentDayNumber > 0 ? (expenses / currentDayNumber) : 0)
      : (totalDaysInMonth > 0 ? (expenses / totalDaysInMonth) : 0);
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

  const totalCategoryBudgets = useMemo(() => 
    Object.values(categoryBudgets).reduce((a, b) => a + b, 0),
    [categoryBudgets]
  );
  const salaryBasedLimit = (incomeSettings.salary || 0) + (incomeSettings.aids || 0) - (incomeSettings.savingsGoal || 0);
  const defaultMonthlyLimit = 2200;

  // Revenus / Budget initial pour la trajectoire Burn-down
  const configuredIncome = (incomeSettings.salary || 0) + (incomeSettings.aids || 0);
  const baseIncome = income > 0 ? income : (configuredIncome > 0 ? configuredIncome : 0);
  const effectiveReferenceIncome = baseIncome > 0 ? baseIncome : 2200;

  const handleUpdateLimitConfig = (newCfg: MonthlyLimitConfig) => {
    setMonthlyLimitConfig(newCfg);
    const computedSpending =
      newCfg.type === "percent"
        ? Math.max(0, Math.round(effectiveReferenceIncome * (1 - newCfg.value / 100)))
        : newCfg.value;
    setCustomSpendingLimit(computedSpending);
    try {
      localStorage.setItem("krona_monthly_limit_config", JSON.stringify(newCfg));
      localStorage.setItem("krona_monthly_spending_limit", computedSpending.toString());
    } catch (err) {}
  };

  const effectiveMonthlyLimit = useMemo(() => {
    if (monthlyLimitConfig) {
      if (monthlyLimitConfig.type === "percent") {
        const pct = Math.min(99, Math.max(1, monthlyLimitConfig.value));
        return Math.max(0, Math.round(effectiveReferenceIncome * (1 - pct / 100)));
      }
      if (monthlyLimitConfig.value > 0) {
        return monthlyLimitConfig.value;
      }
    }
    if (customSpendingLimit && customSpendingLimit > 0) {
      return customSpendingLimit;
    }
    if (totalCategoryBudgets > 0) return totalCategoryBudgets;
    if (salaryBasedLimit > 0) return salaryBasedLimit;
    return defaultMonthlyLimit;
  }, [monthlyLimitConfig, effectiveReferenceIncome, customSpendingLimit, totalCategoryBudgets, salaryBasedLimit, defaultMonthlyLimit]);

  const effectiveInitialBudget = baseIncome > 0 
    ? baseIncome 
    : (effectiveMonthlyLimit > 0 ? effectiveMonthlyLimit : 0);

  const finalRemainingBudget = Math.round((effectiveInitialBudget - expenses) * 100) / 100;

  // Calcul du dernier jour de transaction / jour courant pour arrêter la trajectoire au jour réel
  const cutoffDay = useMemo(() => {
    if (!selectedMonth || selectedMonth === "Tout") return undefined;
    let yyyy: string, mm: string;
    if (selectedMonth === "demo-month") {
      yyyy = "2026";
      mm = "10";
    } else {
      [yyyy, mm] = selectedMonth.split("-");
    }
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === parseInt(yyyy) && (now.getMonth() + 1) === parseInt(mm);
    const lastDayOfMonth = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();

    let maxTxDay = 0;
    filteredTransactions.forEach(tx => {
      if (tx.date) {
        const parts = tx.date.split("-");
        if (parts.length === 3 && parts[0] === yyyy && parts[1] === mm) {
          const d = parseInt(parts[2], 10);
          if (!isNaN(d) && d > maxTxDay) {
            maxTxDay = d;
          }
        }
      }
    });

    if (isCurrentMonth) {
      const today = now.getDate();
      // Si mois en cours : plateau jusqu'au jour courant, et arrêt du tracé à aujourd'hui
      return Math.min(lastDayOfMonth, Math.max(maxTxDay, today));
    } else {
      // Mois passé : s'arrête au dernier jour de transaction connu du CSV
      return maxTxDay > 0 ? Math.min(lastDayOfMonth, maxTxDay) : lastDayOfMonth;
    }
  }, [selectedMonth, filteredTransactions]);

  const displayedDrawerTx = useMemo(() => {
    let list = filteredTransactions;

    if (drawerFilter === "debit") {
      list = list.filter(tx => tx.amount < 0 && !tx.isInternalTransfer && tx.type !== "Épargne & Trésorerie");
    } else if (drawerFilter === "credit") {
      list = list.filter(tx => tx.amount > 0);
    } else if (drawerFilter === "sub") {
      list = list.filter(tx => isTxSubscription(tx));
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
  }, [filteredTransactions, drawerFilter, drawerSearch, isTxSubscription]);

  const { drawerDebitsTotal, drawerCreditsTotal } = useMemo(() => {
    let deb = 0;
    let cred = 0;
    displayedDrawerTx.forEach(tx => {
      if (tx.amount < 0) deb += Math.abs(tx.amount);
      else cred += tx.amount;
    });
    return { drawerDebitsTotal: deb, drawerCreditsTotal: cred };
  }, [displayedDrawerTx]);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden relative">
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[105] bg-neutral-900/90 border border-white/[0.08] backdrop-blur-md text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-sm"
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
      <CSVUploader 
        onStart={() => {
          setIsImportMenuOpen(false);
          setImportStep("importing");
        }}
        onUpload={handleUpload} 
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 w-full min-h-0 viewport-fit-scroll no-scrollbar">
        
      {/* Header & Month Selector (Dashboard and Budgets only) */}
      {(activeTab === "dashboard" || activeTab === "budgets") && (
        <PageHeader 
          title={activeTab === "budgets" ? "Budgets & Plafonds" : "Vue d'ensemble"}
          showDate={activeTab === "dashboard"}
        >
          {hasRealData && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowResetModal(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border text-foreground shadow-sm hover:bg-black/5 dark:hover:bg-red-950/30 hover:text-red-500 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
              aria-label="Supprimer des données"
            >
              <Trash2 size={16} />
            </motion.button>
          )}
          
          <div className="relative">
            <select 
              disabled={uniqueMonths.length === 0}
              value={uniqueMonths.length > 0 ? (selectedMonth || uniqueMonths[0] || "") : ""} 
              onChange={(e) => uniqueMonths.length > 0 && handleMonthChange(e.target.value)}
              className={clsx(
                "h-9 appearance-none bg-card border border-border text-foreground shadow-sm font-medium text-sm py-1.5 pl-4 pr-10 rounded-full outline-none transition-all font-sans",
                uniqueMonths.length > 0
                  ? "hover:bg-black/5 dark:hover:bg-white/[0.08] hover:border-foreground/20 cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
                  : "cursor-not-allowed opacity-75 select-none text-muted-foreground"
              )}
              aria-label="Sélectionner le mois"
            >
              {uniqueMonths.length > 0 ? (
                availableMonths.map(m => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))
              ) : (
                <option value="" disabled>Aucun relevé</option>
              )}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <ChevronDown size={14} className={clsx("text-muted-foreground", uniqueMonths.length === 0 && "opacity-40")} />
            </div>
          </div>
          
          <div className="relative" ref={importMenuRef}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsImportMenuOpen((prev) => !prev)}
              className="h-9 px-3.5 sm:px-4 rounded-full bg-foreground text-background font-medium text-xs sm:text-sm flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer font-sans shrink-0 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
              aria-label="Importer un fichier CSV"
            >
              <Plus size={16} strokeWidth={2.5} className="shrink-0" />
              <span className="font-medium">Importer un CSV</span>
            </motion.button>

            {/* Menu Pop-up compact harmonisé avec le pop-up des notifications */}
            <AnimatePresence>
              {isImportMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  className="absolute top-full right-0 mt-2 w-72 sm:w-80 bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl z-[101] overflow-hidden select-none flex flex-col"
                >
                  <div className="pt-3 px-3.5 pb-1 flex items-center justify-between shrink-0">
                    <span className="text-sm font-semibold text-foreground tracking-tight font-sans">
                      Sélectionner la banque
                    </span>
                    <CloseButton onClick={() => setIsImportMenuOpen(false)} iconSize={15} />
                  </div>

                  <div className="p-2.5 pt-1 space-y-1.5">
                    {/* Option 1 : Crédit Agricole */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsImportMenuOpen(false);
                        localStorage.setItem("krona_selected_bank", "ca");
                        window.dispatchEvent(new CustomEvent("krona-bank-changed", { detail: { bank: "ca" } }));
                        window.dispatchEvent(new CustomEvent("trigger-csv-upload", { detail: { bank: "ca" } }));
                      }}
                      className="w-full flex items-center gap-3 p-2.5 bg-neutral-50 dark:bg-white/[0.03] rounded-2xl border border-border hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:border-foreground/20 active:scale-[0.98] transition-all text-left group cursor-pointer"
                    >
                      <div className="w-8.5 h-8.5 rounded-xl bg-card border border-border flex items-center justify-center text-foreground shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                        <CreditAgricoleLogo className="w-5 h-4 text-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground tracking-tight font-sans">
                          Crédit Agricole
                        </div>
                        <div className="text-xs text-muted-foreground font-sans truncate mt-0.5">
                          Relevé de compte CSV
                        </div>
                      </div>
                      <ChevronRight size={15} className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 ml-auto" />
                    </button>

                    {/* Option 2 : BoursoBank */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsImportMenuOpen(false);
                        localStorage.setItem("krona_selected_bank", "bourso");
                        window.dispatchEvent(new CustomEvent("krona-bank-changed", { detail: { bank: "bourso" } }));
                        window.dispatchEvent(new CustomEvent("trigger-csv-upload", { detail: { bank: "bourso" } }));
                      }}
                      className="w-full flex items-center gap-3 p-2.5 bg-neutral-50 dark:bg-white/[0.03] rounded-2xl border border-border hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:border-foreground/20 active:scale-[0.98] transition-all text-left group cursor-pointer"
                    >
                      <div className="w-8.5 h-8.5 rounded-xl bg-card border border-border flex items-center justify-center text-foreground shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                        <BoursoBankLogo className="w-4.5 h-4.5 text-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground tracking-tight font-sans">
                          BoursoBank
                        </div>
                        <div className="text-xs text-muted-foreground font-sans truncate mt-0.5">
                          Relevé de compte CSV
                        </div>
                      </div>
                      <ChevronRight size={15} className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 ml-auto" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            disabled={uniqueMonths.length === 0}
            onClick={() => uniqueMonths.length > 0 && setShowCalendarModal(true)}
            className={clsx(
              "w-9 h-9 flex items-center justify-center rounded-full border transition-all font-sans shrink-0 shadow-xs",
              uniqueMonths.length > 0
                ? "bg-card border-border text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none hover:bg-black/5 dark:hover:bg-white/[0.08] cursor-pointer"
                : "bg-card border-border text-muted-foreground cursor-not-allowed opacity-40"
            )}
            aria-label="Vue annuelle"
          >
            <CalendarDays size={16} />
          </button>
        </PageHeader>
      )}

      {activeTab === "transactions" ? (
        <TransactionsView 
          transactions={activeTransactions} 
          onRecategorize={handleRecategorizeTransaction} 
          onSelectMonth={handleMonthChange} 
          isTxSubscription={isTxSubscription}
          ignoredSubscriptions={ignoredSubscriptions}
          initialAccount={selectedAccountFilter}
          onSelectAccount={setSelectedAccountFilter}
        />
      ) : activeTab === "trends" ? (
        <TrendsView 
          transactions={activeTransactions} 
          incomeSettings={incomeSettings} 
          categoryBudgets={categoryBudgets} 
          onSelectMonth={handleMonthChange} 
        />
      ) : activeTab === "accounts" ? (
        <AccountsView 
          transactions={activeTransactions} 
          onTriggerUpload={(bank) => {
            const bankKey = bank.toLowerCase().includes("agricole") ? "ca" : "bourso";
            localStorage.setItem("krona_selected_bank", bankKey);
            window.dispatchEvent(new CustomEvent("trigger-csv-upload", { detail: { bank: bankKey } }));
          }} 
          onNavigateTransactions={(bank) => {
            if (bank) setSelectedAccountFilter(bank);
            setActiveTab("transactions");
          }} 
        />
      ) : activeTab === "budgets" ? (
        <div className="flex-1 min-h-0 flex flex-col space-y-6 overflow-y-auto no-scrollbar pb-6">
          <Card className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 shrink-0">
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
                 <Card key={cat} className="flex flex-col justify-between p-6 h-full">
                   <div className="flex justify-between items-start mb-6">
                     <div className="flex items-center gap-3 min-w-0 pr-2">
                       <div className={`w-3 h-3 rounded-full shrink-0 ${CATEGORY_COLORS[cat]?.dot || CATEGORY_COLORS["Autre"].dot}`} />
                       <h3 className="font-semibold text-foreground truncate">{cat}</h3>
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
                  onClick={() => { setSettingsTab("budgets_data"); setShowSettingsModal(true); }} 
                  className="h-10 px-5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none cursor-pointer"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 shrink-0">
        {[
          { 
            label: isAllTime ? "Moyenne gagnée" : "Revenus & Entrées", 
            value: isAllTime ? `${(income / monthsCount).toFixed(2)} € / mois` : `${income.toFixed(2)} €`, 
            change: isAllTime ? "Revenu net moyen par mois" : (autoAppliedInfo || "Total crédité"), 
            pos: true, 
            actionIcon: <ArrowDownLeft size={15} strokeWidth={1.5} /> 
          },
          { 
            label: isAllTime ? "Moyenne dépensée" : "Dépenses", 
            value: isAllTime ? `${(expenses / monthsCount).toFixed(2)} € / mois` : `${expenses.toFixed(2)} €`, 
            change: isAllTime ? "Train de vie mensuel lissé" : "Total débité net", 
            pos: false, 
            actionIcon: <ArrowUpRight size={15} strokeWidth={1.5} /> 
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
            actionIcon: <Wallet size={15} strokeWidth={1.5} />,
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
            actionIcon: <Repeat size={15} strokeWidth={1.5} /> 
          },
        ].map((stat, i) => {
          const isSubsCard = i === 3;

          // 1. Cartes simples de présentation (dont Épargne nette) : aucun clic, aucun hover
          if (!isSubsCard) {
            return (
              <div key={i} className="h-full">
                <Card className="h-full min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] flex flex-col justify-between cursor-default">
                  <div className="flex justify-between items-start mb-1 sm:mb-2">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground font-sans truncate">
                      {stat.label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border text-muted-foreground">
                        {stat.actionIcon}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className="text-xl sm:text-2xl xl:text-3xl font-semibold mb-0.5 sm:mb-1 tracking-tight text-foreground tabular-nums font-sans">
                      {stat.value}
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium w-full">
                      <div className="flex items-center truncate">
                        {stat.icon}
                        <span className="truncate text-muted-foreground">{stat.change}</span>
                      </div>
                      {stat.gauge && stat.gauge.rate > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                          <div className="w-8 sm:w-10 h-1 bg-black/5 dark:bg-white/[0.08] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-500 ease-out" 
                              style={{ width: `${stat.gauge.rate}%` }} 
                            />
                          </div>
                          <span className="font-sans font-medium tabular-nums text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-[11px]">
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

          // 2. Carte "Abonnements récurrents" : Carte cliquable avec light-up titre et icône au survol
          return (
            <div key={i} className="h-full">
              <Card 
                className="h-full min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] flex flex-col justify-between group cursor-pointer active:scale-[0.995]"
                onClick={() => {
                  setDrawerSearch("");
                  setDrawerFilter("sub");
                  setShowTransactionsDrawer(true);
                }}
              >
                <div className="flex justify-between items-start mb-1 sm:mb-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200 font-sans truncate">
                    {stat.label}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border group-hover:border-black/20 dark:group-hover:border-white/20 text-muted-foreground group-hover:text-foreground transition-all duration-200 shrink-0">
                      {stat.actionIcon}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xl sm:text-2xl xl:text-3xl font-semibold mb-0.5 sm:mb-1 tracking-tight text-foreground tabular-nums font-sans">
                    {stat.value}
                  </div>
                  <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium w-full">
                    <span className="text-muted-foreground font-sans truncate">
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 items-stretch">
        
        {/* Col 1: Main Chart (col-span-4) */}
        <div className="col-span-1 lg:col-span-4 h-full flex flex-col min-h-0 overflow-hidden">
          <Card className="h-full flex flex-col overflow-hidden">
            <div className="flex justify-between items-start mb-2 sm:mb-2.5 shrink-0">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">Trajectoire du budget</h3>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border text-muted-foreground shrink-0">
                <Activity size={15} strokeWidth={1.5} />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <div className="text-xl sm:text-2xl font-bold text-foreground tabular-nums font-sans">
                {finalRemainingBudget.toFixed(2)} €
              </div>
            </div>
            
            <div className="flex-1 w-full min-h-0 bg-transparent flex flex-col">
              {isDataLoaded && (
                <ExpensesCurveChart
                  key={selectedMonth || "month"}
                  timeline={expensesTimeline}
                  totalExpenses={expenses}
                  monthlyLimit={effectiveMonthlyLimit}
                  initialBudget={effectiveInitialBudget}
                  targetRemaining={
                    baseIncome > 0
                      ? Math.max(0, baseIncome - effectiveMonthlyLimit)
                      : (incomeSettings.savingsGoal && incomeSettings.savingsGoal > 0 ? incomeSettings.savingsGoal : 0)
                  }
                  cutoffDay={cutoffDay}
                  selectedMonth={selectedMonth || undefined}
                  isDark={isDark}
                />
              )}
            </div>
          </Card>
        </div>

        {/* Col 2: Répartition & 2 Bannières équilibrées (col-span-4) */}
        <div className="col-span-1 lg:col-span-4 h-full flex flex-col justify-between gap-4 min-h-0">
          <Card className="flex flex-col flex-1 min-h-0 overflow-hidden justify-between">
            {/* En-tête de la carte */}
            <div className="flex justify-between items-start shrink-0 mb-1 sm:mb-2">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">Répartition</h3>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border text-muted-foreground shrink-0">
                <PieChartIcon size={15} strokeWidth={1.5} />
              </div>
            </div>

            {categoryData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-neutral-400 py-6">
                <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.04] border border-border flex items-center justify-center mb-2 text-neutral-400">
                  <PieChartIcon size={16} />
                </div>
                <p className="text-xs font-medium text-foreground font-sans">Aucune dépense catégorisée</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-sans">Les débits classés s'afficheront ici</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col pt-0.5">
                {/* 1. Demi-Donut (Arc 180° / Semi-circular Gauge) */}
                {isDataLoaded && (
                  <SemiDonutGauge
                    key={selectedMonth || "month"}
                    categoryData={categoryData}
                    totalExpenses={expenses}
                    isAllTime={isAllTime}
                    monthsCount={monthsCount}
                    selectedMonth={selectedMonth || undefined}
                    hoveredCategory={hoveredCategory}
                    onHoverCategory={handleArcHoverCategory}
                    className="my-1 xl:my-2 min-[1600px]:my-3 min-[1850px]:my-3.5"
                  />
                )}

                {/* 2. Liste des catégories strictement sur une seule colonne verticale avec scroll masqué */}
                <div 
                  ref={categoryListRef}
                  className="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain pr-1 space-y-1 sm:space-y-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {categoryData.map((cat) => {
                    const catColor = CATEGORY_COLORS[cat.name] || CATEGORY_COLORS["Autre"];
                    const colorHex = catColor?.ring || "#71717A";
                    const percentage = expenses > 0 ? ((cat.value / expenses) * 100).toFixed(0) : "0";
                    const isHovered = hoveredCategory === cat.name;

                    return (
                      <div
                        key={cat.name}
                        data-category-row={cat.name}
                        onMouseEnter={() => setHoveredCategory(cat.name)}
                        onMouseLeave={() => setHoveredCategory(null)}
                        onClick={() => {
                          setDrawerFilter("all");
                          setDrawerSearch(cat.name);
                          setShowTransactionsDrawer(true);
                        }}
                        className={clsx(
                          "flex items-center justify-between py-2 sm:py-2.5 px-2 rounded-xl select-none cursor-pointer transition-colors duration-150 min-h-[52px] sm:min-h-[56px]",
                          isHovered
                            ? "bg-black/[0.04] dark:bg-white/[0.06]"
                            : "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                        )}
                      >
                        {/* À gauche : pastille avec icône sur fond teinté fixe (36x36px / w-9 h-9) */}
                        <div className="flex items-center gap-3 min-w-0 max-w-[62%]">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: `${colorHex}15`,
                              border: `1px solid ${colorHex}25`
                            }}
                          >
                            <CategoryIcon type={cat.name} iconSize={16} />
                          </div>
                          {/* Au centre : nom de la catégorie en semi-bold */}
                          <div className="min-w-0 flex-1">
                            <div
                              className="font-semibold text-xs sm:text-sm truncate font-sans transition-colors duration-150 text-foreground"
                            >
                              {cat.name}
                            </div>
                          </div>
                        </div>

                        {/* À droite : montant total dépensé et pourcentage */}
                        <div className="text-right shrink-0 pl-2">
                          <div className="text-xs sm:text-sm font-semibold tabular-nums font-sans transition-colors duration-150 text-foreground">
                            {cat.value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums font-sans mt-0.5">
                            {percentage}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Les 2 bannières compactes de taille strictement identique aux KPI */}
          {isDataLoaded ? (
            <>
              <MonthlyLimitCard 
                spentAmount={expenses}
                income={income}
                monthlyLimit={effectiveMonthlyLimit}
                expenses={expenses}
                categoryBudgets={categoryBudgets}
                incomeSettings={incomeSettings}
                customLimit={customSpendingLimit}
                limitConfig={monthlyLimitConfig}
                onLimitConfigChange={handleUpdateLimitConfig}
                onLimitChange={(limit) => {
                  setCustomSpendingLimit(limit);
                  setMonthlyLimitConfig(prev => prev.type === "percent" ? prev : { type: "amount", value: limit });
                }}
                selectedMonth={selectedMonth || undefined}
                onOpenBudgetSettings={() => {
                  setSettingsTab("budgets_data");
                  setShowSettingsModal(true);
                }}
                className="min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] shrink-0"
              />
              <StartingBudgetCard 
                income={income}
                incomeSettings={incomeSettings}
                transactions={filteredTransactions}
                activeSubscriptions={activeSubscriptions}
                subs={subs}
                selectedMonth={selectedMonth || undefined}
                onOpenSettings={() => {
                  setSettingsTab("income_fixed");
                  setShowSettingsModal(true);
                }}
                className="min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] shrink-0"
              />
            </>
          ) : (
            <>
              <div className="min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] shrink-0 rounded-2xl bg-card border border-border" />
              <div className="min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] shrink-0 rounded-2xl bg-card border border-border" />
            </>
          )}
        </div>

        {/* Col 3: Top Merchants & Spending Cadence (col-span-4) */}
        <div className="col-span-1 lg:col-span-4 h-full flex flex-col justify-between gap-4 min-h-0">
          {/* Carte 1: Top Commerçants (design harmonisé sur la modale Toutes les opérations) */}
          <Card className="flex flex-col relative overflow-hidden shrink-0">
            <div className="flex justify-between items-start shrink-0 mb-2">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">Top Commerçants</h3>
              </div>
              <div 
                className="flex items-center shrink-0 cursor-pointer group active:scale-95 transition-transform"
                onClick={() => setShowTransactionsDrawer(true)}
              >
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors mr-2 font-sans">
                  Voir tout
                </span>
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border group-hover:border-black/20 dark:group-hover:border-white/20 text-muted-foreground group-hover:text-foreground transition-all duration-200 shrink-0">
                  <ShoppingBag size={15} strokeWidth={1.5} />
                </div>
              </div>
            </div>

            {topMerchants.length === 0 ? (
              <div className="py-4 flex flex-col items-center justify-center text-center text-neutral-400">
                <div className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/[0.04] border border-border flex items-center justify-center mb-1 text-neutral-400">
                  <ShoppingBag size={14} />
                </div>
                <p className="text-xs font-medium text-foreground font-sans">Aucun débit marchand</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-sans">Tes dépenses par enseigne apparaîtront ici</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 sm:gap-1.5">
                {topMerchants.slice(0, 4).map((merchant) => {
                  const merchantCatColor = CATEGORY_COLORS[merchant.category] || CATEGORY_COLORS["Autre"];
                  const merchantColorHex = merchantCatColor?.ring || "#71717A";

                  return (
                    <div
                      key={merchant.name}
                      onClick={() => {
                        setDrawerFilter("all");
                        setDrawerSearch(merchant.name);
                        setShowTransactionsDrawer(true);
                      }}
                      className="flex items-center justify-between py-2 sm:py-2.5 px-2 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors cursor-pointer group active:scale-[0.99] select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0 max-w-[55%]">
                        <div 
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `${merchantColorHex}15`,
                            border: `1px solid ${merchantColorHex}25`
                          }}
                        >
                          <CategoryIcon type={merchant.category} iconSize={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-foreground truncate font-sans">
                            {merchant.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate font-sans mt-0.5">
                            {merchant.count} passage{merchant.count > 1 ? "s" : ""} {isAllTime ? "au total" : "ce mois-ci"}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium tabular-nums text-sm text-foreground font-sans">
                          {merchant.total.toFixed(2)} €
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-sans">
                          {isAllTime ? "total débité" : "ce mois-ci"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Carte 2: Rythme de dépense (Barres dynamiques utilisant toute la hauteur disponible) */}
          <Card className="flex-1 min-h-0 flex flex-col relative overflow-hidden justify-between">
            <div className="flex justify-between items-start shrink-0 mb-1">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">Rythme de dépense</h3>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border text-muted-foreground shrink-0">
                <Activity size={15} strokeWidth={1.5} />
              </div>
            </div>

            {/* Moyenne quotidienne réelle */}
            <div className="flex items-baseline justify-between mb-2 shrink-0">
              <div className="flex items-baseline">
                <span className="text-sm sm:text-base font-bold tabular-nums text-foreground font-sans">
                  {spendingCadence.pastDailyAverage.toFixed(2)} €
                </span>
                <span className="text-[11px] text-muted-foreground font-normal ml-1.5 font-sans">
                  / jour en moy.
                </span>
              </div>
            </div>

            {/* Visualiseur vertical 4 colonnes dynamique */}
            <div className="flex-1 min-h-[90px] w-full grid grid-cols-4 gap-2 pt-1 pb-1 items-stretch">
              {isDataLoaded && spendingCadence.weeks.map((week, idx) => (
                <div key={week.id} className="flex flex-col items-center justify-between h-full min-h-0 group select-none">
                  {/* Montant lisible en en-tête de colonne */}
                  <div className="text-[10px] sm:text-[11px] font-semibold tabular-nums text-muted-foreground group-hover:text-foreground transition-colors font-sans mb-1 shrink-0">
                    {week.amount > 0 ? `${week.amount.toFixed(0)} €` : "0 €"}
                  </div>

                  {/* Rail vertical occupant dynamiquement 100% de la hauteur disponible dans la colonne */}
                  <div className="w-full flex-1 min-h-[44px] bg-black/[0.04] dark:bg-white/[0.05] rounded-xl p-1 relative flex flex-col justify-end overflow-hidden border border-border group-hover:border-foreground/20 transition-all">
                    {/* Colonne de remplissage de bas en haut proportionnelle */}
                    <motion.div
                      key={`cadence-bar-${selectedMonth || "month"}-${week.id}`}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      style={{
                        height: `${Math.max(week.amount > 0 ? 12 : 0, Math.min(100, week.pct))}%`,
                        transformOrigin: "bottom",
                      }}
                      transition={{
                        duration: 0.9 - idx * 0.03,
                        delay: idx * 0.03,
                        ease: [0.16, 1, 0.3, 1], // easeOutExpo sur 900ms
                      }}
                      className={clsx(
                        "w-full rounded-lg transition-colors",
                        week.isPeak
                          ? "bg-foreground shadow-xs dark:shadow-[0_0_14px_rgba(255,255,255,0.25)]"
                          : week.amount > 0
                            ? "bg-foreground/70 group-hover:bg-foreground/90"
                            : "bg-transparent"
                      )}
                    />
                  </div>

                  {/* Label discret en bas */}
                  <div className="text-[11px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors font-sans mt-1 shrink-0">
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
              className="absolute inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-md"
              onClick={() => setShowSettingsModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 12 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.96, y: 10 }} 
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-4xl h-[90vh] sm:h-[85vh] md:h-[80vh] relative z-10 mx-2 sm:mx-4 flex flex-col overflow-hidden font-sans"
            >
              {/* Header with Title, Sliding Capsule Segmented Control & Close Button */}
              <div className="sticky top-0 z-30 bg-card border-b border-border px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-foreground font-sans flex items-center gap-2">
                    Paramètres
                  </h2>
                  <div className="sm:hidden">
                    <CloseButton onClick={() => setShowSettingsModal(false)} iconSize={16} />
                  </div>
                </div>

                {/* Capsule Segmented Control with Apple Sliding Spring */}
                <div className="flex items-center justify-center">
                  <nav className="inline-flex items-center rounded-full bg-muted/60 p-1 border border-border relative shadow-inner overflow-hidden max-w-full">
                    {[
                      { id: "income_fixed", label: "Revenus & Fixes", icon: Wallet },
                      { id: "subscriptions", label: "Abonnements", icon: Repeat },
                      { id: "budgets_data", label: "Plafonds & Données", icon: Flag },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const isActive = settingsTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setSettingsTab(tab.id as any)}
                          className="relative flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all active:scale-[0.97] cursor-pointer whitespace-nowrap focus-visible:outline-none select-none"
                        >
                          {isActive && (
                            <motion.div
                              layoutId="appleSettingsTabPill"
                              transition={{ type: "spring", bounce: 0.12, duration: 0.35 }}
                              className="absolute inset-0 rounded-full bg-white text-black shadow-sm"
                            />
                          )}
                          <span className={`relative z-10 flex items-center gap-1.5 sm:gap-2 transition-colors duration-150 ${isActive ? "text-black font-medium" : "text-zinc-400 hover:text-white"}`}>
                            <Icon size={14} className="shrink-0" />
                            <span>{tab.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                <div className="hidden sm:block">
                  <CloseButton onClick={() => setShowSettingsModal(false)} iconSize={16} />
                </div>
              </div>

              {/* Main Content */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 md:p-8 flex flex-col min-h-0 bg-background">
                {settingsTab === "income_fixed" ? (
                  <div className="max-w-2xl mx-auto w-full space-y-6">
                    {/* Section 1: Revenus attendus */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] px-3 mb-2 flex items-center gap-1.5 font-sans">
                        Revenus de référence
                      </h4>
                      <div className="rounded-2xl bg-card border border-border overflow-hidden divide-y divide-border">
                        {/* Salaire */}
                        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                          <div>
                            <div className="text-sm font-medium text-foreground font-sans tracking-tight">Salaire mensuel habituel</div>
                            <div className="text-xs text-muted-foreground font-sans mt-0.5 leading-relaxed">Rémunération nette attendue chaque mois</div>
                          </div>
                          <div className="relative w-36 sm:w-40 shrink-0 self-end sm:self-auto">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.salary || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, salary: Math.max(0, parseFloat(e.target.value) || 0) })}
                              placeholder="0,00"
                              className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground" 
                            />
                          </div>
                        </div>

                        {/* Aides */}
                        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                          <div>
                            <div className="text-sm font-medium text-foreground font-sans tracking-tight">Aides & Allocations</div>
                            <div className="text-xs text-muted-foreground font-sans mt-0.5 leading-relaxed">CAF, bourses, aides publiques ou pensions</div>
                          </div>
                          <div className="relative w-36 sm:w-40 shrink-0 self-end sm:self-auto">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">€</span>
                            <input 
                              type="number" 
                              value={incomeSettings.aids || ""} 
                              onChange={e => handleSaveIncomeSettings({ ...incomeSettings, aids: Math.max(0, parseFloat(e.target.value) || 0) })}
                              placeholder="0,00"
                              className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground" 
                            />
                          </div>
                        </div>

                        {/* Toggle iOS autoApply */}
                        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                          <div className="pr-2">
                            <div className="text-sm font-medium text-foreground font-sans tracking-tight">Injection automatique</div>
                            <div className="text-xs text-muted-foreground font-sans mt-0.5 leading-relaxed">
                              Appliquer ces revenus de référence si aucun virement n'est détecté dans le mois affiché.
                            </div>
                          </div>
                          {/* Apple iOS Switch */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={incomeSettings.autoApply}
                            onClick={() => handleSaveIncomeSettings({ ...incomeSettings, autoApply: !incomeSettings.autoApply })}
                            className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out p-0.5 relative inline-flex items-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 ${
                              incomeSettings.autoApply ? "bg-emerald-500" : "bg-muted border border-border"
                            }`}
                          >
                            <motion.span
                              animate={{ x: incomeSettings.autoApply ? 20 : 0 }}
                              transition={{ type: "spring", stiffness: 600, damping: 35 }}
                              className="w-5 h-5 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35),0_0_1px_rgba(0,0,0,0.2)] block pointer-events-none"
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Charges Incompressibles */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] px-3 mb-2 flex items-center gap-1.5 font-sans">
                        Charges incompressibles
                      </h4>
                      <div className="rounded-2xl bg-card border border-border overflow-hidden divide-y divide-border">
                        {/* Loyer */}
                        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-foreground font-sans tracking-tight">Loyer ou mensualité logement</span>
                              {autoFixedCharges.rent > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground bg-muted border border-border px-2.5 py-0.5 rounded-full tabular-nums font-sans">
                                  Détecté : {autoFixedCharges.rent.toFixed(2)} €
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-sans leading-relaxed">Loyer, charges de copropriété ou syndic</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            <div className="relative w-32 sm:w-36">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">€</span>
                              <input 
                                type="number" 
                                value={incomeSettings.rent !== undefined ? incomeSettings.rent : ""} 
                                onChange={e => handleSaveIncomeSettings({ ...incomeSettings, rent: e.target.value === "" ? undefined : Math.max(0, parseFloat(e.target.value) || 0) })}
                                placeholder={autoFixedCharges.rent > 0 ? `${autoFixedCharges.rent.toFixed(2)} € (auto)` : "0,00"}
                                className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground" 
                              />
                            </div>
                            {incomeSettings.rent !== undefined && (
                              <button
                                type="button"
                                onClick={() => handleSaveIncomeSettings({ ...incomeSettings, rent: undefined })}
                                className="h-7 px-2.5 rounded-full text-[11px] font-medium text-foreground hover:bg-black/10 dark:hover:bg-white/10 bg-black/5 dark:bg-white/5 active:scale-95 transition-all cursor-pointer whitespace-nowrap font-sans border border-border"
                                title="Rétablir la détection automatique"
                              >
                                Rétablir auto
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Prêts */}
                        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-foreground font-sans tracking-tight">Remboursement de prêts</span>
                              {autoFixedCharges.loans > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground bg-muted border border-border px-2.5 py-0.5 rounded-full tabular-nums font-sans">
                                  Détecté : {autoFixedCharges.loans.toFixed(2)} €
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-sans leading-relaxed">Prêt étudiant, crédit bancaire ou mensualités</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            <div className="relative w-32 sm:w-36">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">€</span>
                              <input 
                                type="number" 
                                value={incomeSettings.loans !== undefined ? incomeSettings.loans : ""} 
                                onChange={e => handleSaveIncomeSettings({ ...incomeSettings, loans: e.target.value === "" ? undefined : Math.max(0, parseFloat(e.target.value) || 0) })}
                                placeholder={autoFixedCharges.loans > 0 ? `${autoFixedCharges.loans.toFixed(2)} € (auto)` : "0,00"}
                                className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground" 
                              />
                            </div>
                            {incomeSettings.loans !== undefined && (
                              <button
                                type="button"
                                onClick={() => handleSaveIncomeSettings({ ...incomeSettings, loans: undefined })}
                                className="h-7 px-2.5 rounded-full text-[11px] font-medium text-foreground hover:bg-black/10 dark:hover:bg-white/10 bg-black/5 dark:bg-white/5 active:scale-95 transition-all cursor-pointer whitespace-nowrap font-sans border border-border"
                                title="Rétablir la détection automatique"
                              >
                                Rétablir auto
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Factures / Assurances */}
                        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-foreground font-sans tracking-tight">Énergie & Assurances</span>
                              {autoFixedCharges.utils > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground bg-muted border border-border px-2.5 py-0.5 rounded-full tabular-nums font-sans">
                                  Détecté : {autoFixedCharges.utils.toFixed(2)} €
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-sans leading-relaxed">Énergie, eau, mutuelle de santé, assurances</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            <div className="relative w-32 sm:w-36">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">€</span>
                              <input 
                                type="number" 
                                value={incomeSettings.utilities !== undefined ? incomeSettings.utilities : ""} 
                                onChange={e => handleSaveIncomeSettings({ ...incomeSettings, utilities: e.target.value === "" ? undefined : Math.max(0, parseFloat(e.target.value) || 0) })}
                                placeholder={autoFixedCharges.utils > 0 ? `${autoFixedCharges.utils.toFixed(2)} € (auto)` : "0,00"}
                                className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground" 
                              />
                            </div>
                            {incomeSettings.utilities !== undefined && (
                              <button
                                type="button"
                                onClick={() => handleSaveIncomeSettings({ ...incomeSettings, utilities: undefined })}
                                className="h-7 px-2.5 rounded-full text-[11px] font-medium text-foreground hover:bg-black/10 dark:hover:bg-white/10 bg-black/5 dark:bg-white/5 active:scale-95 transition-all cursor-pointer whitespace-nowrap font-sans border border-border"
                                title="Rétablir la détection automatique"
                              >
                                Rétablir auto
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Synthèse Apple System Summary */}
                    <div className="rounded-2xl bg-card border border-border p-4.5 space-y-2.5 font-sans">
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>Abonnements récurrents engagés</span>
                        <span className="font-medium text-foreground tabular-nums">{subs.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>Total des charges incompressibles</span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {(effectiveRent + effectiveLoans + effectiveUtilities + subs).toFixed(2)} €
                        </span>
                      </div>
                      <div className="pt-2.5 border-t border-border flex justify-between items-center">
                        <div>
                          <div className="text-xs font-medium text-foreground">Budget de départ calculé</div>
                          <div className="text-[11px] text-muted-foreground">Revenus − charges incompressibles</div>
                        </div>
                        <span className="text-emerald-500 dark:text-emerald-400 font-bold tabular-nums text-base tracking-tight">
                          {Math.max(0, ((income > 0 ? income : ((incomeSettings.salary || 0) + (incomeSettings.aids || 0))) - (effectiveRent + effectiveLoans + effectiveUtilities + subs))).toFixed(2)} €
                        </span>
                      </div>
                    </div>
                  </div>
                ) : settingsTab === "subscriptions" ? (
                  <div className="flex-1 flex flex-col h-full min-h-0 max-w-3xl mx-auto w-full">
                    <div className="mb-4 shrink-0">
                      <h3 className="text-base sm:text-lg font-semibold tracking-[-0.015em] text-foreground mb-1 font-sans">
                        Mes Abonnements
                      </h3>
                      <p className="text-xs text-muted-foreground font-sans">
                        Détection intelligente des récurrences. Masquez les faux positifs d'un geste ou restaurez un abonnement.
                      </p>
                    </div>
                    <SubscriptionManager 
                      transactions={transactions} 
                      onIgnore={handleIgnoreSubscription} 
                      onRestore={handleRestoreSubscription}
                      ignoredList={ignoredSubscriptions}
                    />
                  </div>
                ) : settingsTab === "budgets_data" ? (
                  <div className="max-w-2xl mx-auto w-full space-y-6">
                    {/* Contrôle du Plafond Mensuel Global */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] px-3 mb-2 flex items-center gap-1.5 font-sans">
                        Plafond mensuel global
                      </h4>
                      <div className="rounded-2xl bg-card border border-border p-4 sm:p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground font-sans tracking-tight">Type de calcul du plafond</div>
                            <div className="text-xs text-muted-foreground font-sans mt-0.5 leading-relaxed">
                              Montant fixe absolu ou pourcentage de réserve à préserver
                            </div>
                          </div>

                          {/* Segmented Control Pill with Sliding Spring */}
                          <div className="inline-flex items-center rounded-full bg-muted/60 p-1 border border-border relative shadow-inner shrink-0 self-start sm:self-auto overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleUpdateLimitConfig({ type: "amount", value: monthlyLimitConfig.type === "amount" ? monthlyLimitConfig.value : 1500 })}
                              className="relative px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-[0.97] cursor-pointer whitespace-nowrap select-none focus-visible:outline-none"
                            >
                              {monthlyLimitConfig.type === "amount" && (
                                <motion.div
                                  layoutId="appleLimitTypePill"
                                  transition={{ type: "spring", bounce: 0.12, duration: 0.35 }}
                                  className="absolute inset-0 rounded-full bg-white text-black shadow-sm"
                                />
                              )}
                              <span className={`relative z-10 ${monthlyLimitConfig.type === "amount" ? "text-black font-medium" : "text-zinc-400 hover:text-white"}`}>
                                Montant en €
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateLimitConfig({ type: "percent", value: monthlyLimitConfig.type === "percent" ? monthlyLimitConfig.value : 30 })}
                              className="relative px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-[0.97] cursor-pointer whitespace-nowrap select-none focus-visible:outline-none"
                            >
                              {monthlyLimitConfig.type === "percent" && (
                                <motion.div
                                  layoutId="appleLimitTypePill"
                                  transition={{ type: "spring", bounce: 0.12, duration: 0.35 }}
                                  className="absolute inset-0 rounded-full bg-white text-black shadow-sm"
                                />
                              )}
                              <span className={`relative z-10 ${monthlyLimitConfig.type === "percent" ? "text-black font-medium" : "text-zinc-400 hover:text-white"}`}>
                                Pourcentage (%)
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Input & Apple Callout Preview */}
                        {monthlyLimitConfig.type === "amount" ? (
                          <div className="space-y-3 pt-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <label className="text-xs font-medium text-foreground font-sans">
                                Enveloppe de dépenses autorisée
                              </label>
                              <div className="relative w-36 sm:w-40">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">€</span>
                                <input 
                                  type="number" 
                                  value={monthlyLimitConfig.value || ""} 
                                  onChange={e => handleUpdateLimitConfig({ type: "amount", value: Math.max(0, parseFloat(e.target.value) || 0) })}
                                  placeholder="2200"
                                  className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground" 
                                />
                              </div>
                            </div>
                            
                            {/* Apple Informational Callout */}
                            <div className="rounded-xl bg-muted/50 border border-border p-3 text-xs text-muted-foreground font-sans flex items-center gap-2.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <div className="leading-relaxed">
                                Limite : <span className="font-semibold text-foreground">{monthlyLimitConfig.value.toLocaleString("fr-FR")} €</span> · Reste visé : <span className="font-semibold text-foreground">{Math.max(0, effectiveReferenceIncome - monthlyLimitConfig.value).toLocaleString("fr-FR")} €</span> ({effectiveReferenceIncome > 0 ? Math.round((Math.max(0, effectiveReferenceIncome - monthlyLimitConfig.value) / effectiveReferenceIncome) * 100) : 0}% de vos revenus)
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 pt-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <label className="text-xs font-medium text-foreground font-sans">
                                Réserve à conserver (% du revenu)
                              </label>
                              <div className="relative w-36 sm:w-40">
                                <input 
                                  type="number" 
                                  min="1"
                                  max="99"
                                  value={monthlyLimitConfig.value || ""} 
                                  onChange={e => handleUpdateLimitConfig({ type: "percent", value: Math.min(99, Math.max(1, parseFloat(e.target.value) || 0)) })}
                                  placeholder="30"
                                  className="w-full pl-3 pr-7 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground" 
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">%</span>
                              </div>
                            </div>

                            {/* Apple Informational Callout */}
                            <div className="rounded-xl bg-muted/50 border border-border p-3 text-xs text-muted-foreground font-sans flex items-center gap-2.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <div className="leading-relaxed">
                                Reste à vivre : <span className="font-semibold text-foreground">{Math.round(effectiveReferenceIncome * (monthlyLimitConfig.value / 100)).toLocaleString("fr-FR")} € ({monthlyLimitConfig.value}%)</span> · Limite de dépenses : <span className="font-semibold text-foreground">{Math.max(0, Math.round(effectiveReferenceIncome * (1 - monthlyLimitConfig.value / 100))).toLocaleString("fr-FR")} €</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Plafonds par Catégorie de Dépenses */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] px-3 mb-2 flex items-center gap-1.5 font-sans">
                        Plafonds par catégorie de dépenses
                      </h4>
                      <div className="rounded-2xl bg-card border border-border overflow-hidden divide-y divide-border">
                        {Object.keys(CATEGORY_COLORS).filter(c => c !== "Autre" && c !== "Épargne & Trésorerie" && c !== "Revenus & Aides").map(cat => (
                          <div key={cat} className="p-3 sm:px-4 sm:py-3 flex items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                            <div className="flex items-center gap-3 min-w-0 pr-3">
                              <div className={`w-3 h-3 rounded-full shrink-0 ${CATEGORY_COLORS[cat].dot} shadow-[0_0_8px_rgba(255,255,255,0.15)]`} />
                              <span className="text-sm font-medium text-foreground truncate font-sans tracking-tight">{cat}</span>
                            </div>
                            <div className="relative w-32 shrink-0">
                              <input 
                                type="number"
                                value={categoryBudgets[cat] || ""}
                                onChange={e => handleSaveBudget(cat, parseFloat(e.target.value))}
                                placeholder="Illimité"
                                className="w-full pl-3 pr-7 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-xs sm:text-sm text-right font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">€</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2.5 px-3 py-2 rounded-xl bg-card border border-border flex justify-between items-center text-xs font-sans">
                        <span className="text-muted-foreground">Total des plafonds configurés</span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {Object.values(categoryBudgets).reduce((a, b) => a + b, 0).toFixed(2)} €
                        </span>
                      </div>
                    </div>

                    {/* Zone Données & Maintenance */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] px-3 mb-2 flex items-center gap-1.5 font-sans">
                        Données & Maintenance
                      </h4>
                      <div className="rounded-2xl bg-card border border-border overflow-hidden divide-y divide-border">
                        {/* Row 1: Règles apprises */}
                        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                          <div>
                            <div className="text-sm font-medium text-foreground font-sans tracking-tight">Règles d'apprentissage de marchands</div>
                            <div className="text-xs text-muted-foreground font-sans mt-0.5 leading-relaxed">
                              Effacer l'historique d'apprentissage pour forcer une recatégorisation neuve
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                localStorage.removeItem("krona_merchant_knowledge");
                                setToastMessage({ text: "Règles apprises réinitialisées avec succès", visible: true });
                                setTimeout(() => setToastMessage(null), 3000);
                              } catch (e) {}
                            }}
                            className="h-8 px-3.5 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-foreground text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border border-border shrink-0 font-sans"
                          >
                            <RotateCcw size={13} className="text-muted-foreground" />
                            <span>Réinitialiser</span>
                          </button>
                        </div>

                        {/* Row 2: Tout réinitialiser */}
                        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                          <div>
                            <div className="text-sm font-medium text-rose-500 dark:text-rose-400 font-sans tracking-tight">Toutes les données de l'application</div>
                            <div className="text-xs text-muted-foreground font-sans mt-0.5 leading-relaxed">
                              Purger l'ensemble des relevés, budgets, paramètres et caches locaux
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowResetModal(true)}
                            className="h-8 px-3.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 dark:text-rose-400 text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border border-rose-500/30 shrink-0 font-sans"
                          >
                            <Trash2 size={13} />
                            <span>Tout réinitialiser</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 z-30 bg-card border-t border-border px-5 sm:px-6 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-sans">
                  <Check size={14} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <span>Enregistré automatiquement</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="h-9 px-5 rounded-full text-xs sm:text-sm font-medium bg-foreground text-background hover:opacity-90 active:scale-95 transition-all shadow-sm font-sans cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center">
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
              className="bg-card border border-border p-6 rounded-3xl shadow-2xl w-full max-w-sm relative z-10 mx-4 font-sans"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 size={18} />
                </div>
                <CloseButton onClick={() => setShowResetModal(false)} iconSize={16} />
              </div>
              <h3 className="text-lg font-semibold tracking-[-0.015em] text-foreground mb-2 font-sans">
                Supprimer des données
              </h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed font-sans">
                Choisis si tu souhaites effacer uniquement ce mois ou réinitialiser l'ensemble de tes données.
              </p>
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  disabled={!selectedMonth || selectedMonth === "Tout" || selectedMonth === "all"}
                  onClick={confirmReset}
                  className={`h-10 bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 border border-border text-foreground rounded-full px-4 text-xs sm:text-sm font-medium transition-all flex-1 text-center select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none font-sans ${
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
                  className="h-10 bg-rose-500 hover:bg-rose-600 text-white rounded-full px-4 text-xs sm:text-sm font-medium transition-all flex-1 text-center select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-rose-400/40 focus-visible:outline-none cursor-pointer shadow-sm font-sans"
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
              initial={{ opacity: 0, x: -8, scale: 0.96 }} 
              animate={{ opacity: 1, x: 0, scale: 1 }} 
              exit={{ opacity: 0, x: -8, scale: 0.96 }} 
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              style={bellPosition ? {
                left: `${bellPosition.left}px`,
                bottom: `${bellPosition.bottom}px`,
              } : undefined}
              className="fixed left-14 bottom-4 w-80 sm:w-96 max-h-[min(540px,calc(100vh-160px))] bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl z-[101] overflow-hidden flex flex-col"
            >
              <div className="pt-3 px-4 pb-1 flex justify-between items-center shrink-0">
                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm font-sans">
                  Opérations à vérifier
                  {inboxTx.length > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{inboxTx.length}</span>}
                </h3>
                <CloseButton onClick={() => setShowInbox(false)} iconSize={15} />
              </div>
              
              <div className="flex-1 min-h-0 overflow-y-auto max-h-[420px] p-3 pt-1 space-y-2 no-scrollbar">
                {inboxTx.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-2.5">
                      <Check size={20} strokeWidth={2.5} />
                    </div>
                    <p className="font-semibold text-foreground text-sm">Toutes vos dépenses sont classées</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Votre Inbox est vide</p>
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
                        className="p-3 bg-neutral-50 dark:bg-white/[0.03] rounded-2xl border border-border"
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm text-foreground truncate">{tx.name}</div>
                            <div className="text-xs text-neutral-500 mt-0.5">{tx.date}</div>
                          </div>
                          <div className="font-bold text-sm text-foreground shrink-0 text-right tabular-nums">{tx.amount.toFixed(2)} €</div>
                        </div>
                        <div className="relative">
                          <select
                            className="w-full h-9 appearance-none text-xs font-medium bg-neutral-100 dark:bg-white/[0.06] border border-border rounded-xl pl-3.5 pr-8 outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all text-foreground cursor-pointer"
                            value=""
                            onChange={(e) => {
                              const newType = e.target.value;
                              if (newType) {
                                handleRecategorizeTransaction(tx.id, tx.name, newType);
                              }
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
            onSelectMonth={handleMonthChange}
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
              onClick={(e) => {
                if (selectedRowTx || Date.now() - lastPopupClosedAtRef.current < 400) {
                  e.stopPropagation();
                  setSelectedRowTx(null);
                  return;
                }
                setShowTransactionsDrawer(false);
              }}
              className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
            />

            {/* Wrapper modale + pop-up latérale */}
            <div 
              ref={modalWrapperRef}
              className="relative z-10 h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] md:h-[calc(100vh-3rem)] w-full max-w-lg md:max-w-xl flex flex-col pointer-events-auto"
            >
              {/* Pop-up latérale de recatégorisation (ancrée sur le flanc gauche dans l'espace vide) */}
              <AnimatePresence>
                {selectedRowTx && (
                  <motion.div
                    key="recat-popup"
                    ref={recatPopupRef}
                    initial={{ opacity: 0, x: 12, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 12, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                    style={{ top: `${popupTop}px` }}
                    className="max-lg:fixed max-lg:inset-x-4 max-lg:bottom-4 max-lg:!top-auto max-lg:w-auto max-lg:max-h-[80vh] lg:absolute lg:right-full lg:mr-3 lg:w-72 sm:lg:w-80 max-h-[380px] sm:max-h-[420px] bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl z-20 overflow-hidden select-none flex flex-col transition-[top,transform] duration-150 ease-out"
                  >
                    {/* En-tête sobre épuré : fond transparent sans séparateur avec marges symétriques */}
                    <div className="shrink-0 w-full pt-3 px-3 pb-2 flex items-center justify-between z-10 bg-transparent">
                      <span className="text-sm font-semibold text-foreground tracking-tight font-sans">
                        Modifier la catégorie
                      </span>
                      <CloseButton onClick={() => setSelectedRowTx(null)} iconSize={15} />
                    </div>

                    {/* Sous-conteneur dédié scrollable uniquement pour les catégories avec marges latérales parfaitement symétriques */}
                    <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-3 pt-1 pb-3 space-y-1.5">
                      {RECATEGORIZATION_CATEGORIES.map(cat => {
                        const isCurrent = selectedRowTx.type === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleCategorySelect(cat)}
                            className={clsx(
                              "w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group cursor-pointer active:scale-[0.98]",
                              isCurrent
                                ? "bg-neutral-100 dark:bg-white/[0.08] border-foreground/20 shadow-xs"
                                : "bg-neutral-50 dark:bg-white/[0.03] border-border hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:border-foreground/20"
                            )}
                          >
                            <div className="w-8.5 h-8.5 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                              <CategoryIcon type={cat} isSubscription={cat === "Abonnements & Forfaits"} iconSize={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-foreground tracking-tight font-sans truncate">
                                {cat}
                              </div>
                            </div>
                            {isCurrent ? (
                              <div className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 ml-auto shadow-xs">
                                <Check size={12} strokeWidth={2.8} />
                              </div>
                            ) : (
                              <div className="w-5 h-5 flex items-center justify-center shrink-0 ml-auto">
                                <span className="w-2 h-2 rounded-full bg-black/20 dark:bg-white/30 shrink-0 group-hover:bg-black/40 dark:group-hover:bg-white/50 transition-colors" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Modale flottante latérale */}
              <motion.div
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 280 }}
                className="h-full w-full rounded-2xl sm:rounded-3xl bg-card/95 backdrop-blur-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
              >
                {/* Header */}
                <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-border flex items-center justify-between shrink-0">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-lg font-bold tracking-tight text-foreground font-sans">Toutes les opérations</h2>
                      <span className="bg-black/5 dark:bg-white/[0.08] text-muted-foreground text-xs px-2.5 py-0.5 rounded-full font-medium tabular-nums font-sans">
                        {displayedDrawerTx.length !== filteredTransactions.length
                          ? `${displayedDrawerTx.length} sur ${filteredTransactions.length}`
                          : filteredTransactions.length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-sans">
                      {formatMonthLabel(selectedMonth || "")}
                    </p>
                  </div>
                  <CloseButton data-drawer-close="true" onClick={() => { setShowTransactionsDrawer(false); setSelectedRowTx(null); }} />
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
                      className="w-full h-10 pl-9 pr-8 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm focus:outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 text-foreground placeholder:text-neutral-500 transition-all font-sans"
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
                            ? "bg-white text-zinc-950 font-medium shadow-sm"
                            : "text-neutral-400 hover:text-foreground bg-transparent hover:bg-black/5 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  {/* Badge de recherche actif */}
                  {drawerSearch.trim() !== "" && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/[0.08] text-foreground border border-black/10 dark:border-white/10 font-sans max-w-[280px]">
                        <span className="truncate">Recherche : {drawerSearch.trim()}</span>
                        <button
                          type="button"
                          onClick={() => setDrawerSearch("")}
                          className="text-neutral-400 hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
                          aria-label="Effacer la recherche"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    </div>
                  )}
                </div>

                {/* Liste des transactions */}
                <div 
                  ref={drawerScrollRef}
                  onScroll={() => {
                    if (selectedRowTx) {
                      setSelectedRowTx(null);
                    }
                  }}
                  className="flex-1 overflow-y-auto no-scrollbar px-6 flex flex-col"
                >
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
                      <TransactionRow 
                        key={tx.id} 
                        tx={tx} 
                        isSubscription={isTxSubscription(tx)} 
                        isSelected={selectedRowTx?.id === tx.id}
                        onClick={() => {
                          if (selectedRowTx?.id === tx.id) {
                            setSelectedRowTx(null);
                          } else {
                            updatePopupPosition(tx.id);
                            setSelectedRowTx(tx);
                          }
                        }}
                      />
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
          </div>
        )}
      </AnimatePresence>

      </div>
    </div>
  );
}

