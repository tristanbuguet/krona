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

function toSlug(str: string): string {
  return normalizeText(str)
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30);
}

/**
 * PARSEUR CRÉDIT AGRICOLE STRICT & SÉCURISÉ
 * - Découplé de toute logique propre aux autres banques
 * - Séparateur strict ';'
 * - Gestion native des sauts de ligne internes (\n) au sein des libellés entre guillemets via RFC 4180
 * - Ignore les métadonnées initiales (titre, compte, solde) en repérant dynamiquement "Date;Libellé;Débit euros;Crédit euros;"
 * - Débits (< 0) et Crédits (> 0) gérés distinctement
 * - ID unique basé sur date + montant + slug + index pour préserver tous les doublons légitimes
 */
export function parseCreditAgricoleCSV(content: string): CANormalizedTransaction[] {
  if (!content || !content.trim()) return [];

  // Parse PapaParse avec séparateur strict ';' et prise en charge des retours à la ligne entre guillemets
  const parsed = Papa.parse<string[]>(content, {
    delimiter: ";",
    quoteChar: '"',
    skipEmptyLines: false, // Nécessaire pour conserver la structure des lignes avant en-tête
  });

  const rows = parsed.data;
  if (!rows || rows.length === 0) return [];

  // 1. Détection dynamique de la ligne d'en-tête du tableau (ignore les ~10 lignes de métadonnées)
  let headerIndex = -1;
  let dateCol = -1;
  let labelCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let singleAmountCol = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    const normalizedCols = row.map(col => normalizeText(String(col || "")));

    const dCol = normalizedCols.findIndex(c => c.startsWith("date"));
    const lCol = normalizedCols.findIndex(c => c.includes("libelle") || c.includes("operation"));
    const debCol = normalizedCols.findIndex(c => c.includes("debit"));
    const credCol = normalizedCols.findIndex(c => c.includes("credit"));
    const montCol = normalizedCols.findIndex(c => c === "montant" || c.includes("montant"));

    // Vérifie la présence des colonnes indispensables du relevé CA
    if (dCol !== -1 && lCol !== -1 && (debCol !== -1 || credCol !== -1 || montCol !== -1)) {
      headerIndex = i;
      dateCol = dCol;
      labelCol = lCol;
      debitCol = debCol;
      creditCol = credCol;
      if (debCol === -1 && credCol === -1 && montCol !== -1) {
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

  const results: CANormalizedTransaction[] = [];
  const startIndex = headerIndex + 1;
  const occurrenceMap = new Map<string, number>();

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rawDate = row[dateCol];
    if (!rawDate || !String(rawDate).trim()) continue;

    const dateInfo = parseDateToIso(String(rawDate));
    if (!dateInfo) continue;

    // Nettoyage des sauts de ligne internes et mentions parasites dans le libellé
    const rawLabelCell = String(row[labelCol] || "").replace(/[\r\n\t]+/g, " ").trim();
    if (!rawLabelCell) continue;

    const cleanedLabel = cleanMerchantName(rawLabelCell);
    if (!cleanedLabel) continue;

    // Calcul du montant unifié à partir des colonnes Débit et Crédit
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
        // Débit est toujours une dépense stricte (< 0)
        amount = -Math.abs(parsedDebit);
      } else if (parsedCredit !== null && parsedCredit !== 0) {
        // Crédit est toujours un encaissement strict (> 0)
        amount = Math.abs(parsedCredit);
      } else {
        continue; // Ligne sans montant valide
      }
    }

    // Identifiant unique stable basé sur les données et l'occurrence
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
