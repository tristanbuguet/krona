import { GoogleGenAI } from "@google/genai";
import { categorizeLocally, normalizeText, cleanMerchantName } from "./categorization";
import {
  Transaction,
  isSubscriptionCategory,
  isInternalTransferCategory,
  isRegularisationCategory,
} from "./types";
import { LearningRuleMap } from "./cloudSync";
import { RawTransaction } from "./lclParser";
import {
  generateSandboxMockTransactions,
  cleanOpenBankingMerchantLabel,
  formatBankDisplayName,
} from "./enableBanking";
import {
  sanitizeAndDeduplicateTransactions,
  isStrictRecurringSubscription,
  pickBestTransaction,
} from "./bankDeduplication";

export { sanitizeAndDeduplicateTransactions, isStrictRecurringSubscription, pickBestTransaction };

export function normalizeAiCategory(aiCategory: string): string {
  const cleaned = (aiCategory || "").trim();
  const validCategories = [
    "Alimentation & Courses",
    "Restos & Fast-Food",
    "Sorties & Soirées",
    "Shopping & Mode",
    "Transports",
    "Abonnements & Forfaits",
    "Santé & Soins",
    "Logement & Maison",
    "Virements proches & Remboursements",
    "Revenus & Aides",
    "Épargne & Trésorerie",
    "Virement interne",
    "Autre",
  ];

  const exactMatch = validCategories.find(
    (c) => c.toLowerCase() === cleaned.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  const lower = cleaned.toLowerCase();
  if (lower.includes("virement interne") || lower.includes("interne") || lower.includes("regul"))
    return "Virement interne";
  if (lower.includes("aliment") || lower.includes("course") || lower.includes("superm"))
    return "Alimentation & Courses";
  if (lower.includes("resto") || lower.includes("fast") || lower.includes("snack") || lower.includes("cafe"))
    return "Restos & Fast-Food";
  if (lower.includes("sorti") || lower.includes("soire") || lower.includes("loisir") || lower.includes("cinem"))
    return "Sorties & Soirées";
  if (lower.includes("shop") || lower.includes("mode") || lower.includes("vetem") || lower.includes("achat"))
    return "Shopping & Mode";
  if (lower.includes("transport") || lower.includes("train") || lower.includes("uber") || lower.includes("peage"))
    return "Transports";
  if (lower.includes("abon") || lower.includes("forfait")) return "Abonnements & Forfaits";
  if (lower.includes("sant") || lower.includes("soin") || lower.includes("pharm"))
    return "Santé & Soins";
  if (lower.includes("logem") || lower.includes("maison") || lower.includes("loyer"))
    return "Logement & Maison";
  if (lower.includes("vir") || lower.includes("rembours") || lower.includes("lydia"))
    return "Virements proches & Remboursements";
  if (lower.includes("revenu") || lower.includes("salair") || lower.includes("aide") || lower.includes("caf"))
    return "Revenus & Aides";
  if (lower.includes("epargn") || lower.includes("tresor")) return "Épargne & Trésorerie";
  return "Autre";
}

export const AI_BATCH_SIZE = 30;

export interface AiOrphanItem {
  id: string;
  label: string;
  rawLabel?: string;
  amount?: number;
}

export function buildAiCategorizationPrompt(
  items: Array<AiOrphanItem>,
  fewShotSection: string = ""
): string {
  const operationsPayload = items.map((it) => {
    const raw = (it.rawLabel || it.label).trim();
    const cleaned = it.label.trim();
    return {
      id: it.id,
      rawLabel: raw,
      cleanedName: cleaned !== raw ? cleaned : undefined,
      amount: it.amount,
    };
  });

  return `
Tu es un moteur FinTech expert de catégorisation bancaire française.
Pour chaque opération bancaire ci-dessous, déduis la catégorie exacte et pertinente à partir de son libellé brut d'origine (enseigne, type de paiement, informations de remittance, nom du tiers, code de transaction ou MCC) et du nom nettoyé en complément.
Tu dois n'utiliser "Autre" qu'en DERNIER RECOURS absolu.
Tu DOIS obligatoirement renvoyer une catégorie pour CHAQUE opération reçue, choisie STRICTEMENT parmi cette liste FINIE et exacte (et AUCUNE autre) :
- Alimentation & Courses
- Restos & Fast-Food
- Sorties & Soirées
- Shopping & Mode
- Transports
- Abonnements & Forfaits
- Santé & Soins
- Logement & Maison
- Virements proches & Remboursements
- Revenus & Aides
- Épargne & Trésorerie
- Virement interne
- Autre
${fewShotSection}
Règles d'association expertes :
- Supermarchés, hypermarchés, épiceries, supérettes, Picard, Monoprix, Coccinelle, U Express, Franprix, Carrefour, Leclerc, Lidl, Auchan, Intermarché, boulangeries -> "Alimentation & Courses"
- Restaurants, fast-foods, snacks, brasseries, cafés, Deliveroo, Uber Eats, McDonald's, Burger King, Starbucks, Vicco, Goodnews, sandwicheries -> "Restos & Fast-Food"
- Cinémas, soirées, loisirs, clubs, billetterie, Shotgun, concerts, musées, théâtres, parcs, escape game -> "Sorties & Soirées"
- Boutiques de vêtements, mode, chaussures, maroquinerie, Galeries Lafayette, Zara, H&M, Sephora, beauté, Fnac, Amazon, Darty, tabac, presse -> "Shopping & Mode"
- Train, RATP, métro, SNCF, Navigo, Imagine R, TER, TGV, avion, péages, parkings, carburant, stations Total/BP/Shell, Uber, Bolt, taxi, trottinettes -> "Transports"
- Salle de sport, Basic-Fit, Fitness Park, abonnements récurrents streaming/musique, Netflix, Spotify, Disney+, Deezer, Uber One, forfaits mobiles/box, Bouygues, Orange, Free, SFR -> "Abonnements & Forfaits"
- Médecins, pharmacie, spécialistes, dentiste, optique, hôpital, laboratoires, Doctolib, Livi, Kry, soins médicaux -> "Santé & Soins"
- Loyer, électricité, EDF, Engie, TotalEnergies, gaz, eau, charges de copropriété, syndic, bricolage, Leroy Merlin, Castorama, Ikea, meubles, quincaillerie -> "Logement & Maison"
- Virements entre particuliers, Lydia, PayPal entre amis, remboursements mutuelle/sécu -> "Virements proches & Remboursements"
- Salaires (virements employeur, montants positifs significatifs), allocations CAF, Pôle Emploi/France Travail, CPAM, aides de l'État -> "Revenus & Aides"
- Livrets d'épargne, plans épargne (PEL/PEA/assurance-vie), versements d'épargne -> "Épargne & Trésorerie"
- Virements internes de compte à compte du même titulaire, régularisations techniques, ajustements internes -> "Virement interne"
- N'attribue "Autre" qu'en cas d'impossibilité totale de déduire l'activité.

Opérations à catégoriser (avec ID, libellé brut d'origine et libellé nettoyé en complément) :
${JSON.stringify(operationsPayload, null, 2)}

Réponds STRICTEMENT sous la forme d'un tableau JSON brut valide, sans balises Markdown ni texte additionnel :
[
  { "id": "...", "category": "..." }
]
`.trim();
}

async function callGeminiApi(
  ai: GoogleGenAI,
  prompt: string,
  timeoutMs: number = 8000
): Promise<string> {
  const candidateModels = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
  ];

  for (const model of candidateModels) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout IA modèle ${model} (${timeoutMs}ms)`)), timeoutMs)
      );
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" },
        }),
        timeoutPromise,
      ]);
      if (response.text) {
        return response.text;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BankPipeline AI] Modèle ${model} indisponible, test du suivant...`, msg);
    }
  }

  throw new Error("Tous les modèles Gemini ont échoué ou ont expiré.");
}

