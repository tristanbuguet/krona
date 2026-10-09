"use client";

import React from "react";
import { Sparkles } from "lucide-react";

export interface AiInsightItem {
  id: string;
  badge?: string;
  description: string;
  type?: "positive" | "neutral" | "warning" | "tip";
}

export interface AiInsightsCardProps {
  insights?: AiInsightItem[];
  income?: number;
  expenses?: number;
  balance?: number;
  subs?: number;
  projectedSavings?: number;
  className?: string;
}

export function AiInsightsCard({
  income = 0,
  balance = 0,
  subs = 0,
  projectedSavings,
  className = "",
}: AiInsightsCardProps) {
  // Calcul dynamique de l'épargne estimée en fin de mois
  const savingsAmount = typeof projectedSavings === "number" && !isNaN(projectedSavings)
    ? Math.round(projectedSavings)
    : (balance !== 0 ? Math.round(balance) : 420);
  const isPositiveSavings = savingsAmount >= 0;
  const formattedSavings = `${isPositiveSavings ? "+" : ""}${savingsAmount} €`;

  // Calcul dynamique du ratio des charges fixes (abonnements / revenus)
  const fixedCostRatio = income > 0
    ? Math.max(1, Math.round((subs / income) * 100))
    : 2;

  return (
    <div className={`bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col p-6 overflow-hidden ${className}`}>
      {/* En-tête standardisée */}
      <div className="flex justify-between items-start shrink-0">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">
            Analyse & Conseils
          </h3>
          <div className="text-xs text-neutral-400 mt-0.5 font-sans">
            Recommandations pour optimiser ton mois
          </div>
        </div>
        <div className="flex items-center shrink-0">
          <span className="text-xs font-medium text-neutral-400 mr-2.5 flex items-center font-sans tracking-wide">
            IA Krona
          </span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 shrink-0 group transition-colors cursor-pointer hover:border-black/20 dark:hover:border-white/[0.15]">
            <svg 
              viewBox="0 0 48 48" 
              fill="none" 
              className="w-4 h-4 text-neutral-400 group-hover:text-foreground dark:group-hover:text-white transition-colors"
              xmlns="http://www.w3.org/2000/svg"
            >
              <mask id="mask_krona_ai" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
                <rect width="48" height="48" fill="#D9D9D9"/>
              </mask>
              <g mask="url(#mask_krona_ai)">
                <path d="M23.2335 4.16299L31.7073 4.15991C31.4734 5.06138 31.1832 6.09483 30.8764 6.97572C30.1612 9.01702 29.2238 10.9732 28.0811 12.809C23.2291 20.5663 15.0014 24.8882 6.19107 26.485C6.55881 26.498 7.66306 26.3771 8.06439 26.3262C12.1265 25.812 16.0894 24.5393 19.7264 22.6791C27.3158 18.7973 32.5755 12.27 35.1642 4.16286L41.8804 4.16192L41.8784 8.71949C41.8778 10.2935 42.023 10.2165 41.3689 11.6459C37.9432 19.1315 30.5631 23.7696 23.0482 26.3872C20.5489 27.2392 17.9961 27.9243 15.4064 28.4386C15.8156 28.4593 16.3174 28.4463 16.7327 28.4461L19.0955 28.444C19.3018 28.4453 19.6022 28.4513 19.8052 28.4373C20.2254 28.4084 20.7343 28.2817 21.1481 28.1845C22.0767 27.9662 22.9981 27.7181 23.9109 27.4407C30.6382 25.4471 37.1473 22.1025 41.8911 16.8256C41.8668 17.1161 41.8804 17.5995 41.8804 17.9052L41.881 19.833C41.881 22.145 41.912 24.5319 41.881 26.8364C41.4741 27.2215 40.9507 27.6181 40.5006 27.9508C38.1977 29.6266 35.64 30.9189 32.926 31.7778C32.0348 32.0631 31.0969 32.2797 30.1875 32.4927C30.3673 32.5002 30.5666 32.4996 30.7471 32.4959C31.8072 32.4746 32.8894 32.5276 33.9465 32.4877C34.1433 32.9524 34.3337 33.5115 34.5164 33.9912L35.5438 36.6707L38.022 43.1516C37.126 43.1673 36.1987 43.1559 35.3009 43.1561L30.3568 43.1568C30.0538 42.5296 29.7815 41.8759 29.503 41.2375L28.3274 38.5546C27.663 37.0299 26.9362 35.4697 26.3006 33.9391L5.89478 33.9395L5.89686 22.9505C11.2806 21.8278 16.1931 19.0601 19.3992 14.5111C21.536 11.4794 22.8502 7.84619 23.2335 4.16299Z" fill="none" stroke="currentColor" strokeWidth={1.5} />
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Corps stat-driven avec chiffres mis en valeur en grille 2x2 */}
      <div className="flex-1 overflow-y-auto no-scrollbar mt-4 flex flex-col justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
          {/* Tuile 1 — Trajectoire & Épargne */}
          <div className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between transition-all duration-200">
            <div>
              <span className="text-xs text-neutral-400 font-medium font-sans block mb-2">
                Trajectoire du mois
              </span>
              <div className={`text-2xl font-semibold tracking-tight tabular-nums font-sans ${
                isPositiveSavings ? "text-white" : "text-rose-500"
              }`}>
                {formattedSavings}
              </div>
            </div>
            <p className="text-xs text-neutral-400 mt-1 leading-snug font-sans">
              À ce rythme quotidien, ton épargne nette restera positive en fin de mois.
            </p>
          </div>

          {/* Tuile 2 — Charges fixes */}
          <div className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between transition-all duration-200">
            <div>
              <span className="text-xs text-neutral-400 font-medium font-sans block mb-2">
                Charges fixes & Abonnements
              </span>
              <div className="text-2xl font-semibold tracking-tight tabular-nums font-sans text-white">
                {fixedCostRatio}%
              </div>
            </div>
            <p className="text-xs text-neutral-400 mt-1 leading-snug font-sans">
              Tes abonnements pèsent très peu sur tes revenus, un niveau optimal.
            </p>
          </div>

          {/* Tuile 3 — Poste dominant (Top catégorie) */}
          <div className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between transition-all duration-200">
            <div>
              <span className="text-xs text-neutral-400 font-medium font-sans block mb-2">
                Poste principal
              </span>
              <div className="text-xl font-semibold tracking-tight tabular-nums font-sans text-white flex items-baseline gap-2">
                Transports <span className="text-lg text-neutral-400 font-medium">428 €</span>
              </div>
            </div>
            <p className="text-xs text-neutral-400 mt-1 leading-snug font-sans">
              Représente 59% de l'ensemble de tes dépenses sur la période.
            </p>
          </div>

          {/* Tuile 4 — Opportunité d'optimisation */}
          <div className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between transition-all duration-200">
            <div>
              <span className="text-xs text-neutral-400 font-medium font-sans block mb-2">
                Marge d'optimisation
              </span>
              <div className="text-2xl font-semibold tracking-tight tabular-nums font-sans text-emerald-400">
                ~85 €
              </div>
            </div>
            <p className="text-xs text-neutral-400 mt-1 leading-snug font-sans">
              Potentiel d'économie identifié sur les sorties et petits débits récurrents.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
