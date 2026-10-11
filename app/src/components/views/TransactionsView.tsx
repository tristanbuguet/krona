"use client";

import { useState, useMemo } from "react";
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
  formatMonthLabel 
} from "@/lib/types";

interface TransactionsViewProps {
  transactions: Transaction[];
  onRecategorize: (txId: string, merchantName: string, newCategory: string) => void;
  onSelectMonth?: (month: string) => void;
}

export function TransactionsView({
  transactions,
  onRecategorize,
}: TransactionsViewProps) {
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | "debit" | "credit" | "subs" | "transfer">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
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
      if (selectedType === "subs" && !tx.isSubscription && tx.type !== "Abonnements & Forfaits") return false;
      if (selectedType === "transfer" && !tx.isInternalTransfer && tx.type !== "Épargne & Trésorerie") return false;

      // Category filter
      if (selectedCategory !== "all" && tx.type !== selectedCategory) return false;

      // Account filter
      if (selectedAccount !== "all" && (tx.account || "BoursoBank") !== selectedAccount) return false;

      // Month filter
      if (selectedMonth !== "all" && tx.month !== selectedMonth) return false;

      return true;
    });
  }, [transactions, search, selectedType, selectedCategory, selectedAccount, selectedMonth]);

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
      totalDebit,
      totalCredit,
      net: totalCredit - totalDebit,
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
    <div className="flex-1 min-h-0 flex flex-col space-y-4 overflow-y-auto no-scrollbar pb-10">
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-sans">
            Transactions & Audit
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 font-sans mt-0.5">
            Table de contrôle des opérations bancaires avec réassignation instantanée
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={exportFilteredCSV}
            className="h-9 px-3.5 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/[0.1] border border-border text-xs font-medium text-foreground flex items-center gap-2 transition-all active:scale-95 cursor-pointer font-sans"
            title="Exporter en CSV"
          >
            <Download size={14} />
            <span>Exporter CSV</span>
          </button>
        </div>
      </div>

      {/* Controls Bar: Search & Quick Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 shrink-0">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Instant Search Bar */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par marchand, montant ou catégorie..."
              className="w-full h-10 pl-9 pr-8 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground placeholder:text-neutral-500 outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all font-sans"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-foreground p-1 cursor-pointer"
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
                className="h-10 appearance-none bg-black/[0.03] dark:bg-white/[0.04] border border-border text-foreground text-xs font-medium pl-3.5 pr-8 rounded-full outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 cursor-pointer font-sans"
              >
                <option value="all">Toutes les catégories</option>
                {OFFICIAL_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            </div>

            {/* Account Select */}
            {accounts.length > 1 && (
              <div className="relative shrink-0">
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="h-10 appearance-none bg-black/[0.03] dark:bg-white/[0.04] border border-border text-foreground text-xs font-medium pl-3.5 pr-8 rounded-full outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 cursor-pointer font-sans"
                >
                  <option value="all">Tous les comptes</option>
                  {accounts.map(acc => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              </div>
            )}

            {/* Month Select */}
            {months.length > 1 && (
              <div className="relative shrink-0">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-10 appearance-none bg-black/[0.03] dark:bg-white/[0.04] border border-border text-foreground text-xs font-medium pl-3.5 pr-8 rounded-full outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 cursor-pointer font-sans"
                >
                  <option value="all">Toutes les dates</option>
                  {months.map(m => (
                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* Filter Pills (All, Debit, Credit, Subs, Transfers) & Metrics */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-border/50">
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
                    ? "bg-foreground text-background"
                    : "bg-black/5 dark:bg-white/[0.04] text-neutral-400 hover:text-foreground"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Quick summary stats */}
          <div className="flex items-center gap-4 text-xs font-sans text-neutral-400">
            <span className="tabular-nums">
              <strong className="text-foreground">{stats.count}</strong> opération{stats.count > 1 ? "s" : ""}
            </span>
            <span className="hidden md:inline">|</span>
            <span className="hidden md:inline tabular-nums">
              Débits : <span className="text-foreground font-semibold">-{stats.totalDebit.toFixed(2)} €</span>
            </span>
            <span className="hidden md:inline tabular-nums">
              Crédits : <span className="text-emerald-500 font-semibold">+{stats.totalCredit.toFixed(2)} €</span>
            </span>
          </div>
        </div>
      </div>

      {/* Linear-style Audit Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-6 py-3 border-b border-border bg-black/[0.01] dark:bg-white/[0.02] text-[11px] font-semibold text-neutral-400 uppercase tracking-wider font-sans">
          <div className="col-span-2 sm:col-span-2">Date</div>
          <div className="col-span-5 sm:col-span-4">Opération / Marchand</div>
          <div className="col-span-3 sm:col-span-3">Catégorie</div>
          <div className="hidden sm:block sm:col-span-1">Compte</div>
          <div className="col-span-2 sm:col-span-2 text-right">Montant</div>
        </div>

        {/* Table Body */}
        {displayedTransactions.length === 0 ? (
          <div className="py-16 text-center text-neutral-400 font-sans">
            <SlidersHorizontal className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-foreground">Aucune opération trouvée</p>
            <p className="text-xs mt-1 text-neutral-500">Essayez de modifier vos filtres ou votre recherche</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {displayedTransactions.map((tx) => {
              const isPositive = tx.amount > 0;
              const isEditing = editingTxId === tx.id;
              const catColor = CATEGORY_COLORS[tx.type] || CATEGORY_COLORS["Autre"];

              return (
                <div
                  key={tx.id}
                  className="grid grid-cols-12 gap-3 px-6 py-3.5 items-center hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors group font-sans text-xs sm:text-sm"
                >
                  {/* 1. Date */}
                  <div className="col-span-2 sm:col-span-2 text-neutral-400 tabular-nums truncate text-xs">
                    {tx.date}
                  </div>

                  {/* 2. Merchant & Flags */}
                  <div className="col-span-5 sm:col-span-4 flex items-center gap-2 min-w-0 pr-2">
                    <span className="font-semibold text-foreground truncate" title={tx.name}>
                      {tx.name}
                    </span>
                    {tx.isSubscription && (
                      <span 
                        title="Abonnement récurrent" 
                        className="px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[10px] shrink-0 flex items-center gap-0.5"
                      >
                        <Repeat size={10} />
                        <span className="hidden xl:inline">Abo</span>
                      </span>
                    )}
                    {tx.isInternalTransfer && (
                      <span 
                        title="Virement interne / Épargne" 
                        className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] shrink-0 flex items-center gap-0.5"
                      >
                        <ArrowRightLeft size={10} />
                        <span className="hidden xl:inline">Virement</span>
                      </span>
                    )}
                  </div>

                  {/* 3. Category (Interactive Tag with quick select) */}
                  <div className="col-span-3 sm:col-span-3 min-w-0">
                    {isEditing ? (
                      <div className="relative">
                        <select
                          autoFocus
                          value={tx.type}
                          onChange={(e) => handleCategoryChange(tx.id, tx.name, e.target.value)}
                          onBlur={() => setEditingTxId(null)}
                          className="w-full h-8 text-xs font-medium bg-card border border-foreground/30 rounded-lg px-2 text-foreground outline-none shadow-lg cursor-pointer"
                        >
                          {OFFICIAL_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingTxId(tx.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:ring-1 hover:ring-foreground/20 cursor-pointer max-w-full ${catColor.bgSoft} ${catColor.textSoft}`}
                        title="Cliquer pour réassigner la catégorie"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${catColor.dot}`} />
                        <span className="truncate">{tx.type}</span>
                      </button>
                    )}
                  </div>

                  {/* 4. Bank Account */}
                  <div className="hidden sm:block sm:col-span-1 text-neutral-400 text-xs truncate">
                    <span className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/[0.04] border border-border/50 text-[11px]">
                      {tx.account || "BoursoBank"}
                    </span>
                  </div>

                  {/* 5. Amount */}
                  <div className="col-span-2 sm:col-span-2 text-right">
                    <span className={`font-semibold tabular-nums text-xs sm:text-sm ${
                      isPositive ? "text-emerald-500" : "text-foreground"
                    }`}>
                      {formatAmount(tx.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination / Load more */}
        {filteredTransactions.length > pageSize && (
          <div className="p-4 border-t border-border flex justify-center bg-black/[0.01] dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setPageSize(prev => prev + 50)}
              className="px-5 py-2 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/[0.1] text-xs font-medium text-foreground transition-all active:scale-95 cursor-pointer font-sans"
            >
              Afficher plus ({filteredTransactions.length - pageSize} restantes)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
