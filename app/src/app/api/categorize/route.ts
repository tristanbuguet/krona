import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { OFFICIAL_CATEGORIES } from "@/lib/types";
import { categorizeLocally } from "@/lib/categorization";

interface TransactionItem {
  id: string;
  label: string;
  amount?: number;
}

// Catégories officielles exactes de l'application
const VALID_CATEGORIES = [
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
  "Autre"
] as const;

// Normalisation sécurisée au cas où l'IA retourne une variante abrégée
function normalizeCategory(cat: string): string {
  if (!cat) return "Autre";
  const cleaned = cat.trim();
  if ((OFFICIAL_CATEGORIES as readonly string[]).includes(cleaned)) return cleaned;

  const lower = cleaned.toLowerCase();
  if (lower.includes("virement interne") || lower.includes("vir interne") || lower.includes("interne") || lower.includes("regul") || lower.includes("ajustement")) return "Virement interne";
  if (lower.includes("aliment") || lower.includes("course") || lower.includes("superm")) return "Alimentation & Courses";
  if (lower.includes("resto") || lower.includes("fast") || lower.includes("snack") || lower.includes("bar") || lower.includes("cafe")) return "Restos & Fast-Food";
  if (lower.includes("sorti") || lower.includes("soire") || lower.includes("loisir") || lower.includes("cinem")) return "Sorties & Soirées";
  if (lower.includes("shop") || lower.includes("mode") || lower.includes("vetem") || lower.includes("achat")) return "Shopping & Mode";
  if (lower.includes("transport") || lower.includes("train") || lower.includes("vol") || lower.includes("uber") || lower.includes("peage") || lower.includes("essence")) return "Transports";
  if (lower.includes("abon") || lower.includes("forfait") || lower.includes("souscription")) return "Abonnements & Forfaits";
  if (lower.includes("sant") || lower.includes("soin") || lower.includes("pharm") || lower.includes("medec")) return "Santé & Soins";
  if (lower.includes("logem") || lower.includes("maison") || lower.includes("loyer") || lower.includes("charge") || lower.includes("brico")) return "Logement & Maison";
  if (lower.includes("vir") || lower.includes("rembours") || lower.includes("lydia") || lower.includes("paypal")) return "Virements proches & Remboursements";
  if (lower.includes("revenu") || lower.includes("salair") || lower.includes("aide") || lower.includes("caf") || lower.includes("paie")) return "Revenus & Aides";
  if (lower.includes("epargn") || lower.includes("tresor") || lower.includes("invest")) return "Épargne & Trésorerie";

  return "Autre";
}

// Fallback local systématique basé sur le dictionnaire de mots-clés
function localFallbackCategorize(items: TransactionItem[]): Array<{ id: string; category: string }> {
  return items.map(item => {
    const res = categorizeLocally({
      label: item.label,
      rawLabel: item.label,
      amount: typeof item.amount === "number" ? item.amount : 0,
      cache: {}
    });
    return {
      id: item.id,
      category: res.category
    };
  });
}

