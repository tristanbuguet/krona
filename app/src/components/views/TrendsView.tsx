"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
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
  Tooltip, 
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

interface TrendsViewProps {
  transactions: Transaction[];
  incomeSettings: FixedIncomeSettings;
  categoryBudgets: Record<string, number>;
  onSelectMonth?: (month: string) => void;
}

type TimeHorizon = "3m" | "6m" | "ytd" | "all";

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
    if (horizon === "ytd") {
      const currentYear = allMonthsDesc[0]?.split("-")[0] || new Date().getFullYear().toString();
      return allMonthsDesc.filter(m => m.startsWith(currentYear));
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

  // Custom Chart Tooltip
  const CustomTrendsTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-neutral-900/95 dark:bg-[#0F0F11]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl text-xs min-w-[200px]">
          <div className="font-semibold text-white mb-2 text-sm">{label}</div>
          <div className="space-y-1.5 font-sans">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-neutral-400">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
                <span className="font-medium text-white tabular-nums">
                  {formatAmount(entry.value, false)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-6 overflow-y-auto no-scrollbar pb-10">
      {/* Top Header with Time Horizon Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-sans">
            Cockpit Tendances
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 font-sans mt-0.5">
            Analyse plurimensuelle et dynamique d'épargne sur vos relevés
          </p>
        </div>

        {/* Time Horizon Segmented Control */}
        <div className="flex items-center bg-black/5 dark:bg-white/[0.04] p-1 rounded-full border border-border shrink-0">
          {[
            { id: "3m", label: "3 derniers mois" },
            { id: "6m", label: "6 derniers mois" },
            { id: "ytd", label: "Année en cours" },
            { id: "all", label: "Tout l'historique" },
          ].map((tab) => {
            const isActive = horizon === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHorizon(tab.id as TimeHorizon)}
                className={`relative px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer font-sans select-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none ${
                  isActive
                    ? "text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="trends-horizon-pill"
                    className="absolute inset-0 bg-foreground rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Macro KPIs Header (Uniform p-6 padding, Space Grotesk, Tabular-nums) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-5 shrink-0">
        {/* KPI 1: Épargne cumulée */}
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-between shadow-sm transition-all hover:bg-black/[0.01] dark:hover:bg-white/[0.02]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs sm:text-sm font-medium text-neutral-400 font-sans">
              Épargne totale cumulée
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-border text-neutral-400">
              <Wallet size={16} />
            </div>
          </div>
          <div>
            <div className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums font-sans mb-1.5 ${
              totalSavings >= 0 ? "text-foreground" : "text-rose-500 dark:text-rose-400"
            }`}>
              {formatAmount(totalSavings)}
            </div>
            <div className="flex items-center justify-between text-xs text-neutral-400 font-sans">
              <span>Sur {selectedMonths.length} mois analysés</span>
              <span className={`font-medium tabular-nums ${totalSavings >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {totalSavings >= 0 ? "+" : ""}{(totalSavings / Math.max(1, selectedMonths.length)).toFixed(0)} € / mois
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: Taux d'épargne moyen */}
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-between shadow-sm transition-all hover:bg-black/[0.01] dark:hover:bg-white/[0.02]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs sm:text-sm font-medium text-neutral-400 font-sans">
              Taux d'épargne moyen
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-border text-neutral-400">
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums font-sans mb-2">
              {avgSavingsRate}%
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-black/5 dark:bg-white/[0.08] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, avgSavingsRate))}%` }}
                />
              </div>
              <span className="text-xs font-medium text-neutral-400 font-sans tabular-nums">
                {avgSavingsRate >= 20 ? "Idéal (>20%)" : avgSavingsRate > 0 ? "Positif" : "Déficit"}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 3: Moyenne dépenses discrétionnaires */}
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-between shadow-sm transition-all hover:bg-black/[0.01] dark:hover:bg-white/[0.02]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs sm:text-sm font-medium text-neutral-400 font-sans">
              Train de vie discrétionnaire
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-border text-neutral-400">
              <Activity size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums font-sans mb-1.5">
              {avgDiscretionaryExpenses.toFixed(2)} €
            </div>
            <div className="text-xs text-neutral-400 font-sans">
              Hors loyer, emprunt & abonnements
            </div>
          </div>
        </div>

        {/* KPI 4: Moyenne revenus mensuels */}
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-between shadow-sm transition-all hover:bg-black/[0.01] dark:hover:bg-white/[0.02]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs sm:text-sm font-medium text-neutral-400 font-sans">
              Revenus mensuels moyens
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-border text-neutral-400">
              <ArrowDownLeft size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums font-sans mb-1.5">
              {avgMonthlyIncome.toFixed(2)} €
            </div>
            <div className="text-xs text-neutral-400 font-sans">
              Salaires et encaissements lissés
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Evolution Graph: Revenus vs Dépenses & Épargne */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground font-sans">
              Évolution des Flux & Épargne Nette
            </h3>
            <p className="text-xs text-neutral-400 font-sans mt-0.5">
              Comparatif mois par mois des entrées de fonds, des sorties et du solde net mis de côté
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium font-sans">
            <span className="flex items-center gap-1.5 text-neutral-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              Revenus
            </span>
            <span className="flex items-center gap-1.5 text-neutral-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-zinc-600 dark:bg-zinc-400" />
              Dépenses
            </span>
            <span className="flex items-center gap-1.5 text-neutral-400">
              <span className="w-2.5 h-0.5 bg-blue-500 rounded-full" />
              Épargne nette
            </span>
          </div>
        </div>

        <div className="h-[280px] sm:h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120, 120, 120, 0.12)" />
              <XAxis 
                dataKey="label" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#888888", fontSize: 12, fontFamily: "var(--font-space-grotesk)" }} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#888888", fontSize: 12, fontFamily: "var(--font-space-grotesk)" }}
                tickFormatter={(val) => `${val} €`}
              />
              <Tooltip content={<CustomTrendsTooltip />} />
              <Bar dataKey="income" name="Revenus" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="expenses" name="Dépenses" fill="#71717A" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Line 
                type="monotone" 
                dataKey="savings" 
                name="Épargne nette" 
                stroke="#3B82F6" 
                strokeWidth={2.5} 
                dot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#ffffff" }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Bottom Grid: Dérive des Catégories & Stabilité des Charges Fixes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card: Dérive des Catégories */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground font-sans">
                Dérive des Catégories
              </h3>
              <span className="text-xs text-neutral-400 font-sans">Dernier mois vs Moyenne</span>
            </div>
            <p className="text-xs text-neutral-400 font-sans mb-6">
              Postes de dépenses ayant le plus augmenté ou baissé par rapport à vos habitudes
            </p>

            <div className="space-y-4">
              {categoryDrift.slice(0, 5).map((item) => {
                const isIncrease = item.diffAmount > 0;
                const color = CATEGORY_COLORS[item.category] || CATEGORY_COLORS["Autre"];
                return (
                  <div key={item.category} className="flex flex-col gap-1.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                        <span className="font-semibold text-sm text-foreground font-sans truncate max-w-[170px] sm:max-w-xs">
                          {item.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground tabular-nums font-sans">
                          {item.latestVal.toFixed(0)} €
                        </span>
                        <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums ${
                          isIncrease 
                            ? "bg-rose-500/10 text-rose-500" 
                            : "bg-emerald-500/10 text-emerald-500"
                        }`}>
                          {isIncrease ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          <span>{isIncrease ? `+${item.diffPercent}%` : `${item.diffPercent}%`}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 font-sans">
                      <span>Moyenne précédente : {item.avgPrior.toFixed(0)} €</span>
                      <span className="tabular-nums">
                        {isIncrease ? `+${item.diffAmount.toFixed(0)} €` : `${item.diffAmount.toFixed(0)} €`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card: Stabilité des Charges Fixes */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground font-sans">
                Stabilité des Charges Fixes
              </h3>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium font-sans">
                <ShieldCheck size={13} />
                <span>Socle régulier</span>
              </div>
            </div>
            <p className="text-xs text-neutral-400 font-sans mb-6">
              Régularité du socle incompressible (loyer, emprunts, forfaits et abonnements)
            </p>

            <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-border/50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400 font-sans">Moyenne incompressible</span>
                <span className="text-xl font-bold text-foreground tabular-nums font-sans">
                  {fixedChargesAnalysis.avgFixed.toFixed(2)} € / mois
                </span>
              </div>
              <div className="text-xs text-neutral-400 leading-relaxed font-sans">
                Vos charges fixes varient de moins de <strong className="text-foreground tabular-nums">{fixedChargesAnalysis.variationPercent}%</strong> d'un mois sur l'autre, assurant une parfaite prévisibilité de votre budget.
              </div>
            </div>

            {/* Monthly Fixed Costs Bar Breakdown */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-sans">
                Historique mensuel du socle
              </span>
              {fixedChargesAnalysis.series.map((item) => (
                <div key={item.month} className="flex items-center justify-between text-xs font-sans">
                  <span className="text-neutral-400">{item.label}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 sm:w-36 h-1.5 bg-black/5 dark:bg-white/[0.08] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-foreground rounded-full"
                        style={{ 
                          width: `${Math.min(100, fixedChargesAnalysis.avgFixed > 0 ? (item.fixed / fixedChargesAnalysis.avgFixed) * 80 : 0)}%` 
                        }}
                      />
                    </div>
                    <span className="font-semibold text-foreground tabular-nums w-16 text-right">
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
