"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Target } from "lucide-react";
import clsx from "clsx";

export interface MonthlyLimitConfig {
  type: "amount" | "percent";
  value: number; // Montant max (€) si type="amount" ou pourcentage du solde cible (%) si type="percent"
}

export interface MonthlyLimitCardProps {
  spentAmount?: number;
  expenses?: number;
  income?: number;
  maxSpending?: number;
  targetRemaining?: number;
  targetPercent?: number;
  limitConfig?: MonthlyLimitConfig;
  onLimitConfigChange?: (cfg: MonthlyLimitConfig) => void;
  categoryBudgets?: Record<string, number>;
  incomeSettings?: {
    salary?: number;
    aids?: number;
    savingsGoal?: number;
  };
  selectedMonth?: string;
  onOpenBudgetSettings?: () => void;
  className?: string;
  // Compatibilité historique
  monthlyLimit?: number;
  customLimit?: number | null;
  onLimitChange?: (val: number) => void;
}

export function MonthlyLimitCard({
  spentAmount,
  expenses = 0,
  income = 1800,
  maxSpending: propMaxSpending,
  targetRemaining: propTargetRemaining,
  targetPercent: propTargetPercent,
  limitConfig: propLimitConfig,
  onLimitConfigChange,
  categoryBudgets = {},
  incomeSettings = {},
  selectedMonth,
  onOpenBudgetSettings,
  className = "",
  monthlyLimit,
  customLimit,
  onLimitChange,
}: MonthlyLimitCardProps) {
  const [userSavedConfig, setUserSavedConfig] = useState<MonthlyLimitConfig | null>(null);

  // Chargement de la configuration persistée
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
          setUserSavedConfig(parsed);
          return;
        }
      }
      const legacySaved = localStorage.getItem("krona_monthly_spending_limit");
      if (legacySaved) {
        const val = parseFloat(legacySaved);
        if (!isNaN(val) && val > 0) {
          setUserSavedConfig({ type: "amount", value: val });
        }
      }
    } catch (e) {}
  }, []);

  const resolvedDefaultLimit = customLimit && customLimit > 0 ? customLimit : (monthlyLimit && monthlyLimit > 0 ? monthlyLimit : 2200);
  const activeConfig: MonthlyLimitConfig = propLimitConfig || userSavedConfig || { type: "amount", value: resolvedDefaultLimit };
  const effectiveIncome = income > 0 ? income : (monthlyLimit || 2200);

  // Calcul du budget dépensable max et du solde restant cible
  let effectiveMaxSpending: number;
  let effectiveTargetRemaining: number;
  let effectiveTargetPercent: number;

  if (propMaxSpending !== undefined && propTargetRemaining !== undefined) {
    effectiveMaxSpending = propMaxSpending;
    effectiveTargetRemaining = propTargetRemaining;
    effectiveTargetPercent =
      propTargetPercent !== undefined
        ? propTargetPercent
        : effectiveIncome > 0
          ? Math.round((effectiveTargetRemaining / effectiveIncome) * 100)
          : 40;
  } else if (activeConfig.type === "percent") {
    effectiveTargetPercent = Math.min(99, Math.max(1, activeConfig.value));
    effectiveTargetRemaining = Math.round(effectiveIncome * (effectiveTargetPercent / 100));
    effectiveMaxSpending = Math.max(0, effectiveIncome - effectiveTargetRemaining);
  } else {
    effectiveMaxSpending = activeConfig.value > 0 ? activeConfig.value : resolvedDefaultLimit;
    effectiveTargetRemaining = Math.max(0, effectiveIncome - effectiveMaxSpending);
    effectiveTargetPercent =
      effectiveIncome > 0 ? Math.round((effectiveTargetRemaining / effectiveIncome) * 100) : 40;
  }

  const spent = Math.max(0, spentAmount !== undefined ? spentAmount : expenses);
  const percentage = effectiveMaxSpending > 0 ? Math.round((spent / effectiveMaxSpending) * 100) : 0;
  const isOverLimit = spent > effectiveMaxSpending;

  return (
    <div
      onClick={onOpenBudgetSettings}
      className={clsx(
        "bg-card border border-border rounded-2xl shadow-sm flex flex-col justify-between p-3.5 sm:p-4 xl:p-4.5 transition-all duration-200 overflow-hidden cursor-pointer group active:scale-[0.995]",
        className
      )}
    >
      {/* En-tête : Titre à gauche, pastille d'action standardisée à droite */}
      <div className="flex justify-between items-start shrink-0">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200 font-sans truncate">
          Plafond mensuel
        </span>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border group-hover:border-black/20 dark:group-hover:border-white/20 text-muted-foreground group-hover:text-foreground transition-all duration-200 shrink-0"
            aria-label="Configurer le plafond mensuel"
          >
            <Target size={15} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* Milieu : Chiffre clé avec Double indicateur */}
      <div className="flex flex-col my-auto">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight text-foreground tabular-nums font-sans">
            {spent.toFixed(0)} €
          </div>
          <span
            className={clsx(
              "text-[10px] sm:text-xs font-medium tabular-nums font-sans px-2 py-0.5 rounded-full border",
              isOverLimit
                ? "text-rose-500 dark:text-rose-400 bg-rose-500/10 border-rose-500/20 font-semibold"
                : "text-muted-foreground bg-black/[0.03] dark:bg-white/[0.04] border-border"
            )}
          >
            {isOverLimit
              ? `+${Math.round(spent - effectiveMaxSpending).toLocaleString("fr-FR")} € dépassés`
              : `${percentage}% dépensés`}
          </span>
        </div>

        {/* Double indicateur : Montant dépense autorisée vs Montant préservé visé */}
        <div className="text-[10px] sm:text-xs font-medium text-muted-foreground font-sans truncate mt-1">
          Objectif : garder{" "}
          <span className="tabular-nums font-semibold text-foreground">
            {effectiveTargetPercent}%
          </span>{" "}
          ({effectiveTargetRemaining.toFixed(0)} €) · Limite :{" "}
          <span className="tabular-nums font-semibold text-foreground">
            {effectiveMaxSpending.toFixed(0)} €
          </span>
        </div>
      </div>

      {/* Bas de carte : Barre de progression des dépenses réelles par rapport au budget dépensable max */}
      <div className="mt-2 sm:mt-2.5 w-full shrink-0">
        <div className="h-2 sm:h-2.5 w-full bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{
              width: `${Math.min(100, percentage)}%`,
            }}
            transition={{
              duration: 0.9,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={clsx(
              "h-full rounded-full transition-colors",
              isOverLimit
                ? "bg-rose-500"
                : percentage > 85
                  ? "bg-amber-400"
                  : "bg-foreground"
            )}
          />
        </div>
      </div>
    </div>
  );
}