export async function POST(req: NextRequest) {
  const items: TransactionItem[] = [];

  try {
    const body = (await req.json()) as Record<string, unknown>;

    // Support de la payload compacte [{ id, label, amount }]
    if (body.items && Array.isArray(body.items)) {
      body.items.forEach((it: unknown) => {
        if (it && typeof it === "object" && "id" in it && "label" in it) {
          const itemObj = it as { id: unknown; label: unknown; amount?: unknown };
          items.push({
            id: String(itemObj.id),
            label: String(itemObj.label).trim(),
            amount: typeof itemObj.amount === "number" ? itemObj.amount : undefined,
          });
        }
      });
    } else if (body.transactions && Array.isArray(body.transactions)) {
      body.transactions.forEach((tx: unknown, idx: number) => {
        if (typeof tx === "string") {
          items.push({ id: `legacy_${idx}`, label: tx.trim() });
        } else if (tx && typeof tx === "object" && "label" in tx) {
          const txObj = tx as { id?: unknown; label: unknown; amount?: unknown };
          items.push({
            id: String(txObj.id || `legacy_${idx}`),
            label: String(txObj.label).trim(),
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
      const fallbackResults = localFallbackCategorize(items);
      const assignedCount = fallbackResults.filter(r => r.category && r.category !== "Autre").length;
      console.log(`[AI Categorization] Transactions envoyées à l'IA : ${items.length}`);
      console.log(`[AI Categorization] Catégories attribuées par l'IA : ${assignedCount}`);
      return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
    }

    console.log(`[AI Categorization] Transactions reçues pour catégorisation : ${items.length}`);

    // Si le lot est important, envoyer les 25 premières à l'IA et pré-catégoriser le reste localement
    const aiBatch = items.slice(0, 25);
    const overflowBatch = items.slice(25);
    const preCategorizedOverflow = overflowBatch.length > 0 ? localFallbackCategorize(overflowBatch) : [];

    const prompt = `
Tu es un moteur FinTech expert de catégorisation bancaire française.
Pour chaque opération ci-dessous, identifie le commerçant ou la nature de la dépense et associe STRICTEMENT une catégorie parmi cette liste FINIE et exacte (et AUCUNE autre) :
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

Règles de catégorisation :
- Supermarchés, épiceries, boulangeries, supérettes -> "Alimentation & Courses"
- Restaurants, fast-foods, snacks, brasseries, cafés -> "Restos & Fast-Food"
- Cinémas, soirées, loisirs, clubs, parcs -> "Sorties & Soirées"
- Boutiques, prêt-à-porter, high-tech, Amazon, Fnac -> "Shopping & Mode"
- Train, métro, avion, péages, carburant, Uber, taxi -> "Transports"
- Salle de sport, Netflix, Spotify, forfaits mobiles/box, cloud -> "Abonnements & Forfaits"
- Médecins, pharmacie, optique, dentiste, analyses -> "Santé & Soins"
- Loyer, électricité, gaz, eau, charges, bricolage -> "Logement & Maison"
- Virements entre particuliers, Lydia, PayPal entre amis -> "Virements proches & Remboursements"
- Salaires, indemnités, allocations, CAF -> "Revenus & Aides"
- Livrets, placements, versements épargne -> "Épargne & Trésorerie"
- Virements internes de compte à compte, régularisations, ajustements techniques -> "Virement interne"
- Si indéterminé ou trop générique -> "Autre"

Opérations à catégoriser (avec ID et libellé) :
${JSON.stringify(aiBatch)}

Réponds STRICTEMENT sous la forme d'un tableau JSON brut valide, sans balises Markdown (aucun \`\`\`json) ni texte d'introduction ni explications :
[
  { "id": "id_de_l_operation", "category": "categorie_exacte" }
]
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
            config: {
              responseMimeType: "application/json",
            },
          }),
          timeoutPromise,
        ]);

        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[AI Categorization] Modèle ${model} indisponible, test du suivant...`, msg);
      }
    }

    if (!responseText) {
      console.error("[AI Categorization Error] Tous les modèles IA ont échoué. Activation du fallback local.");
      const fallbackResults = localFallbackCategorize(items);
      const assignedCount = fallbackResults.filter(r => r.category && r.category !== "Autre").length;
      console.log(`[AI Categorization] Catégories attribuées par l'IA : ${assignedCount}`);
      return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
    }

    // Nettoyage strict des balises Markdown résiduelles
    const cleanedText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();

    // Extraction robuste du tableau JSON
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
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("[AI Categorization Error] Erreur lors du parse JSON brut :", msg);
      const firstBracket = cleanedText.indexOf("[");
      const lastBracket = cleanedText.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
          rawArray = JSON.parse(cleanedText.slice(firstBracket, lastBracket + 1)) as unknown[];
        } catch { }
      }
    }

    if (!rawArray || rawArray.length === 0) {
      console.warn("[AI Categorization Error] Tableau vide extrait. Repli sur le fallback local.");
      const fallbackResults = localFallbackCategorize(items);
      const assignedCount = fallbackResults.filter(r => r.category && r.category !== "Autre").length;
      console.log(`[AI Categorization] Catégories attribuées par l'IA : ${assignedCount}`);
      return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
    }

    const finalResults: Array<{ id: string; category: string }> = [];

    rawArray.forEach((item: unknown) => {
      if (item && typeof item === "object" && "id" in item) {
        const itemObj = item as { id: unknown; category?: unknown };
        const cat = normalizeCategory(String(itemObj.category || ""));
        finalResults.push({
          id: String(itemObj.id),
          category: cat,
        });
      }
    });

    const combinedResults = [...finalResults, ...preCategorizedOverflow];
    const assignedCount = combinedResults.filter(r => r.category && r.category !== "Autre").length;
    console.log(`[AI Categorization] Catégories attribuées au total : ${assignedCount}`);

    return NextResponse.json({
      results: combinedResults,
      mapping: combinedResults,
      fallback: false,
    }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[AI Categorization Error]", msg);
    const fallbackResults = items.length > 0 ? localFallbackCategorize(items) : [];
    const assignedCount = fallbackResults.filter(r => r.category && r.category !== "Autre").length;
    console.log(`[AI Categorization] Catégories attribuées par l'IA : ${assignedCount}`);
    return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
  }
}
