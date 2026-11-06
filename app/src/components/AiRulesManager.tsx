"use client";

import { useState, useMemo } from "react";
import { Search, Trash2, Sparkles, Repeat, ArrowRightLeft, Tag } from "lucide-react";
import {
  OFFICIAL_CATEGORIES,
  CATEGORY_COLORS,
  LearningRuleMap,
  LearningRuleItem,
} from "../lib/types";

interface AiRulesManagerProps {
  learningRules: LearningRuleMap;
  onUpdateRule: (merchantKey: string, newCategory: string) => void;
  onDeleteRule: (merchantKey: string) => void;
}

export function AiRulesManager({
  learningRules,
  onUpdateRule,
  onDeleteRule,
}: AiRulesManagerProps) {
  const [search, setSearch] = useState("");

  const ruleEntries = useMemo(() => {
    return Object.entries(learningRules)
      .map(([merchantKey, rule]) => ({
        merchantKey,
        ...rule,
      }))
      .filter((item) => {
        const cat = item.categorie || "";
        return cat.trim().length > 0 && cat !== "Autre";
      })
      .sort((a, b) => {
        const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return timeB - timeA;
      });
  }, [learningRules]);

  const filteredRules = useMemo(() => {
    if (!search.trim()) return ruleEntries;
    const query = search.toLowerCase().trim();
    return ruleEntries.filter((item) => {
      const nameMatch = item.merchantKey.toLowerCase().includes(query);
      const catMatch = (item.categorie || "").toLowerCase().includes(query);
      return nameMatch || catMatch;
    });
  }, [ruleEntries, search]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 max-w-3xl mx-auto w-full gap-5">
      {/* En-tête de section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-base sm:text-lg font-semibold tracking-[-0.015em] text-foreground font-sans flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500 shrink-0" />
            Mémoire de l'IA & Règles
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 font-sans">
            Règles personnalisées apprises lors de vos corrections de catégories. Elles sont prioritaires sur l'IA et vos futurs imports.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border text-xs font-medium text-muted-foreground shrink-0 self-start sm:self-auto">
          <span>{ruleEntries.length} règle{ruleEntries.length > 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Barre de recherche */}
      {ruleEntries.length > 0 && (
        <div className="relative shrink-0">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un commerçant ou une catégorie..."
            className="w-full h-9 pl-9 pr-4 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all font-sans"
          />
        </div>
      )}

      {/* Liste des règles */}
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
        {filteredRules.length === 0 ? (
          <div className="p-8 text-center bg-card rounded-2xl border border-dashed border-border flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
              <Sparkles size={20} />
            </div>
            <p className="text-sm font-medium text-foreground">
              {search.trim() ? "Aucune règle ne correspond à votre recherche" : "Aucune règle mémorisée pour l'instant"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {search.trim()
                ? "Essayez avec d'autres termes de recherche."
                : "Dès que vous modifiez la catégorie d'une opération, Krona mémorise automatiquement votre choix pour ce commerçant."}
            </p>
          </div>
        ) : (
          filteredRules.map((rule) => {
            const catColor = CATEGORY_COLORS[rule.categorie] || {
              dot: "bg-zinc-400",
              bgSoft: "bg-zinc-500/10",
              textSoft: "text-zinc-400",
              ring: "#71717A",
              fill: "bg-zinc-500",
            };

            return (
              <div
                key={rule.merchantKey}
                className="p-3.5 bg-card hover:bg-neutral-50 dark:hover:bg-white/[0.02] border border-border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                {/* Libellé et métadonnées */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground truncate">
                      {rule.merchantKey}
                    </span>
                    {rule.isSubscription && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        <Repeat size={10} /> Abonnement
                      </span>
                    )}
                    {rule.isInternalTransfer && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
                        <ArrowRightLeft size={10} /> Virement interne
                      </span>
                    )}
                    {rule.source === "user_manual" && (
                      <span className="text-[10px] text-muted-foreground/70">
                        · Choix manuel
                      </span>
                    )}
                  </div>
                  {rule.updatedAt && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Mis à jour le {new Date(rule.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  )}
                </div>

                {/* Sélecteur de catégorie et bouton suppression */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <select
                      value={rule.categorie}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        if (newCat && newCat !== rule.categorie) {
                          onUpdateRule(rule.merchantKey, newCat);
                        }
                      }}
                      className="appearance-none text-xs font-medium bg-muted/50 border border-border rounded-xl pl-3 pr-7 py-1.5 outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all text-foreground cursor-pointer"
                    >
                      {OFFICIAL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <div
                      className={`w-2 h-2 rounded-full absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${catColor.dot}`}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteRule(rule.merchantKey)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                    title="Supprimer cette règle"
                    aria-label={`Supprimer la règle pour ${rule.merchantKey}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
