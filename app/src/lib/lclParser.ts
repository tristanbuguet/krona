import Papa from "papaparse";
import { cleanMerchantName, normalizeText } from "./categorization";
import { parseDateToIso, parseAmount } from "./boursoParser";

/**
 * Interface standardisée d'une transaction brute Krona
 */
export interface RawTransaction {
  id: string;
  date: string; // Format ISO (YYYY-MM-DD)
  label: string; // Libellé nettoyé
  amount: number; // Nombre flottant (débit négatif, crédit positif)
  rawLabel?: string; // Libellé brut d'origine
  account?: string;
  month?: string; // YYYY-MM
  source?: "csv" | "bank" | "manual";
}

/**
 * Interface des transactions normalisées LCL compatibles avec Krona
 */
export interface LCLNormalizedTransaction extends RawTransaction {
  month: string;
  rawLabel: string;
  account: "LCL";
}

/**
 * Interface commune pour les parseurs bancaires
 */
export interface BankParser {
  name: string;
  canParse?: (content: string) => boolean;
  parse: (content: string) => RawTransaction[];
}

/**
 * Génère un slug propre pour composer des identifiants stables
 */
function toSlug(str: string): string {
  return normalizeText(str)
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Répare les séquences de caractères mal décodées (mojibake Windows-1252 / ISO-8859-1 lues en UTF-8)
 */
export function fixEncoding(text: string): string {
  if (!text) return "";
  return text
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ãª/g, "ê")
    .replace(/Ã«/g, "ë")
    .replace(/Ã /g, "à")
    .replace(/Ã¢/g, "â")
    .replace(/Ã®/g, "î")
    .replace(/Ã¯/g, "ï")
    .replace(/Ã´/g, "ô")
    .replace(/Ã¹/g, "ù")
    .replace(/Ã»/g, "û")
    .replace(/Ã§/g, "ç")
    .replace(/Ã€/g, "À")
    .replace(/Ã‰/g, "É")
    .replace(/Ãˆ/g, "È")
    .replace(/ÃŠ/g, "Ê")
    .replace(/Ã‚/g, "Â")
    .replace(/Ã‡/g, "Ç")
    .replace(/â‚¬/g, "€")
    .replace(/Â(?=[\s\u00A0])/g, ""); // Nettoyage de l'artefact d'espace insécable UTF-8 mal décodé (C2 A0 -> Â ) sans toucher au Â majuscule
}

/**
 * Détecte le séparateur de colonnes (point-virgule ';', virgule ',', ou tabulation '\t')
 */
export function detectLCLDelimiter(content: string): ";" | "\t" | "," {
  const lines = content.split(/\r?\n/).slice(0, 20);
  let tabScore = 0;
  let semiScore = 0;
  let commaScore = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const lower = normalizeText(line);

    // Priorité aux lignes de données ou d'en-tête de colonnes
    if (
      (lower.includes("date") || lower.includes("operation")) &&
      (lower.includes("libelle") || lower.includes("debit") || lower.includes("credit") || lower.includes("montant"))
    ) {
      const tabs = (line.match(/\t/g) || []).length;
      const semis = (line.match(/;/g) || []).length;
      const commas = (line.match(/,/g) || []).length;
      if (tabs > 0 && tabs >= semis && tabs >= commas) return "\t";
      if (semis > 0 && semis >= commas) return ";";
      if (commas > 0) return ",";
    }

    tabScore += (line.match(/\t/g) || []).length;
    semiScore += (line.match(/;/g) || []).length;
    commaScore += (line.match(/,/g) || []).length;
  }

  if (tabScore > semiScore && tabScore > commaScore) return "\t";
  if (commaScore > semiScore) return ",";
  return ";";
}

/**
 * Nettoie les libellés bancaires LCL en retirant les préfixes techniques verbeux
 * tout en conservant le bénéficiaire réel, l'émetteur ou la référence utile.
 */
export function cleanLCLLabel(raw: string): string {
  if (!raw) return "Inconnu";

  let str = fixEncoding(raw)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Nettoyage précis des préfixes de virements avec ou sans mention SEPA / DE / VERS
  const virMatch = str.match(
    /^(VIR(?:EMENT)?(?:\s+INST(?:ANTAN[EÉ])?)?(?:\s+SEPA)?(?:\s+(?:RECU|EMIS|INST(?:ANTAN[EÉ])?))?(?:\s+(?:DE|POUR|VERS|EN\s+VOTRE\s+FAVEUR(?:\s+DE)?))?\s+)(.+)$/i
  );
  if (virMatch && virMatch[2]?.trim()) {
    str = virMatch[2].trim();
  }

  const cleaned = cleanMerchantName(str);
  return cleaned || str;
}

/**
 * PARSEUR DE RELEVÉS BANCAIRES LCL (CSV / TSV)
 * 
 * Spécifications :
 * - Tolérant aux séparateurs : ';' , ',' ou '\t'
 * - Ignore automatiquement les 1 à 5 lignes de métadonnées initiales (Compte n°, Solde au, Devise, etc.)
 * - Identifie la ligne d'en-tête réelle du tableau de transactions
 * - Gère le format Cas A (colonnes Débit et Crédit) et Cas B (colonne Montant unique signée)
 * - Normalise les montants (virgules décimales, espaces insécables \u00A0 / \u202F, symboles monétaires € et EUR)
 * - Nettoie les libellés tout en préservant le commerçant ou bénéficiaire et les accents français
 * - Construit des identifiants uniques déterministes basés sur date + montant + slug + occurrence
 */