function parseAiCategorizationResponse(
  responseText: string
): Array<{ id: string; category: string }> {
  const cleaned = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        parsed = JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
      } catch {
        parsed = null;
      }
    }
  }

  const results: Array<{ id: string; category: string }> = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === "object" && "id" in item) {
        const id = String((item as { id: unknown }).id);
        const cat = normalizeAiCategory(String((item as { category?: unknown }).category || ""));
        results.push({ id, category: cat });
      }
    }
  }
  return results;
}

async function processSingleBatchWithRetry(
  ai: GoogleGenAI,
  batch: Array<AiOrphanItem>,
  fewShotSection: string
): Promise<Map<string, string>> {
  const batchMap = new Map<string, string>();
  if (batch.length === 0) return batchMap;

  const prompt = buildAiCategorizationPrompt(batch, fewShotSection);

  // Tentative 1 pour le lot complet
  let responseText: string | null = null;
  try {
    responseText = await callGeminiApi(ai, prompt);
  } catch (err1) {
    console.warn("[Bank AI] Échec du lot IA, nouvel essai unique...", err1);
    try {
      // Réessai du lot en échec une fois
      responseText = await callGeminiApi(ai, prompt);
    } catch (err2) {
      console.error("[Bank AI] Deuxième échec du lot IA, abandon du lot.", err2);
      return batchMap;
    }
  }

  if (responseText) {
    const parsedItems = parseAiCategorizationResponse(responseText);
    for (const item of parsedItems) {
      if (item.category && item.category !== "Autre") {
        batchMap.set(item.id, item.category);
      }
    }
  }

  // Vérification que la réponse contient une catégorie pour chaque opération envoyée
  // Relance seulement celles qui manquent
  const missingItems = batch.filter((item) => !batchMap.has(item.id));
  if (missingItems.length > 0 && missingItems.length < batch.length) {
    try {
      const missingPrompt = buildAiCategorizationPrompt(missingItems, fewShotSection);
      const retryText = await callGeminiApi(ai, missingPrompt, 5000);
      if (retryText) {
        const retryParsed = parseAiCategorizationResponse(retryText);
        for (const item of retryParsed) {
          if (item.category && item.category !== "Autre") {
            batchMap.set(item.id, item.category);
          }
        }
      }
    } catch (retryMissingErr) {
      console.warn("[Bank AI] Erreur lors de la relance des opérations manquantes :", retryMissingErr);
    }
  }

  return batchMap;
}

