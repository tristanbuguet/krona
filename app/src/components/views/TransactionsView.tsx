"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  X, 
  Filter, 
  ChevronDown, 
  Repeat, 
  ArrowRightLeft, 
  Download, 
  Check, 
  Tag, 
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal
} from "lucide-react";
import { 
  Transaction, 
  OFFICIAL_CATEGORIES, 
  CATEGORY_COLORS, 
  formatAmount, 
  formatMonthLabel,
  isSubscriptionCategory
} from "@/lib/types";
import { PageHeader } from "../ui/PageHeader";

interface TransactionsViewProps {
  transactions: Transaction[];
  onRecategorize: (txId: string, merchantName: string, newCategory: string) => void;
  onSelectMonth?: (month: string) => void;
  isTxSubscription?: (tx: Transaction) => boolean;
  ignoredSubscriptions?: string[];
  initialAccount?: string;
  onSelectAccount?: (account: string) => void;
}

export function TransactionsView({
  transactions,
  onRecategorize,
  isTxSubscription,
  ignoredSubscriptions = [],
  initialAccount = "all",
  onSelectAccount,
}: TransactionsViewProps) {
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | "debit" | "credit" | "subs" | "transfer">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string>(initialAccount || "all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [editingTxId, setEditingTxId] = useState<string | null>(null);

  // Synchronise le filtre de compte externe
  useEffect(() => {
    if (initialAccount) {
      setSelectedAccount(initialAccount);
    }
  }, [initialAccount]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);

  // Available unique accounts
  const accounts = useMemo(() => {
    const list = Array.from(new Set(transactions.map(t => t.account || "BoursoBank")));
    return list.sort();
  }, [transactions]);

  // Available unique months
  const months = useMemo(() => {
    return Array.from(new Set(transactions.map(t => t.month))).sort().reverse();
  }, [transactions]);

  const checkIsSubscription = useCallback((tx: Transaction) => {
    if (isTxSubscription) return isTxSubscription(tx);
    if (!tx || tx.amount >= 0) return false;
    if (ignoredSubscriptions.includes(tx.name)) return false;
    if (tx.isSubscription === false || tx.isRecurring === false) return false;
    return isSubscriptionCategory(tx.type) || tx.isSubscription === true;
  }, [isTxSubscription, ignoredSubscriptions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchesName = tx.name.toLowerCase().includes(query);
        const matchesType = tx.type.toLowerCase().includes(query);
        const matchesAmount = tx.amount.toString().includes(query);
        const matchesAccount = (tx.account || "").toLowerCase().includes(query);
        if (!matchesName && !matchesType && !matchesAmount && !matchesAccount) return false;
      }

      // Type filter
      if (selectedType === "debit" && tx.amount >= 0) return false;
      if (selectedType === "credit" && tx.amount <= 0) return false;
      if (selectedType === "subs") {
        if (!checkIsSubscription(tx)) return false;
      }
      if (selectedType === "transfer" && !tx.isInternalTransfer && tx.type !== "Épargne & Trésorerie") return false;

      // Category filter
      if (selectedCategory !== "all" && tx.type !== selectedCategory) return false;

      // Account filter
      if (selectedAccount !== "all" && (tx.account || "BoursoBank") !== selectedAccount) return false;

      // Month filter
      if (selectedMonth !== "all" && tx.month !== selectedMonth) return false;

      return true;
    });
  }, [transactions, search, selectedType, selectedCategory, selectedAccount, selectedMonth, checkIsSubscription]);

  // Aggregate stats of filtered transactions
  const stats = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    filteredTransactions.forEach(t => {
      if (t.amount > 0) totalCredit += t.amount;
      else totalDebit += Math.abs(t.amount);
    });
    return {
      count: filteredTransactions.length,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      net: Math.round((totalCredit - totalDebit) * 100) / 100,
    };
  }, [filteredTransactions]);

  const handleCategoryChange = (txId: string, merchantName: string, newCat: string) => {
    onRecategorize(txId, merchantName, newCat);
    setEditingTxId(null);
    setToastMessage(`Catégorie mise à jour : ${merchantName} → ${newCat}`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const exportFilteredCSV = () => {
    const headers = ["Date", "Marchand", "Catégorie", "Compte", "Montant"];
    const rows = filteredTransactions.map(t => [
      t.date,
      `"${t.name.replace(/"/g, '""')}"`,
      `"${t.type}"`,
      `"${t.account || "BoursoBank"}"`,
      t.amount.toFixed(2),
    ]);
    const csvContent = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `krona_transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const displayedTransactions = filteredTransactions.slice(0, pageSize);

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full overflow-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed top-20 right-6 z-50 bg-neutral-900/90 dark:bg-black/90 border border-white/[0.1] text-white px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-xl flex items-center gap-2.5 text-xs font-sans"
          >
            <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Check size={12} strokeWidth={3} />
            </div>
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header & Actions */}
      <PageHeader title="Transactions">
        <button
          type="button"
          onClick={exportFilteredCSV}
          className="h-9 px-3.5 rounded-full bg-card hover:bg-black/5 dark:hover:bg-white/[0.1] border border-border text-xs font-medium text-foreground flex items-center gap-2 transition-all active:scale-95 cursor-pointer font-sans shadow-xs"
          aria-label="Exporter en CSV"
        >
          <Download size={14} />
          <span>Exporter CSV</span>
        </button>
      </PageHeader>

      {/* Encapsulated Main Card */}
      <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Controls Bar: Search & Quick Filters (Fixed inside top of card) */}
        <div className="shrink-0 p-4 border-b border-border space-y-3 bg-card">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* Instant Search Bar */}
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par marchand, montant ou catégorie..."
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 transition-all font-sans"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick Selects: Category, Account, Month */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Category Select */}
              <div className="relative shrink-0">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-9 appearance-none bg-black/[0.03] dark:bg-white/[0.04] border border-border text-foreground text-xs font-medium pl-3.5 pr-8 rounded-xl outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 cursor-pointer font-sans"
                >
                  <option value="all" className="bg-card text-foreground">Toutes les catégories</option>
                  {OFFICIAL_CATEGORIES.map(c => (
                    <option key={c} value={c} className="bg-card text-foreground">{c}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>

              {/* Account Select */}
              {accounts.length > 1 && (
                <div className="relative shrink-0">
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="h-9 appearance-none bg-black/[0.03] dark:bg-white/[0.04] border border-border text-foreground text-xs font-medium pl-3.5 pr-8 rounded-xl outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 cursor-pointer font-sans"
                  >
                    <option value="all" className="bg-card text-foreground">Tous les comptes</option>
                    {accounts.map(acc => (
                      <option key={acc} value={acc} className="bg-card text-foreground">{acc}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              )}

              {/* Month Select */}
              {months.length > 1 && (
                <div className="relative shrink-0">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="h-9 appearance-none bg-black/[0.03] dark:bg-white/[0.04] border border-border text-foreground text-xs font-medium pl-3.5 pr-8 rounded-xl outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 cursor-pointer font-sans"
                  >
                    <option value="all" className="bg-card text-foreground">Toutes les dates</option>
                    {months.map(m => (
                      <option key={m} value={m} className="bg-card text-foreground">{formatMonthLabel(m)}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          {/* Filter Pills (All, Debit, Credit, Subs, Transfers) & Metrics */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: "all", label: "Tout" },
                { id: "debit", label: "Dépenses" },
                { id: "credit", label: "Revenus" },
                { id: "subs", label: "Abonnements" },
                { id: "transfer", label: "Virements" },
              ].map(pill => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setSelectedType(pill.id as any)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer font-sans select-none ${
                    selectedType === pill.id
                      ? "bg-white text-zinc-950 font-medium shadow-sm"
                      : "bg-black/[0.04] dark:bg-white/[0.04] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Quick summary stats */}
            <div className="flex items-center gap-4 text-xs font-sans text-muted-foreground">
              <span className="tabular-nums">
                <strong className="text-foreground font-medium">{stats.count}</strong> opération{stats.count > 1 ? "s" : ""}
              </span>
              <span className="hidden md:inline text-black/10 dark:text-white/20">|</span>
              <span className="hidden md:inline tabular-nums">
                Débits : <span className="text-foreground font-semibold">-{stats.totalDebit.toFixed(2)} €</span>
              </span>
              <span className="hidden md:inline tabular-nums">
                Crédits : <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{stats.totalCredit.toFixed(2)} €</span>
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Table Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-muted/50 dark:bg-card z-10 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-sans">
              <tr>
                <th className="py-3 px-6 font-semibold w-28 sm:w-32">Date</th>
                <th className="py-3 px-6 font-semibold">Opération / Marchand</th>
                <th className="py-3 px-6 font-semibold w-48 sm:w-56">Catégorie</th>
                <th className="hidden sm:table-cell py-3 px-6 font-semibold w-32">Compte</th>
                <th className="py-3 px-6 font-semibold text-right w-32">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-sans text-xs sm:text-sm">
              {displayedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-muted-foreground font-sans">
                    <SlidersHorizontal className="w-8 h-8 mx-auto mb-3 opacity-30 text-foreground" />
                    <p className="text-sm font-medium text-foreground">Aucune opération trouvée</p>
                    <p className="text-xs mt-1 text-muted-foreground">Essayez de modifier vos filtres ou votre recherche</p>
                  </td>
                </tr>
              ) : (
                displayedTransactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  const isEditing = editingTxId === tx.id;
                  const catColor = CATEGORY_COLORS[tx.type] || CATEGORY_COLORS["Autre"];

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors group"
                    >
                      {/* 1. Date */}
                      <td className="py-3 px-6 text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                        {tx.date}
                      </td>

                      {/* 2. Merchant & Flags */}
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-foreground truncate">
                            {tx.name}
                          </span>
                          {checkIsSubscription(tx) && (
                            <span 
                              aria-label="Abonnement récurrent" 
                              className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] shrink-0 flex items-center gap-0.5"
                            >
                              <Repeat size={10} />
                              <span className="hidden xl:inline">Abo</span>
                            </span>
                          )}
                          {tx.isInternalTransfer && (
                            <span 
                              aria-label="Virement interne / Épargne" 
                              className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] shrink-0 flex items-center gap-0.5"
                            >
                              <ArrowRightLeft size={10} />
                              <span className="hidden xl:inline">Virement</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. Category */}
                      <td className="py-3 px-6">
                        {isEditing ? (
                          <div className="relative">
                            <select
                              autoFocus
                              value={tx.type}
                              onChange={(e) => handleCategoryChange(tx.id, tx.name, e.target.value)}
                              onBlur={() => setEditingTxId(null)}
                              className="w-full h-8 text-xs font-medium bg-card border border-border rounded-xl px-2 text-foreground outline-none shadow-lg cursor-pointer"
                            >
                              {OFFICIAL_CATEGORIES.map(cat => (
                                <option key={cat} value={cat} className="bg-card text-foreground">{cat}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingTxId(tx.id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:ring-1 hover:ring-border cursor-pointer max-w-full ${catColor.bgSoft} ${catColor.textSoft}`}
                            aria-label="Réassigner la catégorie"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${catColor.dot}`} />
                            <span className="truncate">{tx.type}</span>
                          </button>
                        )}
                      </td>

                      {/* 4. Bank Account */}
                      <td className="hidden sm:table-cell py-3 px-6 text-muted-foreground text-xs whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-border text-[10px] text-muted-foreground">
                          {tx.account || "BoursoBank"}
                        </span>
                      </td>

                      {/* 5. Amount */}
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <span className={`font-semibold tabular-nums text-xs sm:text-sm ${
                          isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                        }`}>
                          {formatAmount(tx.amount)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination / Load more */}
          {filteredTransactions.length > pageSize && (
            <div className="p-4 border-t border-border flex justify-center bg-muted/50 dark:bg-card">
              <button
                type="button"
                onClick={() => setPageSize(prev => prev + 50)}
                className="px-5 py-2 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-xs font-medium text-foreground border border-border transition-all active:scale-95 cursor-pointer font-sans"
              >
                Afficher plus ({filteredTransactions.length - pageSize} restantes)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
