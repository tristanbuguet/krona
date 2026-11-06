import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cleanMerchantName, normalizeText } from "./categorization";
import { RawTransaction } from "./lclParser";
import { parseDateToIso } from "./boursoParser";
import { formatBankDisplayName, isLinkedBankTransaction, isLinkedBankAccount } from "./bankFormatting";
import { BankRefreshQuota, BankSessionInfo } from "./types";

export { formatBankDisplayName, isLinkedBankTransaction, isLinkedBankAccount };

export const ENABLE_BANKING_APP_ID = "c1ad2bc2-df1a-460a-9497-4b1b29094600";
export const ENABLE_BANKING_BASE_URL = "https://api.enablebanking.com";
export const ENABLE_BANKING_AUDIENCE = "api.enablebanking.com";
export const ENABLE_BANKING_DEFAULT_ASPSP = "Boursorama Banque";
export const ENABLE_BANKING_MAX_DAILY_REFRESHES = 4;
export const ENABLE_BANKING_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface EnableBankingBalanceAmount {
  amount: string | number;
  currency: string;
}

export interface EnableBankingBalanceItem {
  name?: string;
  balance_type?: string;
  balance_amount?: EnableBankingBalanceAmount;
  reference_date?: string;
  last_change_date_time?: string;
}

export interface EnableBankingBalancesResponse {
  balances: EnableBankingBalanceItem[];
}

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

export interface EnableBankingJwtHeader {
  alg: "RS256";
  typ: "JWT";
  kid: string;
}

export interface EnableBankingJwtPayload {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface EnableBankingAuthResponse {
  url: string;
  authorization_id?: string;
  psu_id_hash?: string;
}

export interface EnableBankingAccountId {
  iban?: string;
  other?: {
    identification?: string;
    scheme_name?: string;
  };
}

export interface EnableBankingSessionAccount {
  uid: string;
  account_id?: EnableBankingAccountId;
  name?: string;
  currency?: string;
  cash_account_type?: string;
}

export interface EnableBankingSessionResponse {
  session_id: string;
  accounts: EnableBankingSessionAccount[];
  aspsp?: {
    name: string;
    country: string;
  };
}

export interface EnableBankingTransactionAmount {
  amount: string | number;
  currency: string;
}

export interface EnableBankingParty {
  name?: string;
}

export interface EnableBankingTransaction {
  entry_reference?: string;
  transaction_id?: string;
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  transaction_amount: EnableBankingTransactionAmount;
  credit_debit_indicator?: "CRDT" | "DBIT" | string;
  remittance_information?: string[];
  creditor?: EnableBankingParty;
  creditor_name?: string;
  debtor?: EnableBankingParty;
  debtor_name?: string;
  merchant_category_code?: string;
}

export interface EnableBankingTransactionsResponse {
  transactions: EnableBankingTransaction[];
  continuation_key?: string;
}

/**
 * Récupère la clé privée RSA (PKCS#8) côté serveur uniquement.
 * Cherche dans ENABLE_BANKING_PRIVATE_KEY ou enablebanking-key.pem.
 */
export function getEnableBankingPrivateKey(): string {
  const envKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (envKey && envKey.trim().length > 0) {
    const cleaned = envKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim();
    if (cleaned.includes("BEGIN PRIVATE KEY")) {
      return cleaned;
    }
  }

  const candidatePaths = [
    path.join(process.cwd(), "enablebanking-key.pem"),
    path.join(process.cwd(), "..", "enablebanking-key.pem"),
  ];

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
        const raw = fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8").trim();
        if (raw.includes("BEGIN PRIVATE KEY")) {
          return raw;
        }
      }
    } catch {
      // Ignore file read errors and try next candidate
    }
  }

  throw new Error(
    "Clé privée Enable Banking introuvable. Configurez ENABLE_BANKING_PRIVATE_KEY ou le fichier enablebanking-key.pem."
  );
}

/**
 * Génère un token JWT signé en RS256 pour l'authentification auprès d'Enable Banking.
 * - En-tête : alg: "RS256", typ: "JWT", kid: Application ID
 * - Payload : iss: Application ID, aud: "api.enablebanking.com", iat, exp (iat + 3600)
 */
