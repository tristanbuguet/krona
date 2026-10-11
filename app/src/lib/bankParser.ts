import Papa from "papaparse";

export type BankType = "bourso" | "ca";

export interface NormalizedTransaction {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  label: string; // Nom propre et nettoyé
  rawLabel: string;
  amount: number; // Négatif pour dépense, positif pour crédit
  account: "BoursoBank" | "Crédit Agricole";
  categoryBourso?: string;
}

/**
 * Nettoyage des libellés selon les spécifications strictes :
 * Remplace les retours à la ligne internes et espaces multiples par un espace unique propre.
 */
export function cleanLabel(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Conversion robuste des dates JJ/MM/AAAA (français) vers ISO AAAA-MM-JJ.
 */
export function parseDateToIso(dateStr: string): { date: string; month: string } | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();

  // Format français : JJ/MM/AAAA ou JJ-MM-AAAA ou JJ.MM.AAAA
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

  // Format ISO déjà présent : AAAA-MM-JJ
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

  // Fallback Date standard
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
 * Parser BoursoBank :
 * Format standard BoursoBank avec séparateur ';' :
 * Colonne 0 : date d'opération
 * Colonne 2 : libellé brut
 * Colonne 3 : libellé suggéré
 * Colonne 4 : catégorie Bourso
 * Colonne 5 ou 6 : montant
 */
export function parseBoursoBankRows(rows: string[][]): NormalizedTransaction[] {
  const result: NormalizedTransaction[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    // Ignorer la ligne d'en-tête contenant "date"
    if (i === 0 && row[0] && String(row[0]).toLowerCase().includes("date")) continue;

    // Doit avoir au moins date et montant
    if (row.length < 6 || !row[0]) continue;
    const rawAmountStr = row[6] !== undefined ? row[6] : row[5];
    if (rawAmountStr === undefined || rawAmountStr === null || String(rawAmountStr).trim() === "") continue;

    const dateInfo = parseDateToIso(String(row[0]));
    if (!dateInfo) continue;

    const rawLibelle = cleanLabel(String(row[2] || ""));
    const suggLibelle = cleanLabel(String(row[3] || ""));
    const categoryBourso = String(row[4] || "").trim();

    const cleanedAmount = String(rawAmountStr).replace(/\s/g, "").replace("€", "").replace(",", ".");
    const amount = parseFloat(cleanedAmount);
    if (isNaN(amount) || amount === 0) continue;

    const finalLabel = suggLibelle || rawLibelle || "Inconnu";

    result.push({
      date: dateInfo.date,
      month: dateInfo.month,
      label: finalLabel,
      rawLabel: rawLibelle || suggLibelle || "Inconnu",
      amount,
      account: "BoursoBank",
      categoryBourso,
    });
  }

  return result;
}

/**
 * Parser Crédit Agricole :
 * 1. Ignore les métadonnées de tête en recherchant dynamiquement la ligne d'en-tête (Date, Libellé, Débit euros, Crédit euros)
 * 2. Gère les libellés multi-lignes entre guillemets et nettoie les sauts de ligne
 * 3. Normalise les montants : Débit = négatif (-Math.abs(debit)), Crédit = positif (+Math.abs(credit))
 * 4. Convertit les dates JJ/MM/AAAA vers ISO AAAA-MM-JJ
 */
export function parseCreditAgricoleRows(rows: string[][]): NormalizedTransaction[] {
  const result: NormalizedTransaction[] = [];

  // 1. Recherche dynamique de la ligne d'en-tête
  let headerIndex = -1;
  let dateCol = -1;
  let labelCol = -1;
  let debitCol = -1;
  let creditCol = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    const normalizedCols = row.map((col) =>
      String(col || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Enlève les accents
        .trim()
    );

    const dCol = normalizedCols.findIndex((c) => c.startsWith("date"));
    const lCol = normalizedCols.findIndex((c) => c.includes("libelle") || c.includes("operation"));
    const debCol = normalizedCols.findIndex((c) => c.includes("debit"));
    const credCol = normalizedCols.findIndex((c) => c.includes("credit"));

    if (dCol !== -1 && lCol !== -1 && (debCol !== -1 || credCol !== -1)) {
      headerIndex = i;
      dateCol = dCol;
      labelCol = lCol;
      debitCol = debCol;
      creditCol = credCol;
      break;
    }
  }

  // Fallback si l'en-tête exacte n'a pas été trouvée
  if (headerIndex === -1) {
    headerIndex = 0;
    dateCol = 0;
    labelCol = 1;
    debitCol = 2;
    creditCol = 3;
  }

  // 2. Traitement des lignes d'opérations situées après l'en-tête
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawDate = row[dateCol];
    if (!rawDate || String(rawDate).trim() === "") continue;

    const dateInfo = parseDateToIso(String(rawDate));
    if (!dateInfo) continue;

    const rawLabel = String(row[labelCol] || "");
    const cleanedLabel = cleanLabel(rawLabel);
    if (!cleanedLabel) continue;

    // Calcul du montant unifié
    const rawDebit = debitCol !== -1 ? String(row[debitCol] || "").replace(/\s/g, "").replace("€", "").replace(",", ".").trim() : "";
    const rawCredit = creditCol !== -1 ? String(row[creditCol] || "").replace(/\s/g, "").replace("€", "").replace(",", ".").trim() : "";

    const debitVal = parseFloat(rawDebit);
    const creditVal = parseFloat(rawCredit);

    let amount = 0;
    if (!isNaN(debitVal) && debitVal !== 0) {
      amount = -Math.abs(debitVal);
    } else if (!isNaN(creditVal) && creditVal !== 0) {
      amount = Math.abs(creditVal);
    } else {
      continue; // Ignorer les lignes sans montant valide
    }

    result.push({
      date: dateInfo.date,
      month: dateInfo.month,
      label: cleanedLabel,
      rawLabel: cleanedLabel,
      amount,
      account: "Crédit Agricole",
    });
  }

  return result;
}