export async function enrichOrphansWithGemini(
  orphans: Array<AiOrphanItem>,
  learningRules: LearningRuleMap = {}
): Promise<Map<string, string>> {
  const resultMap = new Map<string, string>();
  if (orphans.length === 0) {
    console.log("[Bank AI] Nombre d'opérations envoyées à l'IA : 0");
    console.log("[Bank AI] Nombre de lots : 0");
    console.log("[Bank AI] Nombre de catégories attribuées : 0");
    console.log("[Bank AI] Nombre restant en « Autre » : 0");
    return resultMap;
  }

  const totalBatches = Math.ceil(orphans.length / AI_BATCH_SIZE);
  console.log(`[BankPipeline AI] Transactions envoyées à l'IA : ${orphans.length}`);
  console.log(`[Bank AI] Nombre d'opérations envoyées à l'IA : ${orphans.length}`);
  console.log(`[Bank AI] Nombre de lots : ${totalBatches}`);

  // Sélection au maximum des 10 dernières règles apprises pour le Few-Shot
  const sortedRecentRules = Object.entries(learningRules)
    .map(([key, val]) => {
      const cat = val?.categorie || (val as { category?: string } | null)?.category || "";
      const updatedAt = val?.updatedAt ? Date.parse(val.updatedAt) : 0;
      return { key: key.trim(), category: cat, updatedAt };
    })
    .filter((r) => r.key.length > 0 && r.category && r.category !== "Autre")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);

  let fewShotSection = "";
  if (sortedRecentRules.length > 0) {
    fewShotSection = `
Règles apprises et préférences récentes de cet utilisateur (à respecter et imiter en priorité pour tes déductions) :
${sortedRecentRules.map((r) => `- "${r.key}" -> "${r.category}"`).join("\n")}
`;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[BankPipeline AI] GEMINI_API_KEY absente, exécution du moteur heuristique de secours.");
    for (const item of orphans) {
      const cleaned = cleanOpenBankingMerchantLabel(item.label, true);
      const local = categorizeLocally({
        label: cleaned || item.label,
        rawLabel: item.rawLabel || item.label,
        amount: item.amount ?? 0,
        cache: learningRules,
      });
      if (local.category && local.category !== "Autre") {
        resultMap.set(item.id, local.category);
      }
    }
    const assignedCount = resultMap.size;
    const remainingAutre = orphans.length - assignedCount;
    console.log(`[BankPipeline AI] Catégories attribuées par l'IA : ${assignedCount}`);
    console.log(`[Bank AI] Nombre de catégories attribuées : ${assignedCount}`);
    console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);
    return resultMap;
  }

  const ai = new GoogleGenAI({ apiKey });

  // Traite les opérations par lots de taille AI_BATCH_SIZE (30), l'un après l'autre
  for (let i = 0; i < orphans.length; i += AI_BATCH_SIZE) {
    const batch = orphans.slice(i, i + AI_BATCH_SIZE);
    const batchMap = await processSingleBatchWithRetry(ai, batch, fewShotSection);
    for (const [id, cat] of batchMap.entries()) {
      resultMap.set(id, cat);
    }
  }

  // Fallback local complémentaire pour toute opération non résolue par l'IA
  for (const item of orphans) {
    if (!resultMap.has(item.id)) {
      const cleaned = cleanOpenBankingMerchantLabel(item.label, true);
      const local = categorizeLocally({
        label: cleaned || item.label,
        rawLabel: item.rawLabel || item.label,
        amount: item.amount ?? 0,
        cache: learningRules,
      });
      if (local.category && local.category !== "Autre") {
        resultMap.set(item.id, local.category);
      }
    }
  }

  const assignedCount = Array.from(resultMap.values()).filter((c) => c && c !== "Autre").length;
  const remainingAutre = orphans.length - assignedCount;
  console.log(`[BankPipeline AI] Catégories attribuées par l'IA : ${assignedCount}`);
  console.log(`[Bank AI] Nombre de catégories attribuées : ${assignedCount}`);
  console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);

  return resultMap;
}