export function generateEnableBankingJWT(nowSeconds?: number): string {
  const privateKey = getEnableBankingPrivateKey();
  const appId = (process.env.ENABLE_BANKING_APP_ID || ENABLE_BANKING_APP_ID)
    .replace(/^"|"$/g, "")
    .trim();

  const iat = nowSeconds !== undefined ? Math.floor(nowSeconds) : Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header: EnableBankingJwtHeader = {
    alg: "RS256",
    typ: "JWT",
    kid: appId,
  };

  const payload: EnableBankingJwtPayload = {
    iss: appId,
    aud: ENABLE_BANKING_AUDIENCE,
    iat,
    exp,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();

  const signature = signer.sign(privateKey, "base64url");
  return `${signingInput}.${signature}`;
}

/**
 * Résout le nom et le pays de la banque Enable Banking (Production / Sandbox).
 */
export function resolveSandboxAspsp(aspspTitle?: string, country = "FR"): { name: string; country: string } {
  const cleanedTitle = (aspspTitle || "").trim();
  if (!cleanedTitle) {
    return { name: ENABLE_BANKING_DEFAULT_ASPSP, country };
  }
  const lower = cleanedTitle.toLowerCase();
  if (lower === "boursobank" || lower === "boursorama" || lower === "boursorama banque") {
    return { name: ENABLE_BANKING_DEFAULT_ASPSP, country };
  }
  return { name: cleanedTitle, country };
}

/**
 * Crée une session d'autorisation auprès d'Enable Banking (POST /auth)
 * et retourne l'URL de redirection vers la banque.
 */
export async function createAuthSession(
  aspspTitle: string = ENABLE_BANKING_DEFAULT_ASPSP,
  redirectUrl: string,
  state?: string,
  country: string = "FR"
): Promise<{ url: string; authorizationId?: string }> {
  const token = generateEnableBankingJWT();
  const aspsp = resolveSandboxAspsp(aspspTitle, country);
  const validUntil = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
  const sessionState = state || `krona_${Date.now()}`;

  const response = await fetch(`${ENABLE_BANKING_BASE_URL}/auth`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      access: {
        valid_until: validUntil,
        balances: true,
        transactions: true,
      },
      aspsp: {
        name: aspsp.name,
        country: aspsp.country,
      },
      state: sessionState,
      redirect_url: redirectUrl,
      psu_type: "personal",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as { message?: string; detail?: string; error?: string };
      errorDetail = errJson.message || errJson.detail || errJson.error || errorDetail;
    } catch {
      // Fallback status text
    }
    throw new Error(`Erreur Enable Banking (/auth) : ${errorDetail}`);
  }

  const data = (await response.json()) as EnableBankingAuthResponse;
  if (!data.url) {
    throw new Error("Enable Banking n'a retourné aucune URL d'autorisation.");
  }

  return {
    url: data.url,
    authorizationId: data.authorization_id,
  };
}

/**
 * Échange le code de retour OAuth / Open Banking contre une session active (POST /sessions)
 * ou récupère une session existante (GET /sessions/{sessionId}).
 */
export async function authorizeOrGetSession(
  codeOrSessionId: string,
  isCode: boolean = true
): Promise<EnableBankingSessionResponse> {
  const token = generateEnableBankingJWT();

  const endpoint = isCode
    ? `${ENABLE_BANKING_BASE_URL}/sessions`
    : `${ENABLE_BANKING_BASE_URL}/sessions/${encodeURIComponent(codeOrSessionId)}`;

  const response = await fetch(endpoint, {
    method: isCode ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(isCode ? { body: JSON.stringify({ code: codeOrSessionId }) } : {}),
    cache: "no-store",
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as { message?: string; detail?: string; error?: string };
      errorDetail = errJson.message || errJson.detail || errJson.error || errorDetail;
    } catch {
      // Ignore parse error
    }
    throw new Error(`Erreur Enable Banking (/sessions) : ${errorDetail}`);
  }

  const data = (await response.json()) as EnableBankingSessionResponse;
  return {
    session_id: data.session_id || codeOrSessionId,
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    aspsp: data.aspsp,
  };
}

/**
 * Supprime ou révoque une session d'autorisation auprès d'Enable Banking (DELETE /sessions/{sessionId}).
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const token = generateEnableBankingJWT();
    const url = `${ENABLE_BANKING_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    return response.ok;
  } catch (err) {
    console.warn("[Enable Banking] Erreur lors de la suppression de session :", err);
    return false;
  }
}

/**
 * Récupère les transactions comptabilisées (booked / BOOK) pour un compte depuis Enable Banking.
 */
