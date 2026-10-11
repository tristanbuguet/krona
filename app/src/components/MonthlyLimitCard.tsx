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
      "bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col justify-between p-4 sm:p-5 transition-all duration-200",
      className
    )}>
      {/* En-tête : Titre et action crayon strictement harmonisés */}
      <div className="flex justify-between items-start shrink-0">
        <div className="min-w-0 pr-2">
          <h3 className="text-base font-semibold tracking-tight text-foreground font-sans truncate">
            Plafond mensuel
          </h3>
          <div className="text-xs text-neutral-400 mt-0.5 font-sans truncate">
            Limite globale de dépenses
          </div>
        </div>

        {/* Action discrète format w-8 h-8 identique aux autres cartes */}
        <div className="shrink-0">
          {isEditing ? (
            <button
              type="button"
              onClick={handleSaveEdit}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-black text-white dark:bg-white dark:text-black transition-transform active:scale-95 cursor-pointer shadow-sm"
              title="Valider"
              aria-label="Valider le montant"
            >
              <Check size={14} strokeWidth={2.5} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 hover:text-foreground dark:hover:text-white hover:border-black/20 dark:hover:border-white/[0.15] transition-all active:scale-95 cursor-pointer"
              title="Ajuster le plafond"
              aria-label="Ajuster le plafond"
            >
              <Pencil size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Contenu compact : Métrique & Jauge fine */}
      <div className="mt-4">
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="flex items-center gap-2 mb-2">
            <span className="text-xs text-neutral-400 font-sans">Nouveau plafond :</span>
            <div className="relative w-28">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
                className="w-full pl-2 pr-6 py-0.5 text-sm font-semibold rounded-lg bg-neutral-100 dark:bg-white/[0.06] border border-border text-foreground tabular-nums outline-none focus:ring-1 focus:ring-foreground/20 font-sans"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400 font-sans">€</span>
            </div>
          </form>
        ) : (
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-foreground font-sans">
                {spent.toFixed(0)} €
              </span>
              <span className="text-xs text-neutral-400 font-sans">dépensés</span>
            </div>
            <div className="text-right">
              <span className="text-xs sm:text-sm font-medium text-neutral-400 tabular-nums font-sans">
                sur {effectiveLimit.toFixed(0)} €
              </span>
            </div>
          </div>
        )}

        {/* Jauge horizontale fine style Apple */}
        <div className="h-1.5 w-full bg-black/5 dark:bg-white/[0.06] rounded-full overflow-hidden relative">
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
                  : "bg-neutral-900 dark:bg-white"
            )}
          />
        </div>
      </div>
    </div>
  );
}
