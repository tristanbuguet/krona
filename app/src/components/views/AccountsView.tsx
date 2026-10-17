"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Landmark, 
  Wallet, 
  CreditCard, 
  Plus, 
  UploadCloud, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Check, 
  X, 
  Calendar,
  Activity,
  Trash2,
  Edit2,
  ArrowRight
} from "lucide-react";
import { BoursoBankLogo, CreditAgricoleLogo } from "../BankSelectorPopover";
import { CloseButton } from "../ui/CloseButton";
import { Transaction, AccountInfo, formatAmount, formatMonthLabel } from "@/lib/types";
import { PageHeader } from "../ui/PageHeader";

interface AccountsViewProps {
  transactions: Transaction[];
  onTriggerUpload?: (bank: string) => void;
  onNavigateTransactions?: (bank?: string) => void;
}

const DEFAULT_ACCOUNTS: AccountInfo[] = [
  {
    id: "bourso-main",
    name: "Compte courant BoursoBank",
    bank: "BoursoBank",
    type: "Compte courant",
    accountNumber: "•••• 4821",
    initialBalance: 1500,
  },
  {
    id: "ca-main",
    name: "Compte Crédit Agricole",
    bank: "Crédit Agricole",
    type: "Compte courant",
    accountNumber: "•••• 8912",
    initialBalance: 650,
  },
  {
    id: "bourso-savings",
    name: "Livret d'Épargne Bourso+",
    bank: "BoursoBank",
    type: "Livret d'épargne",
    accountNumber: "•••• 3301",
    initialBalance: 5200,
  }
];

