"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Pencil, Check } from "lucide-react";
import clsx from "clsx";

interface MonthlyLimitCardProps {
  expenses: number;
  categoryBudgets?: Record<string, number>;
  incomeSettings?: {
    salary?: number;
    aids?: number;
    savingsGoal?: number;
  };
  onOpenBudgetSettings?: () => void;
  className?: string;
}

export function MonthlyLimitCard({
  expenses = 0,
  categoryBudgets = {},
  incomeSettings = {},
  onOpenBudgetSettings,
  className = "",
}: MonthlyLimitCardProps) {
  // Calcul du plafond effectif
  const totalCategoryBudgets = Object.values(categoryBudgets).reduce((a, b) => a + b, 0);
  const salaryBasedLimit = (incomeSettings.salary || 0) + (incomeSettings.aids || 0) - (incomeSettings.savingsGoal || 0);
  const defaultLimit = 2200;

  const [customLimit, setCustomLimit] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("krona_monthly_spending_limit");
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val > 0) setCustomLimit(val);
      }
    } catch (e) {}
  }, []);

  const effectiveLimit = customLimit && customLimit > 0
    ? customLimit
    : (totalCategoryBudgets > 0 ? totalCategoryBudgets : (salaryBasedLimit > 0 ? salaryBasedLimit : defaultLimit));

  const spent = Math.max(0, expenses);
  const percentage = effectiveLimit > 0 ? Math.round((spent / effectiveLimit) * 100) : 0;
  const isOverLimit = spent > effectiveLimit;

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(effectiveLimit.toString());
    setIsEditing(true);
  };

  const handleSaveEdit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed) && parsed > 0) {
      setCustomLimit(parsed);
      try {
        localStorage.setItem("krona_monthly_spending_limit", parsed.toString());
      } catch (err) {}
    }
    setIsEditing(false);
  };

  return (
    <div className={clsx(
      "bg-white dark:bg-zinc-900/50 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl shadow-sm flex flex-col justify-between p-3 sm:p-3.5 xl:p-4 transition-all duration-200 overflow-hidden",
      className
    )}>
      {/* En-tête : Titre à gauche, bouton pastille d'action à droite (identique au gabarit KPI) */}
      <div className="flex justify-between items-start shrink-0">
        <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-neutral-400 font-sans truncate">
          Plafond mensuel
        </span>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isEditing ? (
            <button
              type="button"
              onClick={handleSaveEdit}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center bg-zinc-900 dark:bg-white text-white dark:text-black transition-transform active:scale-95 cursor-pointer shadow-sm"
              title="Valider"
              aria-label="Valider le montant"
            >
              <Check size={13} strokeWidth={2.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center bg-zinc-100 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-zinc-600 dark:text-neutral-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/[0.08] transition-all active:scale-95 cursor-pointer"
              title="Ajuster le plafond"
              aria-label="Ajuster le plafond"
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Milieu : Chiffre clé et libellé associé */}
      <div className="flex flex-col my-auto">
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="flex items-center gap-2 py-0.5">
            <span className="text-xs text-zinc-500 dark:text-neutral-400 font-sans">Nouveau :</span>
            <div className="relative w-24">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
                className="w-full pl-2 pr-5 py-0.5 text-xs font-semibold rounded-lg bg-neutral-100 dark:bg-white/[0.06] border border-border text-foreground tabular-nums outline-none focus:ring-1 focus:ring-foreground/20 font-sans"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 dark:text-neutral-400 font-sans">€</span>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white tabular-nums font-sans">
                {spent.toFixed(0)} €
              </div>
              <span className={clsx(
                "text-[10px] sm:text-xs font-medium tabular-nums font-sans",
                isOverLimit ? "text-rose-500 font-semibold" : "text-zinc-500 dark:text-neutral-400"
              )}>
                {percentage}%
              </span>
            </div>
            <div className="text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-neutral-400 font-sans truncate mt-0.5">
              dépensés sur <span className="tabular-nums font-medium text-zinc-700 dark:text-neutral-300">{effectiveLimit.toFixed(0)} €</span>
            </div>
          </>
        )}
      </div>

      {/* Bas de carte : Barre de progression épaissie (h-2 / h-2.5) ancrée en bas avec marge aérée */}
      <div className="mt-2 sm:mt-2.5 w-full shrink-0">
        <div className="h-2 sm:h-2.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, percentage)}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
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
