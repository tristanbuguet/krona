import { cleanMerchantName, normalizeText } from "./categorization";
import { RawTransaction } from "./lclParser";
import { BankRefreshQuota, BankSessionInfo, Transaction } from "./types";

export const ENABLE_BANKING_MAX_DAILY_REFRESHES = 4;
export const ENABLE_BANKING_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ENABLE_BANKING_HISTORY_DAYS = 89;

/**
 * Calcule le quota d'actualisations DSP2 restantes sur les dernières 24 heures (max 4 consultations).
 */
export function computeBankRefreshQuota(
  timestamps?: string[] | null,
  nowMs: number = Date.now(),
  limit: number = ENABLE_BANKING_MAX_DAILY_REFRESHES
): BankRefreshQuota {
  const rawList = Array.isArray(timestamps) ? timestamps : [];
  const validRecent = rawList
    .map((ts) => {
      const parsed = Date.parse(ts);
      return isNaN(parsed) ? null : { iso: new Date(parsed).toISOString(), ms: parsed };
    })
    .filter((item): item is { iso: string; ms: number } => {
      if (!item) return false;
      const age = nowMs - item.ms;
      return age >= -60_000 && age < ENABLE_BANKING_QUOTA_WINDOW_MS;
    })
    .sort((a, b) => a.ms - b.ms);

  const used = Math.min(limit, validRecent.length);
  const remaining = Math.max(0, limit - used);
  const resetAt =
    validRecent.length >= limit
      ? new Date(validRecent[validRecent.length - limit].ms + ENABLE_BANKING_QUOTA_WINDOW_MS).toISOString()
      : validRecent.length > 0
        ? new Date(validRecent[0].ms + ENABLE_BANKING_QUOTA_WINDOW_MS).toISOString()
        : null;

  return {
    limit,
    used,
    remaining,
    timestamps: validRecent.map((v) => v.iso),
    resetAt,
  };
}

/**
 * Enregistre une nouvelle actualisation bancaire dans le quota 24h si la limite DSP2 (4/jour) n'est pas atteinte.
 */
export function consumeBankRefreshQuota(
  session?: Pick<BankSessionInfo, "refreshTimestamps" | "refreshQuota"> | null,
  nowMs: number = Date.now(),
  limit: number = ENABLE_BANKING_MAX_DAILY_REFRESHES
): { allowed: boolean; quota: BankRefreshQuota } {
  const existingTimestamps =
    session?.refreshTimestamps || session?.refreshQuota?.timestamps || [];
  const currentQuota = computeBankRefreshQuota(existingTimestamps, nowMs, limit);

  if (currentQuota.remaining <= 0) {
    return {
      allowed: false,
      quota: currentQuota,
    };
  }

  const nowIso = new Date(nowMs).toISOString();
  const nextTimestamps = [...currentQuota.timestamps, nowIso];
  const updatedQuota = computeBankRefreshQuota(nextTimestamps, nowMs, limit);

  return {
    allowed: true,
    quota: updatedQuota,
  };
}

/**
 * Préfixes d'agrégateurs / terminaux de paiement (SumUp, Square, Zettle, PayPal, Stripe…)
 * qui précèdent le vrai nom du commerçant : "SNP*MLG EVENTS" -> "MLG EVENTS", "SQ *CAFE" -> "CAFE".
 */
const PAYMENT_PROCESSOR_PREFIX =
  /^(?:SNP|SQ|SP|SUMUP|SUM\s?UP|ZTL|IZ|IZETTLE|PP|PAYPAL|STRIPE|STR|MOLLIE|ADY|ADYEN|PAYPLUG|DRI|GOOGLE|APPLE\.COM\/BILL|HELLOASSO|WWW|TPE)\s*\*\s*/i;

/**
 * Supprime les scories techniques des terminaux et passerelles :
 * - "Ebay 0*04-15396-3" (référence de commande après un astérisque)
 * - "Bolt.eu/o/2611010" (domaine + chemin de reçu)
 * - "Snp*mlg Events" (préfixe d'agrégateur)
 * Idempotent : peut être appliquée plusieurs fois sans altérer un libellé déjà propre.
 */
