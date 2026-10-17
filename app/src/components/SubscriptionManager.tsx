"use client";

import { useEffect, useState, useMemo } from "react";
import { Repeat, EyeOff, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Transaction, isSubscriptionCategory } from "../lib/types";

const EXCLUDED_KEYWORDS = ["monoprix", "franprix", "carrefour", "boulangerie", "auchan", "leclerc", "intermarche", "lidl", "aldi", "casino", "ratp", "sncf", "uber", "bolt", "freenow", "taxi", "velib", "deliveroo", "ubereats", "just eat", "mcdonalds", "burger king", "kfc"];

export function detectSubscriptions(transactions: Transaction[], ignoredList: string[] = []): Set<string> {
  const byMerchant = new Map<string, Transaction[]>();
  
  transactions.forEach(tx => {
    if (tx.amount >= 0) return;
    if (tx.isSubscription === false || tx.isRecurring === false) return;
    if (ignoredList.includes(tx.name)) return;
    const nameLower = tx.name.toLowerCase();
    const isExplicitSub = tx.isSubscription === true || nameLower.includes("navigo") || nameLower.includes("pass ratp");
    if (!isExplicitSub && EXCLUDED_KEYWORDS.some(kw => nameLower.includes(kw))) return;
    if (tx.type === "Alimentation & Courses" || tx.type === "Restos & Fast-Food" || tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer) return;
    if (!isSubscriptionCategory(tx.type) && !tx.isSubscription && !isExplicitSub) return;

    if (!byMerchant.has(tx.name)) {
      byMerchant.set(tx.name, []);
    }
    byMerchant.get(tx.name)!.push(tx);
  });

  const subs = new Set<string>();

  for (const [merchant, txs] of byMerchant.entries()) {
    if (ignoredList.includes(merchant)) continue;
    
    // Si la transaction est explicitement marquée ou est un pass Navigo, l'accepter même sur 1 seul mois
    const hasExplicit = txs.some(t => t.isSubscription === true || t.name.toLowerCase().includes("navigo"));
    if (hasExplicit) {
      subs.add(merchant);
      continue;
    }

    const sorted = txs.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sorted.length < 2) continue;
    
    let isSub = false;
    for (let i = 0; i < sorted.length - 1; i++) {
      const tx1 = sorted[i];
      const tx2 = sorted[i+1];
      
      const t1 = new Date(tx1.date).getTime();
      const t2 = new Date(tx2.date).getTime();
      const daysDiff = Math.abs(t2 - t1) / (1000 * 60 * 60 * 24);
      
      if (daysDiff >= 26 && daysDiff <= 33) {
        const amt1 = Math.abs(tx1.amount);
        const amt2 = Math.abs(tx2.amount);
        const diff = Math.abs(amt1 - amt2);
        
        // Variation < 2% or gap < 0.50€
        if (diff < 0.50 || (diff / Math.max(amt1, amt2)) < 0.02) {
          isSub = true;
          break;
        }
      }
    }
    if (isSub) subs.add(merchant);
  }
  return subs;
}

