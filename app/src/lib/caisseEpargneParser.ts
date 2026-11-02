import Papa from "papaparse";
import { cleanMerchantName, normalizeText } from "./categorization";
import { parseDateToIso, parseAmount } from "./boursoParser";

export interface CENormalizedTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  label: string; // Nom propre nettoyé (issu prioritairement de Libelle simplifie)
  rawLabel: string; // Libellé complet d'origine sans retours à la ligne
  amount: number; // Négatif pour débit, positif pour crédit
  account: "Caisse d'Épargne";
  categoryBourso?: string; // Libellé combiné Categorie - Sous categorie pour interopérabilité
  categoryCE?: string;
  subCategoryCE?: string;
}

function toSlug(str: string): string {
  return normalizeText(str)
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * PARSEUR CAISSE D'ÉPARGNE (GROUPE BPCE)
 * 
 * Spécifications réelles :
 * - Délimiteur strict ';'
 * - Gestion native des guillemets et sauts de ligne internes (RFC 4180)
 * - Ignore les lignes de métadonnées initiales (ex: "Compte de dépôt n° ...", "Solde au ...")
 * - Détecte dynamiquement la ligne d'en-tête réelle :
 *   "Date de comptabilisation;Libelle simplifie;Libelle operation;Reference;Informations complementaires;Type operation;Categorie;Sous categorie;Debit;Credit;Date operation;Date de valeur;Pointage operation"
 *   ainsi que les variantes abrégées ("Date de l'opération;Date de valeur;Libellé;Débit;Crédit").
 * - Colonnes clés :
 *   * Date : Date operation (JJ/MM/AAAA) prioritaire, avec repli sur Date de comptabilisation.
 *   * Libellé : Libelle simplifie (déjà épuré par la banque) prioritaire, avec repli sur Libelle operation.
 *   * Montants : Débit (< 0) et Crédit (> 0) avec virgule et signes négatifs pris en compte.
 *   * Catégorisation native : colonnes Categorie et Sous categorie conservées pour mapping métier.
 * - ID unique déterministe préfixé 'ce_' basé sur date, montant, slug et compteur d'occurrence.
 */
export function parseCaisseEpargneCSV(content: string): CENormalizedTransaction[] {
  if (!content || !content.trim()) return [];

  const parsed = Papa.parse<string[]>(content, {
    delimiter: ";",
    quoteChar: '"',
    skipEmptyLines: false,
  });

  const rows = parsed.data;
  if (!rows || rows.length === 0) return [];

  // 1. Détection dynamique de la ligne d'en-tête (ignore les métadonnées initiales)
  let headerIndex = -1;
  let dateOpCol = -1;
  let dateComptaCol = -1;
  let dateGenericCol = -1;
  let libelleSimplifieCol = -1;
  let libelleOperationCol = -1;
  let genericLabelCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let singleAmountCol = -1;
  let categoryCol = -1;
  let subCategoryCol = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    const normalizedCols = row.map(col => normalizeText(String(col || "")));

    // Date d'achat réelle (prioritaire)
    const dOp = normalizedCols.findIndex(
      c =>
        c === "date operation" ||
        c === "date d'operation" ||
        c === "date d operation" ||
        c === "date de l'operation" ||
        c === "date de l operation" ||
        c.startsWith("date op")
    );

    // Date de comptabilisation (repli)
    const dCompta = normalizedCols.findIndex(
      c => c.includes("comptabilisation") || c.includes("compta")
    );

    // Date générique (excluant date de valeur)
    let dGen = normalizedCols.findIndex(
      c => (c.includes("date") && !c.includes("valeur") && !c.includes("compta")) || c === "date"
    );
    if (dGen === -1) {
      dGen = normalizedCols.findIndex(c => c.includes("date"));
    }

    // Libellé simplifié (priorité absolue pour le nom du marchand)
    const lSimp = normalizedCols.findIndex(
      c => c.includes("simplifie") || c === "libelle simplifie"
    );

    // Libellé opération (monétique / complet)
    const lOp = normalizedCols.findIndex(
      c => (c.includes("libelle") && c.includes("operation")) || c === "libelle operation"
    );

    // Libellé générique
    const lGen = normalizedCols.findIndex(
      c =>
        !c.includes("date") &&
        !c.includes("type") &&
        (c.includes("libelle") || c.includes("detail") || c.includes("designation"))
    );

    // Montants
    const deb = normalizedCols.findIndex(c => c.includes("debit"));
    const cred = normalizedCols.findIndex(c => c.includes("credit"));
    const mont = normalizedCols.findIndex(c => c === "montant" || c.includes("montant"));

    // Catégorisation native Caisse d'Épargne
    const cat = normalizedCols.findIndex(
      c => (c === "categorie" || c.startsWith("categorie")) && !c.includes("sous")
    );
    const subCat = normalizedCols.findIndex(
      c => c.includes("sous categorie") || c.includes("sous-categorie")
    );

    const hasDate = dOp !== -1 || dCompta !== -1 || dGen !== -1;
    const hasLabel = lSimp !== -1 || lOp !== -1 || lGen !== -1;
    const hasAmount = deb !== -1 || cred !== -1 || mont !== -1;

    // L'en-tête doit comporter au moins la date, le libellé et une information de montant
    if (hasDate && hasLabel && hasAmount) {
      headerIndex = i;
      dateOpCol = dOp;
      dateComptaCol = dCompta;
      dateGenericCol = dGen;
      libelleSimplifieCol = lSimp;
      libelleOperationCol = lOp;
      genericLabelCol = lGen;
      debitCol = deb;
      creditCol = cred;
      categoryCol = cat;
      subCategoryCol = subCat;
      if (deb === -1 && cred === -1 && mont !== -1) {
        singleAmountCol = mont;
      }
      break;
    }
  }

  // Fallback si l'en-tête n'est pas identifiée
  if (headerIndex === -1) {
    headerIndex = 0;
    dateGenericCol = 0;
    genericLabelCol = 2;
    debitCol = 3;
    creditCol = 4;
  }

  const results: CENormalizedTransaction[] = [];
  const startIndex = headerIndex + 1;
  const occurrenceMap = new Map<string, number>();

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    // 1. Date : Date opération prioritaire, avec repli sur Date comptabilisation
    let rawDateStr = "";
    if (dateOpCol !== -1 && row[dateOpCol] && String(row[dateOpCol]).trim()) {
      rawDateStr = String(row[dateOpCol]).trim();
    } else if (dateComptaCol !== -1 && row[dateComptaCol] && String(row[dateComptaCol]).trim()) {
      rawDateStr = String(row[dateComptaCol]).trim();
    } else if (dateGenericCol !== -1 && row[dateGenericCol] && String(row[dateGenericCol]).trim()) {
      rawDateStr = String(row[dateGenericCol]).trim();
    }

    if (!rawDateStr) continue;
    const dateInfo = parseDateToIso(rawDateStr);
    if (!dateInfo) continue;

    // 2. Libellé : Libelle simplifie prioritaire sur Libelle operation
    const valSimplifie = libelleSimplifieCol !== -1
      ? String(row[libelleSimplifieCol] || "").replace(/[\r\n\t]+/g, " ").trim()
      : "";
    const valOperation = libelleOperationCol !== -1
      ? String(row[libelleOperationCol] || "").replace(/[\r\n\t]+/g, " ").trim()
      : "";
    const valGeneric = genericLabelCol !== -1
      ? String(row[genericLabelCol] || "").replace(/[\r\n\t]+/g, " ").trim()
      : "";

    const rawLabelCell = valOperation || valGeneric || valSimplifie;
    if (!rawLabelCell && !valSimplifie) continue;

    // Si Libelle simplifie existe, le formater proprement ; sinon nettoyer le libellé brut d'opération
    const cleanedLabel = valSimplifie
      ? cleanMerchantName(valSimplifie)
      : cleanMerchantName(rawLabelCell);
    if (!cleanedLabel) continue;

    // 3. Montants Débit / Crédit ou Montant unique
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

      if (parsedCredit !== null && parsedCredit !== 0) {
        // Crédit est toujours un encaissement strict (> 0)
        amount = Math.abs(parsedCredit);
      } else if (parsedDebit !== null && parsedDebit !== 0) {
        // Débit est toujours une dépense stricte (< 0), même si la banque fournit une chaîne déjà négative
        amount = -Math.abs(parsedDebit);
      } else {
        continue; // Ligne sans montant valide
      }
    }

    // 4. Catégorisation native Caisse d'Épargne
    const categoryCE = categoryCol !== -1 ? String(row[categoryCol] || "").trim() : undefined;
    const subCategoryCE = subCategoryCol !== -1 ? String(row[subCategoryCol] || "").trim() : undefined;
    const combinedCategory = [categoryCE, subCategoryCE].filter(Boolean).join(" - ") || undefined;

    // 5. Identifiant unique stable et déterministe
    const slug = toSlug(cleanedLabel) || "tx";
    const baseKey = `${dateInfo.date}_${amount}_${slug}`;
    const occurrenceIndex = (occurrenceMap.get(baseKey) || 0) + 1;
    occurrenceMap.set(baseKey, occurrenceIndex);
    const uniqueId = `ce_${baseKey}_${occurrenceIndex}`;

    results.push({
      id: uniqueId,
      date: dateInfo.date,
      month: dateInfo.month,
      label: cleanedLabel,
      rawLabel: rawLabelCell,
      amount,
      account: "Caisse d'Épargne",
      categoryBourso: combinedCategory,
      categoryCE: categoryCE || undefined,
      subCategoryCE: subCategoryCE || undefined,
    });
  }

  return results;
}
