"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import clsx from "clsx";

import { Transaction, isSubscriptionCategory } from "../lib/types";

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
  selectedMonth?: string;
  onOpenSettings?: () => void;
  className?: string;
}

export function RealDisposableIncomeCard({
  income = 0,
  incomeSettings = {},
  transactions = [],
  activeSubscriptions = [],
  subs = 0,
  selectedMonth,
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
      else if (
        (isSubscriptionCategory(tx.type) || tx.isSubscription) &&
        tx.isSubscription !== false &&
        tx.isRecurring !== false
      ) {
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

    // Priorité aux charges configurées manuellement par l'utilisateur si définies (permet 0 € explicite)
    const rent = (incomeSettings.rent !== undefined && incomeSettings.rent !== null) ? incomeSettings.rent : autoRent;
    const loans = (incomeSettings.loans !== undefined && incomeSettings.loans !== null) ? incomeSettings.loans : autoLoans;
    const regularUtilities = (incomeSettings.utilities !== undefined && incomeSettings.utilities !== null) ? incomeSettings.utilities : autoUtilities;

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
    <div 
      onClick={onOpenSettings}
      className={clsx(
        "bg-card border border-border rounded-2xl shadow-sm flex flex-col justify-between p-3.5 sm:p-4 xl:p-4.5 transition-all duration-200 overflow-hidden cursor-pointer group active:scale-[0.995]",
        className
      )}
    >
      {/* En-tête : Titre à gauche, bouton pastille d'action à droite (identique au gabarit KPI) */}
      <div className="flex justify-between items-start shrink-0">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200 font-sans truncate">
          Budget de départ
        </span>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border group-hover:border-black/20 dark:group-hover:border-white/20 text-muted-foreground group-hover:text-foreground transition-all duration-200 shrink-0"
            aria-label="Ajuster les revenus et charges incompressibles"
          >
            <Coins size={15} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {/* Milieu : Chiffre clé et libellé associé */}
      <div className="flex flex-col my-auto">
        <div className="flex items-baseline justify-between gap-2">
          <div className={clsx(
            "text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight tabular-nums font-sans",
            isHealthy ? "text-foreground" : "text-rose-500"
          )}>
            {disposableIncome.toFixed(0)} €
          </div>
          <span className="text-[10px] sm:text-xs font-medium text-muted-foreground tabular-nums font-sans">
            {fixedRatio}% engagés
          </span>
        </div>
        <div className="text-[10px] sm:text-xs font-medium text-muted-foreground font-sans truncate mt-0.5">
          pour vivre · <span className="tabular-nums font-medium text-foreground">{fixedBreakdown.total.toFixed(0)} €</span> de charges fixes
        </div>
      </div>

      {/* Bas de carte : Barre de progression segmentée (h-2 / h-2.5) avec découpe nette et coins arrondis */}
      <div className="mt-2 sm:mt-2.5 w-full shrink-0">
        <div className="w-full relative h-2 sm:h-2.5 bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{ transformOrigin: "left" }}
            transition={{
              duration: 0.9,
              ease: [0.16, 1, 0.3, 1], // easeOutExpo sur 900ms
            }}
            className="w-full h-full flex items-center gap-1 sm:gap-1.5"
          >
            {fixedBreakdown.rent > 0 && (
              <div
                style={{ flex: `${fixedBreakdown.rent} 1 0%` }}
                className="h-full rounded-full min-w-[6px] bg-foreground transition-colors"
              />
            )}
            {fixedBreakdown.loans > 0 && (
              <div
                style={{ flex: `${fixedBreakdown.loans} 1 0%` }}
                className="h-full rounded-full min-w-[6px] bg-foreground/80 transition-colors"
              />
            )}
            {fixedBreakdown.subscriptions > 0 && (
              <div
                style={{ flex: `${fixedBreakdown.subscriptions} 1 0%` }}
                className="h-full rounded-full min-w-[6px] bg-foreground/50 transition-colors"
              />
            )}
            {fixedBreakdown.regularUtilities > 0 && (
              <div
                style={{ flex: `${fixedBreakdown.regularUtilities} 1 0%` }}
                className="h-full rounded-full min-w-[6px] bg-foreground/30 transition-colors"
              />
            )}
            {disposableIncome > 0 && (
              <div
                style={{ flex: `${disposableIncome} 1 0%` }}
                className="h-full rounded-full min-w-[10px] bg-black/[0.08] dark:bg-white/10 transition-colors"
              />
            )}
            {disposableIncome < 0 && (
              <div
                style={{ flex: `${Math.abs(disposableIncome)} 1 0%` }}
                className="h-full rounded-full min-w-[6px] bg-rose-500"
              />
            )}
            {/* Si aucune charge et aucun revenu configuré, afficher le track vide neutre */}
            {fixedBreakdown.total === 0 && disposableIncome <= 0 && (
              <div className="h-full w-full rounded-full bg-neutral-100 dark:bg-white/[0.06]" />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export const StartingBudgetCard = RealDisposableIncomeCard;