/**
 * Signature comptable d'une opération : date d'opération + montant signé exact (le signe porte le sens du flux)
 * + commerçant nettoyé (scories de terminal supprimées). Indépendante des identifiants techniques éphémères
 * et du statut PEND/BOOK, elle sert de clé unique de déduplication bancaire et CSV.
 */
export function buildDeduplicationSignature(date: string, amount: number, name: string): string {
  const cleaned = cleanOpenBankingMerchantLabel(name || "", true) || cleanMerchantName(name);
  const cleanSlug = normalizeText(cleaned).replace(/[^a-z0-9]/g, "");
  const roundedAmount = Math.round(amount * 100) / 100;
  return `${date}_${roundedAmount.toFixed(2)}_${cleanSlug}`;
}

export interface BankPipelineOptions {
  rawTransactions: RawTransaction[];
  existingTransactions?: Transaction[];
  learningRules?: LearningRuleMap;
  aspspLabel?: string;
  enableSandboxFallback?: boolean;
  skipAiEnrichment?: boolean;
  /** Début de la fenêtre couverte par l'extraction bancaire (YYYY-MM-DD). Défaut : plus ancienne date entrante. */
  historyStartDate?: string;
  aiCategorizer?: (items: Array<AiOrphanItem>) => Promise<Map<string, string>>;
}

export interface BankPipelineResult {
  candidateTransactions: Transaction[];
  deduplicatedNewTransactions: Transaction[];
  allMergedTransactions: Transaction[];
  learningRules: LearningRuleMap;
  usedSandboxFallback: boolean;
  /** Nombre de doublons historiques supprimés lors de cette exécution. */
  removedDuplicatesCount: number;
  /** Nombre réel d'opérations nouvelles (hors mises à niveau d'existantes). */
  addedCount: number;
}

function applyCategoryToTransaction(tx: Transaction, newCat: string, nowIso: string): Transaction {
  const isRegul = isRegularisationCategory(newCat);
  const isInternal = isInternalTransferCategory(newCat) || isRegul;
  const isSub = !isInternal && isSubscriptionCategory(newCat);

  return {
    ...tx,
    type: newCat,
    isSubscription: isSub,
    isRecurring: isSub,
    isInternalTransfer: isInternal,
    excludeFromSpending: isInternal,
    excludeFromIncome: isInternal || isRegul,
    updatedAt: nowIso,
  };
}

/**
 * Exécute le pipeline complet d'ingestion bancaire en 3 étapes obligatoires :
 * - Étape A (Local) : expressions régulières locales pour commerçants évidents
 * - Étape B (Règles utilisateur) : dictionnaire `learningRules` mémorisé
 * - Étape C (Appel IA obligatoire) : enrichissement Gemini pour toutes les opérations "Autre"
 */
