"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Pencil, Check, X } from "lucide-react";
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
  const [internalConfig, setInternalConfig] = useState<MonthlyLimitConfig>({
    type: "amount",
    value: 900,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editType, setEditType] = useState<"amount" | "percent">("amount");
  const [inputValue, setInputValue] = useState("");

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
          setInternalConfig(parsed);
          return;
        }
      }
      const legacySaved = localStorage.getItem("krona_monthly_spending_limit");
      if (legacySaved) {
        const val = parseFloat(legacySaved);
        if (!isNaN(val) && val > 0) {
          setInternalConfig({ type: "amount", value: val });
        }
      }
    } catch (e) {}
  }, []);

  const activeConfig = propLimitConfig || internalConfig;
  const effectiveIncome = income > 0 ? income : 1800;

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
    effectiveMaxSpending = activeConfig.value > 0 ? activeConfig.value : (monthlyLimit || 900);
    effectiveTargetRemaining = Math.max(0, effectiveIncome - effectiveMaxSpending);
    effectiveTargetPercent =
      effectiveIncome > 0 ? Math.round((effectiveTargetRemaining / effectiveIncome) * 100) : 40;
  }

  const spent = Math.max(0, spentAmount !== undefined ? spentAmount : expenses);
  const percentage = effectiveMaxSpending > 0 ? Math.round((spent / effectiveMaxSpending) * 100) : 0;
  const isOverLimit = spent > effectiveMaxSpending;

  // Gestion du mode édition
  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditType(activeConfig.type);
    setInputValue(activeConfig.value.toString());
    setIsEditing(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const handleSaveEdit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed) && parsed > 0) {
      const newConfig: MonthlyLimitConfig = {
        type: editType,
        value: editType === "percent" ? Math.min(99, Math.max(1, Math.round(parsed))) : Math.round(parsed),
      };

      setInternalConfig(newConfig);
      onLimitConfigChange?.(newConfig);

      // Calcul de la dépense max pour compatibilité historique
      const computedSpending =
        newConfig.type === "percent"
          ? Math.round(effectiveIncome * (1 - newConfig.value / 100))
          : newConfig.value;
      onLimitChange?.(computedSpending);

      try {
        localStorage.setItem("krona_monthly_limit_config", JSON.stringify(newConfig));
        localStorage.setItem("krona_monthly_spending_limit", computedSpending.toString());
      } catch (err) {}
    }
    setIsEditing(false);
  };

  // Aperçu de conversion dynamique lors de la saisie
  const parsedInput = parseFloat(inputValue);
  let conversionPreview = "";
  if (!isNaN(parsedInput) && parsedInput > 0) {
    if (editType === "percent") {
      const pct = Math.min(99, Math.max(1, Math.round(parsedInput)));
      const rem = Math.round(effectiveIncome * (pct / 100));
      const sp = Math.max(0, effectiveIncome - rem);
      conversionPreview = `↳ Limite dépense : ${sp.toLocaleString("fr-FR")} € · Reste visé : ${rem.toLocaleString("fr-FR")} € (${pct}%)`;
    } else {
      const sp = Math.round(parsedInput);
      const rem = Math.max(0, effectiveIncome - sp);
      const pct = effectiveIncome > 0 ? Math.round((rem / effectiveIncome) * 100) : 0;
      conversionPreview = `↳ Reste visé : ${rem.toLocaleString("fr-FR")} € (${pct}% de vos revenus)`;
    }
  }

  return (
    <div
      className={clsx(
        "bg-white dark:bg-zinc-900/50 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl shadow-sm flex flex-col justify-between p-3 sm:p-3.5 xl:p-4 transition-all duration-200 overflow-hidden",
        className
      )}
    >
      {/* En-tête : Titre à gauche, boutons d'action à droite */}
      <div className="flex justify-between items-center shrink-0">
        <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-neutral-400 font-sans truncate">
          Plafond mensuel
        </span>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center bg-zinc-100 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95 cursor-pointer"
                aria-label="Annuler la modification"
              >
                <X size={12} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center bg-zinc-900 dark:bg-white text-white dark:text-black transition-transform active:scale-95 cursor-pointer shadow-sm"
                aria-label="Valider la configuration"
              >
                <Check size={13} strokeWidth={2.5} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center bg-zinc-100 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-zinc-600 dark:text-neutral-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/[0.08] transition-all active:scale-95 cursor-pointer"
              aria-label="Ajuster le plafond et l'objectif"
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Milieu : Vue Édition ou Chiffre clé avec Double indicateur */}
      <div className="flex flex-col my-auto">
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="flex flex-col gap-1.5 py-0.5">
            <div className="flex items-center justify-between gap-2">
              {/* Sélecteur de mode : Montant (€) vs Reste (%) */}
              <div className="inline-flex p-0.5 rounded-lg bg-zinc-100 dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.06] text-[10px] font-medium font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setEditType("amount");
                    if (inputValue) {
                      const cur = parseFloat(inputValue);
                      if (!isNaN(cur) && cur < 100) {
                        // Conversion estimée depuis le pourcentage
                        setInputValue(Math.round(effectiveIncome * (1 - cur / 100)).toString());
                      }
                    }
                  }}
                  className={clsx(
                    "px-2 py-0.5 rounded-md transition-all cursor-pointer font-sans",
                    editModeClass(editType === "amount")
                  )}
                >
                  Limite (€)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditType("percent");
                    if (inputValue) {
                      const cur = parseFloat(inputValue);
                      if (!isNaN(cur) && cur > 100) {
                        // Conversion estimée depuis le montant
                        const pct = Math.max(1, Math.min(99, Math.round(((effectiveIncome - cur) / effectiveIncome) * 100)));
                        setInputValue(pct.toString());
                      }
                    }
                  }}
                  className={clsx(
                    "px-2 py-0.5 rounded-md transition-all cursor-pointer font-sans",
                    editModeClass(editType === "percent")
                  )}
                >
                  Reste (%)
                </button>
              </div>

              {/* Champ numérique compact */}
              <div className="relative w-24 shrink-0">
                <input
                  type="number"
                  step={editType === "percent" ? "1" : "10"}
                  min="1"
                  max={editType === "percent" ? "99" : undefined}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  autoFocus
                  className="w-full pl-2.5 pr-6 py-1 text-xs font-semibold rounded-lg bg-neutral-100 dark:bg-white/[0.06] border border-border text-foreground tabular-nums outline-none focus:ring-1 focus:ring-foreground/20 font-sans"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400 dark:text-neutral-400 font-sans pointer-events-none">
                  {editType === "amount" ? "€" : "%"}
                </span>
              </div>
            </div>

            {/* Aperçu dynamique de conversion */}
            {conversionPreview && (
              <div className="text-[10px] text-zinc-500 dark:text-neutral-400 font-sans truncate">
                {conversionPreview}
              </div>
            )}
          </form>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white tabular-nums font-sans">
                {spent.toFixed(0)} €
              </div>
              <span
                className={clsx(
                  "text-[10px] sm:text-xs font-medium tabular-nums font-sans px-2 py-0.5 rounded-full border",
                  isOverLimit
                    ? "text-rose-500 dark:text-rose-400 bg-rose-500/10 border-rose-500/20 font-semibold"
                    : "text-zinc-600 dark:text-neutral-300 bg-black/[0.03] dark:bg-white/[0.04] border-black/[0.04] dark:border-white/[0.06]"
                )}
              >
                {isOverLimit
                  ? `+${Math.round(spent - effectiveMaxSpending).toLocaleString("fr-FR")} € dépassés`
                  : `${percentage}% dépensés`}
              </span>
            </div>

            {/* Double indicateur : Montant dépense autorisée vs Montant préservé visé */}
            <div className="text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-neutral-400 font-sans truncate mt-1">
              Objectif : garder{" "}
              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                {effectiveTargetPercent}%
              </span>{" "}
              ({effectiveTargetRemaining.toFixed(0)} €) · Limite :{" "}
              <span className="tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                {effectiveMaxSpending.toFixed(0)} €
              </span>
            </div>
          </>
        )}
      </div>

      {/* Bas de carte : Barre de progression des dépenses réelles par rapport au budget dépensable max */}
      <div className="mt-2 sm:mt-2.5 w-full shrink-0">
        <div className="h-2 sm:h-2.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
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
                  : "bg-zinc-900 dark:bg-white"
            )}
          />
        </div>
      </div>
    </div>
  );
}

function editModeClass(isActive: boolean): string {
  return isActive
    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-semibold"
    : "text-zinc-500 dark:text-neutral-400 hover:text-zinc-900 dark:hover:text-white";
}
