"use client";

import { useEffect, useState, useMemo } from "react";
import { Repeat, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Transaction = {
  id: string;
  name: string;
  type: string;
  amount: number;
  date: string;
  month: string;
  isInternalTransfer?: boolean;
};

const EXCLUDED_KEYWORDS = ["monoprix", "franprix", "carrefour", "boulangerie", "auchan", "leclerc", "intermarche", "lidl", "aldi", "casino", "ratp", "sncf", "uber", "bolt", "freenow", "taxi", "velib", "deliveroo", "ubereats", "just eat", "mcdonalds", "burger king", "kfc"];

export function detectSubscriptions(transactions: Transaction[], ignoredList: string[] = []): Set<string> {
  const byMerchant = new Map<string, Transaction[]>();
  
  transactions.forEach(tx => {
    if (tx.amount >= 0) return;
    const nameLower = tx.name.toLowerCase();
    if (EXCLUDED_KEYWORDS.some(kw => nameLower.includes(kw))) return;
    if (tx.type === "Alimentation & Courses" || tx.type === "Restos & Fast-Food" || tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer) return;
    if (!byMerchant.has(tx.name)) {
      byMerchant.set(tx.name, []);
    }
    byMerchant.get(tx.name)!.push(tx);
  });

  const subs = new Set<string>();

  for (const [merchant, txs] of byMerchant.entries()) {
    if (ignoredList.includes(merchant)) continue;
    
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

export function SubscriptionManager({ transactions, onIgnore }: { transactions: Transaction[], onIgnore: (merchantName: string) => void }) {
  const [ignoredList, setIgnoredList] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    const ignored = JSON.parse(localStorage.getItem("krona_ignored_subscriptions") || "[]");
    setIgnoredList(ignored);
  }, []);

  const handleIgnore = (merchant: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const updated = [...ignoredList, merchant];
    setIgnoredList(updated);
    localStorage.setItem("krona_ignored_subscriptions", JSON.stringify(updated));
    onIgnore(merchant);
  };

  const activeSubs = useMemo(() => {
    const subMerchants = detectSubscriptions(transactions, ignoredList);
    const map = new Map<string, { name: string, amount: number, type: string, date: string }>();
    
    transactions.forEach(tx => {
      if ((subMerchants.has(tx.name) || tx.type === "Abonnements & Forfaits") && !ignoredList.includes(tx.name)) {
        if (!map.has(tx.name)) {
          map.set(tx.name, { name: tx.name, amount: Math.abs(tx.amount), type: tx.type, date: tx.date });
        } else {
          // Keep the latest transaction amount
          const existing = map.get(tx.name)!;
          if (new Date(tx.date) > new Date(existing.date)) {
            existing.amount = Math.abs(tx.amount);
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
    <div className="flex flex-col h-full min-h-0 bg-neutral-50/50 dark:bg-white/[0.02] rounded-3xl p-5 md:p-6 gap-6 border border-border">
      <div className="bg-card rounded-2xl p-5 md:p-6 shadow-sm border border-border flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-sm font-medium text-neutral-400 mb-1">Total mensuel engagé</h2>
          <div className="text-3xl font-semibold text-foreground tabular-nums">
            {totalMonthly.toFixed(2)} € <span className="text-sm font-normal text-neutral-500">/ mois</span>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-sm font-medium text-neutral-400 mb-1">Projection annuelle</h2>
          <div className="text-lg font-medium text-foreground tabular-nums">
            ~{totalYearly.toFixed(0)} € <span className="text-sm font-normal text-neutral-500">/ an</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto no-scrollbar pb-6 pr-1">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">Abonnements actifs ({activeSubs.length})</h3>
        <div className="space-y-3">
          <AnimatePresence>
            {activeSubs.map((sub) => (
              <motion.div
                layout
                key={sub.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, type: "spring", bounce: 0, opacity: { duration: 0.1 } }}
                className="bg-card rounded-2xl p-4 flex items-center justify-between border border-border hover:border-black/10 dark:hover:border-white/20 group transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0 pr-4">
                  <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/[0.08] flex items-center justify-center text-foreground shrink-0">
                    <Repeat size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground text-sm truncate" title={sub.name}>{sub.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{sub.type}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium text-foreground tabular-nums text-sm">{sub.amount.toFixed(2)} €</span>
                  <button 
                    type="button"
                    onClick={(e) => handleIgnore(sub.name, e)}
                    className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none active:scale-95 cursor-pointer"
                    title="Ce n'est pas un abonnement"
                    aria-label={`Ignorer ${sub.name}`}
                  >
                    <EyeOff size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {activeSubs.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-400">
              <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/[0.04] border border-border flex items-center justify-center mb-3 text-neutral-400">
                <Repeat size={18} />
              </div>
              <p className="text-sm font-medium text-foreground">Aucun abonnement détecté</p>
              <p className="text-xs text-neutral-500 mt-0.5">Les récurrences automatiques apparaîtront ici</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