export async function executeBankIngestionPipeline({
  rawTransactions,
  existingTransactions = [],
  learningRules = {},
  aspspLabel = "BoursoBank",
  enableSandboxFallback = true,
  skipAiEnrichment = false,
  historyStartDate,
  aiCategorizer,
}: BankPipelineOptions): Promise<BankPipelineResult> {
  const cleanAspspLabel = formatBankDisplayName(aspspLabel);
  let effectiveRaw = [...rawTransactions];
  let usedSandboxFallback = false;

  // Cas de secours Sandbox vide : injecter un jeu réaliste complet si aucune opération réelle
  if (effectiveRaw.length === 0 && enableSandboxFallback && existingTransactions.length === 0) {
    effectiveRaw = generateSandboxMockTransactions(cleanAspspLabel);
    usedSandboxFallback = true;
  }

  const nowIso = new Date().toISOString();
  const rulesCopy: LearningRuleMap = { ...learningRules };

  console.log(
    `[BankPipeline] Démarrage du pipeline : ${effectiveRaw.length} opérations entrantes, ${existingTransactions.length} existantes.`
  );

  // Étape A & B sur les opérations entrantes (Regex locales + LearningRules)
  const candidateMapById = new Map<string, Transaction>();
  const candidateTransactions: Transaction[] = effectiveRaw.map((raw) => {
    const cleanedName = cleanOpenBankingMerchantLabel(raw.label, true) || raw.label;
    const localCat = categorizeLocally({
      label: cleanedName,
      rawLabel: raw.rawLabel || raw.label,
      amount: raw.amount,
      cache: rulesCopy,
    });

    const tx: Transaction = {
      id: raw.id,
      name: cleanedName,
      rawName: raw.rawLabel,
      rawLabel: raw.rawLabel || raw.label,
      type: localCat.category || "Autre",
      amount: raw.amount,
      date: raw.date,
      month: raw.month || raw.date.slice(0, 7),
      isSubscription: localCat.isSubscription,
      isRecurring: localCat.isSubscription,
      isInternalTransfer: localCat.isInternalTransfer,
      excludeFromSpending: localCat.excludeFromSpending ?? localCat.isInternalTransfer,
      excludeFromIncome: localCat.excludeFromIncome ?? localCat.isInternalTransfer,
      account: raw.account || cleanAspspLabel,
      source: "bank",
      ...(raw.bankAccountUid ? { bankAccountUid: raw.bankAccountUid } : {}),
      ...(raw.bankTransactionId ? { bankTransactionId: raw.bankTransactionId } : {}),
      ...(raw.entryReference ? { entryReference: raw.entryReference } : {}),
      importBatchId: `bank_${nowIso}`,
      updatedAt: nowIso,
    };

    candidateMapById.set(tx.id, tx);
    return tx;
  });

  // Mise à niveau et nettoyage des transactions existantes (suppression de "Mock ASPSP" et re-catégorisation des "Autre")
  const upgradedExisting: Transaction[] = existingTransactions.map((ex) => {
    const matchingCandidate = candidateMapById.get(ex.id);
    const cleanedAccount =
      !ex.account || ex.account === "Mock ASPSP" || ex.account.toLowerCase().includes("mock")
        ? cleanAspspLabel
        : ex.account;

    const cleanedName =
      matchingCandidate?.name ||
      (ex.id.startsWith("eb_") ? cleanOpenBankingMerchantLabel(ex.rawName || ex.name, true) || ex.name : ex.name);

    const resolvedSource =
      ex.source ||
      (ex.id.startsWith("eb_") ? "bank" : /^(bourso|ca|ce|lcl|csv)_/i.test(ex.id) ? "csv" : undefined);

    // Si la transaction existante était restée en "Autre" ou si son nom/compte a été nettoyé, on ré-exécute les étapes A et B
    if (ex.type === "Autre" || ex.account !== cleanedAccount || ex.name !== cleanedName || ex.source !== resolvedSource) {
      const localCat = categorizeLocally({
        label: cleanedName,
        rawLabel: ex.rawName || ex.name,
        amount: ex.amount,
        cache: rulesCopy,
      });

      const resolvedCategory = ex.type !== "Autre" ? ex.type : localCat.category || "Autre";
      const updated = applyCategoryToTransaction(
        {
          ...ex,
          name: cleanedName,
          account: cleanedAccount,
          source: resolvedSource,
          rawLabel: ex.rawLabel || ex.rawName || ex.name,
        },
        resolvedCategory,
        nowIso
      );
      return updated;
    }

    return {
      ...ex,
      source: resolvedSource,
    };
  });

  // Déduplication par signature comptable (date + montant signé + commerçant nettoyé).
  // 1) La banque fait foi sur sa fenêtre d'extraction : pour chaque signature, on conserve au plus
  //    autant d'opérations bancaires existantes que la banque en renvoie (min. 1), ce qui purge les
  //    doublons historiques (variantes d'intitulé PEND/BOOK, anciens ids éphémères) sans toucher aux
  //    achats identiques légitimes (deux cafés le même jour) ni à l'historique hors fenêtre.
  const freshSigCounts = new Map<string, number>();
  for (const tx of candidateTransactions) {
    const sig = buildDeduplicationSignature(tx.date, tx.amount, tx.name);
    freshSigCounts.set(sig, (freshSigCounts.get(sig) || 0) + 1);
  }
  const windowStart =
    historyStartDate ||
    (candidateTransactions.length > 0
      ? candidateTransactions.reduce((min, t) => (t.date < min ? t.date : min), candidateTransactions[0].date)
      : null);
  const candidateIds = new Set(candidateTransactions.map((t) => t.id));
  const isBankTx = (t: Transaction) => t.source === "bank" || t.id.startsWith("eb_");

  // Ordre de préférence : CSV/manuel d'abord, puis opérations catégorisées par l'utilisateur, puis ids encore valides
  const rank = (t: Transaction) =>
    (isBankTx(t) ? 4 : 0) + (t.type === "Autre" ? 2 : 0) + (candidateIds.has(t.id) ? 0 : 1);
  const ordered = [...upgradedExisting].sort((a, b) => rank(a) - rank(b));

  const keptSigCounts = new Map<string, number>();
  const keptExisting: Transaction[] = [];
  let removedDuplicatesCount = 0;
  for (const tx of ordered) {
    const sig = buildDeduplicationSignature(tx.date, tx.amount, tx.name);
    const kept = keptSigCounts.get(sig) || 0;
    const inWindow = windowStart !== null && tx.date >= windowStart;
    if (isBankTx(tx) && inWindow && kept >= Math.max(1, freshSigCounts.get(sig) || 0)) {
      removedDuplicatesCount++;
      continue;
    }
    keptSigCounts.set(sig, kept + 1);
    keptExisting.push(tx);
  }
  upgradedExisting.length = 0;
  upgradedExisting.push(...keptExisting);
  if (removedDuplicatesCount > 0) {
    console.log(`[BankPipeline] ${removedDuplicatesCount} doublon(s) historique(s) supprimé(s).`);
  }

  // 2) Les opérations entrantes ne sont ajoutées que si leur signature n'est pas déjà couverte
  const existingIds = new Set<string>(upgradedExisting.map((t) => t.id));
  const existingSigCounts = new Map(keptSigCounts);

  const deduplicatedNew: Transaction[] = [];
  for (const tx of candidateTransactions) {
    if (existingIds.has(tx.id)) {
      continue;
    }
    const sig = buildDeduplicationSignature(tx.date, tx.amount, tx.name);
    const count = existingSigCounts.get(sig) || 0;
    if (count > 0) {
      existingSigCounts.set(sig, count - 1);
      continue;
    }
    existingIds.add(tx.id);
    deduplicatedNew.push(tx);
  }

  // Étape C (Appel IA) : uniquement sur les opérations non résolues ("Autre")
  // Les doublons écartés par la déduplication ne sont JAMAIS envoyés à l'IA
  const orphans: AiOrphanItem[] = deduplicatedNew
    .filter((t) => t.type === "Autre")
    .map((t) => ({
      id: t.id,
      label: t.name,
      rawLabel: t.rawLabel || t.rawName || t.name,
      amount: t.amount,
    }));

  // Si des opérations existantes issues de la banque étaient restées en "Autre", les réévaluer
  for (const ex of upgradedExisting) {
    if (ex.source === "bank" && ex.type === "Autre" && !orphans.some((o) => o.id === ex.id)) {
      orphans.push({
        id: ex.id,
        label: ex.name,
        rawLabel: ex.rawLabel || ex.rawName || ex.name,
        amount: ex.amount,
      });
    }
  }

  const allCombined = [...deduplicatedNew, ...upgradedExisting];
  const categorizedLocallyCount = allCombined.length - orphans.length;
  console.log(
    `[BankPipeline] Étapes A & B (Regex + Règles) : ${categorizedLocallyCount}/${allCombined.length} opérations catégorisées, ${orphans.length} orpheline(s) "Autre".`
  );

  let aiCategories = new Map<string, string>();

  if (!skipAiEnrichment) {
    if (orphans.length === 0) {
      console.log(`[BankPipeline AI] Transactions envoyées à l'IA : 0`);
      console.log(`[Bank AI] Nombre d'opérations envoyées à l'IA : 0`);
      console.log(`[Bank AI] Nombre de lots : 0`);
      console.log(`[Bank AI] Nombre de catégories attribuées : 0`);
      console.log(`[Bank AI] Nombre restant en « Autre » : 0`);
    } else {
      try {
        if (aiCategorizer) {
          const totalBatches = Math.ceil(orphans.length / AI_BATCH_SIZE);
          console.log(`[BankPipeline AI] Transactions envoyées à l'IA : ${orphans.length}`);
          console.log(`[Bank AI] Nombre d'opérations envoyées à l'IA : ${orphans.length}`);
          console.log(`[Bank AI] Nombre de lots : ${totalBatches}`);

          // Traitement séquentiel par lots de 30 avec 1 réessai pour les lots en échec
          for (let i = 0; i < orphans.length; i += AI_BATCH_SIZE) {
            const batch = orphans.slice(i, i + AI_BATCH_SIZE);
            let batchMap: Map<string, string> | null = null;
            try {
              batchMap = await aiCategorizer(batch);
            } catch (err1) {
              console.warn(`[Bank AI] Échec du lot ${Math.floor(i / AI_BATCH_SIZE) + 1}, nouvel essai unique...`, err1);
              try {
                batchMap = await aiCategorizer(batch);
              } catch (err2) {
                console.error(`[Bank AI] Deuxième échec du lot ${Math.floor(i / AI_BATCH_SIZE) + 1}, abandon du lot.`, err2);
              }
            }

            if (batchMap) {
              for (const [id, cat] of batchMap.entries()) {
                const normalized = normalizeAiCategory(cat);
                if (normalized !== "Autre") {
                  aiCategories.set(id, normalized);
                }
              }
            }
          }

          const assignedCount = Array.from(aiCategories.values()).filter((c) => c && c !== "Autre").length;
          const remainingAutre = orphans.length - assignedCount;
          console.log(`[BankPipeline AI] Catégories attribuées par l'IA : ${assignedCount}`);
          console.log(`[Bank AI] Nombre de catégories attribuées : ${assignedCount}`);
          console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);
        } else {
          aiCategories = await enrichOrphansWithGemini(orphans, rulesCopy);
        }
      } catch (aiErr: unknown) {
        console.error(
          "[Bank AI] Erreur lors de l'appel IA (importation préservée en 'Autre') :",
          aiErr
        );
        const remainingAutre = orphans.length - aiCategories.size;
        console.log(`[Bank AI] Nombre de catégories attribuées : ${aiCategories.size}`);
        console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);
      }
    }
  } else {
    console.log(
      `[BankPipeline AI] Enrichissement IA ignoré côté serveur (délégué au client) : ${orphans.length} orpheline(s) transmise(s).`
    );
  }

  if (aiCategories.size > 0) {
    const applyAiMap = (list: Transaction[]) => {
      for (let i = 0; i < list.length; i++) {
        const tx = list[i];
        const newCat = aiCategories.get(tx.id);
        if (newCat && newCat !== "Autre") {
          const updatedTx = applyCategoryToTransaction(tx, newCat, nowIso);
          list[i] = updatedTx;

          // Ne jamais écraser une règle manuelle définie par l'utilisateur
          if (rulesCopy[updatedTx.name]?.source !== "user_manual") {
            rulesCopy[updatedTx.name] = {
              categorie: newCat,
              isSubscription: Boolean(updatedTx.isSubscription),
              isInternalTransfer: Boolean(updatedTx.isInternalTransfer),
              excludeFromSpending: Boolean(updatedTx.excludeFromSpending),
              excludeFromIncome: Boolean(updatedTx.excludeFromIncome),
              source: "ai_suggested",
              updatedAt: nowIso,
            };
          }
        }
      }
    };

    applyAiMap(deduplicatedNew);
    applyAiMap(upgradedExisting);
  }

  flagInterAccountTransfers([...deduplicatedNew, ...upgradedExisting], nowIso);

  const allMergedTransactions = [...deduplicatedNew, ...upgradedExisting].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const deduplicatedIds = new Set(allMergedTransactions.map((t) => t.id));
  const cleanNew = deduplicatedNew.filter((t) => deduplicatedIds.has(t.id));
  const updatedOrNewTransactions = cleanNew.length > 0 ? cleanNew : allMergedTransactions;
  const netRemovedDuplicates = removedDuplicatesCount;

  return {
    candidateTransactions,
    deduplicatedNewTransactions: updatedOrNewTransactions,
    allMergedTransactions,
    learningRules: rulesCopy,
    usedSandboxFallback,
    removedDuplicatesCount: netRemovedDuplicates,
    addedCount: cleanNew.length,
  };
}

