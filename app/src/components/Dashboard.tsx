"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, PieChart, Pie, Cell } from "recharts";
import { CSVUploader } from "./CSVUploader";
import { SubscriptionManager } from "./SubscriptionManager";
import { useState, useMemo, useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, RefreshCcw, Loader2, ChevronDown, Trash2, X, Wallet, Repeat, Check, Sparkles, AlertCircle, CheckCircle2, Info, Activity, PieChart as PieChartIcon, CreditCard, ArrowRightLeft } from "lucide-react";

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
    parsedDate = new Date();
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
  if (cache[name] && cache[name].categorie) {
    return {
      type: cache[name].categorie,
      isSub: cache[name].isSubscription || false,
      isInternalTransfer: false
    };
  }

  const cat = categoryBourso.toLowerCase();
  const nam = name.toLowerCase();
  
  let type = "Autre";
  let isSub = false;
  let isInternalTransfer = false;

  // Intercept savings and internal transfers immediately
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
  "Santé & Bien-être": { ring: "#EF4444", fill: "bg-rose-500", dot: "bg-rose-500" },
  "Loisirs & Sorties": { ring: "#06B6D4", fill: "bg-cyan-500", dot: "bg-cyan-500" },
  "Logement & Maison": { ring: "#EAB308", fill: "bg-yellow-500", dot: "bg-yellow-500" },
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
        <div className="text-xs text-neutral-400 mb-2">Total cumulé : {data.cumulative.toFixed(2)} €</div>
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

const SHOW_AI_COACH = false;