export async function fetchTransactions(
  sessionId: string,
  accountId: string
): Promise<EnableBankingTransaction[]> {
  let targetAccountUid = accountId.trim();

  // Si aucun accountId n'est fourni mais qu'un sessionId est présent, on résout le premier compte de la session
  if (!targetAccountUid && sessionId) {
    const session = await authorizeOrGetSession(sessionId, false);
    if (session.accounts.length > 0) {
      targetAccountUid = session.accounts[0].uid;
    }
  }

  if (!targetAccountUid) {
    throw new Error("Identifiant de compte (accountId) manquant pour récupérer les transactions.");
  }

  const token = generateEnableBankingJWT();
  const allBookedTransactions: EnableBankingTransaction[] = [];
  let continuationKey: string | undefined = undefined;
  let pageCount = 0;

  while (pageCount < 10) {
    pageCount++;
    const url = new URL(
      `${ENABLE_BANKING_BASE_URL}/accounts/${encodeURIComponent(targetAccountUid)}/transactions`
    );
    url.searchParams.set("transaction_status", "BOOK");
    if (continuationKey) {
      url.searchParams.set("continuation_key", continuationKey);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { message?: string; detail?: string; error?: string };
        errorDetail = errJson.message || errJson.detail || errJson.error || errorDetail;
      } catch {
        // Ignore parse error
      }
      throw new Error(`Erreur Enable Banking (/transactions) : ${errorDetail}`);
    }

    const data = (await response.json()) as EnableBankingTransactionsResponse;
    const rawList = Array.isArray(data.transactions) ? data.transactions : [];

    for (const tx of rawList) {
      const status = (tx.status || "BOOK").toUpperCase();
      if (status === "BOOK" || status === "BOOKED") {
        allBookedTransactions.push(tx);
      }
    }

    if (data.continuation_key) {
      continuationKey = data.continuation_key;
    } else {
      break;
    }
  }

  return allBookedTransactions;
}

/**
 * Récupère le solde comptable ou disponible d'un compte auprès d'Enable Banking (GET /accounts/{accountId}/balances).
 */
