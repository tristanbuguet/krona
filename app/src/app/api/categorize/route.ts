import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { LearningRuleMap } from "@/lib/types";
import { categorizeLocally } from "@/lib/categorization";
import {
  AI_BATCH_SIZE,
  AiOrphanItem,
  buildAiCategorizationPrompt,
  normalizeAiCategory,
} from "@/lib/bankPipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fallback local systématique basé sur le dictionnaire de mots-clés et les règles apprises
function localFallbackCategorize(
  items: AiOrphanItem[],
  learningRules: LearningRuleMap = {}
): Array<{ id: string; category: string }> {
  return items.map((item) => {
    const res = categorizeLocally({
      label: item.label,
      rawLabel: item.rawLabel || item.label,
      amount: typeof item.amount === "number" ? item.amount : 0,
      cache: learningRules,
    });
    return {
      id: item.id,
      category: res.category,
    };
  });
}

async function callGemini(
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
          config: {
            responseMimeType: "application/json",
          },
        }),
        timeoutPromise,
      ]);

      if (response.text) {
        return response.text;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Categorization] Modèle ${model} indisponible, test du suivant...`, msg);
    }
  }

  throw new Error("Tous les modèles IA ont échoué ou ont expiré.");
}

function parseGeminiJson(responseText: string): Array<{ id: string; category: string }> {
  const cleanedText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
  let rawArray: unknown[] = [];
  try {
    const parsed = JSON.parse(cleanedText) as unknown;
    if (Array.isArray(parsed)) {
      rawArray = parsed;
    } else if (parsed && typeof parsed === "object") {
      const parsedRecord = parsed as Record<string, unknown>;
      if (Array.isArray(parsedRecord.results)) {
        rawArray = parsedRecord.results;
      } else if (Array.isArray(parsedRecord.mapping)) {
        rawArray = parsedRecord.mapping;
      } else {
        const firstVal = Object.values(parsedRecord)[0];
        if (Array.isArray(firstVal)) {
          rawArray = firstVal;
        }
      }
    }
  } catch {
    const firstBracket = cleanedText.indexOf("[");
    const lastBracket = cleanedText.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        rawArray = JSON.parse(cleanedText.slice(firstBracket, lastBracket + 1)) as unknown[];
      } catch {}
    }
  }

  const results: Array<{ id: string; category: string }> = [];
  for (const it of rawArray) {
    if (it && typeof it === "object" && "id" in it) {
      const obj = it as { id: unknown; category?: unknown };
      const cat = normalizeAiCategory(String(obj.category || ""));
      results.push({ id: String(obj.id), category: cat });
    }
  }
  return results;
}

export async function POST(req: NextRequest) {
  const items: AiOrphanItem[] = [];

  try {
    const body = (await req.json()) as Record<string, unknown>;

    // Extraction et typage strict des règles d'apprentissage utilisateur
    const rawRules: LearningRuleMap =
      body.learningRules && typeof body.learningRules === "object"
        ? (body.learningRules as LearningRuleMap)
        : body.merchantKnowledge && typeof body.merchantKnowledge === "object"
        ? (body.merchantKnowledge as LearningRuleMap)
        : {};

    // Sélection au maximum des 10 dernières règles apprises pour le Few-Shot (par updatedAt décroissant)
    const sortedRecentRules = Object.entries(rawRules)
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

    // Support de la payload compacte [{ id, label, rawLabel, amount }]
    if (body.items && Array.isArray(body.items)) {
      body.items.forEach((it: unknown) => {
        if (it && typeof it === "object" && "id" in it && "label" in it) {
          const itemObj = it as { id: unknown; label: unknown; rawLabel?: unknown; amount?: unknown };
          items.push({
            id: String(itemObj.id),
            label: String(itemObj.label).trim(),
            rawLabel: typeof itemObj.rawLabel === "string" ? itemObj.rawLabel.trim() : undefined,
            amount: typeof itemObj.amount === "number" ? itemObj.amount : undefined,
          });
        }
      });
    } else if (body.transactions && Array.isArray(body.transactions)) {
      body.transactions.forEach((tx: unknown, idx: number) => {
        if (typeof tx === "string") {
          items.push({ id: `legacy_${idx}`, label: tx.trim() });
        } else if (tx && typeof tx === "object" && "label" in tx) {
          const txObj = tx as { id?: unknown; label: unknown; rawLabel?: unknown; amount?: unknown };
          items.push({
            id: String(txObj.id || `legacy_${idx}`),
            label: String(txObj.label).trim(),
            rawLabel: typeof txObj.rawLabel === "string" ? txObj.rawLabel.trim() : undefined,
            amount: typeof txObj.amount === "number" ? txObj.amount : undefined,
          });
        }
      });
    }

    if (items.length === 0) {
      return NextResponse.json({ results: [], mapping: [], fallback: false }, { status: 200 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[AI Categorization Error] GEMINI_API_KEY absente. Activation du fallback local par mots-clés.");
      const fallbackResults = localFallbackCategorize(items, rawRules);
      const assignedCount = fallbackResults.filter((r) => r.category && r.category !== "Autre").length;
      const remainingAutre = items.length - assignedCount;
      console.log(`[AI Categorization] Transactions envoyées à l'IA : ${items.length}`);
      console.log(`[AI Categorization] Nombre d'opérations envoyées à l'IA : ${items.length}`);
      console.log(`[Bank AI] Nombre d'opérations envoyées à l'IA : ${items.length}`);
      console.log(`[Bank AI] Nombre de lots : ${Math.ceil(items.length / AI_BATCH_SIZE)}`);
      console.log(`[AI Categorization] Catégories attribuées par l'IA : ${assignedCount}`);
      console.log(`[AI Categorization] Nombre de catégories attribuées : ${assignedCount}`);
      console.log(`[Bank AI] Nombre de catégories attribuées : ${assignedCount}`);
      console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);
      return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
    }

    const totalBatches = Math.ceil(items.length / AI_BATCH_SIZE);
    console.log(`[AI Categorization] Transactions reçues pour catégorisation : ${items.length}`);
    console.log(`[Bank AI] Nombre d'opérations envoyées à l'IA : ${items.length}`);
    console.log(`[Bank AI] Nombre de lots : ${totalBatches}`);

    const ai = new GoogleGenAI({ apiKey });
    const resolvedMap = new Map<string, string>();

    // Traite toutes les opérations par lots de taille AI_BATCH_SIZE (30), l'un après l'autre
    for (let i = 0; i < items.length; i += AI_BATCH_SIZE) {
      const batch = items.slice(i, i + AI_BATCH_SIZE);
      const prompt = buildAiCategorizationPrompt(batch, fewShotSection);

      let responseText = "";
      try {
        responseText = await callGemini(ai, prompt);
      } catch (err1) {
        console.warn(`[Bank AI] Échec du lot ${Math.floor(i / AI_BATCH_SIZE) + 1}, nouvel essai unique...`, err1);
        try {
          // Réessaie un lot en échec une fois avant de le laisser en « Autre »
          responseText = await callGemini(ai, prompt);
        } catch (err2) {
          console.error(`[Bank AI] Deuxième échec du lot ${Math.floor(i / AI_BATCH_SIZE) + 1}, abandon du lot.`, err2);
        }
      }

      if (responseText) {
        const parsedResults = parseGeminiJson(responseText);
        for (const item of parsedResults) {
          if (item.category && item.category !== "Autre") {
            resolvedMap.set(item.id, item.category);
          }
        }
      }

      // Vérifie que la réponse contient une catégorie valide pour chaque opération envoyée
      // et relance seulement celles qui manquent
      const missingInBatch = batch.filter((it) => !resolvedMap.has(it.id));
      if (missingInBatch.length > 0 && missingInBatch.length < batch.length) {
        try {
          const retryPrompt = buildAiCategorizationPrompt(missingInBatch, fewShotSection);
          const retryText = await callGemini(ai, retryPrompt, 5000);
          if (retryText) {
            const retryParsed = parseGeminiJson(retryText);
            for (const item of retryParsed) {
              if (item.category && item.category !== "Autre") {
                resolvedMap.set(item.id, item.category);
              }
            }
          }
        } catch (missingErr) {
          console.warn("[Bank AI] Erreur lors de la relance des opérations manquantes :", missingErr);
        }
      }
    }

    // Fallback local complémentaire pour toute opération non résolue par l'IA
    const finalResults: Array<{ id: string; category: string }> = items.map((item) => {
      const aiCat = resolvedMap.get(item.id);
      if (aiCat && aiCat !== "Autre") {
        return { id: item.id, category: aiCat };
      }
      const local = categorizeLocally({
        label: item.label,
        rawLabel: item.rawLabel || item.label,
        amount: typeof item.amount === "number" ? item.amount : 0,
        cache: rawRules,
      });
      return {
        id: item.id,
        category: local.category || "Autre",
      };
    });

    const assignedCount = finalResults.filter((r) => r.category && r.category !== "Autre").length;
    const remainingAutre = items.length - assignedCount;

    console.log(`[AI Categorization] Catégories attribuées au total : ${assignedCount}`);
    console.log(`[AI Categorization] Nombre de catégories attribuées : ${assignedCount}`);
    console.log(`[Bank AI] Nombre de catégories attribuées : ${assignedCount}`);
    console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);

    return NextResponse.json({
      results: finalResults,
      mapping: finalResults,
      fallback: false,
    }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[AI Categorization Error]", msg);
    const fallbackResults = items.length > 0 ? localFallbackCategorize(items) : [];
    const assignedCount = fallbackResults.filter((r) => r.category && r.category !== "Autre").length;
    const remainingAutre = items.length - assignedCount;
    console.log(`[AI Categorization] Catégories attribuées par l'IA : ${assignedCount}`);
    console.log(`[Bank AI] Nombre de catégories attribuées : ${assignedCount}`);
    console.log(`[Bank AI] Nombre restant en « Autre » : ${remainingAutre}`);
    return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
  }
}
