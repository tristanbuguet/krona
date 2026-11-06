import { AccountInfo } from "./types";

/**
 * Nettoie et formate le libellé commercial lisible de la banque connectée.
 * Remplace tout intitulé technique ("Boursorama Banque", "Mock ASPSP", etc.) par un nom bancaire propre (ex. "BoursoBank").
 */
export function formatBankDisplayName(
  aspspName?: string | null,
  accountName?: string | null
): string {
  const combined = `${aspspName || ""} ${accountName || ""}`.trim().toLowerCase();
  const isSandbox = combined.includes("sandbox") || combined.includes("mock");

  if (combined.includes("bourso")) {
    return isSandbox ? "BoursoBank (Sandbox)" : "BoursoBank";
  }
  if (combined.includes("agricole")) {
    return isSandbox ? "Crédit Agricole (Sandbox)" : "Crédit Agricole";
  }
  if (combined.includes("epargne") || combined.includes("caisse")) {
    return isSandbox ? "Caisse d'Épargne (Sandbox)" : "Caisse d'Épargne";
  }
  if (combined.includes("lcl")) {
    return isSandbox ? "LCL (Sandbox)" : "LCL";
  }
  if (!aspspName || aspspName.toLowerCase().includes("mock") || aspspName.trim() === "Mock ASPSP") {
    return isSandbox ? "BoursoBank (Sandbox)" : "BoursoBank";
  }

  // Nettoyage de préfixes techniques résiduels
  const cleaned = aspspName
    .replace(/\b(mock|aspsp|sandbox|test)\b/gi, "")
    .replace(/[-_]+/g, " ")
    .trim();

  if (!cleaned) return "BoursoBank";
  return isSandbox ? `${cleaned} (Sandbox)` : cleaned;
}

/**
 * Détermine si une transaction provient d'une synchronisation bancaire Open Banking (Enable Banking)
 * ou est rattachée au compte bancaire synchronisé (ex. BoursoBank).
 */
export function isLinkedBankTransaction(
  tx: { id?: string; account?: string; source?: string },
  customBankNames?: Set<string> | string[]
): boolean {
  // 1. Si explicitement marquée comme provenant de la banque synchronisée
  if (tx.source === "bank") {
    return true;
  }
  // 2. Si identifiant technique Open Banking (Enable Banking)
  if (typeof tx.id === "string" && tx.id.startsWith("eb_")) {
    return true;
  }
  // 3. Les transactions CSV manuelles ne doivent JAMAIS être supprimées
  if (tx.source === "csv") {
    return false;
  }
  if (typeof tx.id === "string" && /^(bourso|ca|ce|lcl|csv)_/i.test(tx.id)) {
    return false;
  }
  // 4. Comptes techniques de bac à sable Open Banking ou rattachés à la banque liée
  const acc = (tx.account || "").trim().toLowerCase();
  if (!acc) return false;
  if (
    acc === "boursobank" ||
    acc === "boursobank (sandbox)" ||
    acc.includes("bourso") ||
    acc === "mock aspsp" ||
    acc === "banque sandbox"
  ) {
    return true;
  }
  if (customBankNames) {
    for (const name of customBankNames) {
      if (name && acc === name.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Détermine si un compte enregistré provient de la liaison bancaire synchronisée.
 */
export function isLinkedBankAccount(
  account: AccountInfo,
  customBankNames?: Set<string> | string[]
): boolean {
  if (account.id && account.id.startsWith("eb_")) return true;
  const name = (account.name || "").trim().toLowerCase();
  if (!name) return false;
  if (
    name === "boursobank" ||
    name === "boursobank (sandbox)" ||
    name.includes("bourso") ||
    name.includes("mock aspsp") ||
    name.includes("banque sandbox")
  ) {
    return true;
  }
  if (customBankNames) {
    for (const bName of customBankNames) {
      if (bName && name === bName.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}