export async function fetchAccountBalance(accountId: string): Promise<number | null> {
  const targetAccountUid = (accountId || "").trim();
  if (!targetAccountUid) return null;

  try {
    const token = generateEnableBankingJWT();
    const url = `${ENABLE_BANKING_BASE_URL}/accounts/${encodeURIComponent(targetAccountUid)}/balances`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as EnableBankingBalancesResponse;
    const balances = Array.isArray(data.balances) ? data.balances : [];
    if (balances.length === 0) return null;

    // Priorité aux types de soldes standard DSP2 : CLAV (Closing Available), ITAV (Interim Available), XPCD, CLBD, ITBD
    const preferredTypes = ["CLAV", "ITAV", "XPCD", "CLBD", "ITBD"];
    let selected = balances[0];
    for (const pref of preferredTypes) {
      const match = balances.find((b) => (b.balance_type || "").toUpperCase() === pref);
      if (match && match.balance_amount?.amount !== undefined) {
        selected = match;
        break;
      }
    }

    const rawAmount = selected?.balance_amount?.amount;
    if (rawAmount === undefined || rawAmount === null) return null;

    const num =
      typeof rawAmount === "number"
        ? rawAmount
        : parseFloat(String(rawAmount).replace(",", "."));
    return isNaN(num) ? null : Math.round(num * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Nettoie un libellé issu d'Open Banking (Enable Banking) :
 * - Supprime les préfixes techniques de carte (CARTE DD/MM/YY ... CB*XXXX)
 * - Normalise les caractères spéciaux parasites d'enseignes (UBER *EATS -> Uber Eats, SHOTGUN* -> Shotgun)
 * - Corrige les noms d'enseignes tronqués à 16 caractères (GALERIES LAFAYET -> Galeries Lafayette)
 * - Supprime les codes de caisse/département isolés en fin de libellé carte (ex. PICARD 2 -> Picard)
 */
export function cleanOpenBankingMerchantLabel(raw: string, isCardLabel: boolean = false): string {
  if (!raw) return "";
  let s = raw.replace(/[\r\n\t]+/g, " ").trim();

  const looksLikeCard = isCardLabel || /^(CARTE|PAIEMENT\s+CB|PAIEMENT\s+CARTE|ACHAT\s+CB|CB\b)/i.test(s) || /\bCB\*\d+/i.test(s);

  // Supprimer les codes cartes CB*XXXX avant de nettoyer les suffixes numériques
  s = s.replace(/\bCB\*\d+\b/gi, " ").trim();

  // Nettoyer les préfixes redondants "VIR Virement" -> "Virement"
  s = s.replace(/^VIR(EMENT)?\s+(?=VIREMENT\b)/i, "").trim();

  // Normaliser les séparateurs techniques d'enseignes (ex. UBER *EATS HELP.U, UBER *ONE MEMBE, SHOTGUN* VOLANGE)
  s = s.replace(/\bUBER\s*\*\s*EATS(?:\s+HELP\.U\w*)?/gi, "Uber Eats");
  s = s.replace(/\bUBER\s*\*\s*ONE(?:\s+MEMBE\w*)?/gi, "Uber One");
  s = s.replace(/\bSHOTGUN\s*\*/gi, "Shotgun ");
  s = s.replace(/\bMC\s+DONALD\s*S\b/gi, "McDonald's");
  s = s.replace(/\bGALERIES\s+LAFAYET(?:TE)?\b/gi, "Galeries Lafayette");
  s = s.replace(/\bGOOD\s*NEWS(?:\s+LA\s+FAYE\w*)?/gi, "Goodnews");
  s = s.replace(/\bVIC\s+CO\b/gi, "Vicco");
  s = s.replace(/\bBOUYGUES\s+TELECOM\s+BOUYGUES\s+TELE\w*/gi, "Bouygues Telecom");
  s = s.replace(/\bSC\.?AUT\.?TASTY\s+CROU\w*/gi, "Tasty Crous");

  // Si c'est un libellé carte (CARTE DD/MM/YY <MARCHAND> <CHIFFRE> CB*XXXX), retirer le chiffre de caisse/zone final isolé
  if (looksLikeCard) {
    s = s.replace(/\s+(?:SC\s+)?\d{1,2}\s*$/i, "").trim();
  }

  const cleaned = cleanMerchantName(s);
  return cleaned;
}

/**
 * Normalise une liste de transactions Enable Banking vers l'interface `RawTransaction` de Krona
 * (`id`, `date`, `month`, `label`, `rawLabel`, `amount`, `account`) avec déduplication déterministe compatible CSV.
 */
export function normalizeEnableBankingTransactions(
  ebTransactions: EnableBankingTransaction[],
  accountLabel: string = "BoursoBank"
): RawTransaction[] {
  const cleanAccountLabel =
    !accountLabel || accountLabel.toLowerCase().includes("mock")
      ? formatBankDisplayName(accountLabel)
      : accountLabel;
  const occurrenceMap = new Map<string, number>();
  const normalized: RawTransaction[] = [];

  for (const tx of ebTransactions) {
    if (!tx || !tx.transaction_amount) continue;
    const status = (tx.status || "BOOK").toUpperCase();
    if (status !== "BOOK" && status !== "BOOKED") continue;

    const rawDateStr =
      tx.booking_date ||
      tx.value_date ||
      tx.transaction_date ||
      new Date().toISOString().slice(0, 10);

    const parsedDate = parseDateToIso(rawDateStr);
    const isoDate = parsedDate ? parsedDate.date : rawDateStr.slice(0, 10);
    const isoMonth = parsedDate ? parsedDate.month : isoDate.slice(0, 7);

    const rawAmt =
      typeof tx.transaction_amount.amount === "number"
        ? tx.transaction_amount.amount
        : parseFloat(String(tx.transaction_amount.amount).replace(",", "."));

    if (isNaN(rawAmt) || rawAmt === 0) continue;

    const indicator = (tx.credit_debit_indicator || "").toUpperCase();
    let signedAmount: number;
    if (indicator === "DBIT" || indicator === "DEBIT") {
      signedAmount = -Math.abs(rawAmt);
    } else if (indicator === "CRDT" || indicator === "CREDIT") {
      signedAmount = Math.abs(rawAmt);
    } else {
      signedAmount = rawAmt;
    }
    signedAmount = Math.round(signedAmount * 100) / 100;

    // 1. Extraction prioritaire du commerçant (débit -> creditor) ou de l'émetteur (crédit -> debtor)
    const partyName =
      signedAmount < 0
        ? (tx.creditor?.name || tx.creditor_name || tx.debtor?.name || tx.debtor_name || "").trim()
        : (tx.debtor?.name || tx.debtor_name || tx.creditor?.name || tx.creditor_name || "").trim();

    const firstRemittance =
      Array.isArray(tx.remittance_information) && tx.remittance_information.length > 0
        ? String(tx.remittance_information[0] || "").trim()
        : "";

    const remittanceJoined = Array.isArray(tx.remittance_information)
      ? tx.remittance_information.filter(Boolean).join(" ").trim()
      : "";

    // 2. Nettoyage prioritaire : commerçant/émetteur en priorité, sinon première entrée de remittance_information
    const cleanedParty = partyName ? cleanOpenBankingMerchantLabel(partyName, false) : "";
    const cleanedRemittance = firstRemittance
      ? cleanOpenBankingMerchantLabel(firstRemittance, true)
      : remittanceJoined
        ? cleanOpenBankingMerchantLabel(remittanceJoined, true)
        : "";

    const cleanedLabel =
      cleanedParty || cleanedRemittance || partyName || firstRemittance || remittanceJoined || "Opération bancaire";
    const rawLabel = (remittanceJoined || firstRemittance || partyName || cleanedLabel).trim();

    const slug =
      normalizeText(cleanedLabel)
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 30) || "tx";

    const baseKey = `${isoDate}_${signedAmount}_${slug}`;
    const occurrence = (occurrenceMap.get(baseKey) || 0) + 1;
    occurrenceMap.set(baseKey, occurrence);

    const refClean = (tx.entry_reference || tx.transaction_id || "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 24);
    const uniqueId = refClean
      ? `eb_${isoDate}_${signedAmount}_${refClean}`
      : `eb_${baseKey}_${occurrence}`;

    normalized.push({
      id: uniqueId,
      date: isoDate,
      month: isoMonth,
      label: cleanedLabel,
      rawLabel,
      amount: signedAmount,
      account: cleanAccountLabel,
      source: "bank",
    });
  }

  return normalized;
}

/**
 * Génère un jeu d'opérations réalistes de simulation pour la Sandbox Enable Banking
 * lorsque la banque de test ne renvoie aucune transaction réelle (`booked === 0`).
 * Couvre Alimentation, Uber Eats, Transports SNCF, Salaire, Abonnements, Logement.
 */
export function generateSandboxMockTransactions(
  accountLabel: string = "Banque Sandbox",
  referenceDate: Date = new Date()
): RawTransaction[] {
  const year = referenceDate.getFullYear();
  const monthNumber = referenceDate.getMonth() + 1;
  const monthStr = `${year}-${String(monthNumber).padStart(2, "0")}`;

  const padDay = (day: number) =>
    `${monthStr}-${String(Math.min(Math.max(1, day), 28)).padStart(2, "0")}`;

  const mockTemplates = [
    {
      day: 1,
      label: "Virement Salaire",
      rawLabel: "VIR SEPA SALAIRE EMPLOYEUR KRONA SANDBOX",
      amount: 2850.0,
      ref: "sal01",
    },
    {
      day: 2,
      label: "Loyer Résidence",
      rawLabel: "PRLV SEPA LOYER MENSUEL RESIDENCE",
      amount: -850.0,
      ref: "loy02",
    },
    {
      day: 4,
      label: "Carrefour City Paris",
      rawLabel: "CB CARREFOUR CITY PARIS 11 FACT 4209",
      amount: -48.3,
      ref: "crf04",
    },
    {
      day: 6,
      label: "Uber Eats FR",
      rawLabel: "PAIEMENT CB UBER EATS COMMANDE HELP.UBER",
      amount: -23.9,
      ref: "ube06",
    },
    {
      day: 8,
      label: "SNCF Connect Paris",
      rawLabel: "ACHAT BILLET TGV SNCF CONNECT INTERNET",
      amount: -68.5,
      ref: "snc08",
    },
    {
      day: 11,
      label: "Netflix.com",
      rawLabel: "PRLV SEPA NETFLIX MONTHLY SUBSCRIPTION",
      amount: -15.99,
      ref: "nfl11",
    },
    {
      day: 13,
      label: "Spotify Premium",
      rawLabel: "CB SPOTIFY AB STOCKHOLM SE",
      amount: -10.99,
      ref: "spo13",
    },
    {
      day: 16,
      label: "Monoprix Express",
      rawLabel: "CB MONOPRIX EXPR ACHATS ALIMENTAIRES",
      amount: -34.2,
      ref: "mpx16",
    },
    {
      day: 19,
      label: "Pharmacie de la Mairie",
      rawLabel: "PAIEMENT CB PHARMACIE DE LA MAIRIE",
      amount: -18.5,
      ref: "phm19",
    },
    {
      day: 22,
      label: "Boulangerie Paul",
      rawLabel: "CARTE BOULANGERIE PAUL PAINS VIENNOISERIES",
      amount: -5.4,
      ref: "blg22",
    },
  ];

  return mockTemplates.map((item) => {
    const isoDate = padDay(item.day);
    return {
      id: `eb_sbx_${isoDate}_${item.amount}_${item.ref}`,
      date: isoDate,
      month: monthStr,
      label: item.label,
      rawLabel: item.rawLabel,
      amount: item.amount,
      account: accountLabel,
      source: "bank",
    };
  });
}
