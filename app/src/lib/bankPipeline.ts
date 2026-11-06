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

export async function enrichOrphansWithGemini(
  orphans: Array<{ id: string; label: string; amount?: number }>
): Promise<Map<string, string>> {
  const resultMap = new Map<string, string>();
  if (orphans.length === 0) {
    console.log("[BankPipeline AI] 0 transaction orpheline à envoyer à l'IA (100% résolu par Regex + Règles).");
    return resultMap;
  }

  console.log(`[BankPipeline AI] Envoi de ${orphans.length} transaction(s) à l'IA pour catégorisation...`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[BankPipeline AI] GEMINI_API_KEY absente, exécution du moteur heuristique de secours.");
    for (const item of orphans) {
      const cleaned = cleanOpenBankingMerchantLabel(item.label, true);
      const local = categorizeLocally({
        label: cleaned || item.label,
        rawLabel: item.label,
        amount: item.amount ?? 0,
        cache: {},
      });
      if (local.category && local.category !== "Autre") {
        resultMap.set(item.id, local.category);
      }
    }
    console.log(
      `[BankPipeline AI] Résultat IA (fallback local) : ${resultMap.size}/${orphans.length} catégorisées`,
      Object.fromEntries(resultMap)
    );
    return resultMap;
  }

  try {
    // Si la liste d'orphelines est volumineuse, envoyer les 25 premières à l'IA et résoudre le reste localement
    const aiBatch = orphans.slice(0, 25);
    const localBatch = orphans.slice(25);

    for (const item of localBatch) {
      const cleaned = cleanOpenBankingMerchantLabel(item.label, true);
      const local = categorizeLocally({
        label: cleaned || item.label,
        rawLabel: item.label,
        amount: item.amount ?? 0,
        cache: {},
      });
      if (local.category && local.category !== "Autre") {
        resultMap.set(item.id, local.category);
      }
    }

    const prompt = `
Tu es un moteur FinTech expert de catégorisation bancaire française.
Pour chaque opération ci-dessous (comportant id, label et montant en euros), identifie le commerçant ou la nature de la dépense et associe STRICTEMENT une catégorie parmi cette liste FINIE et exacte (et AUCUNE autre) :
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

Règles d'association :
- Supermarchés, alimentation générale, Picard, Monoprix, Coccinelle, U Express, boulangeries, supérettes -> "Alimentation & Courses"
- Restaurants, fast-foods, snacks, brasseries, cafés, Goodnews, Vicco, Uber Eats, Deliveroo, McDonald's -> "Restos & Fast-Food"
- Cinémas, soirées, loisirs, clubs, billetterie, Shotgun, parcs -> "Sorties & Soirées"
- Boutiques, prêt-à-porter, Galeries Lafayette, Zara, Ikea, Amazon, Fnac, tabac -> "Shopping & Mode"
- Train, métro, RATP, Navigo, Imagine R, SNCF, avion, péages, carburant, Uber, taxi -> "Transports"
- Salle de sport, Basic-Fit, Netflix, Spotify, Uber One, forfaits mobiles/box, Bouygues, abonnements récurrents -> "Abonnements & Forfaits"
- Médecins, pharmacie, Kry, Livi, Doctolib, optique, dentiste, laboratoire -> "Santé & Soins"
- Loyer, électricité, gaz, eau, charges, syndic, bricolage -> "Logement & Maison"
- Virements entre particuliers, Lydia, PayPal entre amis -> "Virements proches & Remboursements"
- Salaires (montants positifs significatifs), indemnités, allocations, CAF, Pôle Emploi -> "Revenus & Aides"
- Livrets, placements, versements épargne -> "Épargne & Trésorerie"
- Virements internes de compte à compte, régularisations techniques -> "Virement interne"
- Si indéterminé ou trop générique -> "Autre"

Opérations à catégoriser :
${JSON.stringify(aiBatch)}

Réponds uniquement en JSON valide sans balises Markdown : [{ "id": "...", "category": "..." }]
`.trim();

    const ai = new GoogleGenAI({ apiKey });
    const candidateModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
    ];

    let responseText = "";
    for (const model of candidateModels) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout IA modèle ${model} (4500ms)`)), 4500)
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
          responseText = response.text;
          break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[BankPipeline AI] Modèle ${model} indisponible, test du suivant...`, msg);
      }
    }

    if (responseText) {
      const text = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object" && "id" in item && "category" in item) {
            const id = String((item as { id: unknown }).id);
            const cat = normalizeAiCategory(String((item as { category: unknown }).category));
            if (cat !== "Autre") {
              resultMap.set(id, cat);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[BankPipeline AI] Erreur lors de l'appel Gemini :", err);
  }

  // Fallback local complémentaire pour toute opération non résolue par l'IA
  for (const item of orphans) {
    if (!resultMap.has(item.id)) {
      const cleaned = cleanOpenBankingMerchantLabel(item.label, true);
      const local = categorizeLocally({
        label: cleaned || item.label,
        rawLabel: item.label,
        amount: item.amount ?? 0,
        cache: {},
      });
      if (local.category && local.category !== "Autre") {
        resultMap.set(item.id, local.category);
      }
    }
  }

  console.log(
    `[BankPipeline AI] Résultat renvoyé : ${resultMap.size}/${orphans.length} transaction(s) catégorisée(s)`,
    Object.fromEntries(resultMap)
  );

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
  aiCategorizer?: (items: Array<{ id: string; label: string; amount?: number }>) => Promise<Map<string, string>>;
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
      type: localCat.category || "Autre",
      amount: raw.amount,
      date: raw.date,
      month: raw.month || raw.date.slice(0, 7),
      isSubscription: localCat.isSubscription,
      isRecurring: localCat.isSubscription,
      isInternalTransfer: localCat.isInternalTransfer,
      excludeFromSpending: localCat.excludeFromSpending ?? localCat.isInternalTransfer,
      excludeFromIncome: localCat.excludeFromIncome ?? localCat.isInternalTransfer,
      account: formatBankDisplayName(raw.account || cleanAspspLabel),
      source: "bank",
      ...(raw.bankAccountUid ? { bankAccountUid: raw.bankAccountUid } : {}),
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
  const orphans = deduplicatedNew
    .filter((t) => t.type === "Autre")
    .map((t) => ({ id: t.id, label: t.name, amount: t.amount }));

  // Si des opérations existantes issues de la banque étaient restées en "Autre", les réévaluer
  for (const ex of upgradedExisting) {
    if (ex.source === "bank" && ex.type === "Autre" && !orphans.some((o) => o.id === ex.id)) {
      orphans.push({ id: ex.id, label: ex.name, amount: ex.amount });
    }
  }

  const allCombined = [...deduplicatedNew, ...upgradedExisting];
  const categorizedLocallyCount = allCombined.length - orphans.length;
  console.log(
    `[BankPipeline] Étapes A & B (Regex + Règles) : ${categorizedLocallyCount}/${allCombined.length} opérations catégorisées, ${orphans.length} orpheline(s) "Autre".`
  );

  let aiCategories = new Map<string, string>();

  if (!skipAiEnrichment) {
    console.log(`[BankPipeline AI] Transactions envoyées à l'IA : ${orphans.length}`);

    if (orphans.length > 0) {
      if (aiCategorizer) {
        aiCategories = await aiCategorizer(orphans);
      } else {
        aiCategories = await enrichOrphansWithGemini(orphans);
      }
    }

    const assignedCount = Array.from(aiCategories.values()).filter((c) => c && c !== "Autre").length;
    console.log(`[BankPipeline AI] Catégories attribuées par l'IA : ${assignedCount}`);
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

          rulesCopy[updatedTx.name] = {
            categorie: newCat,
            isSubscription: Boolean(updatedTx.isSubscription),
            isInternalTransfer: Boolean(updatedTx.isInternalTransfer),
            excludeFromSpending: Boolean(updatedTx.excludeFromSpending),
            excludeFromIncome: Boolean(updatedTx.excludeFromIncome),
            updatedAt: nowIso,
          };
        }
      }
    };

    applyAiMap(deduplicatedNew);
    applyAiMap(upgradedExisting);
  }

  flagInterAccountTransfers([...deduplicatedNew, ...upgradedExisting], nowIso);

  const rawMerged = [...deduplicatedNew, ...upgradedExisting];
  const allMergedTransactions = sanitizeAndDeduplicateTransactions(rawMerged);

  // Synchroniser également deduplicatedNewTransactions avec les transactions assainies
  const deduplicatedIds = new Set(allMergedTransactions.map((t) => t.id));
  const cleanNew = deduplicatedNew.filter((t) => deduplicatedIds.has(t.id));
  const updatedOrNewTransactions = cleanNew.length > 0 ? cleanNew : allMergedTransactions;
  const netRemovedDuplicates = Math.max(
    removedDuplicatesCount,
    rawMerged.length - allMergedTransactions.length
  );

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