export function parseLCLCSV(content: string): LCLNormalizedTransaction[] {
  if (!content || !content.trim()) return [];

  // 1. Nettoyage initial du BOM et réparation d'encodage éventuel
  const cleanedContent = fixEncoding(content.replace(/^\uFEFF/, "").trim());
  if (!cleanedContent) return [];

  const delimiter = detectLCLDelimiter(cleanedContent);

  const parsed = Papa.parse<string[]>(cleanedContent, {
    delimiter,
    quoteChar: '"',
    skipEmptyLines: false,
  });

  const rows = parsed.data;
  if (!rows || rows.length === 0) return [];

  // 2. Détection dynamique de la ligne d'en-tête (ignore les métadonnées initiales)
  let headerIndex = -1;
  let dateCol = -1;
  let labelCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let singleAmountCol = -1;

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const normalizedCols = row.map(col => normalizeText(String(col || "")));

    // Date : Date, Date opération, Date de l'opération
    const dCol = normalizedCols.findIndex(
      c =>
        c === "date" ||
        c === "date operation" ||
        c === "date d'operation" ||
        c === "date d operation" ||
        c === "date de l'operation" ||
        c === "date de l operation" ||
        (c.startsWith("date") && !c.includes("valeur"))
    );

    // Libellé : Libellé, Opération, Libellé de l'opération, Désignation
    const lCol = normalizedCols.findIndex(
      (c, idx) =>
        idx !== dCol &&
        (c === "libelle" ||
          c === "operation" ||
          c === "libelle de l'operation" ||
          c === "libelle de l operation" ||
          c === "libelle operation" ||
          c.includes("libelle") ||
          c.includes("operation") ||
          c === "designation")
    );

    // Montants : Débit et Crédit, ou Montant
    const debCol = normalizedCols.findIndex(c => c.includes("debit"));
    const credCol = normalizedCols.findIndex(c => c.includes("credit"));
    const montCol = normalizedCols.findIndex(c => c === "montant" || c.includes("montant") || c === "amount");

    const hasDate = dCol !== -1;
    const hasLabel = lCol !== -1;
    const hasAmount = debCol !== -1 || credCol !== -1 || montCol !== -1;

    if (hasDate && hasLabel && hasAmount) {
      headerIndex = i;
      dateCol = dCol;
      labelCol = lCol;
      debitCol = debCol;
      creditCol = credCol;
      if (debCol === -1 && credCol === -1 && montCol !== -1) {
        singleAmountCol = montCol;
      } else if (montCol !== -1 && debCol === -1) {
        singleAmountCol = montCol;
      }
      break;
    }
  }

  // Fallback si l'en-tête n'est pas identifiée
  if (headerIndex === -1) {
    headerIndex = 0;
    dateCol = 0;
    labelCol = 1;
    debitCol = 2;
    creditCol = 3;
  }

  const results: LCLNormalizedTransaction[] = [];
  const startIndex = headerIndex + 1;
  const occurrenceMap = new Map<string, number>();

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rawDate = row[dateCol];
    if (!rawDate || !String(rawDate).trim()) continue;

    const cleanDateStr = String(rawDate).replace(/"/g, "").trim();
    if (cleanDateStr.toLowerCase().includes("date")) continue;

    const dateInfo = parseDateToIso(cleanDateStr);
    if (!dateInfo) continue;

    const rawLabelCell = String(row[labelCol] || "").replace(/[\r\n\t]+/g, " ").replace(/"/g, "").trim();
    if (!rawLabelCell) continue;

    const cleanedLabel = cleanLCLLabel(rawLabelCell);
    if (!cleanedLabel) continue;

    // Détermination du montant
    let amount = 0;

    if (singleAmountCol !== -1) {
      const parsedVal = parseAmount(row[singleAmountCol]);
      if (parsedVal === null || parsedVal === 0) continue;
      amount = parsedVal;
    } else {
      const rawDebit = debitCol !== -1 ? row[debitCol] : undefined;
      const rawCredit = creditCol !== -1 ? row[creditCol] : undefined;

      const parsedDebit = parseAmount(rawDebit);
      const parsedCredit = parseAmount(rawCredit);

      if (parsedDebit !== null && parsedDebit !== 0) {
        // Débit est une dépense stricte (< 0)
        amount = -Math.abs(parsedDebit);
      } else if (parsedCredit !== null && parsedCredit !== 0) {
        // Crédit est une recette stricte (> 0)
        amount = Math.abs(parsedCredit);
      } else {
        continue;
      }
    }

    // Clé unique et stable
    const slug = toSlug(cleanedLabel) || "tx";
    const baseKey = `${dateInfo.date}_${amount}_${slug}`;
    const occurrenceIndex = (occurrenceMap.get(baseKey) || 0) + 1;
    occurrenceMap.set(baseKey, occurrenceIndex);
    const uniqueId = `lcl_${baseKey}_${occurrenceIndex}`;

    results.push({
      id: uniqueId,
      date: dateInfo.date,
      month: dateInfo.month,
      label: cleanedLabel,
      rawLabel: rawLabelCell,
      amount,
      account: "LCL",
    });
  }

  return results;
}

/**
 * Instance du parseur LCL implémentant l'interface commune BankParser
 */
export const lclParser: BankParser = {
  name: "LCL",
  parse: parseLCLCSV,
};

export default lclParser;