export function stripTerminalNoise(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return s;

  for (let i = 0; i < 2; i++) s = s.replace(PAYMENT_PROCESSOR_PREFIX, "").trim();

  // Chemins d'URL / reçus : "BOLT.EU/O/2611010" -> "BOLT.EU"
  s = s.replace(/(\.[a-z]{2,4})\/\S*/gi, "$1");
  // Domaines : "BOLT.EU" -> "BOLT", "NETFLIX.COM" -> "NETFLIX", "WWW.AMAZON.FR" -> "AMAZON"
  s = s.replace(/^WWW\./i, "");
  s = s.replace(/\.(?:com|eu|fr|net|org|io|co|uk|de|es|it|nl|be|app|me)\b\.?/gi, " ");
  // Référence après astérisque : "EBAY 0*04-15396-3", "AMAZON*2K3L49", "UBER *TRIP 8DJ2"
  s = s.replace(/\s*[A-Z0-9]*\*[A-Z0-9][A-Z0-9\-\/.]*$/i, "");
  s = s.replace(/\s*\*+\s*$/, "");
  // Références numériques à tirets / longues séries de chiffres en fin de libellé : "04-15396-3", "2611010"
  s = s.replace(/\s+[0-9][0-9\-\/.]{4,}$/g, "");
  s = s.replace(/\s+\d{5,}\b/g, " ");
  // Séparateurs orphelins
  s = s.replace(/[*_#]+/g, " ").replace(/\s+-\s*$/, "").replace(/\s+/g, " ").trim();

  return s || (raw || "").trim();
}

/** Graphies officielles des marques dont le Title Case générique est incorrect. */
const MERCHANT_ALIASES: Array<[RegExp, string]> = [
  [/^ebay\b.*$/i, "eBay"],
  [/^bolt\b(?!\s+food).*$/i, "Bolt"],
  [/^bolt\s+food\b.*$/i, "Bolt Food"],
  [/^paypal\b.*$/i, "PayPal"],
  [/^amazon\s*(prime|prime video)\b.*$/i, "Amazon Prime"],
  [/^(amazon|amzn)(\s*(mktp|mktplace|marketplace|eu|payments|digital|fr))*\b.*$/i, "Amazon"],
  [/^netflix\b.*$/i, "Netflix"],
  [/^spotify\b.*$/i, "Spotify"],
  [/^uber\s+eats\b.*$/i, "Uber Eats"],
  [/^uber\s+one\b.*$/i, "Uber One"],
  [/^uber(\s+trip|\s+bv|\s+help)?\b(?!\s+(eats|one)).*$/i, "Uber"],
  [/^deliveroo\b.*$/i, "Deliveroo"],
  [/^sncf\b.*$/i, "SNCF"],
  [/^ratp\b.*$/i, "RATP"],
  [/^(free\s+mobile|freemobile)\b.*$/i, "Free Mobile"],
  [/^sfr\b.*$/i, "SFR"],
  [/^edf\b.*$/i, "EDF"],
  [/^ikea\b.*$/i, "IKEA"],
  [/^lidl\b.*$/i, "Lidl"],
  [/^apple\b.*$/i, "Apple"],
  [/^google\b.*$/i, "Google"],
  [/^vinted\b.*$/i, "Vinted"],
  [/^lydia\b.*$/i, "Lydia"],
  [/^mlg\s+events?\b.*$/i, "MLG Events"],
  [/^basic\s*fit(\s+ii|\s+sc\s*\d+)?\b.*$/i, "Basic Fit"],
  [/^bouygues(\s+telecom)?(\s+sc\s*\d+)?\b.*$/i, "Bouygues Telecom"],
];

function applyMerchantAlias(name: string): string {
  for (const [regex, canonical] of MERCHANT_ALIASES) {
    if (regex.test(name)) return canonical;
  }
  return name;
}

/**
 * Nettoie en profondeur les libellés Open Banking bruts :
 * - Supprime les préfixes techniques de carte (CARTE DD/MM/YY ... CB*XXXX)
 * - Normalise les caractères spéciaux parasites d'enseignes (UBER *EATS -> Uber Eats, SHOTGUN* -> Shotgun)
 * - Corrige les noms d'enseignes tronqués à 16 caractères (GALERIES LAFAYET -> Galeries Lafayette)
 * - Supprime les codes de caisse/département isolés en fin de libellé carte (ex. PICARD 2 -> Picard)
 */
export function cleanOpenBankingMerchantLabel(raw: string, isCardLabel: boolean = false): string {
  if (!raw) return "";
  let s = raw.replace(/[\r\n\t]+/g, " ").trim();

  const looksLikeCard =
    isCardLabel ||
    /^(CARTE|PAIEMENT\s+CB|PAIEMENT\s+CARTE|ACHAT\s+CB|CB\b)/i.test(s) ||
    /\bCB\*\d+/i.test(s);

  // Supprimer les codes cartes CB*XXXX avant de nettoyer les suffixes numériques
  s = s.replace(/\bCB\*\d+\b/gi, " ").trim();

  // Nettoyer les préfixes redondants "VIR Virement" -> "Virement"
  s = s.replace(/^VIR(EMENT)?\s+(?=VIREMENT\b)/i, "").trim();

  // Normaliser les séparateurs techniques d'enseignes
  s = s.replace(/\bUBER\s*\*\s*EATS(?:\s+HELP\.U\w*)?/gi, "Uber Eats");
  s = s.replace(/\bUBER\s*\*\s*ONE(?:\s+MEMBE\w*)?/gi, "Uber One");
  s = s.replace(/\bSHOTGUN\s*\*/gi, "Shotgun ");
  s = s.replace(/\bMC\s+DONALD\s*S\b/gi, "McDonald's");
  s = s.replace(/\bGALERIES\s+LAFAYET(?:TE)?\b/gi, "Galeries Lafayette");
  s = s.replace(/\bGOOD\s*NEWS(?:\s+LA\s+FAYE\w*)?/gi, "Goodnews");
  s = s.replace(/\bVIC\s+CO\b/gi, "Vicco");
  s = s.replace(/\bBOUYGUES\s+TELECOM\s+BOUYGUES\s+TELE\w*/gi, "Bouygues Telecom");
  s = s.replace(/\bSC\.?AUT\.?TASTY\s+CROU\w*/gi, "Tasty Crous");

  // Si c'est un libellé carte, retirer le chiffre de caisse/zone final isolé
  if (looksLikeCard) {
    s = s.replace(/\s+(?:SC\s+)?\d{1,2}\s*$/i, "").trim();
  }

  s = stripTerminalNoise(s);

  const cleaned = cleanMerchantName(s);
  return applyMerchantAlias(cleaned);
}

/**
 * Signature comptable canonique : `date_signedAmount_normalizedMerchant`.
 */
export function buildDeduplicationSignature(date: string, amount: number, label: string): string {
  const cleaned = cleanOpenBankingMerchantLabel(label, true) || cleanMerchantName(label);
  const slug = normalizeText(cleaned).replace(/[^a-z0-9]/g, "");
  return `${date}_${amount.toFixed(2)}_${slug}`;
}

/**
 * Déduplication multi-comptes bancaires (ex: BoursoBank Compte Courant CACC + Carte Débit CARD).
 * Si une opération carte débitée immédiatement sur le compte courant apparaît à la fois
 * sur le compte courant et sur le compte carte, l'entrée carte est un miroir technique :
 * seule l'opération du compte courant est conservée.
 */
export function deduplicateCrossAccountBankTransactions(
  rawList: RawTransaction[],
  accountsMeta?: Array<{ uid: string; cashAccountType?: string; name?: string }>
): RawTransaction[] {
  if (!Array.isArray(rawList) || rawList.length <= 1) {
    return Array.isArray(rawList) ? rawList : [];
  }

  const cardUids = new Set<string>();
  const checkingUids = new Set<string>();

  if (Array.isArray(accountsMeta)) {
    for (const acc of accountsMeta) {
      const type = (acc.cashAccountType || "").toUpperCase();
      const name = (acc.name || "").toLowerCase();
      if (type === "CARD" || name.includes("carte") || name.includes("card")) {
        cardUids.add(acc.uid);
      } else if (
        type === "CACC" ||
        name.includes("courant") ||
        name.includes("dépôt") ||
        name.includes("checking")
      ) {
        checkingUids.add(acc.uid);
      }
    }
  }

  const sigGroups = new Map<string, Array<{ tx: RawTransaction; isCard: boolean }>>();

  for (const tx of rawList) {
    const cleaned = cleanOpenBankingMerchantLabel(tx.label, true) || cleanMerchantName(tx.label);
    const slug = normalizeText(cleaned).replace(/[^a-z0-9]/g, "");
    const sig = `${tx.date}_${tx.amount.toFixed(2)}_${slug}`;
    const isCard = tx.bankAccountUid ? cardUids.has(tx.bankAccountUid) : false;

    const list = sigGroups.get(sig) || [];
    list.push({ tx, isCard });
    sigGroups.set(sig, list);
  }

  const result: RawTransaction[] = [];
  const occurrenceTracker = new Map<string, number>();

  for (const entries of sigGroups.values()) {
    if (entries.length === 1) {
      const tx = entries[0].tx;
      const baseKey = `${tx.date}_${tx.amount}_${normalizeText(tx.label).replace(/[^a-z0-9]/g, "-").slice(0, 30)}`;
      const occ = (occurrenceTracker.get(baseKey) || 0) + 1;
      occurrenceTracker.set(baseKey, occ);
      result.push({ ...tx, id: `eb_${baseKey}_${occ}` });
      continue;
    }

    const hasChecking = entries.some((e) => !e.isCard);
    const hasCard = entries.some((e) => e.isCard);

    let keptEntries: Array<{ tx: RawTransaction; isCard: boolean }> = [];

    if (hasChecking && hasCard) {
      keptEntries = entries.filter((e) => !e.isCard);
    } else {
      const seenAccounts = new Set<string>();
      for (const e of entries) {
        const acc = e.tx.bankAccountUid || "default";
        if (!seenAccounts.has(acc)) {
          seenAccounts.add(acc);
          keptEntries.push(e);
        }
      }
    }

    for (const e of keptEntries) {
      const tx = e.tx;
      const baseKey = `${tx.date}_${tx.amount}_${normalizeText(tx.label).replace(/[^a-z0-9]/g, "-").slice(0, 30)}`;
      const occ = (occurrenceTracker.get(baseKey) || 0) + 1;
      occurrenceTracker.set(baseKey, occ);
      result.push({ ...tx, id: `eb_${baseKey}_${occ}` });
    }
  }

  return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Détecte si un marchand correspond à un abonnement fixe récurrent ou un prélèvement unique par date
 * (ex: Bouygues Telecom, Uber One, Basic Fit, Netflix...).
 */
export function isStrictRecurringSubscription(name: string): boolean {
  const n = normalizeText(name);
  if (n.includes("uber one") || n.includes("uberone")) return true;
  if (n.includes("bouygues")) return true;
  if (n.includes("basic fit") || n.includes("basicfit") || n.includes("basic-fit")) return true;
  if (n.includes("netflix") || n.includes("spotify") || n.includes("deezer")) return true;
  if (
    n.includes("free mobile") ||
    n.includes("sfr fibre") ||
    n.includes("sfr mobile") ||
    n.includes("orange fibre")
  )
    return true;
  if (n.includes("loyer") || n.includes("cotisation") || n.includes("salaire")) return true;
  return false;
}

/**
 * Choisit la version la plus riche et la plus récente parmi plusieurs transactions en doublon.
 */
export function pickBestTransaction(candidates: Transaction[]): Transaction {
  if (candidates.length === 1) return candidates[0];

  return candidates.reduce((best, curr) => {
    const bestScore =
      (best.type && best.type !== "Autre" ? 20 : 0) +
      (best.isSubscription ? 5 : 0) +
      (best.isInternalTransfer ? 5 : 0) +
      (best.source === "bank" ? 2 : 0) +
      (best.updatedAt ? Date.parse(best.updatedAt) / 1e12 : 0);

    const currScore =
      (curr.type && curr.type !== "Autre" ? 20 : 0) +
      (curr.isSubscription ? 5 : 0) +
      (curr.isInternalTransfer ? 5 : 0) +
      (curr.source === "bank" ? 2 : 0) +
      (curr.updatedAt ? Date.parse(curr.updatedAt) / 1e12 : 0);

    return currScore > bestScore ? curr : best;
  });
}

/**
 * Assainit et déduplique définitivement une liste de transactions financières.
 * Élimine les doublons créés par :
 * 1. Les variations d'identifiants historiques (eb_... vs eb_acc1_... vs eb_date_amount_...)
 * 2. Les miroirs de comptes carte vs compte courant (BoursoBank Open Banking)
 * 3. Les variantes d'intitulés (ex. "Uber One" vs "UBER *ONE MEMBE", "Bouygues Telecom" vs "PRLV SEPA BOUYGUES TELECOM")
 * 4. Les synchronisations successives empilées
 *
 * Conserve fidèlement les opérations légitimes multiples (ex. 2 achats distincts au même montant)
 * et préserve la catégorie enrichie ou corrigée par l'utilisateur.
 */
export function sanitizeAndDeduplicateTransactions(transactions: Transaction[]): Transaction[] {
  if (!Array.isArray(transactions) || transactions.length <= 1) {
    return Array.isArray(transactions) ? transactions : [];
  }

  // 1. Déduplication stricte par ID d'abord (garder la plus récemment mise à jour)
  const byId = new Map<string, Transaction>();
  for (const tx of transactions) {
    if (!tx || !tx.id) continue;
    const existing = byId.get(tx.id);
    if (!existing) {
      byId.set(tx.id, tx);
    } else {
      const existingTime = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
      const newTime = tx.updatedAt ? Date.parse(tx.updatedAt) : 0;
      if (newTime >= existingTime) {
        byId.set(tx.id, tx);
      }
    }
  }

  const uniqueById = Array.from(byId.values());

  // 2. Déduplication par signature comptable : date + montant signé + commerçant nettoyé
  const isBankTx = (t: Transaction) => t.source === "bank" || t.id.startsWith("eb_");

  const sigGroups = new Map<string, Transaction[]>();
  for (const tx of uniqueById) {
    const sig = buildDeduplicationSignature(tx.date, tx.amount, tx.name);
    const list = sigGroups.get(sig) || [];
    list.push(tx);
    sigGroups.set(sig, list);
  }

  const result: Transaction[] = [];

  for (const group of sigGroups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const bankTxs = group.filter(isBankTx);
    const nonBankTxs = group.filter((t) => !isBankTx(t));

    // Si aucune transaction bancaire (toutes CSV / manuelles avec IDs distincts) :
    // Deux lignes dans un relevé CSV représentent deux achats distincts légitimes
    if (bankTxs.length === 0) {
      result.push(...nonBankTxs);
      continue;
    }

    // S'il s'agit d'un abonnement / prélèvement fixe (Uber One, Bouygues Telecom, Basic Fit, Netflix...) :
    if (isStrictRecurringSubscription(group[0].name)) {
      result.push(pickBestTransaction(group));
      continue;
    }

    // Pour les opérations bancaires ordinaires :
    const occMap = new Map<number, Transaction[]>();
    const unindexedBank: Transaction[] = [];

    for (const tx of bankTxs) {
      const match = tx.id.match(/_(\d+)$/);
      if (match) {
        const occ = parseInt(match[1], 10);
        const list = occMap.get(occ) || [];
        list.push(tx);
        occMap.set(occ, list);
      } else {
        unindexedBank.push(tx);
      }
    }

    // Si des transactions bancaires partagent le même index d'occurrence (_1), fusionner les doublons
    for (const list of occMap.values()) {
      result.push(pickBestTransaction(list));
    }

    // S'il y a des opérations non indexées, fusionner si même signature
    if (unindexedBank.length > 0) {
      if (occMap.size === 0) {
        const byExactId = new Map<string, Transaction>();
        for (const u of unindexedBank) {
          if (!byExactId.has(u.id)) byExactId.set(u.id, u);
        }
        result.push(...byExactId.values());
      } else {
        const best = pickBestTransaction(unindexedBank);
        if (occMap.size === 0) {
          result.push(best);
        }
      }
    }

    // Réinjecter les transactions non bancaires
    for (const nonBank of nonBankTxs) {
      result.push(nonBank);
    }
  }

  return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Traduit le type de compte DSP2 (cash_account_type ISO 20022) vers les types de comptes Krona.
 */
export function mapCashAccountType(
  cashAccountType?: string,
  accountName?: string
): "Compte courant" | "Livret d'épargne" | "Carte bancaire" {
  const t = (cashAccountType || "").toUpperCase();
  const n = (accountName || "").toLowerCase();
  if (t === "SVGS" || t === "MOMA" || t === "ONDP" || /livret|epargne|épargne|ldd|lep|pel|cel|savings/.test(n))
    return "Livret d'épargne";
  if (t === "CARD" || /carte|card/.test(n)) return "Carte bancaire";
  return "Compte courant";
}

/**
 * Durée restante avant expiration du consentement DSP2 (en jours, arrondi inférieur). null si inconnue.
 */
export function daysUntilConsentExpiry(
  validUntil?: string | null,
  nowMs: number = Date.now()
): number | null {
  if (!validUntil) return null;
  const ms = Date.parse(validUntil);
  if (isNaN(ms)) return null;
  return Math.floor((ms - nowMs) / (24 * 3600 * 1000));
}