/**
 * Détection automatique du type de relevé bancaire (BoursoBank vs Crédit Agricole)
 */
export function detectBankType(rows: string[][]): BankType {
  for (const row of rows.slice(0, 15)) {
    const joined = row
      .join(";")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (
      joined.includes("credit agricole") ||
      joined.includes("compte de dep") ||
      joined.includes("debit euros") ||
      joined.includes("credit euros")
    ) {
      return "ca";
    }
    if (
      joined.includes("dateop") ||
      joined.includes("dateval") ||
      joined.includes("bourso") ||
      joined.includes("category")
    ) {
      return "bourso";
    }
  }

  // Si au moins une ligne a 6 colonnes ou plus au format BoursoBank
  if (rows.some((r) => r.length >= 6)) {
    return "bourso";
  }

  return "ca";
}

/**
 * Parseur universel depuis un fichier File du navigateur :
 * - Applique l'encodage windows-1252 pour le Crédit Agricole afin de préserver les accents et €
 * - Applique UTF-8 pour BoursoBank
 * - Gère RFC 4180 (guillemets et sauts de ligne internes)
 */
export function parseBankCsvFile(
  file: File,
  forcedBank?: BankType
): Promise<{ bank: "BoursoBank" | "Crédit Agricole"; transactions: NormalizedTransaction[] }> {
  return new Promise((resolve, reject) => {
    // Le Crédit Agricole requiert explicitement windows-1252 (ou ISO-8859-1)
    const encoding = forcedBank === "ca" ? "windows-1252" : (forcedBank === "bourso" ? "UTF-8" : "windows-1252");

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = (e.target?.result as string) || "";

        Papa.parse<string[]>(text, {
          delimiter: ";",
          skipEmptyLines: false, // Nécessaire pour conserver la structure avant détection d'en-tête CA
          complete: (results) => {
            const rows = results.data;
            const bankType = forcedBank || detectBankType(rows);

            let transactions: NormalizedTransaction[] = [];
            if (bankType === "ca") {
              transactions = parseCreditAgricoleRows(rows);
            } else {
              transactions = parseBoursoBankRows(rows);
            }

            resolve({
              bank: bankType === "ca" ? "Crédit Agricole" : "BoursoBank",
              transactions,
            });
          },
          error: (err: any) => {
            reject(err);
          },
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsText(file, encoding);
  });
}
