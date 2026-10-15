"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { 
  TrendingUp, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowDownRight,
  ShieldCheck, 
  Repeat, 
  Calendar, 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  Minus,
  Sparkles
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend, 
  Line, 
  ComposedChart,
  Area
} from "recharts";
import { 
  Transaction, 
  FixedIncomeSettings, 
  CATEGORY_COLORS, 
  formatMonthLabel, 
  formatAmount 
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

  // Month-by-month aggregates for the charts and metrics
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

    horizonTransactions.forEach(tx => {
      const m = tx.month;
      if (!dataMap[m]) return;

      const isInternal = tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer;
      if (isInternal) {
        // Internal transfers are not considered operational expenses/incomes
        return;
      }

      if (tx.amount > 0) {
        dataMap[m].income += tx.amount;
      } else {
        const absVal = Math.abs(tx.amount);
        dataMap[m].expenses += absVal;

        // Is it a fixed/incompressible charge?
        const isFixed = 
          tx.type === "Logement & Maison" || 
          tx.type === "Abonnements & Forfaits" || 
          tx.isSubscription ||
          tx.name.toLowerCase().includes("loyer") ||
          tx.name.toLowerCase().includes("assurance") ||
          tx.name.toLowerCase().includes("edf") ||
          tx.name.toLowerCase().includes("orange") ||
          tx.name.toLowerCase().includes("forfait");

        if (isFixed) {
          dataMap[m].fixedCosts += absVal;
        } else {
          dataMap[m].discretionaryExpenses += absVal;
        }

        dataMap[m].categories[tx.type] = (dataMap[m].categories[tx.type] || 0) + absVal;
      }
    });

    // Calculate net savings for each month
    chronologicalMonths.forEach(m => {
      const item = dataMap[m];
      item.savings = item.income - item.expenses;
    });

    return chronologicalMonths.map(m => dataMap[m]);
  }, [chronologicalMonths, horizonTransactions]);

  // Macro KPIs
  const { totalSavings, avgSavingsRate, avgDiscretionaryExpenses, avgMonthlyIncome } = useMemo(() => {
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

    return {
      totalSavings: totSavings,
      avgSavingsRate: savingsRate,
      avgDiscretionaryExpenses: avgDiscr,
      avgMonthlyIncome: avgInc,
    };
  }, [monthlyData, selectedMonths.length]);

  // Category Drift Analysis
  // Compare the most recent month against the average of preceding months in the horizon
  const categoryDrift = useMemo(() => {
    if (selectedMonths.length === 0) return [];

    const latestMonth = selectedMonths[0]; // newest
    const priorMonths = selectedMonths.slice(1); // older months

    // Collect all spending categories
    const categoriesSet = new Set<string>();
    horizonTransactions.forEach(t => {
      if (t.amount < 0 && t.type !== "Épargne & Trésorerie" && !t.isInternalTransfer) {
        categoriesSet.add(t.type);
      }
    });

    const results = Array.from(categoriesSet).map(cat => {
      // Latest month total
      const latestVal = horizonTransactions
        .filter(t => t.month === latestMonth && t.type === cat && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // Prior months average
      const priorCount = Math.max(1, priorMonths.length);
      const priorValTotal = horizonTransactions
        .filter(t => priorMonths.includes(t.month) && t.type === cat && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const avgPrior = priorMonths.length > 0 ? priorValTotal / priorCount : latestVal;
      const diffAmount = latestVal - avgPrior;
      const diffPercent = avgPrior > 0 ? Math.round((diffAmount / avgPrior) * 100) : (latestVal > 0 ? 100 : 0);

      return {
        category: cat,
        latestVal,
        avgPrior,
        diffAmount,
        diffPercent,
      };
    });

    // Sort by largest absolute drift in euros
    return results.sort((a, b) => Math.abs(b.diffAmount) - Math.abs(a.diffAmount));
  }, [horizonTransactions, selectedMonths]);

  // Fixed Charges Regularity
  const fixedChargesAnalysis = useMemo(() => {
    if (monthlyData.length === 0) {
      return { avgFixed: 0, variance: 0, isStable: true, series: [] };
    }

    const series = monthlyData.map(m => ({
      month: m.month,
      label: m.label,
      fixed: m.fixedCosts,
    }));

    const avgFixed = series.reduce((sum, s) => sum + s.fixed, 0) / series.length;
    
    // Calculate variance / stability
    const maxFixed = Math.max(...series.map(s => s.fixed));
    const minFixed = Math.min(...series.map(s => s.fixed));
    const variationPercent = avgFixed > 0 ? Math.round(((maxFixed - minFixed) / avgFixed) * 100) : 0;
    const isStable = variationPercent <= 15;

    return {
      avgFixed,
      variationPercent,
      isStable,
      series,
    };
  }, [monthlyData]);



  return (
    <div className="flex-1 min-h-0 flex flex-col w-full h-full overflow-hidden">
      {/* Top Header with Time Horizon Selector */}
      <PageHeader title="Tendances">
        <div className="h-9 flex items-center bg-white/80 dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-black/[0.08] dark:border-border rounded-full p-0.5 shadow-sm shrink-0 gap-0.5">
          {[
            { id: "3m", label: "3 derniers mois" },
            { id: "6m", label: "6 derniers mois" },
            { id: "all", label: "Tout l'historique" },
          ].map((tab) => {
            const isActive = horizon === tab.id;
            return (
              <motion.button
                key={tab.id}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setHorizon(tab.id as TimeHorizon)}
                className={clsx(
                  "relative h-full flex items-center justify-center px-3 sm:px-3.5 rounded-full text-xs font-medium transition-colors cursor-pointer font-sans select-none leading-none outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none",
                  isActive
                    ? "text-white dark:text-black font-semibold"
                    : "text-zinc-600 dark:text-muted-foreground hover:text-zinc-900 dark:hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="trends-horizon-pill"
                    className="absolute inset-0 bg-zinc-900 dark:bg-white rounded-full shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center leading-none">
                  {tab.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </PageHeader>

      {/* Main Viewport Container - Zero scroll, occupies 100% of viewport */}
      <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden viewport-fit-scroll no-scrollbar">
        {/* 1. Macro KPIs Header */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          {[
            {
              label: "Épargne totale cumulée",
              value: (
                <span className={totalSavings >= 0 ? "text-foreground" : "text-rose-500 dark:text-rose-400"}>
                  {formatAmount(totalSavings)}
                </span>
              ),
              actionIcon: <Wallet size={14} />,
              subline: (
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-neutral-400 font-sans w-full">
                  <span className="truncate">Sur {selectedMonths.length} mois analysés</span>
                  <span className={clsx("tabular-nums shrink-0 ml-1.5 font-medium", totalSavings >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-rose-500")}>
                    {totalSavings >= 0 ? "+" : ""}{(totalSavings / Math.max(1, selectedMonths.length)).toFixed(0)} € / mois
                  </span>
                </div>
              ),
            },
            {
              label: "Taux d'épargne moyen",
              value: `${avgSavingsRate}%`,
              actionIcon: <TrendingUp size={14} />,
              subline: (
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-neutral-400 font-sans w-full">
                  <span className="truncate">{avgSavingsRate >= 20 ? "Idéal (>20%)" : avgSavingsRate > 0 ? "Positif" : "Déficit"} · Train de vie maîtrisé</span>
                </div>
              ),
            },
            {
              label: "Train de vie discrétionnaire",
              value: `${avgDiscretionaryExpenses.toFixed(2)} €`,
              actionIcon: <Activity size={14} />,
              subline: (
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-neutral-400 font-sans w-full">
                  <span className="truncate">Hors charges fixes & abonnements</span>
                </div>
              ),
            },
            {
              label: "Revenus mensuels moyens",
              value: `${avgMonthlyIncome.toFixed(2)} €`,
              actionIcon: <ArrowDownLeft size={14} />,
              subline: (
                <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-neutral-400 font-sans w-full">
                  <span className="truncate">Salaires et encaissements lissés</span>
                </div>
              ),
            },
          ].map((stat, i) => (
            <div key={i} className="h-full">
              <Card className="h-full min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] flex flex-col justify-between cursor-default">
                <div className="flex justify-between items-start mb-1 sm:mb-2">
                  <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-neutral-400 font-sans truncate">
                    {stat.label}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center bg-zinc-100 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-zinc-600 dark:text-neutral-400">
                      {stat.actionIcon}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xl sm:text-2xl xl:text-3xl font-semibold mb-0.5 sm:mb-1 tracking-tight text-foreground tabular-nums font-sans">
                    {stat.value}
                  </div>
                  {stat.subline}
                </div>
              </Card>
            </div>
          ))}
        </div>

        {/* 2. Main Evolution Graph: Revenus vs Dépenses & Épargne (Remplit harmonieusement la hauteur disponible) */}
        <div className="bg-white dark:bg-card border border-black/[0.06] dark:border-border rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col flex-[1.2] min-h-[190px] overflow-hidden">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div>
              <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground font-sans">
                Évolution des Flux & Épargne Nette
              </h3>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 text-xs font-medium font-sans">
              <span className="flex items-center gap-1.5 text-zinc-500 dark:text-neutral-400">
                <span className="w-2 h-2 rounded-sm bg-emerald-500" />
                Revenus
              </span>
              <span className="flex items-center gap-1.5 text-zinc-500 dark:text-neutral-400">
                <span className="w-2 h-2 rounded-sm bg-zinc-600 dark:bg-zinc-400" />
                Dépenses
              </span>
              <span className="flex items-center gap-1.5 text-zinc-500 dark:text-neutral-400">
                <span className="w-2.5 h-0.5 bg-blue-500 rounded-full" />
                Épargne nette
              </span>
            </div>
          </div>

          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120, 120, 120, 0.12)" />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: "#888888", fontSize: 11, fontFamily: "var(--font-space-grotesk)" }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: "#888888", fontSize: 11, fontFamily: "var(--font-space-grotesk)" }}
                  tickFormatter={(val) => `${val} €`}
                />
                <Bar dataKey="income" name="Revenus" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="expenses" name="Dépenses" fill="#71717A" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Line 
                  type="monotone" 
                  dataKey="savings" 
                  name="Épargne nette" 
                  stroke="#3B82F6" 
                  strokeWidth={2} 
                  dot={{ r: 3, fill: "#3B82F6", strokeWidth: 1.5, stroke: "#ffffff" }} 
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Bottom Grid: Dérive des Catégories & Stabilité des Charges Fixes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[180px]">
          {/* Card: Dérive des Catégories */}
          <div className="bg-white dark:bg-card border border-black/[0.06] dark:border-border rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col justify-between overflow-hidden h-full">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground font-sans">
                Dérive des Catégories
              </h3>
              <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-neutral-400 font-sans">Dernier mois vs Moyenne</span>
            </div>

            <div className="flex-1 min-h-0 flex flex-col justify-around gap-1.5">
              {categoryDrift.slice(0, 3).map((item) => {
                const isIncrease = item.diffAmount > 0;
                const color = CATEGORY_COLORS[item.category] || CATEGORY_COLORS["Autre"];
                return (
                  <div key={item.category} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-border/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
                      <span className="font-semibold text-xs text-foreground font-sans truncate max-w-[120px] sm:max-w-[180px]">
                        {item.category}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-neutral-400 font-sans hidden sm:inline tabular-nums">
                        (moy. {item.avgPrior.toFixed(0)} €)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-foreground tabular-nums font-sans">
                        {item.latestVal.toFixed(0)} €
                      </span>
                      <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums ${
                        isIncrease 
                          ? "bg-rose-500/10 text-rose-500" 
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500"
                      }`}>
                        {isIncrease ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                        <span>{isIncrease ? `+${item.diffPercent}%` : `${item.diffPercent}%`}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card: Stabilité des Charges Fixes */}
          <div className="bg-white dark:bg-card border border-black/[0.06] dark:border-border rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col justify-between overflow-hidden h-full">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground font-sans">
                Stabilité des Charges Fixes
              </h3>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 text-[10px] sm:text-[11px] font-medium font-sans">
                <ShieldCheck size={12} />
                <span>Socle régulier</span>
              </div>
            </div>

            <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-border/40 rounded-xl px-3 py-1.5 mb-1 shrink-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] text-zinc-500 dark:text-neutral-400 font-sans">Moyenne incompressible</span>
                <span className="text-sm sm:text-base font-bold text-foreground tabular-nums font-sans">
                  {fixedChargesAnalysis.avgFixed.toFixed(2)} € / mois
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-neutral-400 font-sans truncate">
                Variation &lt; <strong className="text-foreground tabular-nums">{fixedChargesAnalysis.variationPercent}%</strong> d'un mois sur l'autre · Budget hautement prévisible
              </div>
            </div>

            {/* Monthly Fixed Costs Bar Breakdown */}
            <div className="flex-1 min-h-0 flex flex-col justify-around gap-1">
              {fixedChargesAnalysis.series.slice(-3).map((item) => (
                <div key={item.month} className="flex items-center justify-between text-xs font-sans">
                  <span className="text-zinc-500 dark:text-neutral-400 text-[11px]">{item.label}</span>
                  <div className="flex items-center gap-2.5">
                    <div className="w-20 sm:w-28 h-1 bg-black/5 dark:bg-white/[0.08] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-foreground rounded-full"
                        style={{ 
                          width: `${Math.min(100, fixedChargesAnalysis.avgFixed > 0 ? (item.fixed / fixedChargesAnalysis.avgFixed) * 80 : 0)}%` 
                        }}
                      />
                    </div>
                    <span className="font-semibold text-foreground tabular-nums text-xs w-14 text-right">
                      {item.fixed.toFixed(0)} €
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
