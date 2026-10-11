"use client";

import React, { useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import clsx from "clsx";

interface Transaction {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  month: string;
  isSubscription?: boolean;
  isInternalTransfer?: boolean;
}

interface RealDisposableIncomeCardProps {
  income: number;
  incomeSettings?: {
    salary?: number;
    aids?: number;
    savingsGoal?: number;
    rent?: number;
    loans?: number;
    utilities?: number;
  };
  transactions?: Transaction[];
  activeSubscriptions?: Transaction[];
  subs?: number;
  onOpenSettings?: () => void;
  className?: string;
}

export function RealDisposableIncomeCard({
  income = 0,
  incomeSettings = {},
  transactions = [],
  activeSubscriptions = [],
  subs = 0,
  onOpenSettings,
  className = "",
}: RealDisposableIncomeCardProps) {
  // 1. Détermination du revenu socle (revenus constatés ou configurés)
  const baseIncome = useMemo(() => {
    if (income > 0) return income;
    const configured = (incomeSettings.salary || 0) + (incomeSettings.aids || 0);
    return configured > 0 ? configured : 3200; // Fallback représentatif en mode démo
  }, [income, incomeSettings]);

  // 2. Détection et ventilation automatique des charges incompressibles (fixes)
  const fixedBreakdown = useMemo(() => {
    let autoRent = 0;
    let autoLoans = 0;
    let subscriptions = subs > 0 ? subs : 0;
    let autoUtilities = 0;

    transactions.forEach(tx => {
      if (tx.amount >= 0 || tx.isInternalTransfer || tx.type === "Épargne & Trésorerie") return;
      const abs = Math.abs(tx.amount);
      const nam = tx.name.toLowerCase();

      // Logement, loyer, charges syndic
      if (
        nam.includes("loyer") ||
        nam.includes("bail") ||
        nam.includes("syndic") ||
        nam.includes("propriétaire") ||
        (tx.type === "Logement & Maison" && abs >= 200)
      ) {
        autoRent += abs;
      }
      // Emprunts et crédits
      else if (
        nam.includes("credit") ||
        nam.includes("crédit") ||
        nam.includes("pret") ||
        nam.includes("prêt") ||
        nam.includes("emprunt") ||
        nam.includes("mensualite") ||
        nam.includes("mensualité") ||
        nam.includes("echeance") ||
        nam.includes("échéance")
      ) {
        autoLoans += abs;
      }
      // Abonnements & Forfaits récurrents
      else if (tx.isSubscription || tx.type === "Abonnements & Forfaits") {
        if (subscriptions === 0) subscriptions += abs;
      }
      // Prélèvements fixes récurrents (énergie, mutuelle, assurance)
      else if (
        nam.includes("edf") ||
        nam.includes("engie") ||
        nam.includes("totalenergies") ||
        nam.includes("assurance") ||
        nam.includes("mutuelle") ||
        nam.includes("veolia") ||
        nam.includes("suez") ||
        nam.includes("impots") ||
        nam.includes("impôts")
      ) {
        autoUtilities += abs;
      }
    });

    // Complément abonnements si non détectés dans la boucle
    if (subscriptions === 0 && activeSubscriptions && activeSubscriptions.length > 0) {
      subscriptions = activeSubscriptions.reduce((acc, s) => acc + Math.abs(s.amount), 0);
    }

    // Priorité aux charges configurées manuellement par l'utilisateur si renseignées (> 0)
    const rent = (incomeSettings.rent && incomeSettings.rent > 0) ? incomeSettings.rent : autoRent;
    const loans = (incomeSettings.loans && incomeSettings.loans > 0) ? incomeSettings.loans : autoLoans;
    const regularUtilities = (incomeSettings.utilities && incomeSettings.utilities > 0) ? incomeSettings.utilities : autoUtilities;

    const totalFixed = rent + loans + subscriptions + regularUtilities;

    return {
      rent,
      loans,
      subscriptions,
      regularUtilities,
      total: totalFixed,
    };
  }, [transactions, activeSubscriptions, subs, incomeSettings]);

  // 3. Calcul du budget de départ disponible (revenu disponible réel)
  const disposableIncome = baseIncome - fixedBreakdown.total;
  const fixedRatio = baseIncome > 0 ? Math.min(100, Math.round((fixedBreakdown.total / baseIncome) * 100)) : 0;
  const isHealthy = disposableIncome >= 0;

  return (
    <div className={clsx(
      "bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col justify-between p-4 sm:p-5 transition-all duration-200",
      className
    )}>
      {/* En-tête : Titre strictement aligné et action réglage */}
      <div className="flex justify-between items-start shrink-0">
        <div className="min-w-0 pr-2">
          <h3 className="text-base font-semibold tracking-tight text-foreground font-sans truncate">
            Budget de départ
          </h3>
          <div className="text-xs text-neutral-400 mt-0.5 font-sans truncate">
            Après loyer, prêt & abonnements fixes
          </div>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 hover:text-foreground dark:hover:text-white hover:border-black/20 dark:hover:border-white/[0.15] transition-all active:scale-95 cursor-pointer"
            title="Ajuster les charges incompressibles"
            aria-label="Ajuster les charges incompressibles"
          >
            <SlidersHorizontal size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Contenu compact : Métrique & Jauge fine */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="flex items-baseline gap-1.5">
            <span className={clsx(
              "text-xl sm:text-2xl font-bold tracking-tight tabular-nums font-sans",
              isHealthy ? "text-foreground" : "text-rose-500"
            )}>
              {disposableIncome.toFixed(0)} €
            </span>
            <span className="text-xs text-neutral-400 font-sans">pour vivre</span>
          </div>

          <div className="text-right">
            <span className="text-xs sm:text-sm font-medium text-neutral-400 tabular-nums font-sans">
              {fixedRatio} % engagés
            </span>
          </div>
        </div>

        {/* Jauge fine proportionnelle style Apple */}
        <div className="h-1.5 w-full bg-black/5 dark:bg-white/[0.06] rounded-full overflow-hidden flex">
          {fixedBreakdown.rent > 0 && (
            <div
              style={{ width: `${Math.min(100, (fixedBreakdown.rent / baseIncome) * 100)}%` }}
              className="h-full bg-neutral-900 dark:bg-white transition-all duration-500"
              title={`Loyer : ${fixedBreakdown.rent.toFixed(0)} €`}
            />
          )}
          {fixedBreakdown.loans > 0 && (
            <div
              style={{ width: `${Math.min(100, (fixedBreakdown.loans / baseIncome) * 100)}%` }}
              className="h-full bg-neutral-600 dark:bg-neutral-300 border-l border-card transition-all duration-500"
              title={`Prêt : ${fixedBreakdown.loans.toFixed(0)} €`}
            />
          )}
          {fixedBreakdown.subscriptions > 0 && (
            <div
              style={{ width: `${Math.min(100, (fixedBreakdown.subscriptions / baseIncome) * 100)}%` }}
              className="h-full bg-neutral-400 dark:bg-neutral-400 border-l border-card transition-all duration-500"
              title={`Abonnements : ${fixedBreakdown.subscriptions.toFixed(0)} €`}
            />
          )}
          {fixedBreakdown.regularUtilities > 0 && (
            <div
              style={{ width: `${Math.min(100, (fixedBreakdown.regularUtilities / baseIncome) * 100)}%` }}
              className="h-full bg-neutral-300 dark:bg-neutral-500 border-l border-card transition-all duration-500"
              title={`Prélèvements : ${fixedBreakdown.regularUtilities.toFixed(0)} €`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
