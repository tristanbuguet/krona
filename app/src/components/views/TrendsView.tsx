"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { 
  TrendingUp, 
  Wallet, 
  ArrowDownLeft, 
  ShieldCheck, 
  Repeat, 
  Activity, 
  AlertCircle, 
  PieChart,
  BarChart3,
  ShoppingCart,
  Utensils,
  ShoppingBag,
  Train,
  Ticket,
  HeartPulse,
  Home,
  Star,
  ArrowRightLeft
} from "lucide-react";
import { 
  ResponsiveContainer, 
  ComposedChart,
  Bar, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  ReferenceLine
} from "recharts";
import { 
  Transaction, 
  FixedIncomeSettings, 
  CATEGORY_COLORS, 
  formatMonthLabel,
  isSalaryTransaction,
  isAidTransaction
} from "@/lib/types";
import { PageHeader } from "../ui/PageHeader";
import { Card } from "../ui/Card";

interface TrendsViewProps {
  transactions: Transaction[];
  incomeSettings: FixedIncomeSettings;
  categoryBudgets: Record<string, number>;
  onSelectMonth?: (month: string) => void;
}

type TimeHorizon = "3m" | "6m" | "all";

// Unified French currency formatter with strict tabular-nums compliance
export const formatCurrencyFr = (amount: number, showSign = false): string => {
  const formatted = Math.abs(amount).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!showSign) return `${formatted} €`;
  if (amount > 0) return `+${formatted} €`;
  if (amount < 0) return `-${formatted} €`;
  return `0,00 €`;
};

// Rounded whole euro formatter for badges, labels and tooltips
export const formatEurosFr = (amount: number, showSign = false): string => {
  const formatted = Math.abs(Math.round(amount)).toLocaleString("fr-FR");
  if (!showSign) return `${formatted} €`;
  if (amount > 0) return `+${formatted} €`;
  if (amount < 0) return `-${formatted} €`;
  return `0 €`;
};

// Unified operational income vs refund detection (strictly identical to Dashboard.tsx)
function checkIsIncomeTx(tx: Transaction, salaryRef = 0): {
  isIncome: boolean;
  isSalary: boolean;
  isAids: boolean;
  isRefund: boolean;
} {
  if (tx.amount <= 0) {
    return { isIncome: false, isSalary: false, isAids: false, isRefund: false };
  }
  const combinedText = `${tx.name} ${tx.rawName || ""}`.toLowerCase();

  const isAids = 
    isAidTransaction(tx) || 
    Boolean(combinedText.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide|allocation/i));

  const isRefundLabel = Boolean(combinedText.match(/remboursement|avoir/i));

  const matchesSalaryKeywords = Boolean(
    combinedText.match(/salaire|paie|paye|virement sepa|vir sepa|remuneration|rémunération|appointement|appointements|galeries|employeur/i)
  );

  const isSignificantIncome = 
    tx.type === "Revenus & Aides" &&
    (tx.amount >= 500 || (salaryRef > 0 && tx.amount >= salaryRef * 0.5));

  const isSalary = !isRefundLabel && !isAids && (
    matchesSalaryKeywords ||
    isSignificantIncome ||
    isSalaryTransaction(tx, salaryRef)
  );

  const isIncome = isSalary || isAids || tx.type === "Revenus & Aides";
  const isRefund = !isIncome;

  return { isIncome, isSalary, isAids, isRefund };
}

// Category icon renderer adhering to the Dashboard standard
function CategoryIcon({ type, iconSize = 16 }: { type: string; iconSize?: number }) {
  const color = CATEGORY_COLORS[type]?.ring || "#A1A1AA";
  const iconProps = { size: iconSize, strokeWidth: 1.75, style: { color } };

  if (type === "Abonnements & Forfaits") return <Repeat {...iconProps} />;
  if (type === "Revenus & Aides") return <ArrowDownLeft {...iconProps} />;
  if (type === "Épargne & Trésorerie" || type === "Virements proches & Remboursements") return <ArrowRightLeft {...iconProps} />;

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
}

// Clean, uncluttered X-axis tick
function CustomXAxisTick({ x, y, payload }: any) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill="#888888"
        fontSize={11}
        fontFamily="var(--font-space-grotesk)"
      >
        {payload.value}
      </text>
    </g>
  );
}

