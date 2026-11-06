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
 * Calcule l'âge relatif d'une transaction pour arbitrer les doublons en gardant la plus ancienne.
 * Un score plus faible = plus ancien.
 * - Les transactions CSV / manuelles (source: "csv") ont la priorité d'ancienneté (base comptable initiale).
 * - À source égale, la date updatedAt / createdAt la plus ancienne prime.
 * - En l'absence de date, l'indice d'apparition dans le tableau fait foi.
 */
export function getTransactionSortAge(tx: Transaction, originalIndex: number = 0): number {
  const isCsv = tx.source === "csv" || /^(bourso|ca|ce|lcl|csv)_/i.test(tx.id);
  const baseOffset = isCsv ? 0 : 1_000_000_000_000;
  const parsedTime = tx.updatedAt ? Date.parse(tx.updatedAt) : 0;
  const timeComponent = !isNaN(parsedTime) && parsedTime > 0 ? parsedTime : originalIndex * 1000;
  return baseOffset + timeComponent;
}

/**
 * Déduplication avant toute insertion (Appariement un pour un) :
 * - Vérifie si une opération avec la même date, le même montant exact et le même commerçant nettoyé existe déjà.
 * - Si l'opération existe déjà, garde l'existante ("Si une opération existe déjà, garde l'existante").
 * - Si l'opération existante est en attente (PDNG) et que la validée (BOOK) arrive, met à jour vers BOOK.
 * - Deux achats identiques le même jour restent deux opérations si la source en contient deux.
 * - Filtre et rejette toute transaction entrante en attente (PDNG / PEND).
 */
export function deduplicateBeforeInsertion(
  incomingTransactions: Transaction[],
  existingTransactions: Transaction[]
): {
  newTransactions: Transaction[];
  allMergedTransactions: Transaction[];
  removedDuplicatesCount: number;
} {
  if (!Array.isArray(incomingTransactions) || incomingTransactions.length === 0) {
    return {
      newTransactions: [],
      allMergedTransactions: Array.isArray(existingTransactions) ? existingTransactions : [],
      removedDuplicatesCount: 0,
    };
  }

  // 1. Filtrer les opérations entrantes : ne garder strictement que les validées (BOOK / BOOKED)
  const validIncoming = incomingTransactions.filter((tx) => {
    const rawStatus = ((tx as unknown as { status?: string }).status || "").toUpperCase();
    if (rawStatus === "PDNG" || rawStatus === "PEND" || rawStatus === "PENDING") {
      return false;
    }
    return true;
  });

  // 2. Construire le pool des opérations existantes groupées par signature comptable
  const existingPool = new Map<string, Transaction[]>();
  const existingIds = new Set<string>();
  const updatedExistingList = (existingTransactions || []).map((t) => ({ ...t }));

  for (const ex of updatedExistingList) {
    if (ex && ex.id) existingIds.add(ex.id);
    const sig = buildDeduplicationSignature(ex.date, ex.amount, ex.name);
    const list = existingPool.get(sig) || [];
    list.push(ex);
    existingPool.set(sig, list);
  }

  const newTransactions: Transaction[] = [];
  let removedDuplicatesCount = 0;

  // 3. Appariement un pour un sur chaque opération entrante
  for (const inc of validIncoming) {
    if (!inc || !inc.id) continue;

    // Déjà présente par ID strict
    const existingById = updatedExistingList.find((e) => e.id === inc.id);
    if (existingById) {
      const existingStatus = ((existingById as unknown as { status?: string }).status || "").toUpperCase();
      if (
        existingStatus === "PDNG" ||
        existingStatus === "PEND" ||
        (existingById as unknown as { isPending?: boolean }).isPending
      ) {
        existingById.updatedAt = inc.updatedAt || new Date().toISOString();
        (existingById as unknown as { status: string }).status = "BOOK";
        (existingById as unknown as { isPending: boolean }).isPending = false;
        if (existingById.type === "Autre" && inc.type && inc.type !== "Autre") {
          existingById.type = inc.type;
        }
      }
      removedDuplicatesCount++;
      continue;
    }

    const sig = buildDeduplicationSignature(inc.date, inc.amount, inc.name);
    const available = existingPool.get(sig);

    if (available && available.length > 0) {
      // Une opération existe déjà pour cette dépense : on garde l'existante
      const matched = available.shift()!;
      const matchedStatus = ((matched as unknown as { status?: string }).status || "").toUpperCase();

      // Si l'existante était en attente (PDNG), la validée (BOOK) la remplace/met à niveau
      if (matchedStatus === "PDNG" || matchedStatus === "PEND" || (matched as unknown as { isPending?: boolean }).isPending) {
        matched.updatedAt = inc.updatedAt || new Date().toISOString();
        (matched as unknown as { status: string }).status = "BOOK";
        (matched as unknown as { isPending: boolean }).isPending = false;
        if (matched.type === "Autre" && inc.type && inc.type !== "Autre") {
          matched.type = inc.type;
        }
      }

      removedDuplicatesCount++;
      continue;
    }

    // Aucun appariement existant : c'est un achat légitime nouveau (ou un deuxième achat identique)
    newTransactions.push(inc);
    existingIds.add(inc.id);
  }

  const allMergedTransactions = [...newTransactions, ...updatedExistingList].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return {
    newTransactions,
    allMergedTransactions,
    removedDuplicatesCount,
  };
}