export function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [processState, setProcessState] = useState<null | "reading" | "analyzing" | "calculating" | "success">(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("Tout");
  const [showResetModal, setShowResetModal] = useState(false);
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"income" | "subs">("income");
  const [isSaved, setIsSaved] = useState(false);
  
  const [coachTips, setCoachTips] = useState<{type: string, text: string}[] | null>(null);
  const [isCoachLoading, setIsCoachLoading] = useState(false);

  const [incomeSettings, setIncomeSettings] = useState<FixedIncomeSettings>({
    salary: 1300,
    salaryDay: 28,
    aids: 195,
    autoApply: false
  });

  // Settings & Inbox Modal Listeners
  useEffect(() => {
    const handleOpenSettings = () => setShowSettingsModal(true);
    const handleOpenInbox = () => setShowInbox(true);
    window.addEventListener("open-settings", handleOpenSettings);
    window.addEventListener("open-inbox", handleOpenInbox);
    return () => {
      window.removeEventListener("open-settings", handleOpenSettings);
      window.removeEventListener("open-inbox", handleOpenInbox);
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
      
      if (hasMutated) {
        localStorage.setItem('financeTransactions_v1', JSON.stringify(parsed));
      }

    } else {
      setTransactions(initialTransactions);
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
  }, [transactions]);

  const availableMonths = useMemo(() => {
    const months = Array.from(new Set(transactions.map(tx => tx.month))).sort().reverse();
    return ["Tout", ...months];
  }, [transactions]);

  useEffect(() => {
    if (selectedMonth === "Tout" && availableMonths.length > 1) {
      setSelectedMonth(availableMonths[1]);
    }
  }, [availableMonths, selectedMonth]);

  const handleUpload = async (data: any[]) => {
    try {
      setProcessState("reading");
      
      // Artificial slight delay for smoothness
      await new Promise(r => setTimeout(r, 600));

      const cache = JSON.parse(localStorage.getItem('financeCategoryCache_v2') || '{}');

      const parsedRows = data
        .filter((row: any[], i: number) => {
          if (i === 0 && typeof row[0] === "string" && row[0].includes("Date")) return false;
          return row.length >= 7 && row[0] && row[6];
        })
        .map((row: any[]) => {
          const dateStr = String(row[0]).trim();
          const rawLibelle = String(row[2] || "").trim();
          const suggLibelle = String(row[3] || "").trim();
          const categoryBourso = String(row[4] || "").trim();
          const rawAmount = String(row[6]).trim();
          
          const name = suggLibelle || rawLibelle || "Unknown";
          const fallback = getLocalFallback(categoryBourso, name, cache);
          
          const cleanedAmount = rawAmount.replace(/\s/g, '').replace('€', '').replace(',', '.');
          const amount = parseFloat(cleanedAmount);
          const dateInfo = parseAndFormatDate(dateStr);
          
          return {
            id: `${dateInfo.date}_${name}_${amount}`,
            name,
            type: fallback.type,
            amount: isNaN(amount) ? 0 : amount,
            date: dateInfo.date,
            month: dateInfo.month,
            isSubscription: fallback.isSub,
            isInternalTransfer: fallback.isInternalTransfer,
          };
        })
        .filter(row => row.amount !== 0);

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

      setTransactions(prev => {
        const all = [...newTransactions, ...prev];
        const unique = Array.from(new Map(all.map(item => [item.id, item])).values());
        return unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      setProcessState("success");

      // Auto redirect to majority month
      const monthCounts = newTransactions.reduce((acc, tx) => {
        acc[tx.month] = (acc[tx.month] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      let majorityMonth = "Tout";
      let maxCount = 0;
      for (const [m, c] of Object.entries(monthCounts)) {
        if (c > maxCount) {
          maxCount = c;
          majorityMonth = m;
        }
      }
      setSelectedMonth(majorityMonth);

      await new Promise(r => setTimeout(r, 800));
      setProcessState(null);
      
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
    if (selectedMonth === "Tout") return transactions;
    return transactions.filter(tx => tx.month === selectedMonth);
  }, [transactions, selectedMonth]);

  const inboxTx = useMemo(() => {
    return filteredTransactions.filter(tx => tx.type === "Autre");
  }, [filteredTransactions]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("update-inbox-count", { detail: { count: inboxTx.length } }));
  }, [inboxTx.length]);


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
      .map(([name, value]) => ({ name, value, max: exp > 0 ? exp : 1 }))
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
          return { day, dateFormatted: day, amount, cumulative, topTx: [] };
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
    return filteredTransactions
      .filter(tx => tx.isSubscription || tx.type === "Abonnements & Forfaits")
      .map(tx => {
        const day = tx.date.split("-")[2];
        return { name: tx.name, price: Math.abs(tx.amount), date: `Le ${day}` };
      })
      .slice(0, 10);
  }, [filteredTransactions]);

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
        {processState && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 z-[100] bg-black/40 dark:bg-black/60 backdrop-blur-md flex items-center justify-center flex-col text-white"
          >
            {processState !== "success" ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} className="mb-6">
                <Loader2 className="w-10 h-10 text-white" />
              </motion.div>
            ) : (
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="mb-6 w-12 h-12 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" 
                  />
                </svg>
              </motion.div>
            )}
            
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
                  {processState !== "success" ? "Analyse des opérations..." : "Importation réussie"}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Month Selector */}
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h1 className="text-xl font-bold text-foreground">Vue d'ensemble</h1>
        
        <div className="flex items-center gap-3">
          {selectedMonth !== "Tout" && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowResetModal(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              title="Réinitialiser ce mois"
            >
              <Trash2 size={16} />
            </motion.button>
          )}
          
          <div className="relative">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none bg-card border border-border text-foreground font-medium text-sm py-2 pl-4 pr-10 rounded-full shadow-sm outline-none hover:border-black/10 dark:hover:border-white/20 transition-colors cursor-pointer"
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>{formatMonthLabel(m)}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <ChevronDown size={16} className="text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-6 shrink-0">
        {[
          { label: "Revenus & Entrées", value: `${income.toFixed(2)} €`, change: autoAppliedInfo || "Total crédité", pos: true, actionIcon: <ArrowDownLeft size={16} /> },
          { label: "Dépenses", value: `${expenses.toFixed(2)} €`, change: "Total débité net", pos: false, actionIcon: <ArrowUpRight size={16} /> },
          { 
            label: "Reste à vivre (Solde)", 
            value: `${balance.toFixed(2)} €`, 
            change: dailyPace ? (
              dailyPace.type === "current" ? (
                dailyPace.isNegative ? "Dépassement de budget" : `soit ~${dailyPace.amount.toFixed(2)} € / jour disponible`
              ) : (
                `Mois clôturé (${dailyPace.amount > 0 ? '+' : ''}${dailyPace.amount.toFixed(0)} € épargnés)`
              )
            ) : "Net calculé", 
            pos: balance >= 0,
            actionIcon: <Wallet size={16} />
          },
          { label: "Abonnements récurrents", value: `${subs.toFixed(2)} €`, change: `${activeSubscriptions.length} identifiés`, pos: true, icon: <RefreshCcw size={14} className="inline mr-1" />, actionIcon: <Repeat size={16} /> },
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
                <div className="text-3xl xl:text-4xl font-semibold mb-2 tracking-tight text-foreground">{stat.value}</div>
                <div className="text-sm font-medium flex items-center">
                  {stat.icon}
                  <span className={stat.pos ? "text-foreground" : "text-muted-foreground"}>{stat.change}</span>
                </div>
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
                <div className="text-3xl font-semibold text-foreground">{expenses.toFixed(2)} €</div>
                <div className="text-sm font-medium text-muted-foreground">Dépensés sur le mois</div>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400">
              <Activity size={16} />
            </div>
          </div>
          
          <div className="flex-1 w-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
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
            </ResponsiveContainer>
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
            
            {categoryData.length === 0 ? (
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
                    <span className="text-xs font-medium text-neutral-400 tracking-wider mb-0.5">DÉPENSÉ</span>
                    <span className="font-bold text-3xl tracking-tight text-foreground">{expenses.toFixed(0)} €</span>
                  </div>
                </div>

                <div className="flex flex-col justify-center space-y-4">
                  {categoryData.map((cat, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center min-w-0">
                          <div className={`w-2 h-2 rounded-full mr-2.5 shrink-0 ${CATEGORY_COLORS[cat.name]?.dot || CATEGORY_COLORS["Autre"].dot}`} />
                          <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate" title={cat.name}>{cat.name}</span>
                        </div>
                        <span className="font-semibold text-neutral-900 dark:text-white shrink-0 ml-3">{cat.value.toFixed(0)} €</span>
                      </div>
                      <div className="h-1.5 w-full bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(cat.value / cat.max) * 100}%` }}
                          transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.1 }}
                          className={`h-full rounded-full ${CATEGORY_COLORS[cat.name]?.fill || CATEGORY_COLORS["Autre"].fill}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="flex-1 min-h-0 flex flex-col">
            <div className="flex justify-between items-start mb-6 shrink-0">
              <h3 className="text-base font-medium text-foreground">Abonnements</h3>
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0">
                <CreditCard size={16} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
              {activeSubscriptions.length === 0 ? (
                <div className="text-sm text-muted-foreground flex h-full items-center justify-center">Aucun abonnement détecté</div>
              ) : activeSubscriptions.map((sub, i) => (
                <motion.div whileTap={{ scale: 0.97 }} key={i} className="flex justify-between items-center p-3 rounded-2xl hover:bg-neutral-50 dark:hover:bg-muted/50 cursor-pointer transition-all hover:border-black/5 dark:hover:border-white/10 border border-transparent">
                  <div>
                    <div className="font-semibold text-sm text-foreground">{sub.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{sub.date}</div>
                  </div>
                </motion.div>
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
              {filteredTransactions.map((tx) => (
                <motion.div 
                  whileTap={{ scale: 0.98 }} 
                  key={tx.id} 
                  className="flex justify-between items-center p-3 xl:p-4 rounded-2xl cursor-pointer group hover:bg-neutral-50 dark:hover:bg-muted/40 transition-all border border-transparent hover:border-black/5 dark:hover:border-white/5"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-600 dark:text-neutral-300 transition-colors shrink-0">
                      {tx.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm xl:text-base text-foreground truncate max-w-[120px] xl:max-w-[180px]">{tx.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer ? (
                          <span className="text-[10px] uppercase font-bold bg-neutral-200/50 dark:bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full shrink-0">Virement interne</span>
                        ) : (
                          <div className="text-xs xl:text-sm text-muted-foreground truncate max-w-[120px] xl:max-w-[180px]">
                            {tx.isSubscription ? "🔄 " : ""}{tx.type}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold text-sm xl:text-base text-foreground`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount.toFixed(2)} €
                    </div>
                    <div className="text-xs xl:text-sm text-muted-foreground mt-0.5">{tx.date}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
          
          <CSVUploader onUpload={handleUpload} />
        </div>
      </div>

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
                  ) : (
                    <div className="flex-1 flex flex-col h-full min-h-0">
                      <div className="mb-6 shrink-0">
                        <h3 className="text-lg font-semibold text-foreground mb-1">Abonnements récurrents</h3>
                        <p className="text-sm text-muted-foreground">Glissez vos abonnements dans la bonne colonne pour ajuster votre budget fixe.</p>
                      </div>
                      <SubscriptionManager transactions={transactions} onUpdate={handleUpdateSubscription} />
                    </div>
                  )}
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

    </div>
  );
}