// Custom Tooltip component for central chart
function CustomChartTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const monthSavingsRate = data.income > 0 
    ? Math.round((data.savings / data.income) * 100) 
    : 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-3 shadow-xl min-w-[200px] text-xs font-sans select-none">
      <div className="font-semibold text-foreground mb-2 pb-1.5 border-b border-border">
        {data.label}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            Revenus
          </span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrencyFr(data.income)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
            Dépenses
          </span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrencyFr(data.expenses)}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2.5 h-0.5 bg-blue-500 rounded-full shrink-0" />
            Épargne
          </span>
          <div className="text-right">
            <span className={clsx(
              "font-semibold tabular-nums",
              data.savings >= 0 ? "text-emerald-500" : "text-rose-500"
            )}>
              {formatCurrencyFr(data.savings, true)}
            </span>
            <span className="text-[10px] text-muted-foreground ml-1.5 tabular-nums">
              ({monthSavingsRate}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrendsView({
  transactions,
  incomeSettings,
  categoryBudgets,
  onSelectMonth,
}: TrendsViewProps) {
  const [horizon, setHorizon] = useState<TimeHorizon>("3m");

  // Sorted list of all unique months in descending order (newest first)
  const allMonthsDesc = useMemo(() => {
    return Array.from(new Set(transactions.map(t => t.month))).sort().reverse();
  }, [transactions]);

  // Filter months according to selected horizon
  const selectedMonths = useMemo(() => {
    if (allMonthsDesc.length === 0) return [];
    
    if (horizon === "3m") {
      return allMonthsDesc.slice(0, 3);
    }
    if (horizon === "6m") {
      return allMonthsDesc.slice(0, 6);
    }
    return allMonthsDesc;
  }, [allMonthsDesc, horizon]);

  // Months in chronological order for time series charts
  const chronologicalMonths = useMemo(() => {
    return [...selectedMonths].reverse();
  }, [selectedMonths]);

  // Transactions filtered to the selected horizon
  const horizonTransactions = useMemo(() => {
    const monthSet = new Set(selectedMonths);
    return transactions.filter(t => monthSet.has(t.month));
  }, [transactions, selectedMonths]);

  // Month-by-month aggregates for charts and metrics (Strict Single Source of Truth)
  const monthlyData = useMemo(() => {
    const dataMap: Record<string, {
      month: string;
      label: string;
      income: number;
      expenses: number;
      savings: number;
      fixedCosts: number;
      discretionaryExpenses: number;
      categories: Record<string, number>;
    }> = {};

    chronologicalMonths.forEach(m => {
      dataMap[m] = {
        month: m,
        label: formatMonthLabel(m),
        income: 0,
        expenses: 0,
        savings: 0,
        fixedCosts: 0,
        discretionaryExpenses: 0,
        categories: {},
      };
    });

    const hasSalaryMap: Record<string, boolean> = {};
    const hasAidsMap: Record<string, boolean> = {};

    horizonTransactions.forEach(tx => {
      const m = tx.month;
      if (!dataMap[m]) return;

      const isInternal = tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer;
      if (isInternal) {
        // Internal transfers are never counted as operational revenues or expenses
        return;
      }

      const { isIncome, isSalary, isAids, isRefund } = checkIsIncomeTx(tx, incomeSettings.salary);

      if (tx.amount > 0) {
        if (isIncome) {
          dataMap[m].income += tx.amount;
          if (isSalary) hasSalaryMap[m] = true;
          if (isAids) hasAidsMap[m] = true;
        } else if (isRefund) {
          // Remboursement opérationnel venant déduire directement les dépenses
          dataMap[m].expenses = Math.max(0, dataMap[m].expenses - tx.amount);
          if (dataMap[m].categories[tx.type]) {
            dataMap[m].categories[tx.type] = Math.max(0, dataMap[m].categories[tx.type] - tx.amount);
          }
        }
      } else {
        const absVal = Math.abs(tx.amount);
        dataMap[m].expenses += absVal;
        dataMap[m].categories[tx.type] = (dataMap[m].categories[tx.type] || 0) + absVal;

        // Detection of fixed incompressible charges (rent, loans, subscriptions, essential utilities)
        const nam = `${tx.name} ${tx.rawName || ""}`.toLowerCase();
        const isFixed = 
          tx.type === "Logement & Maison" || 
          tx.type === "Abonnements & Forfaits" || 
          tx.isSubscription ||
          nam.includes("loyer") ||
          nam.includes("assurance") ||
          nam.includes("mutuelle") ||
          nam.includes("edf") ||
          nam.includes("engie") ||
          nam.includes("totalenergies") ||
          nam.includes("orange") ||
          nam.includes("forfait") ||
          nam.includes("internet") ||
          nam.includes("fibre") ||
          nam.includes("credit") ||
          nam.includes("crédit") ||
          nam.includes("pret") ||
          nam.includes("prêt") ||
          nam.includes("veolia") ||
          nam.includes("suez") ||
          nam.includes("impots") ||
          nam.includes("impôts");

        if (isFixed) {
          dataMap[m].fixedCosts += absVal;
        }
      }
    });

    // Prise en compte de autoApply indépendante : Salaire et Aides gérés séparément
    if (incomeSettings.autoApply) {
      chronologicalMonths.forEach(m => {
        const item = dataMap[m];
        let injected = 0;
        if (!hasSalaryMap[m] && incomeSettings.salary > 0) {
          injected += incomeSettings.salary;
        }
        if (!hasAidsMap[m] && incomeSettings.aids > 0) {
          injected += incomeSettings.aids;
        }
        item.income += injected;
      });
    }

    // Intégration des paramètres configurés (loyer, emprunts, charges) si définis
    chronologicalMonths.forEach(m => {
      const item = dataMap[m];
      let configFixed = 0;
      if (incomeSettings.rent && incomeSettings.rent > 0) configFixed += incomeSettings.rent;
      if (incomeSettings.loans && incomeSettings.loans > 0) configFixed += incomeSettings.loans;
      if (incomeSettings.utilities && incomeSettings.utilities > 0) configFixed += incomeSettings.utilities;

      if (configFixed > 0 && item.fixedCosts < configFixed) {
        item.fixedCosts = configFixed;
      }

      item.income = Math.round(item.income * 100) / 100;
      item.expenses = Math.round(item.expenses * 100) / 100;
      item.savings = Math.round((item.income - item.expenses) * 100) / 100;
      item.fixedCosts = Math.min(item.expenses, Math.round(item.fixedCosts * 100) / 100);
      item.discretionaryExpenses = Math.round(Math.max(0, item.expenses - item.fixedCosts) * 100) / 100;
    });

    return chronologicalMonths.map(m => dataMap[m]);
  }, [chronologicalMonths, horizonTransactions, incomeSettings]);

  // Macro KPIs
  const { 
    totalSavings, 
    avgSavingsRate, 
    avgDiscretionaryExpenses, 
    avgMonthlyIncome, 
    avgMonthlyExpenses,
    avgMonthlySavings,
    discretionaryRatio,
    savingsTierText
  } = useMemo(() => {
    const monthsCount = Math.max(1, selectedMonths.length);
    let totalInc = 0;
    let totalExp = 0;
    let totalDiscretionary = 0;

    monthlyData.forEach(m => {
      totalInc += m.income;
      totalExp += m.expenses;
      totalDiscretionary += m.discretionaryExpenses;
    });

    const totSavings = totalInc - totalExp;
    const savingsRate = totalInc > 0 ? Math.round((totSavings / totalInc) * 100) : 0;
    const avgDiscr = totalDiscretionary / monthsCount;
    const avgInc = totalInc / monthsCount;
    const avgExp = totalExp / monthsCount;
    const avgSav = totSavings / monthsCount;

    const discRatio = avgInc > 0 ? Math.round((avgDiscr / avgInc) * 100) : 0;

    let tierText = "";
    if (savingsRate > 20) {
      tierText = "Idéal (>20%) · Train de vie maîtrisé";
    } else if (savingsRate >= 10) {
      tierText = "Correct (10-20%) · Marge de progression";
    } else {
      tierText = "Sous la cible (<10%) · Budget sous tension";
    }

    return {
      totalSavings: totSavings,
      avgSavingsRate: savingsRate,
      avgDiscretionaryExpenses: avgDiscr,
      avgMonthlyIncome: avgInc,
      avgMonthlyExpenses: avgExp,
      avgMonthlySavings: avgSav,
      discretionaryRatio: discRatio,
      savingsTierText: tierText,
    };
  }, [monthlyData, selectedMonths.length]);

  // Category Drift Analysis
  // Compare the most recent month against the average of preceding months in the horizon (excluding current month)
  const categoryDrift = useMemo(() => {
    if (selectedMonths.length === 0) return [];

    const latestMonth = selectedMonths[0]; // newest
    const priorMonths = selectedMonths.slice(1); // older months

    // Collect all spending categories
    const categoriesSet = new Set<string>();
    horizonTransactions.forEach(t => {
      if (t.type !== "Épargne & Trésorerie" && !t.isInternalTransfer && t.type !== "Revenus & Aides") {
        categoriesSet.add(t.type);
      }
    });

    const results = Array.from(categoriesSet).map(cat => {
      // Latest month total net
      const latestTxs = horizonTransactions.filter(
        t => t.month === latestMonth && t.type === cat && !t.isInternalTransfer && t.type !== "Épargne & Trésorerie"
      );
      let latestVal = 0;
      latestTxs.forEach(t => {
        const { isIncome } = checkIsIncomeTx(t, incomeSettings.salary);
        if (t.amount < 0) {
          latestVal += Math.abs(t.amount);
        } else if (!isIncome) {
          latestVal -= t.amount;
        }
      });
      latestVal = Math.max(0, latestVal);

      // Prior months average net (strictly excluding latest month when at least 2 months exist)
      let priorValTotal = 0;
      if (priorMonths.length > 0) {
        const priorTxs = horizonTransactions.filter(
          t => priorMonths.includes(t.month) && t.type === cat && !t.isInternalTransfer && t.type !== "Épargne & Trésorerie"
        );
        priorTxs.forEach(t => {
          const { isIncome } = checkIsIncomeTx(t, incomeSettings.salary);
          if (t.amount < 0) {
            priorValTotal += Math.abs(t.amount);
          } else if (!isIncome) {
            priorValTotal -= t.amount;
          }
        });
        priorValTotal = Math.max(0, priorValTotal);
      }

      const avgPrior = priorMonths.length > 0 ? (priorValTotal / priorMonths.length) : latestVal;
      const diffAmount = latestVal - avgPrior;
      const diffPercent = avgPrior > 0 
        ? Math.round((diffAmount / avgPrior) * 100) 
        : (latestVal > 0 ? 100 : 0);

      // Smart variation badge without redundant arrows
      const isIncrease = diffAmount > 0.01;
      const isNeutral = Math.abs(diffAmount) <= 0.01;
      let badgeText = "";
      if (isNeutral) {
        badgeText = "0 €";
      } else if (isIncrease) {
        if (diffPercent > 200 || avgPrior < 30) {
          const mult = avgPrior > 0 ? (latestVal / avgPrior) : 0;
          if (mult >= 1.5) {
            badgeText = `×${mult.toFixed(1)}`;
          } else {
            badgeText = `+${Math.round(diffAmount).toLocaleString("fr-FR")} €`;
          }
        } else {
          badgeText = `+${diffPercent}%`;
        }
      } else {
        badgeText = `${diffPercent}%`;
      }

      return {
        category: cat,
        latestVal: Math.round(latestVal * 100) / 100,
        avgPrior: Math.round(avgPrior * 100) / 100,
        diffAmount: Math.round(diffAmount * 100) / 100,
        diffPercent,
        badgeText,
        isIncrease,
        isNeutral,
      };
    });

    const activeResults = results.filter(r => r.latestVal > 0 || r.avgPrior > 0);
    // Sort by largest absolute drift in euros, then by latest spending
    return activeResults.sort((a, b) => Math.abs(b.diffAmount) - Math.abs(a.diffAmount) || b.latestVal - a.latestVal);
  }, [horizonTransactions, selectedMonths, incomeSettings.salary]);

  // Maximum value for proportional category progress bars
  const maxCategoryVal = useMemo(() => {
    const top5 = categoryDrift.slice(0, 5);
    if (top5.length === 0) return 1;
    return Math.max(...top5.map(c => Math.max(c.latestVal, c.avgPrior)), 1);
  }, [categoryDrift]);

  // Budget Structure (50 / 30 / 20) Analysis
  const budgetStructure = useMemo(() => {
    const monthsCount = Math.max(1, selectedMonths.length);
    let totalInc = 0;
    let totalFixed = 0;
    let totalDiscretionary = 0;

    monthlyData.forEach(m => {
      totalInc += m.income;
      totalFixed += m.fixedCosts;
      totalDiscretionary += m.discretionaryExpenses;
    });

    const avgInc = totalInc / monthsCount;
    const avgFixed = totalFixed / monthsCount;
    const avgDiscr = totalDiscretionary / monthsCount;
    const avgSavings = Math.max(0, avgInc - (avgFixed + avgDiscr));

    // Real shares in % of income
    const fixedShare = avgInc > 0 ? Math.round((avgFixed / avgInc) * 100) : 0;
    const variableShare = avgInc > 0 ? Math.round((avgDiscr / avgInc) * 100) : 0;
    const savingsShare = avgInc > 0 ? Math.max(0, 100 - fixedShare - variableShare) : 0;

    // Segment widths for the 100% horizontal gauge
    const totalAllocated = Math.max(avgInc, avgFixed + avgDiscr, 1);
    const widthFixed = (avgFixed / totalAllocated) * 100;
    const widthVariable = (avgDiscr / totalAllocated) * 100;
    const widthSavings = Math.max(0, 100 - widthFixed - widthVariable);

    // Daily average variable expenditure
    const dailyVariable = avgDiscr / 30.4;

    return {
      avgInc,
      avgFixed,
      avgDiscr,
      avgSavings,
      fixedShare,
      variableShare,
      savingsShare,
      widthFixed,
      widthVariable,
      widthSavings,
      dailyVariable,
    };
  }, [monthlyData, selectedMonths.length]);

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full overflow-hidden">
      {/* Top Header with Time Horizon Selector - calibrated exactly to Dashboard topbar standard */}
      <PageHeader title="Tendances">
        <div className="h-9 p-0.5 rounded-full bg-card border border-border flex items-center gap-0.5 shadow-sm shrink-0">
          {[
            { id: "3m", label: "3 derniers mois" },
            { id: "6m", label: "6 derniers mois" },
            { id: "all", label: "Tout l'historique" },
          ].map((tab) => {
            const isActive = horizon === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHorizon(tab.id as TimeHorizon)}
                className="relative h-8 px-3 sm:px-3.5 rounded-full text-xs font-medium cursor-pointer font-sans select-none flex items-center justify-center leading-none outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-[0.97]"
              >
                {isActive && (
                  <motion.div
                    layoutId="trendsPeriodPill"
                    className="absolute inset-0 bg-white rounded-full shadow-sm"
                    transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.8 }}
                  />
                )}
                <span className={clsx(
                  "relative z-10 transition-colors duration-200",
                  isActive
                    ? "text-black font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </PageHeader>

      {/* Main Viewport Container */}
      <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden viewport-fit-scroll no-scrollbar">
        {/* 1. Macro KPIs Header (grid-cols-4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          {[
            {
              label: "Épargne totale cumulée",
              value: (
                <span className={clsx("tabular-nums", totalSavings >= 0 ? "text-foreground" : "text-rose-500 dark:text-rose-400")}>
                  {formatCurrencyFr(totalSavings, true)}
                </span>
              ),
              actionIcon: <Wallet size={15} strokeWidth={1.5} />,
              subline: (
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-muted-foreground font-sans w-full">
                  <span className="truncate">Sur {selectedMonths.length} {selectedMonths.length > 1 ? "mois analysés" : "mois analysé"}</span>
                  <span className={clsx(
                    "tabular-nums shrink-0 ml-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium",
                    avgMonthlySavings >= 0 
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500" 
                      : "bg-rose-500/10 text-rose-500"
                  )}>
                    {formatEurosFr(avgMonthlySavings, true)} / mois
                  </span>
                </div>
              ),
            },
            {
              label: "Taux d'épargne moyen",
              value: <span className="tabular-nums">{avgSavingsRate}%</span>,
              actionIcon: <TrendingUp size={15} strokeWidth={1.5} />,
              subline: (
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-muted-foreground font-sans w-full">
                  <span className="truncate">{savingsTierText}</span>
                </div>
              ),
            },
            {
              label: "Train de vie discrétionnaire",
              value: <span className="tabular-nums">{formatCurrencyFr(avgDiscretionaryExpenses)}</span>,
              actionIcon: <Activity size={15} strokeWidth={1.5} />,
              subline: (
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-muted-foreground font-sans w-full">
                  <span className="truncate">Hors charges fixes & abonnements</span>
                  <span className="tabular-nums shrink-0 ml-1.5 text-xs text-muted-foreground">
                    {discretionaryRatio}% du revenu
                  </span>
                </div>
              ),
            },
            {
              label: "Revenus mensuels moyens",
              value: <span className="tabular-nums">{formatCurrencyFr(avgMonthlyIncome)}</span>,
              actionIcon: <ArrowDownLeft size={15} strokeWidth={1.5} />,
              subline: (
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-muted-foreground font-sans w-full">
                  <span className="truncate">Salaires & encaissements lissés</span>
                  <span className="tabular-nums shrink-0 ml-1.5 text-xs text-muted-foreground">
                    Sur {selectedMonths.length} {selectedMonths.length > 1 ? "mois" : "mois"}
                  </span>
                </div>
              ),
            },
          ].map((stat, i) => (
            <div key={i} className="h-full">
              <Card className="h-full min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] flex flex-col justify-between p-5 cursor-default">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground font-sans truncate">
                    {stat.label}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-border flex items-center justify-center text-muted-foreground shrink-0 ml-2">
                    {stat.actionIcon}
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xl sm:text-2xl xl:text-3xl font-semibold mb-1 tracking-tight text-foreground tabular-nums font-sans">
                    {stat.value}
                  </div>
                  {stat.subline}
                </div>
              </Card>
            </div>
          ))}
        </div>

        {/* 2. Main Evolution Graph: Évolution des Flux & Épargne Nette */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col flex-[1.2] min-h-[200px] overflow-hidden">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground font-sans">
              Évolution des Flux & Épargne Nette
            </h3>
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground font-sans">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  Revenus
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
                  Dépenses
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-blue-500 rounded-full shrink-0" />
                  Épargne
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-border flex items-center justify-center text-muted-foreground shrink-0">
                <BarChart3 size={15} strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart 
                data={monthlyData} 
                margin={{ top: 12, right: 16, left: -10, bottom: 4 }}
                barCategoryGap="25%"
                barGap={6}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120, 120, 120, 0.12)" />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  height={28}
                  tick={<CustomXAxisTick />} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: "#888888", fontSize: 11, fontFamily: "var(--font-space-grotesk)" }}
                  tickFormatter={(val) => `${val.toLocaleString("fr-FR")} €`}
                />
                <Tooltip 
                  content={<CustomChartTooltip />} 
                  cursor={{ fill: 'rgba(255, 255, 255, 0.03)', radius: 12 }} 
                />
                <ReferenceLine 
                  y={avgMonthlyExpenses} 
                  stroke="rgba(255, 255, 255, 0.12)" 
                  strokeDasharray="3 3" 
                />
                <Bar 
                  dataKey="income" 
                  name="Revenus" 
                  fill="#10B981" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={36} 
                  barSize={32}
                  isAnimationActive={true}
                  animationDuration={500}
                  animationEasing="ease-out"
                />
                <Bar 
                  dataKey="expenses" 
                  name="Dépenses nettes" 
                  fill="#71717A" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={36} 
                  barSize={32}
                  isAnimationActive={true}
                  animationDuration={500}
                  animationEasing="ease-out"
                />
                <Line 
                  type="monotone" 
                  dataKey="savings" 
                  name="Épargne nette" 
                  stroke="#3B82F6" 
                  strokeWidth={2.5} 
                  dot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#ffffff" }} 
                  activeDot={{ r: 6, fill: "#3B82F6", strokeWidth: 2, stroke: "#ffffff" }}
                  isAnimationActive={true}
                  animationDuration={500}
                  animationEasing="ease-out"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Bottom Grid: Dérive des Catégories & Structure du Budget */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[220px]">
          {/* Card Bas-Gauche : Dérive des Catégories */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between overflow-hidden h-full">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground font-sans">
                Dérive des Catégories
              </h3>
              <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-border flex items-center justify-center text-muted-foreground shrink-0">
                <AlertCircle size={15} strokeWidth={1.5} />
              </div>
            </div>

            <div className="flex-1 min-h-0 space-y-3.5 overflow-y-auto no-scrollbar pr-0.5">
              {categoryDrift.slice(0, 5).map((item) => {
                const catColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS["Autre"];
                return (
                  <div key={item.category} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-border/80"
                          style={{ backgroundColor: `${catColor.ring}18` }}
                        >
                          <CategoryIcon type={item.category} iconSize={15} />
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-sm font-medium text-foreground truncate">
                            {item.category}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            · moy. {formatEurosFr(item.avgPrior)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          {formatEurosFr(item.latestVal)}
                        </span>
                        <span className={clsx(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                          item.isIncrease
                            ? "bg-rose-500/10 text-rose-500 dark:text-rose-400"
                            : item.isNeutral
                            ? "bg-zinc-500/10 text-zinc-400"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500"
                        )}>
                          {item.badgeText}
                        </span>
                      </div>
                    </div>

                    {/* Fine minimalist progress bar */}
                    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                      <div 
                        className={clsx(
                          "h-full rounded-full transition-all duration-500 ease-out",
                          item.isIncrease ? "bg-amber-500/80" : "bg-emerald-500/80"
                        )}
                        style={{ width: `${Math.min(100, maxCategoryVal > 0 ? (item.latestVal / maxCategoryVal) * 100 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {categoryDrift.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-muted-foreground text-xs font-sans">
                  <span>Aucune dépense enregistrée sur cette période</span>
                </div>
              )}
            </div>
          </div>

          {/* Card Bas-Droite : Structure du Budget (50 / 30 / 20) */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col justify-between overflow-hidden h-full">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground font-sans">
                Structure du Budget
              </h3>
              <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-border flex items-center justify-center text-muted-foreground shrink-0">
                <PieChart size={15} strokeWidth={1.5} />
              </div>
            </div>

            {/* 1. Global Multi-Segment Gauge (without duplicate text below) */}
            <div className="h-2.5 rounded-full overflow-hidden flex gap-0.5 bg-white/[0.04] p-0.5 shrink-0 mb-2">
              {budgetStructure.widthFixed > 0 && (
                <div 
                  className="h-full bg-indigo-500 rounded-l-full transition-all duration-500 ease-out"
                  style={{ width: `${budgetStructure.widthFixed}%` }}
                  title={`Fixes : ${budgetStructure.fixedShare}%`}
                />
              )}
              {budgetStructure.widthVariable > 0 && (
                <div 
                  className="h-full bg-amber-500 transition-all duration-500 ease-out"
                  style={{ width: `${budgetStructure.widthVariable}%` }}
                  title={`Variables : ${budgetStructure.variableShare}%`}
                />
              )}
              {budgetStructure.widthSavings > 0 && (
                <div 
                  className="h-full bg-emerald-500 rounded-r-full transition-all duration-500 ease-out"
                  style={{ width: `${budgetStructure.widthSavings}%` }}
                  title={`Épargne : ${budgetStructure.savingsShare}%`}
                />
              )}
            </div>

            {/* 2. Detailed 3 Poles List (Open & clean lines) */}
            <div className="space-y-3 flex-1 min-h-0 flex flex-col justify-around">
              {[
                {
                  name: "Socle Incompressible",
                  target: "Cible < 50%",
                  amount: budgetStructure.avgFixed,
                  share: budgetStructure.fixedShare,
                  icon: <ShieldCheck size={16} strokeWidth={1.75} className="text-indigo-400" />,
                  pillBg: "bg-indigo-500/15",
                  pillBorder: "border-indigo-500/30",
                },
                {
                  name: "Train de vie Discrétionnaire",
                  target: "Cible < 30%",
                  amount: budgetStructure.avgDiscr,
                  share: budgetStructure.variableShare,
                  icon: <ShoppingBag size={16} strokeWidth={1.75} className="text-amber-400" />,
                  pillBg: "bg-amber-500/15",
                  pillBorder: "border-amber-500/30",
                },
                {
                  name: "Capacité d'Épargne",
                  target: "Cible > 20%",
                  amount: budgetStructure.avgSavings,
                  share: budgetStructure.savingsShare,
                  icon: <Wallet size={16} strokeWidth={1.75} className="text-emerald-400" />,
                  pillBg: "bg-emerald-500/15",
                  pillBorder: "border-emerald-500/30",
                },
              ].map((pole) => (
                <div key={pole.name} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center shrink-0 border", pole.pillBorder, pole.pillBg)}>
                      {pole.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {pole.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {pole.target}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {formatEurosFr(pole.amount)} / mois
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {pole.share}% du revenu
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 3. Synthetic Minimal Footer */}
            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground font-sans mt-2 shrink-0">
              <span>Rythme variable moyen</span>
              <span className="text-foreground font-medium tabular-nums">
                ~{formatCurrencyFr(budgetStructure.dailyVariable)} / jour
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
