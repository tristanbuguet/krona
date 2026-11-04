import Papa from "papaparse";
import { cleanMerchantName, normalizeText } from "./categorization";
import { parseDateToIso, parseAmount } from "./boursoParser";

export interface CANormalizedTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  label: string; // Nom propre nettoyé
  rawLabel: string; // Libellé d'origine sans retours à la ligne
  amount: number; // Négatif pour débit, positif pour crédit
  account: "Crédit Agricole";
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
 * Répare les artefacts d'encodage courants (mojibake Windows-1252 / ISO-8859-1 décodé en UTF-8)
 */
export function fixMojibake(text: string): string {
  if (!text) return "";
  return text
    .replace(/^\uFEFF/, "")
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
    .replace(/Â(?=[\s\u00A0])/g, "");
}

/**
 * Détecte dynamiquement le séparateur de colonnes (point-virgule ';', tabulation '\t' ou virgule ',')
 */
export function detectCADelimiter(content: string): ";" | "\t" | "," {
  const lines = content.split(/\r?\n/).slice(0, 35);
  let tabScore = 0;
  let semiScore = 0;
  let commaScore = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const lower = normalizeText(line);

    // Priorité aux lignes contenant des mots-clés typiques d'en-tête de relevé
    if (
      (lower.includes("date") || lower.includes("operation")) &&
      (lower.includes("libelle") ||
        lower.includes("debit") ||
        lower.includes("credit") ||
        lower.includes("montant") ||
        lower.includes("valeur") ||
        lower.includes("detail"))
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
 * Nettoie les libellés Crédit Agricole avec métadonnées concaténées :
 * - Retire les préfixes "CARTE 06/10/2026", "CARTE DU 06/10/2026", "PAIEMENT PAR CARTE DU...", etc.
 * - Garantit de manière absolue que le libellé ne retourne JAMAIS une date.
 */
export function cleanCALabel(rawLabel: string, amount?: number): string {
  if (!rawLabel || !rawLabel.trim()) {
    return amount !== undefined && amount > 0 ? "Virement" : "Opération";
  }

  const str = fixMojibake(rawLabel)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Nettoyage ciblé des préfixes fréquents Crédit Agricole
  const caPrefixes = [
    /^(?:PAIEMENT\s+(?:PAR\s+)?(?:CARTE|CB)|ACHAT\s+CB|ACHAT\s+CARTE|CB\*)(?:\s+(?:DU\s+)?\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)?(?:\s+\d{1,2}[hH:]\d{2})?\s+/i,
    /^CARTE(?:\s+(?:DU|DE))?(?:\s+(?:N[°O]?|NUM[EÉ]RO)\s*\d+)?(?:\s+X\d{4})?(?:\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)?(?:\s+\d{1,2}[hH:]\d{2})?\s+/i,
    /^CB\s+(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s+)?/i,
    /^(?:VIR(?:EMENT)?\s+)?(?:SEPA\s+)?(?:RECU|EMIS|INST(?:ANTAN[EÉ])?)(?:\s+(?:DE|POUR|VERS|EN\s+VOTRE\s+FAVEUR(?:\s+DE)?))?\s+/i,
    /^(?:PRLV\s+SEPA|PRELEVEMENT\s+SEPA|PRLV|PRELEVEMENT)(?:\s+(?:DE|POUR|VERS))?\s+/i,
    /^(?:RETRAIT\s+DAB|RETRAIT\s+AU\s+DISTRIBUTEUR|RETRAIT|DAB)(?:\s+(?:DU\s+)?\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)?\s+/i,
  ];

  let cleaned = str;
  for (const rx of caPrefixes) {
    if (rx.test(cleaned)) {
      cleaned = cleaned.replace(rx, "").trim();
      break;
    }
  }

  // Traitement via le nettoyeur principal
  const result = cleanMerchantName(cleaned || str);

  // GARANTIE ABSOLUE : transaction.label ne doit JAMAIS contenir une date
  if (
    parseDateToIso(result) !== null ||
    /^\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?$/.test(result) ||
    /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(result)
  ) {
    if (amount !== undefined && amount > 0) {
      return "Virement reçu";
    }
    return "Opération carte";
  }

  return result || "Opération";
}

/**
 * PARSEUR CRÉDIT AGRICOLE STRICT & SÉCURISÉ
 * - Détection automatique du séparateur (';', '\t', ',')
 * - Tolérance aux métadonnées initiales (Compte, Titulaire, Solde, IBAN...)
 * - Identification dynamique des colonnes par analyse sémantique des en-têtes
 *   * Date : recherche "date operation", "date de l'operation", puis "date", en excluant formellement "date de valeur"
 *   * Libellé : recherche "libelle", "operation", "detail", en excluant formellement toute colonne contenant "date"
 *   * Débit / Crédit / Montant : détection précise des colonnes monétaires
 * - Garde-fou anti-décalage : réassignation automatique si une cellule libellé contient une date
 * - Nettoyage avancé des métadonnées concaténées ("CARTE 06/10/2026 MONOPRIX...")
 * - Déduplication déterministe avec clés stables d'occurrence
 */
export function parseCreditAgricoleCSV(content: string): CANormalizedTransaction[] {
  if (!content || !content.trim()) return [];

  const cleanedContent = fixMojibake(content.trim());
  const delimiter = detectCADelimiter(cleanedContent);

  const parsed = Papa.parse<string[]>(cleanedContent, {
    delimiter,
    quoteChar: '"',
    skipEmptyLines: false,
  });

  let rows = parsed.data;
  if (!rows || rows.length === 0) return [];

  // Secours si le délimiteur n'a produit qu'une seule colonne
  if (rows.length > 0 && rows[0].length <= 1 && cleanedContent.includes("\t")) {
    const reParsed = Papa.parse<string[]>(cleanedContent, {
      delimiter: "\t",
      quoteChar: '"',
      skipEmptyLines: false,
    });
    if (reParsed.data && reParsed.data.length > 0 && reParsed.data[0].length > 1) {
      rows = reParsed.data;
    }
  }

  // 1. Détection dynamique de la ligne d'en-tête (ignore les métadonnées initiales)
  let headerIndex = -1;
  let dateCol = -1;
  let labelCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let singleAmountCol = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const normalizedCols = row.map(col =>
      normalizeText(String(col || "")).replace(/['’]/g, "'")
    );

    // a) Colonne Date : recherche ciblée de la date d'opération, en excluant strictement la "date de valeur"
    let dCol = normalizedCols.findIndex(
      c =>
        c === "date operation" ||
        c === "date de l'operation" ||
        c === "date de l operation" ||
        c === "date d'operation" ||
        c === "date d operation" ||
        c.startsWith("date op")
    );

    if (dCol === -1) {
      dCol = normalizedCols.findIndex(c => c === "date");
    }

    if (dCol === -1) {
      dCol = normalizedCols.findIndex(
        c => c.startsWith("date") && !c.includes("valeur") && !c.includes("compta")
      );
    }

    if (dCol === -1) {
      dCol = normalizedCols.findIndex(c => c.includes("date") && !c.includes("valeur"));
    }

    // b) Colonne Libellé : cherche "libelle", "operation", "detail", en excluant explicitement les colonnes contenant "date"
    let lCol = normalizedCols.findIndex(
      (c, idx) =>
        idx !== dCol &&
        !c.includes("date") &&
        (c === "libelle" ||
          c === "libelle de l'operation" ||
          c === "libelle de l operation" ||
          c === "libelle operation" ||
          c === "libelle simplifie" ||
          c.includes("libelle"))
    );

    if (lCol === -1) {
      lCol = normalizedCols.findIndex(
        (c, idx) =>
          idx !== dCol &&
          !c.includes("date") &&
          (c === "operation" || c.includes("operation"))
      );
    }

    if (lCol === -1) {
      lCol = normalizedCols.findIndex(
        (c, idx) =>
          idx !== dCol &&
          !c.includes("date") &&
          (c === "detail" || c.includes("detail"))
      );
    }

    if (lCol === -1) {
      lCol = normalizedCols.findIndex(
        (c, idx) =>
          idx !== dCol &&
          !c.includes("date") &&
          (c.includes("designation") || c.includes("description") || c.includes("motif"))
      );
    }

    // c) Colonnes Débit, Crédit et Montant
    const debCol = normalizedCols.findIndex(
      (c, idx) => idx !== dCol && idx !== lCol && !c.includes("date") && c.includes("debit")
    );
    const credCol = normalizedCols.findIndex(
      (c, idx) => idx !== dCol && idx !== lCol && !c.includes("date") && c.includes("credit")
    );
    const montCol = normalizedCols.findIndex(
      (c, idx) =>
        idx !== dCol &&
        idx !== lCol &&
        !c.includes("date") &&
        (c === "montant" || c.includes("montant"))
    );

    // Vérifie la présence des colonnes indispensables
    if (dCol !== -1 && lCol !== -1 && (debCol !== -1 || credCol !== -1 || montCol !== -1)) {
      headerIndex = i;
      dateCol = dCol;
      labelCol = lCol;
      debitCol = debCol;
      creditCol = credCol;
      singleAmountCol = montCol;
      break;
    }
  }

  // Fallback sécurisé si l'en-tête n'est pas identifié textuellement
  let isHeaderless = false;
  if (headerIndex === -1) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row) || row.length < 3) continue;

      const date0 = parseDateToIso(String(row[0] || ""));
      const date1 = parseDateToIso(String(row[1] || ""));

      if (date0) {
        isHeaderless = true;
        headerIndex = i; // Les transactions commencent dès cet index
        dateCol = 0;
        if (date1) {
          // Col 1 est la date de valeur !
          labelCol = 2;
          debitCol = 3;
          creditCol = 4;
        } else {
          labelCol = 1;
          debitCol = 2;
          creditCol = 3;
        }
        break;
      }
    }
  }

  if (headerIndex === -1) {
    headerIndex = 0;
    dateCol = 0;
    labelCol = 1;
    debitCol = 2;
    creditCol = 3;
  }

  const results: CANormalizedTransaction[] = [];
  const startIndex = isHeaderless ? headerIndex : headerIndex + 1;
  const occurrenceMap = new Map<string, number>();

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rawDate = row[dateCol];
    if (!rawDate || !String(rawDate).trim()) continue;

    const dateInfo = parseDateToIso(String(rawDate));
    if (!dateInfo) continue;

    // Calcul du montant unifié
    let amount = 0;
    if (debitCol !== -1 || creditCol !== -1) {
      const rawDebit = debitCol !== -1 ? row[debitCol] : undefined;
      const rawCredit = creditCol !== -1 ? row[creditCol] : undefined;

      const parsedDebit = parseAmount(rawDebit);
      const parsedCredit = parseAmount(rawCredit);

      if (parsedDebit !== null && parsedDebit !== 0) {
        amount = -Math.abs(parsedDebit);
      } else if (parsedCredit !== null && parsedCredit !== 0) {
        amount = Math.abs(parsedCredit);
      } else {
        continue; // Ligne sans montant valide
      }
    } else if (singleAmountCol !== -1) {
      const parsedVal = parseAmount(row[singleAmountCol]);
      if (parsedVal === null || parsedVal === 0) continue;
      amount = parsedVal;
    } else {
      continue;
    }

    // Récupération de la cellule libellé avec détection et correction automatique si c'est une date
    let activeLabelCol = labelCol;
    let rawLabelCell = String(row[activeLabelCol] || "").replace(/[\r\n\t]+/g, " ").trim();

    if (
      !rawLabelCell ||
      parseDateToIso(rawLabelCell) !== null ||
      /^\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?$/.test(rawLabelCell)
    ) {
      const altCol = row.findIndex((val, idx) => {
        if (
          idx === dateCol ||
          idx === debitCol ||
          idx === creditCol ||
          idx === singleAmountCol
        ) {
          return false;
        }
        const text = String(val || "").trim();
        if (!text) return false;
        if (parseDateToIso(text) !== null) return false;
        if (parseAmount(text) !== null) return false;
        return /[a-zA-ZÀ-ÿ]/.test(text);
      });

      if (altCol !== -1) {
        activeLabelCol = altCol;
        rawLabelCell = String(row[activeLabelCol] || "").replace(/[\r\n\t]+/g, " ").trim();
      }
    }

    if (!rawLabelCell) continue;

    const cleanedLabel = cleanCALabel(rawLabelCell, amount);
    if (!cleanedLabel) continue;

    // Identifiant unique stable basé sur les données et le slug
    const slug = toSlug(cleanedLabel) || "tx";
    const baseKey = `${dateInfo.date}_${amount}_${slug}`;
    const occurrenceIndex = (occurrenceMap.get(baseKey) || 0) + 1;
    occurrenceMap.set(baseKey, occurrenceIndex);
    const uniqueId = `ca_${baseKey}_${occurrenceIndex}`;

    results.push({
      id: uniqueId,
      date: dateInfo.date,
      month: dateInfo.month,
      label: cleanedLabel,
      rawLabel: rawLabelCell,
      amount,
      account: "Crédit Agricole",
    });
  }

  return results;
}

export default parseCreditAgricoleCSV;