export function AccountsView({
  transactions,
  onTriggerUpload,
  onNavigateTransactions,
}: AccountsViewProps) {
  const [accounts, setAccounts] = useState<AccountInfo[]>(DEFAULT_ACCOUNTS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountInfo | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formBank, setFormBank] = useState<"BoursoBank" | "Crédit Agricole" | "Autre">("BoursoBank");
  const [formType, setFormType] = useState<"Compte courant" | "Livret d'épargne" | "Carte bancaire">("Compte courant");
  const [formNumber, setFormNumber] = useState("");
  const [formBalance, setFormBalance] = useState<string>("0");

  // Load custom accounts from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("krona_accounts_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAccounts(parsed);
        }
      }
    } catch (e) {}
  }, []);

  const saveAccounts = (newList: AccountInfo[]) => {
    setAccounts(newList);
    localStorage.setItem("krona_accounts_v1", JSON.stringify(newList));
  };

  // Compute metrics for each account from actual transactions
  const accountsData = useMemo(() => {
    return accounts.map(acc => {
      // Find matching transactions by bank and account type
      const isSavingsAcc = acc.type === "Livret d'épargne" || 
        acc.id.includes("savings") || 
        acc.name.toLowerCase().includes("livret") || 
        acc.name.toLowerCase().includes("épargne");

      const accTx = transactions.filter(t => {
        const isBourso = !t.account || t.account.toLowerCase().includes("bourso");
        const isCA = Boolean(t.account && t.account.toLowerCase().includes("agricole"));

        if (acc.bank.toLowerCase().includes("agricole")) {
          if (!isCA) return false;
        } else {
          if (!isBourso) return false;
        }

        const isSavingsTx = t.type === "Épargne & Trésorerie" || Boolean(t.isInternalTransfer);
        if (isSavingsAcc) {
          return isSavingsTx;
        }
        return true;
      });

      // Compute transactions sum
      const netTxSum = accTx.reduce((sum, t) => {
        if (isSavingsAcc) {
          // Sur le livret d'épargne : un virement vers l'épargne (débité du courant) crédite l'épargne (+)
          return sum + (-t.amount);
        }
        return sum + t.amount;
      }, 0);
      const computedBalance = (acc.initialBalance || 0) + netTxSum;

      // Find newest transaction date
      const sortedTx = [...accTx].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const lastTxDate = sortedTx[0]?.date || null;
      const recentTx = sortedTx.slice(0, 3);

      return {
        ...acc,
        computedBalance,
        txCount: accTx.length,
        lastTxDate,
        recentTx,
      };
    });
  }, [accounts, transactions]);

  // Total consolidated wealth
  const totalWealth = useMemo(() => {
    return accountsData.reduce((sum, acc) => sum + acc.computedBalance, 0);
  }, [accountsData]);

  const handleOpenAdd = () => {
    setEditingAccount(null);
    setFormName("");
    setFormBank("BoursoBank");
    setFormType("Compte courant");
    setFormNumber("");
    setFormBalance("0");
    setShowAddModal(true);
  };

  const handleOpenEdit = (acc: AccountInfo) => {
    setEditingAccount(acc);
    setFormName(acc.name);
    setFormBank(acc.bank);
    setFormType(acc.type);
    setFormNumber(acc.accountNumber || "");
    setFormBalance((acc.initialBalance || 0).toString());
    setShowAddModal(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const balanceNum = parseFloat(formBalance.replace(",", ".")) || 0;

    if (editingAccount) {
      const updated = accounts.map(a => a.id === editingAccount.id ? {
        ...a,
        name: formName || a.name,
        bank: formBank,
        type: formType,
        accountNumber: formNumber || a.accountNumber,
        initialBalance: balanceNum,
      } : a);
      saveAccounts(updated);
      setToastMessage(`Compte "${formName}" mis à jour`);
    } else {
      const newAcc: AccountInfo = {
        id: `acc-${Date.now()}`,
        name: formName || `Compte ${formBank}`,
        bank: formBank,
        type: formType,
        accountNumber: formNumber ? `•••• ${formNumber.slice(-4)}` : "•••• 0000",
        initialBalance: balanceNum,
      };
      saveAccounts([...accounts, newAcc]);
      setToastMessage(`Compte "${newAcc.name}" ajouté avec succès`);
    }

    setShowAddModal(false);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDeleteAccount = (accId: string) => {
    if (confirm("Supprimer ce compte de votre espace ?")) {
      const updated = accounts.filter(a => a.id !== accId);
      saveAccounts(updated);
      setShowAddModal(false);
      setToastMessage("Compte supprimé");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleTriggerUploadForBank = (bank: string) => {
    const bankKey = bank.toLowerCase().includes("agricole") ? "ca" : "bourso";
    localStorage.setItem("krona_selected_bank", bankKey);
    if (onTriggerUpload) {
      onTriggerUpload(bankKey);
    } else {
      window.dispatchEvent(new CustomEvent("trigger-csv-upload", { detail: { bank: bankKey } }));
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full overflow-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-20 right-6 z-50 bg-neutral-900/90 dark:bg-black/90 border border-white/[0.1] text-white px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-xl flex items-center gap-2.5 text-xs font-sans"
          >
            <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Check size={12} strokeWidth={3} />
            </div>
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <PageHeader title="Comptes">
        <button
          type="button"
          onClick={handleOpenAdd}
          className="h-9 px-3.5 rounded-full bg-foreground text-background text-xs sm:text-sm font-medium flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer font-sans"
        >
          <Plus size={15} />
          <span>Ajouter un compte</span>
        </button>
      </PageHeader>

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-6 no-scrollbar min-h-0">

      {/* Total Consolidated Wealth Card (p-6, Space Grotesk tabular-nums) */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shrink-0 transition-all hover:bg-black/[0.01] dark:hover:bg-white/[0.02]">
        <div>
          <span className="text-xs sm:text-sm font-medium text-muted-foreground font-sans block mb-1">
            Solde total consolidé (Tous comptes)
          </span>
          <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground tabular-nums font-sans">
            {formatAmount(totalWealth, false)}
          </div>
          <p className="text-xs text-muted-foreground font-sans mt-1">
            Cumul des soldes déclarés et des mouvements de relevés
          </p>
        </div>

        <div className="flex items-center gap-6 sm:border-l sm:border-border sm:pl-6">
          <div>
            <div className="text-xs text-muted-foreground font-sans mb-1">Comptes actifs</div>
            <div className="text-xl font-bold text-foreground tabular-nums font-sans">
              {accounts.length}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-sans mb-1">Mouvements tracés</div>
            <div className="text-xl font-bold text-foreground tabular-nums font-sans">
              {transactions.length} ops
            </div>
          </div>
        </div>
      </div>

      {/* Modular Accounts Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {accountsData.map((acc) => {
          const isBourso = acc.bank === "BoursoBank";
          const isCA = acc.bank === "Crédit Agricole";

          return (
            <div
              key={acc.id}
              className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-foreground/20 transition-all group"
            >
              {/* Account Header */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/[0.04] border border-border flex items-center justify-center shrink-0">
                      {isBourso ? (
                        <BoursoBankLogo className="w-4.5 h-4.5 text-foreground" />
                      ) : isCA ? (
                        <CreditAgricoleLogo className="w-5 h-4 text-foreground" />
                      ) : (
                        <Landmark size={20} className="text-foreground" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-foreground font-sans truncate">
                        {acc.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-sans">
                        <span>{acc.type}</span>
                        {acc.accountNumber && <span>· {acc.accountNumber}</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(acc)}
                    className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                    aria-label="Modifier ce compte"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>

                {/* Account Balance */}
                <div className="mb-4">
                  <div className="text-xs text-muted-foreground font-sans mb-1">Solde estimé</div>
                  <div className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums font-sans ${
                    acc.computedBalance >= 0 ? "text-foreground" : "text-rose-500"
                  }`}>
                    {formatAmount(acc.computedBalance, false)}
                  </div>
                </div>

                {/* Meta stats */}
                <div className="flex items-center justify-between text-xs text-muted-foreground font-sans py-2.5 border-y border-border/50 mb-4">
                  <button
                    type="button"
                    onClick={() => onNavigateTransactions && onNavigateTransactions(acc.bank)}
                    className="hover:underline flex items-center gap-1 cursor-pointer text-left hover:text-foreground transition-colors group/link"
                  >
                    <span>Volume : <strong className="text-foreground tabular-nums">{acc.txCount}</strong> opérations</span>
                    <ArrowRight size={11} className="opacity-60 group-hover/link:opacity-100 transition-opacity" />
                  </button>
                  <span>
                    {acc.lastTxDate ? `Dernier relevé : ${acc.lastTxDate}` : "Aucun relevé"}
                  </span>
                </div>

                {/* Recent Transactions Preview */}
                {acc.recentTx.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-sans">
                      Derniers mouvements
                    </span>
                    {acc.recentTx.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between text-xs font-sans">
                        <span className="text-muted-foreground truncate max-w-[160px]">{tx.name}</span>
                        <span className={`tabular-nums font-medium ${tx.amount > 0 ? "text-emerald-600 dark:text-emerald-500" : "text-foreground"}`}>
                          {formatAmount(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Button: Import CSV for this account */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleTriggerUploadForBank(acc.bank)}
                  className="w-full h-10 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/[0.1] border border-black/[0.06] dark:border-border text-xs font-medium text-foreground flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer font-sans"
                >
                  <UploadCloud size={15} />
                  <span>Importer un relevé {acc.bank}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* Add / Edit Account Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="relative z-10 w-full max-w-md bg-card border border-border dark:border-white/[0.08] rounded-3xl p-6 shadow-2xl flex flex-col font-sans"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold tracking-tight text-foreground">
                  {editingAccount ? "Modifier le compte" : "Rattacher un compte"}
                </h3>
                <CloseButton onClick={() => setShowAddModal(false)} />
              </div>

              <form onSubmit={handleSaveAccount} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                    Nom du compte
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex: Compte courant principal"
                    className="w-full h-10 px-3.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                      Établissement
                    </label>
                    <select
                      value={formBank}
                      onChange={(e) => setFormBank(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-xs text-foreground outline-none focus:border-foreground/30 cursor-pointer"
                    >
                      <option value="BoursoBank">BoursoBank</option>
                      <option value="Crédit Agricole">Crédit Agricole</option>
                      <option value="Autre">Autre banque</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                      Type de compte
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-xs text-foreground outline-none focus:border-foreground/30 cursor-pointer"
                    >
                      <option value="Compte courant">Compte courant</option>
                      <option value="Livret d'épargne">Livret d'épargne</option>
                      <option value="Carte bancaire">Carte bancaire</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                      Numéro (4 derniers chiffres)
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={formNumber}
                      onChange={(e) => setFormNumber(e.target.value)}
                      placeholder="Ex: 4821"
                      className="w-full h-10 px-3.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground outline-none focus:border-foreground/30 transition-all tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                      Solde initial / déclaré (€)
                    </label>
                    <input
                      type="text"
                      value={formBalance}
                      onChange={(e) => setFormBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-10 px-3.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground outline-none focus:border-foreground/30 transition-all tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  {editingAccount ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(editingAccount.id)}
                      className="h-10 px-3.5 rounded-full text-rose-500 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>Supprimer</span>
                    </button>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="h-10 px-4 rounded-full text-xs font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/[0.06] cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="h-10 px-5 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
