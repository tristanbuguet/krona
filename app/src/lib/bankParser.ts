import { parseBoursoBankCSV, BoursoNormalizedTransaction, parseDateToIso } from "./boursoParser";
import { parseCreditAgricoleCSV, CANormalizedTransaction } from "./creditAgricoleParser";
import { parseCaisseEpargneCSV, CENormalizedTransaction } from "./caisseEpargneParser";
import { cleanMerchantName, normalizeText } from "./categorization";

export type BankType = "bourso" | "ca" | "ce";

export interface NormalizedTransaction {
  id: string; // Identifiant unique garanti
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  label: string; // Nom propre et nettoyé
  rawLabel: string;
  amount: number; // Négatif pour dépense, positif pour crédit
  account: "BoursoBank" | "Crédit Agricole" | "Caisse d'Épargne";
  categoryBourso?: string;
  categoryCE?: string;
  subCategoryCE?: string;
}

// Ré-exportations des fonctions clés pour utilisation directe
export { 
  parseBoursoBankCSV, 
  parseCreditAgricoleCSV, 
  parseCaisseEpargneCSV, 
  parseDateToIso, 
  cleanMerchantName 
};
export type { BoursoNormalizedTransaction, CANormalizedTransaction, CENormalizedTransaction };

/**
 * Nettoyage des libellés (compatibilité ascendante)
 */
export function cleanLabel(raw: string): string {
  if (!raw) return "";
  return raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Rétrocompatibilité pour d'anciens appels éventuels à parseBoursoBankRows
 */
export function parseBoursoBankRows(rows: string[][]): NormalizedTransaction[] {
  const csvString = rows.map(r => r.join(";")).join("\n");
  return parseBoursoBankCSV(csvString);
}

/**
 * Rétrocompatibilité pour d'anciens appels éventuels à parseCreditAgricoleRows
 */
export function parseCreditAgricoleRows(rows: string[][]): NormalizedTransaction[] {
  const csvString = rows.map(r => r.join(";")).join("\n");
  return parseCreditAgricoleCSV(csvString);
}

/**
 * Rétrocompatibilité pour d'anciens appels éventuels à parseCaisseEpargneRows
 */
export function parseCaisseEpargneRows(rows: string[][]): NormalizedTransaction[] {
  const csvString = rows.map(r => r.join(";")).join("\n");
  return parseCaisseEpargneCSV(csvString);
}

/**
 * Détection automatique du type de relevé bancaire uniquement en cas d'absence
 * de choix utilisateur explicite.
 */
export function detectBankType(text: string): BankType {
  const sample = normalizeText(text.slice(0, 3000));
  if (
    sample.includes("caisse d'epargne") ||
    sample.includes("caisse d epargne") ||
    sample.includes("bpce") ||
    sample.includes("libelle simplifie") ||
    sample.includes("date de comptabilisation") ||
    sample.includes("sous categorie") ||
    sample.includes("sous-categorie") ||
    sample.includes("date de l'operation") ||
    sample.includes("date de l operation") ||
    sample.includes("date d'operation")
  ) {
    return "ce";
  }
  if (
    sample.includes("credit agricole") ||
    (sample.includes("debit euros") && sample.includes("credit euros")) ||
    (sample.includes("compte de dep") && !sample.includes("date de l'operation") && !sample.includes("libelle simplifie"))
  ) {
    return "ca";
  }
  if (sample.includes("date de valeur") && (sample.includes("debit") || sample.includes("credit"))) {
    return "ce";
  }
  return "bourso";
}

/**
 * Lit un fichier File du navigateur sous forme de texte avec l'encodage spécifié.
 */
function readFileAsText(file: File | Blob, encoding: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || "");
    reader.onerror = (err) => reject(err);
    reader.readAsText(file, encoding);
  });
}

/**
 * PARSEUR PRINCIPAL DE RELEVÉS BANCAIRES
 * 
 * Découplage strict :
 * - Le choix de l'utilisateur (forcedBank) aiguille DIRECTEMENT vers la bonne fonction :
 *   - "bourso" -> Encodage UTF-8 -> parseBoursoBankCSV
 *   - "ca"     -> Encodage windows-1252 -> parseCreditAgricoleCSV
 *   - "ce"     -> Encodage windows-1252 -> parseCaisseEpargneCSV
 * - Aucune heuristique ne vient écraser la configuration sélectionnée par l'utilisateur.
 */
export async function parseBankCsvFile(
  file: File,
  forcedBank?: BankType
): Promise<{ bank: "BoursoBank" | "Crédit Agricole" | "Caisse d'Épargne"; transactions: NormalizedTransaction[] }> {
  // 1. Détermination stricte de la banque cible
  let targetBank: BankType;

  if (forcedBank === "bourso" || forcedBank === "ca" || forcedBank === "ce") {
    targetBank = forcedBank;
  } else {
    // Si aucune banque n'est forcée, détection préliminaire rapide
    const testSample = await readFileAsText(file.slice(0, 4000), "UTF-8");
    targetBank = detectBankType(testSample);
  }

  // 2. Lecture avec l'encodage approprié selon la banque
  // Crédit Agricole et Caisse d'Épargne exportent en windows-1252 (ISO-8859-15) pour préserver accents et sigles
  // BoursoBank exporte en UTF-8
  const encoding = (targetBank === "ca" || targetBank === "ce") ? "windows-1252" : "UTF-8";
  const content = await readFileAsText(file, encoding);

  // 3. Aiguillage direct et étanche sans interférence
  if (targetBank === "ca") {
    const transactions = parseCreditAgricoleCSV(content);
    return {
      bank: "Crédit Agricole",
      transactions,
    };
  } else if (targetBank === "ce") {
    const transactions = parseCaisseEpargneCSV(content);
    return {
      bank: "Caisse d'Épargne",
      transactions,
    };
  } else {
    const transactions = parseBoursoBankCSV(content);
    return {
      bank: "BoursoBank",
      transactions,
    };
  }
}
