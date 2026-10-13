import Papa from "papaparse";
import { cleanMerchantName, normalizeText } from "./categorization";

export interface BoursoNormalizedTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  label: string; // Nom propre nettoyé
  rawLabel: string; // Libellé d'origine sans retours à la ligne
  amount: number; // Négatif pour débit, positif pour crédit
  account: "BoursoBank";
  categoryBourso?: string;
}

/**
 * Nettoie un slug pour la composition de l'ID unique
 */
function toSlug(str: string): string {
  return normalizeText(str)
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30);
}

/**
 * Conversion robuste des dates en format ISO (YYYY-MM-DD et YYYY-MM).
 * Supporte :
 * - ISO : YYYY-MM-DD ou YYYY/MM/DD
 * - Français : JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA
 * - Français court : JJ/MM/AA
 */
export function parseDateToIso(dateStr: string): { date: string; month: string } | null {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim();

  // 1. Format français : JJ/MM/AAAA ou JJ-MM-AAAA ou JJ.MM.AAAA
  const frMatch = cleaned.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (frMatch) {
    const day = frMatch[1].padStart(2, "0");
    const month = frMatch[2].padStart(2, "0");
    let year = frMatch[3];
    if (year.length === 2) year = `20${year}`;
    return {
      date: `${year}-${month}-${day}`,
      month: `${year}-${month}`,
    };
  }

  // 2. Format ISO : YYYY-MM-DD ou YYYY/MM/DD
  const isoMatch = cleaned.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return {
      date: `${year}-${month}-${day}`,
      month: `${year}-${month}`,
    };
  }

  // 3. Fallback objet Date standard
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return {
      date: `${yyyy}-${mm}-${dd}`,
      month: `${yyyy}-${mm}`,
    };
  }

  return null;
}

/**
 * Parsing robuste des montants (formats français et international).
 * - " -12,50 € " -> -12.50
 * - " 1 250,00 " -> 1250.00
 * - " 1,250.00 " -> 1250.00
 * - " (45.00) "  -> -45.00
 */
export function parseAmount(val: any): number | null {
  if (val === null || val === undefined) return null;
  let str = String(val).trim();
  if (!str) return null;

  // Détection de parenthèses comptables (12.50) -> -12.50
  let isNegative = str.includes("-") || /^\(.*\)$/.test(str);

  // Nettoyage des devises, espaces classiques et insécables (\u00A0, \u202F)
  str = str.replace(/[€$£\s\u00A0\u202F\(\)]/g, "");

  // Si deux séparateurs décimaux/milliers existent (ex: 1.250,00 ou 1,250.00)
  if (str.includes(",") && str.includes(".")) {
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Format européen : 1.250,00
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // Format US : 1,250.00
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }

  // Nettoyage des signes résiduels pour le parsing
  str = str.replace(/[^\d\.]/g, "");
  const num = parseFloat(str);
  if (isNaN(num)) return null;

  return isNegative ? -Math.abs(num) : Math.abs(num);
}

/**
 * Détecte si le fichier BoursoBank est séparé par ';' ou ','
 */
function detectBoursoDelimiter(content: string): ";" | "," {
  const lines = content.split(/\r?\n/).slice(0, 10);
  let semiScore = 0;
  let commaScore = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const lower = line.toLowerCase();
    // Priorité à la ligne d'en-tête contenant des mots-clés
    if (lower.includes("date") || lower.includes("label") || lower.includes("libelle") || lower.includes("amount") || lower.includes("montant")) {
      const semis = (line.match(/;/g) || []).length;
      const commas = (line.match(/,/g) || []).length;
      if (semis > 0 && semis >= commas) return ";";
      if (commas > 0) return ",";
    }
    semiScore += (line.match(/;/g) || []).length;
    commaScore += (line.match(/,/g) || []).length;
  }

  return commaScore > semiScore ? "," : ";";
}

/**
 * PARSEUR BOURSOBANK STRICT & SÉCURISÉ
 * - Découplé de toute logique propre aux autres banques
 * - Détection dynamique d'en-tête (dateOp, label, amount, categoryParent, etc.)
 * - Gestion UTF-8, séparateurs ';' et ','
 * - ID unique incluant l'index de ligne pour conserver les doublons légitimes
 */