/**
 * Supprime les doublons déjà présents dans la base Neon ou le stockage local
 * (en gardant la plus ancienne de chaque paire).
 * Appariement un pour un :
 * - Si une opération CSV et une opération Banque existent pour le même achat, garde la CSV (la plus ancienne).
 * - Si une opération en attente (PDNG) et une validée (BOOK) existent, garde la validée (remplacement).
 * - Si deux opérations bancaires identiques existent pour un même achat (double synchro ou compte carte/courant), garde la plus ancienne.
 * - Deux achats identiques légitimes le même jour restent deux opérations.
 * Ne fait aucun appel réseau vers la banque.
 */
export function cleanDatabaseDuplicates(transactions: Transaction[]): {
  cleanedTransactions: Transaction[];
  removedDuplicatesCount: number;
  removedTransactions: Transaction[];
} {
  if (!Array.isArray(transactions) || transactions.length <= 1) {
    return {
      cleanedTransactions: Array.isArray(transactions) ? transactions : [],
      removedDuplicatesCount: 0,
      removedTransactions: [],
    };
  }

  // 1. Déduplication d'abord par identifiant strict (garder la plus ancienne)
  const byId = new Map<string, { tx: Transaction; index: number }>();
  const idDuplicates: Transaction[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx || !tx.id) continue;
    const existing = byId.get(tx.id);
    if (!existing) {
      byId.set(tx.id, { tx, index: i });
    } else {
      const existingAge = getTransactionSortAge(existing.tx, existing.index);
      const currentAge = getTransactionSortAge(tx, i);
      if (currentAge < existingAge) {
        idDuplicates.push(existing.tx);
        byId.set(tx.id, { tx, index: i });
      } else {
        idDuplicates.push(tx);
      }
    }
  }

  const uniqueByIdList = Array.from(byId.values()).sort((a, b) => a.index - b.index);

  // 2. Regroupement par signature comptable (date + montant exact + commerçant nettoyé)
  const sigGroups = new Map<string, Array<{ tx: Transaction; index: number }>>();
  for (const item of uniqueByIdList) {
    const sig = buildDeduplicationSignature(item.tx.date, item.tx.amount, item.tx.name);
    const list = sigGroups.get(sig) || [];
    list.push(item);
    sigGroups.set(sig, list);
  }

  const keptResult: Transaction[] = [];
  const removedDuplicates: Transaction[] = [...idDuplicates];

  for (const group of sigGroups.values()) {
    if (group.length === 1) {
      keptResult.push(group[0].tx);
      continue;
    }

    // Gestion du cas BOOK vs PDNG : si une version BOOK et une version PDNG coexistent, éliminer la PDNG
    const hasBook = group.some((item) => {
      const s = ((item.tx as unknown as { status?: string }).status || "").toUpperCase();
      return s === "BOOK" || s === "BOOKED";
    });
    const nonPdngGroup = hasBook
      ? group.filter((item) => {
          const s = ((item.tx as unknown as { status?: string }).status || "").toUpperCase();
          const isPending = (item.tx as unknown as { isPending?: boolean }).isPending;
          if (s === "PDNG" || s === "PEND" || isPending) {
            removedDuplicates.push(item.tx);
            return false;
          }
          return true;
        })
      : group;

    if (nonPdngGroup.length <= 1) {
      if (nonPdngGroup.length === 1) keptResult.push(nonPdngGroup[0].tx);
      continue;
    }

    // Cas abonnement strict (Uber One, Bouygues Telecom, Basic Fit, Netflix, Loyer...) :
    // Il ne peut physiquement y avoir qu'une seule opération par date/montant.
    // On conserve STRICTEMENT la plus ancienne de la paire !
    if (isStrictRecurringSubscription(nonPdngGroup[0].tx.name)) {
      const sorted = [...nonPdngGroup].sort(
        (a, b) => getTransactionSortAge(a.tx, a.index) - getTransactionSortAge(b.tx, b.index)
      );
      // Conserver la catégorie enrichie si l'ancienne était en "Autre"
      const bestCategory = sorted.find((i) => i.tx.type && i.tx.type !== "Autre")?.tx.type;
      const oldestTx = { ...sorted[0].tx };
      if (bestCategory && oldestTx.type === "Autre") {
        oldestTx.type = bestCategory;
      }
      keptResult.push(oldestTx);
      for (let j = 1; j < sorted.length; j++) {
        removedDuplicates.push(sorted[j].tx);
      }
      continue;
    }

    // Cas général : partition par rang d'occurrence (achat 1, achat 2, achat 3...)
    // Les opérations CSV et bancaires sont indexées déterministement par _1, _2...
    // Si des opérations n'ont pas de suffixe numérique explicite, on leur assigne
    // un rang séquentiel (1 pour la première, 2 pour la deuxième) au sein de leur source.
    const isBank = (t: Transaction) => t.source === "bank" || t.id.startsWith("eb_");
    const nonBankItems = nonPdngGroup.filter((i) => !isBank(i.tx));
    const bankItems = nonPdngGroup.filter((i) => isBank(i.tx));

    // Si toutes sont CSV / manuelles : deux lignes dans un relevé CSV représentent deux achats réels
    if (bankItems.length === 0) {
      for (const item of nonBankItems) keptResult.push(item.tx);
      continue;
    }

    // Associer à chaque élément son rang d'occurrence (1, 2...)
    const getOccurrenceRank = (
      item: { tx: Transaction; index: number },
      sourceIndex: number
    ): number => {
      const match = item.tx.id.match(/_(\d+)$/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > 0) return val;
      }
      return sourceIndex + 1;
    };

    // Grouper par rang d'occurrence
    const byRank = new Map<number, Array<{ tx: Transaction; index: number }>>();

    nonBankItems.forEach((item, idx) => {
      const rank = getOccurrenceRank(item, idx);
      const list = byRank.get(rank) || [];
      list.push(item);
      byRank.set(rank, list);
    });

    bankItems.forEach((item, idx) => {
      const rank = getOccurrenceRank(item, idx);
      const list = byRank.get(rank) || [];
      list.push(item);
      byRank.set(rank, list);
    });

    // Pour chaque rang d'occurrence (ex: achat n°1) :
    // S'il y a plusieurs transactions pour le même rang (ex: 1 CSV + 1 Banque, ou 2 Banques dupliquées),
    // on garde la plus ancienne (CSV prioritaire sur Banque, puis horodatage) et on élimine les doublons.
    const sortedRanks = Array.from(byRank.keys()).sort((a, b) => a - b);
    for (const rank of sortedRanks) {
      const rankItems = byRank.get(rank)!;
      if (rankItems.length === 1) {
        keptResult.push(rankItems[0].tx);
      } else {
        const sorted = [...rankItems].sort(
          (a, b) => getTransactionSortAge(a.tx, a.index) - getTransactionSortAge(b.tx, b.index)
        );
        // Conserver la catégorie enrichie si la plus ancienne était en "Autre"
        const bestCategory = sorted.find((i) => i.tx.type && i.tx.type !== "Autre")?.tx.type;
        const oldestTx = { ...sorted[0].tx };
        if (bestCategory && oldestTx.type === "Autre") {
          oldestTx.type = bestCategory;
        }
        keptResult.push(oldestTx);
        for (let k = 1; k < sorted.length; k++) {
          removedDuplicates.push(sorted[k].tx);
        }
      }
    }
  }

  const cleanedTransactions = keptResult.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return {
    cleanedTransactions,
    removedDuplicatesCount: removedDuplicates.length,
    removedTransactions: removedDuplicates,
  };
}

/**
 * Assainit et déduplique définitivement une liste de transactions financières.
 * Utilise l'algorithme d'audit et de déduplication cleanDatabaseDuplicates pour garantir
 * qu'aucun doublon ne subsiste tout en préservant fidèlement les achats réels multiples.
 */
export function sanitizeAndDeduplicateTransactions(transactions: Transaction[]): Transaction[] {
  return cleanDatabaseDuplicates(transactions).cleanedTransactions;
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