/**
 * Multi-comptes : un débit sur un sous-compte et un crédit du même montant sur un autre sous-compte
 * de la même liaison (à ±3 jours) constituent un virement interne (ex. courant -> livret), exclu des
 * dépenses et des revenus. Mutation en place des objets (partagés par référence avec les listes appelantes).
 */
export function flagInterAccountTransfers(list: Transaction[], nowIso: string): number {
  const DAY = 24 * 3600 * 1000;
  const credits = list.filter((t) => t.bankAccountUid && t.amount > 0);
  const used = new Set<string>();
  let flagged = 0;
  for (const debit of list) {
    if (!debit.bankAccountUid || debit.amount >= 0) continue;
    const match = credits.find(
      (c) =>
        !used.has(c.id) &&
        c.bankAccountUid !== debit.bankAccountUid &&
        Math.abs(c.amount + debit.amount) < 0.005 &&
        Math.abs(Date.parse(c.date) - Date.parse(debit.date)) <= 3 * DAY
    );
    if (!match) continue;
    used.add(match.id);
    for (const t of [debit, match]) {
      Object.assign(t, applyCategoryToTransaction(t, "Virement interne", nowIso));
    }
    flagged++;
  }
  return flagged;
}

/**
 * Recatégorise les opérations bancaires déjà en base classées « Autre » sans rappeler la banque.
 * Séquence stricte :
 * 1. Nettoyage du libellé (scories de terminaux, préfixe carte, dates)
 * 2. Règles locales (mots-clés regex)
 * 3. Dictionnaire d'apprentissage mémorisé (learningRules)
 * 4. IA (Gemini) pour tout ce qui reste en « Autre »
 * Journalise le nombre d'opérations envoyées à l'IA et de catégories attribuées.
 */