export function parseBoursoBankCSV(content: string): BoursoNormalizedTransaction[] {
  if (!content || !content.trim()) return [];

  // 1. Nettoie le BOM UTF-8 invisible au tout début du texte brut
  const cleanContent = content.replace(/^\uFEFF/, "").trim();
  if (!cleanContent) return [];

  // Détection du délimiteur (séparateur ';' standard BoursoBank ou ',')
  const delimiter = detectBoursoDelimiter(cleanContent);

  const parsed = Papa.parse<string[]>(cleanContent, {
    delimiter,
    skipEmptyLines: "greedy",
    quoteChar: '"',
  });

  const rows = parsed.data;
  if (!rows || rows.length === 0) return [];

  // 2. Découpe et identification de la ligne d'en-tête (cherche la présence de "Date Opération")
  let headerIndex = -1;
  let dateCol = 0;
  let labelCol = 2;
  let suggestedLabelCol = 3;
  let categoryCol = 4;
  let amountCol = 6; // Par défaut index 6 (première colonne Solde = montant de l'opération)

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length < 2) continue;

    // Nettoie les guillemets et espaces des en-têtes
    const cleanedHeaders = row.map(c => String(c || "").replace(/"/g, "").trim());
    const normalizedHeaders = cleanedHeaders.map(c => normalizeText(c));

    const hasDateOp = normalizedHeaders.some(h => h.includes("date operation") || h === "dateop" || h === "date_op");
    const hasDate = normalizedHeaders.some(h => h.includes("date"));

    if (hasDateOp || hasDate) {
      headerIndex = i;

      // Date : index 0 ou colonne Date Opération
      const dIdx = normalizedHeaders.findIndex(h => h.includes("date operation") || h === "dateop" || h === "date_op");
      dateCol = dIdx !== -1 ? dIdx : normalizedHeaders.findIndex(h => h.includes("date"));
      if (dateCol === -1) dateCol = 0;

      // Libellé Suggéré : index 3 (priorité)
      const suggIdx = normalizedHeaders.findIndex(h => h.includes("sugg"));
      suggestedLabelCol = suggIdx !== -1 ? suggIdx : 3;

      // Libellé standard : index 2 (ne doit PAS matcher "Date Opération")
      const libIdx = normalizedHeaders.findIndex((h, idx) => 
        idx !== dateCol && 
        !h.includes("date") && 
        (h === "libelle" || h.includes("libelle") || h === "label" || h.includes("label")) && 
        !h.includes("sugg")
      );
      labelCol = libIdx !== -1 ? libIdx : 2;

      // Catégorie : index 4
      const catIdx = normalizedHeaders.findIndex(h => h.includes("categorie") || h.includes("category"));
      categoryCol = catIdx !== -1 ? catIdx : 4;

      // Montant :
      // CRITIQUE BOURSOBANK : Il n'y a AUCUNE colonne nommée « Montant » ou « Amount ».
      // Le montant de l'opération se trouve dans la PREMIÈRE colonne nommée « Solde » (index 6).
      // La seconde colonne « Solde » (index 10) est le solde bancaire et doit être totalement ignorée.
      const montantIdx = normalizedHeaders.findIndex(h => h.includes("montant") || h.includes("amount"));
      const firstSoldeIdx = normalizedHeaders.indexOf("solde");

      if (montantIdx !== -1) {
        amountCol = montantIdx;
      } else if (firstSoldeIdx !== -1) {
        amountCol = firstSoldeIdx;
      } else {
        amountCol = 6;
      }

      break;
    }
  }

  // Fallback si aucun en-tête identifié
  if (headerIndex === -1) {
    headerIndex = 0;
    dateCol = 0;
    labelCol = 2;
    suggestedLabelCol = 3;
    categoryCol = 4;
    amountCol = 6;
  }

  const results: BoursoNormalizedTransaction[] = [];
  const startIndex = headerIndex + 1;

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length < 2) continue;

    // Ignore d'éventuelles lignes d'en-tête répétées
    const firstCell = String(row[dateCol] || "").replace(/"/g, "").trim();
    if (firstCell.toLowerCase().includes("date")) continue;

    const dateInfo = parseDateToIso(firstCell);
    if (!dateInfo) continue;

    // Montant : extrait la PREMIÈRE colonne "Solde" (index 6). Remplace la virgule par un point et parseFloat().
    // Ignore totalement l'index 10.
    const rawAmountCell = row[amountCol] !== undefined ? String(row[amountCol]).replace(/"/g, "").trim() : "";
    if (!rawAmountCell) continue;

    const cleanAmountStr = rawAmountCell
      .replace(/[\s\u00A0\u202F€$£\(\)]/g, "")
      .replace(",", ".");
    const isNegative = rawAmountCell.includes("-") || rawAmountCell.includes("(");
    let absNum = parseFloat(cleanAmountStr.replace(/[^\d\.]/g, ""));
    if (isNaN(absNum) || absNum === 0) continue;
    const amount = isNegative ? -Math.abs(absNum) : Math.abs(absNum);

    // Libellé / Commerçant : utilise en priorité « Libellé Suggéré » (index 3). Si vide, prends « Libellé » (index 2).
    const suggested = suggestedLabelCol !== -1 && row[suggestedLabelCol] ? String(row[suggestedLabelCol]).replace(/"/g, "").trim() : "";
    const regular = labelCol !== -1 && row[labelCol] ? String(row[labelCol]).replace(/"/g, "").trim() : "";
    const rawLabel = suggested || regular;
    if (!rawLabel) continue;

    const cleanedLabel = cleanMerchantName(rawLabel);

    // Catégorie d'origine : prends « Catégorie » (index 4). Si "Non catégorisé" ou vide, marque-la en "Autre".
    const rawCategory = categoryCol !== -1 && row[categoryCol] ? String(row[categoryCol]).replace(/"/g, "").trim() : "";
    let categoryBourso = rawCategory;
    if (!categoryBourso || normalizeText(categoryBourso).includes("non categorise") || normalizeText(categoryBourso) === "autre") {
      categoryBourso = "Autre";
    }

    // Identifiant unique demandé : `bourso-${date}-${Math.abs(amount)}-${index}`
    const uniqueId = `bourso-${dateInfo.date}-${Math.abs(amount)}-${i}`;

    results.push({
      id: uniqueId,
      date: dateInfo.date,
      month: dateInfo.month,
      label: cleanedLabel,
      rawLabel,
      amount,
      account: "BoursoBank",
      categoryBourso,
    });
  }

  return results;
}
