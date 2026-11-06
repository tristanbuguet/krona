import crypto from "node:crypto";
import { cleanMerchantName, normalizeText } from "./categorization";
import { RawTransaction } from "./lclParser";
import { parseDateToIso } from "./boursoParser";
import { formatBankDisplayName, isLinkedBankTransaction, isLinkedBankAccount } from "./bankFormatting";
import {
  ENABLE_BANKING_MAX_DAILY_REFRESHES,
  ENABLE_BANKING_QUOTA_WINDOW_MS,
  ENABLE_BANKING_HISTORY_DAYS,
  computeBankRefreshQuota,
  consumeBankRefreshQuota,
  cleanOpenBankingMerchantLabel,
  stripTerminalNoise,
  buildDeduplicationSignature,
  deduplicateCrossAccountBankTransactions,
  sanitizeAndDeduplicateTransactions,
  isStrictRecurringSubscription,
  pickBestTransaction,
  mapCashAccountType,
  daysUntilConsentExpiry,
  cleanDatabaseDuplicates,
  diagnoseBankDuplicates,
} from "./bankDeduplication";

export {
  formatBankDisplayName,
  isLinkedBankTransaction,
  isLinkedBankAccount,
  ENABLE_BANKING_MAX_DAILY_REFRESHES,
  ENABLE_BANKING_QUOTA_WINDOW_MS,
  ENABLE_BANKING_HISTORY_DAYS,
  computeBankRefreshQuota,
  consumeBankRefreshQuota,
  cleanOpenBankingMerchantLabel,
  stripTerminalNoise,
  buildDeduplicationSignature,
  deduplicateCrossAccountBankTransactions,
  sanitizeAndDeduplicateTransactions,
  cleanDatabaseDuplicates,
  diagnoseBankDuplicates,
  isStrictRecurringSubscription,
  pickBestTransaction,
  mapCashAccountType,
  daysUntilConsentExpiry,
};

export const ENABLE_BANKING_APP_ID = "c1ad2bc2-df1a-460a-9497-4b1b29094600";
export const ENABLE_BANKING_BASE_URL = "https://api.enablebanking.com";
export const ENABLE_BANKING_AUDIENCE = "api.enablebanking.com";
export const ENABLE_BANKING_DEFAULT_ASPSP = "Boursorama Banque";

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
  status?: string;
  access?: { valid_until?: string };
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
 * Nettoie une chaîne de clé privée RSA (PEM) provenant de variables d'environnement (notamment Vercel Serverless) :
 * - Remplacement systématique des séquences littérales "\n" et retours chariot par de véritables sauts de ligne
 * - Suppression des guillemets superflus (doubles, simples, échappés) entourant la clé
 * - Support des clés encodées en Base64 ou multilignes
 */