export async function recategorizeOrphanBankTransactions({
  transactions,
  learningRules = {},
  aiCategorizer,
}: {
  transactions: Transaction[];
  learningRules?: LearningRuleMap;
  aiCategorizer?: (items: Array<AiOrphanItem>) => Promise<Map<string, string>>;
}): Promise<{
  updatedTransactions: Transaction[];
  recategorizedCount: number;
  learningRules: LearningRuleMap;
}> {
  const nowIso = new Date().toISOString();
  const rulesCopy: LearningRuleMap = { ...learningRules };
  const updatedTransactions = [...transactions];
  let recategorizedCount = 0;

  // 1. Identifier les opérations bancaires en « Autre »
  const orphanIndices: number[] = [];
  const orphanItems: Array<AiOrphanItem> = [];

  for (let i = 0; i < updatedTransactions.length; i++) {
    const tx = updatedTransactions[i];
    const isBank = tx.source === "bank" || tx.id.startsWith("eb_");
    if (isBank && tx.type === "Autre") {
      // Nettoyage du libellé avant tout traitement (retrait préfixes carte, dates, mentions techniques)
      const cleaned = cleanOpenBankingMerchantLabel(tx.rawName || tx.name, true) || tx.name;

      // Étape A & B : Règles locales puis dictionnaire d'apprentissage
      const local = categorizeLocally({
        label: cleaned,
        rawLabel: tx.rawLabel || tx.rawName || tx.name,
        amount: tx.amount,
        cache: rulesCopy,
      });

      if (local.category && local.category !== "Autre") {
        const updated = applyCategoryToTransaction(
          { ...tx, name: cleaned },
          local.category,
          nowIso
        );
        updatedTransactions[i] = updated;
        recategorizedCount++;

        rulesCopy[updated.name] = {
          categorie: local.category,
          isSubscription: Boolean(updated.isSubscription),
          isInternalTransfer: Boolean(updated.isInternalTransfer),
          excludeFromSpending: Boolean(updated.excludeFromSpending),
          excludeFromIncome: Boolean(updated.excludeFromIncome),
          updatedAt: nowIso,
        };
      } else {
        orphanIndices.push(i);
        orphanItems.push({
          id: tx.id,
          label: cleaned,
          rawLabel: tx.rawLabel || tx.rawName || tx.name,
          amount: tx.amount,
        });
      }
    }
  }

  // Étape C : Appel IA pour tout ce qui reste en « Autre »
  let aiMap = new Map<string, string>();
  if (orphanItems.length === 0) {
    console.log(`[Bank AI] Nombre d'opérations envoyées à l'IA : 0`);
    console.log(`[Bank AI] Nombre de lots : 0`);
    console.log(`[Bank AI] Nombre de catégories attribuées : 0`);
    console.log(`[Bank AI] Nombre restant en « Autre » : 0`);
  } else {
    try {
      if (aiCategorizer) {
        const totalBatches = Math.ceil(orphanItems.length / AI_BATCH_SIZE);
        console.log(`[Bank AI] Nombre d'opérations envoyées à l'IA : ${orphanItems.length}`);
        console.log(`[Bank AI] Nombre de lots : ${totalBatches}`);

        for (let i = 0; i < orphanItems.length; i += AI_BATCH_SIZE) {
          const batch = orphanItems.slice(i, i + AI_BATCH_SIZE);
          let batchMap: Map<string, string> | null = null;
          try {
            batchMap = await aiCategorizer(batch);
          } catch (err1) {
            console.warn(`[Bank AI] Échec du lot ${Math.floor(i / AI_BATCH_SIZE) + 1}, nouvel essai unique...`, err1);
            try {
              batchMap = await aiCategorizer(batch);
            } catch (err2) {
              console.error(`[Bank AI] Deuxième échec du lot ${Math.floor(i / AI_BATCH_SIZE) + 1}, abandon du lot.`, err2);
            }
          }

          if (batchMap) {
            for (const [id, cat] of batchMap.entries()) {
              const normalized = normalizeAiCategory(cat);
              if (normalized !== "Autre") {
                aiMap.set(id, normalized);
              }
            }
          }
        }

        const assignedCount = Array.from(aiMap.values()).filter((c) => c && c !== "Autre").length;
        const remainingAutre = orphanItems.length - assignedCount;
        console.log(`[Bank AI] Nombre de catégories attribuées : ${assignedCount}`);
        console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);
      } else {
        aiMap = await enrichOrphansWithGemini(orphanItems, rulesCopy);
      }
    } catch (aiErr: unknown) {
      console.error("[Bank AI] Erreur lors de la catégorisation IA :", aiErr);
      const remainingAutre = orphanItems.length - aiMap.size;
      console.log(`[Bank AI] Nombre de catégories attribuées : ${aiMap.size}`);
      console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);
    }
  }

  if (aiMap.size > 0) {
    for (const idx of orphanIndices) {
      const tx = updatedTransactions[idx];
      const newCat = aiMap.get(tx.id);
      if (newCat && newCat !== "Autre") {
        const updated = applyCategoryToTransaction(tx, newCat, nowIso);
        updatedTransactions[idx] = updated;
        recategorizedCount++;

        if (rulesCopy[updated.name]?.source !== "user_manual") {
          rulesCopy[updated.name] = {
            categorie: newCat,
            isSubscription: Boolean(updated.isSubscription),
            isInternalTransfer: Boolean(updated.isInternalTransfer),
            excludeFromSpending: Boolean(updated.excludeFromSpending),
            excludeFromIncome: Boolean(updated.excludeFromIncome),
            source: "ai_suggested",
            updatedAt: nowIso,
          };
        }
      }
    }
  }

  return {
    updatedTransactions,
    recategorizedCount,
    learningRules: rulesCopy,
  };
}