export function SubscriptionManager({ 
  transactions, 
  onIgnore,
  onRestore,
  ignoredList: propIgnoredList,
}: { 
  transactions: Transaction[]; 
  onIgnore: (merchantName: string) => void;
  onRestore?: (merchantName: string) => void;
  ignoredList?: string[];
}) {
  const [ignoredList, setIgnoredList] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    if (propIgnoredList) {
      setIgnoredList(propIgnoredList);
    } else {
      try {
        const ignored = JSON.parse(localStorage.getItem("krona_ignored_subscriptions") || "[]");
        setIgnoredList(ignored);
      } catch (e) {
        setIgnoredList([]);
      }
    }
  }, [propIgnoredList]);

  const handleIgnore = (merchant: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = Array.from(new Set([...ignoredList, merchant]));
    setIgnoredList(updated);
    try {
      localStorage.setItem("krona_ignored_subscriptions", JSON.stringify(updated));
    } catch (err) {}
    onIgnore(merchant);
  };

  const handleRestore = (merchant: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = ignoredList.filter(m => m !== merchant);
    setIgnoredList(updated);
    try {
      localStorage.setItem("krona_ignored_subscriptions", JSON.stringify(updated));
    } catch (err) {}
    onRestore?.(merchant);
  };

  const activeSubs = useMemo(() => {
    const subMerchants = detectSubscriptions(transactions, ignoredList);
    const map = new Map<string, { name: string, amount: number, type: string, date: string }>();
    
    transactions.forEach(tx => {
      if (tx.amount >= 0) return;
      const isEligible = (isSubscriptionCategory(tx.type) || tx.isSubscription || subMerchants.has(tx.name))
        && tx.isSubscription !== false
        && tx.isRecurring !== false
        && !ignoredList.includes(tx.name);

      if (isEligible) {
        if (!map.has(tx.name)) {
          map.set(tx.name, { name: tx.name, amount: Math.abs(tx.amount), type: tx.type, date: tx.date });
        } else {
          // Keep the latest transaction amount
          const existing = map.get(tx.name)!;
          if (new Date(tx.date) > new Date(existing.date)) {
            existing.amount = Math.abs(tx.amount);
            existing.type = tx.type;
            existing.date = tx.date;
          }
        }
      }
    });
    
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [transactions, ignoredList]);

  const totalMonthly = activeSubs.reduce((acc, sub) => acc + sub.amount, 0);
  const totalYearly = totalMonthly * 12;

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full min-h-0 gap-6">
      {/* Summary Hero */}
      <div className="bg-card rounded-2xl p-5 border border-border shadow-xs flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Total mensuel engagé</h2>
          <div className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-foreground tabular-nums font-sans">
            {totalMonthly.toFixed(2)} € <span className="text-xs font-normal text-muted-foreground">/ mois</span>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Projection annuelle</h2>
          <div className="text-base sm:text-lg font-medium text-foreground tabular-nums font-sans">
            ~{totalYearly.toFixed(0)} € <span className="text-xs font-normal text-muted-foreground">/ an</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto no-scrollbar pb-6 pr-1 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] font-sans">
              Abonnements actifs · {activeSubs.length}
            </h3>
            <span className="text-[11px] text-muted-foreground font-sans">Détectés automatiquement</span>
          </div>
          
          <div className="space-y-2.5">
            <AnimatePresence>
              {activeSubs.map((sub) => (
                <motion.div
                  layout
                  key={sub.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25, type: "spring", bounce: 0 }}
                  className="bg-card hover:bg-black/[0.02] dark:hover:bg-white/[0.03] rounded-2xl p-3.5 flex items-center justify-between border border-border group transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5 min-w-0 pr-4">
                    <div className="w-9 h-9 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-border flex items-center justify-center text-foreground shrink-0">
                      <Repeat size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground text-sm truncate font-sans tracking-tight">{sub.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate font-sans">{sub.type}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-medium text-foreground tabular-nums text-sm font-sans">{sub.amount.toFixed(2)} €</span>
                    <button 
                      type="button"
                      onClick={(e) => handleIgnore(sub.name, e)}
                      className="p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/15 rounded-full transition-all opacity-60 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none active:scale-90 cursor-pointer"
                      aria-label={`Ignorer ${sub.name}`}
                      title="Masquer cet abonnement"
                    >
                      <EyeOff size={15} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {activeSubs.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground bg-card rounded-2xl border border-border">
                <div className="w-10 h-10 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-border flex items-center justify-center mb-3 text-muted-foreground">
                  <Repeat size={16} />
                </div>
                <p className="text-sm font-medium text-foreground font-sans">Aucun abonnement actif</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-sans">Les récurrences automatiques apparaîtront ici</p>
              </div>
            )}
          </div>
        </div>

        {/* Abonnements masqués */}
        {ignoredList.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] font-sans">
                Abonnements masqués · {ignoredList.length}
              </h3>
              <span className="text-[11px] text-muted-foreground font-sans">
                Exclus du calcul des charges récurrentes
              </span>
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {ignoredList.map((merchant) => (
                  <motion.div
                    key={merchant}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2, type: "spring", bounce: 0 }}
                    className="bg-card rounded-2xl p-3 flex items-center justify-between border border-border transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-3">
                      <div className="w-9 h-9 rounded-full bg-black/[0.04] dark:bg-white/[0.05] border border-border flex items-center justify-center text-muted-foreground shrink-0">
                        <EyeOff size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground text-sm truncate font-sans">
                          {merchant}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate font-sans">
                          Masqué des abonnements
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleRestore(merchant, e)}
                      className="h-7 px-3 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 text-foreground text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0 border border-border font-sans"
                      aria-label={`Restaurer ${merchant}`}
                    >
                      <Eye size={13} className="text-muted-foreground" />
                      <span>Restaurer</span>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