export function cleanPrivateKeyString(rawKey: string): string {
  if (!rawKey || typeof rawKey !== "string") return "";

  let key = rawKey.trim();

  // 1. Décodage Base64 si la variable a été encodée pour contourner les retours à la ligne Vercel
  if (!key.includes("-----BEGIN") && key.length > 50) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf-8");
      if (decoded.includes("PRIVATE KEY")) {
        key = decoded.trim();
      }
    } catch {
      // Pas du base64 valide, continuer avec la clé brute
    }
  }

  // 2. Suppression itérative des guillemets superflus entourant la clé (doubles, simples, échappés, backticks)
  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith("`") && key.endsWith("`")) ||
    (key.startsWith('\\"') && key.endsWith('\\"')) ||
    (key.startsWith("\\'") && key.endsWith("\\'"))
  ) {
    if (key.startsWith('\\"') || key.startsWith("\\'")) {
      key = key.slice(2, -2).trim();
    } else {
      key = key.slice(1, -1).trim();
    }
  }

  // 3. Suppression des guillemets résiduels aux extrémités
  key = key.replace(/^["'`]+|["'`]+$/g, "").trim();

  // 4. Remplacement des séquences littérales de saut de ligne (\n, \\n, \r\n) par de réels sauts de ligne
  key = key
    .replace(/\\r\\n/g, "\n")
    .replace(/\\+n/g, "\n")
    .replace(/\\+r/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // 5. Si la clé est du base64 brut sans en-tête PEM, l'encadrer en PKCS#8
  if (!key.includes("-----BEGIN") && key.length > 100) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }

  return key;
}

/**
 * Récupère la clé privée RSA (PKCS#8) côté serveur uniquement.
 * Cherche en priorité dans ENABLE_BANKING_PRIVATE_KEY (avec nettoyage des retours à la ligne et guillemets),
 * puis en solution de secours local dans enablebanking-key.pem.
 */
export function getEnableBankingPrivateKey(): string {
  const envKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  if (envKey && envKey.trim().length > 0) {
    const cleaned = cleanPrivateKeyString(envKey);
    if (cleaned.includes("PRIVATE KEY")) {
      return cleaned;
    }
  }

  // Solution de secours en local uniquement via fs.existsSync
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path");
    const candidatePaths = [
      path.join(process.cwd(), "enablebanking-key.pem"),
      path.join(process.cwd(), "..", "enablebanking-key.pem"),
    ];

    for (const filePath of candidatePaths) {
      try {
        if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
          const raw = fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8").trim();
          const cleaned = cleanPrivateKeyString(raw);
          if (cleaned.includes("PRIVATE KEY")) {
            return cleaned;
          }
        }
      } catch {
        // Ignorer les erreurs d'accès fichiers et continuer
      }
    }
  } catch {
    // fs non disponible dans l'environnement
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
  const rawAppId = process.env.ENABLE_BANKING_APP_ID || ENABLE_BANKING_APP_ID;
  const appId = rawAppId.replace(/^["'`]+|["'`]+$/g, "").trim();

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
): Promise<{ url: string; authorizationId?: string; validUntil: string }> {
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
    validUntil,
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
  const endpoint = isCode
    ? `${ENABLE_BANKING_BASE_URL}/sessions`
    : `${ENABLE_BANKING_BASE_URL}/sessions/${encodeURIComponent(codeOrSessionId)}`;

  const response = await ebFetch(endpoint, "/sessions", {
    method: isCode ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(isCode ? { body: JSON.stringify({ code: codeOrSessionId }) } : {}),
  });

  const data = (await response.json()) as EnableBankingSessionResponse;
  // GET /sessions/{id} renvoie un statut (AUTHORIZED, EXPIRED, REVOKED, CLOSED…) et des uids de comptes
  const status = String(data.status || "").toUpperCase();
  if (status && status !== "AUTHORIZED") {
    throw new EnableBankingError(`Session Enable Banking ${status.toLowerCase()} (expired)`, 401);
  }
  const accounts = Array.isArray(data.accounts)
    ? (data.accounts as Array<EnableBankingSessionAccount | string>).map((a) =>
        typeof a === "string" ? { uid: a } : a
      )
    : [];
  return {
    session_id: data.session_id || codeOrSessionId,
    accounts,
    aspsp: data.aspsp,
    access: data.access,
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
 * Erreur typée Enable Banking : permet de distinguer une session expirée/révoquée (reconnexion requise)
 * d'une indisponibilité temporaire (réessayer plus tard) sans heuristique fragile sur le message.
 */
export class EnableBankingError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EnableBankingError";
    this.status = status;
  }
  /** 401/403 = consentement expiré ou révoqué ; 422 sur EXPIRED_SESSION / closed session. */
  get isSessionExpired(): boolean {
    return (
      this.status === 401 ||
      this.status === 403 ||
      (this.status === 422 && /expired|closed|revoked|invalid.?session/i.test(this.message))
    );
  }
  get isTransient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export function isSessionExpiredError(err: unknown): boolean {
  return err instanceof EnableBankingError && err.isSessionExpired;
}

/**
 * fetch authentifié avec retries exponentiels non bloquants (réseau, 429, 5xx) — 3 tentatives max.
 */
async function ebFetch(url: string, label: string, init: RequestInit = {}): Promise<Response> {
  const maxAttempts = 3;
  let lastError: EnableBankingError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${generateEnableBankingJWT()}`,
          Accept: "application/json",
          ...(init.headers || {}),
        },
        cache: "no-store",
      });
    } catch (err) {
      lastError = new EnableBankingError(
        `Erreur réseau Enable Banking (${label}) : ${err instanceof Error ? err.message : String(err)}`,
        0
      );
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
      continue;
    }
    if (response.ok) return response;

    let detail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as { message?: string; detail?: unknown; error?: string; code?: string };
      const d = typeof errJson.detail === "string" ? errJson.detail : "";
      detail = [errJson.error || errJson.code, errJson.message || d].filter(Boolean).join(" - ") || detail;
    } catch {
      // corps non JSON
    }
    lastError = new EnableBankingError(`Erreur Enable Banking (${label}) : ${detail}`, response.status);
    if (!lastError.isTransient || attempt === maxAttempts) throw lastError;
    await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
  }
  throw lastError ?? new EnableBankingError(`Erreur Enable Banking (${label})`, 0);
}

/**
 * Récupère les transactions comptabilisées (booked / BOOK) pour un compte depuis Enable Banking,
 * sur toute la profondeur d'historique disponible (90 jours) avec pagination complète.
 */
export async function fetchTransactions(
  sessionId: string,
  accountId: string,
  options: { dateFrom?: string; now?: Date } = {}
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

  // Sans date_from, la plupart des ASPSP (dont BoursoBank) ne renvoient que le mois en cours.
  const now = options.now || new Date();
  const dateFrom =
    options.dateFrom ||
    new Date(now.getTime() - ENABLE_BANKING_HISTORY_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const allBookedTransactions: EnableBankingTransaction[] = [];
  const seenKeys = new Set<string>();
  let continuationKey: string | undefined = undefined;
  let pageCount = 0;

  // Certaines banques paginent par 10-20 opérations : 50 pages couvrent largement 90 jours.
  while (pageCount < 50) {
    pageCount++;
    const url = new URL(
      `${ENABLE_BANKING_BASE_URL}/accounts/${encodeURIComponent(targetAccountUid)}/transactions`
    );
    url.searchParams.set("date_from", dateFrom);
    url.searchParams.set("transaction_status", "BOOK");
    if (continuationKey) {
      url.searchParams.set("continuation_key", continuationKey);
    }

    const response = await ebFetch(url.toString(), "/transactions");

    const data = (await response.json()) as EnableBankingTransactionsResponse;
    const rawList = Array.isArray(data.transactions) ? data.transactions : [];

    for (const tx of rawList) {
      const status = (tx.status || "BOOK").toUpperCase();
      if (status === "BOOK" || status === "BOOKED") {
        allBookedTransactions.push(tx);
      }
    }

    // Garde-fou contre une banque qui renverrait la même clé de continuation en boucle
    if (data.continuation_key && !seenKeys.has(data.continuation_key)) {
      seenKeys.add(data.continuation_key);
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
 * Normalise une liste de transactions Enable Banking vers l'interface `RawTransaction` de Krona
 * (`id`, `date`, `month`, `label`, `rawLabel`, `amount`, `account`) avec déduplication déterministe compatible CSV.
 */
export function normalizeEnableBankingTransactions(
  ebTransactions: EnableBankingTransaction[],
  accountLabel: string = "BoursoBank",
  accountUid?: string
): RawTransaction[] {
  const cleanAccountLabel =
    !accountLabel || accountLabel.toLowerCase().includes("mock")
      ? formatBankDisplayName(accountLabel)
      : accountLabel;
  const occurrenceMap = new Map<string, number>();
  const normalized: RawTransaction[] = [];
  // Discriminant de compte (multi-comptes) : évite qu'une même opération sur deux sous-comptes partage un id
  const accountSlug = (accountUid || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toLowerCase();

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

    // Identifiant 100 % déterministe et canonique (date + montant signé + commerçant nettoyé + rang d'occurrence) :
    // indépendant des identifiants techniques éphémères et invariant d'une synchronisation à l'autre.
    const uniqueId = `eb_${baseKey}_${occurrence}`;
    const ebUniqueId = (tx.entry_reference || tx.transaction_id || "").trim() || undefined;
    const entryRef = (tx.entry_reference || "").trim() || undefined;

    normalized.push({
      id: uniqueId,
      date: isoDate,
      month: isoMonth,
      label: cleanedLabel,
      rawLabel,
      amount: signedAmount,
      account: cleanAccountLabel,
      source: "bank",
      ...(accountUid ? { bankAccountUid: accountUid } : {}),
      ...(ebUniqueId ? { bankTransactionId: ebUniqueId } : {}),
      ...(entryRef ? { entryReference: entryRef } : {}),
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
