import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { OFFICIAL_CATEGORIES } from "@/lib/types";
import { categorizeLocally } from "@/lib/categorization";

interface TransactionItem {
  id: string;
  label: string;
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
  "Autre"
] as const;

// Normalisation sécurisée au cas où l'IA retourne une variante abrégée
function normalizeCategory(cat: string): string {
  if (!cat) return "Autre";
  const cleaned = cat.trim();
  if (OFFICIAL_CATEGORIES.includes(cleaned as any)) return cleaned;

  const lower = cleaned.toLowerCase();
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
      amount: 0,
      cache: {}
    });
    return {
      id: item.id,
      category: res.category
    };
  });
}

export async function POST(req: NextRequest) {
  let items: TransactionItem[] = [];

  try {
    const body = await req.json();

    // Support de la payload compacte [{ id, label }]
    if (body.items && Array.isArray(body.items)) {
      body.items.forEach((it: any) => {
        if (it && it.id && it.label) {
          items.push({ id: String(it.id), label: String(it.label).trim() });
        }
      });
    } else if (body.transactions && Array.isArray(body.transactions)) {
      body.transactions.forEach((tx: string, idx: number) => {
        if (tx) items.push({ id: `legacy_${idx}`, label: String(tx).trim() });
      });
    }

    if (items.length === 0) {
      return NextResponse.json({ results: [], mapping: [], fallback: false }, { status: 200 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[AI Categorization Error] GEMINI_API_KEY absente. Activation du fallback local par mots-clés.");
      const fallbackResults = localFallbackCategorize(items);
      return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
    }

    console.log(`[Krona AI] Catégorisation de ${items.length} transactions...`);

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
- Si indéterminé ou trop générique -> "Autre"

Opérations à catégoriser (avec ID et libellé) :
${JSON.stringify(items)}

Réponds STRICTEMENT sous la forme d'un tableau JSON brut valide, sans balises Markdown (aucun \`\`\`json) ni texte d'introduction ni explications :
[
  { "id": "id_de_l_operation", "category": "categorie_exacte" }
]
`.trim();

    const ai = new GoogleGenAI({ apiKey });
    const candidateModels = [
      "gemini-flash-lite-latest",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-flash-latest",
    ];
    let responseText = "";

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        console.error(`[AI Categorization Error] Modèle ${model} indisponible :`, err?.message || err);
      }
    }

    if (!responseText) {
      console.error("[AI Categorization Error] Tous les modèles IA ont échoué. Activation du fallback local.");
      const fallbackResults = localFallbackCategorize(items);
      return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
    }

    // Nettoyage strict des balises Markdown résiduelles
    const cleanedText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();

    // Extraction robuste du tableau JSON
    let rawArray: any[] = [];
    try {
      const parsed = JSON.parse(cleanedText);
      if (Array.isArray(parsed)) {
        rawArray = parsed;
      } else if (parsed && Array.isArray(parsed.results)) {
        rawArray = parsed.results;
      } else if (parsed && Array.isArray(parsed.mapping)) {
        rawArray = parsed.mapping;
      } else if (parsed && typeof parsed === "object") {
        const firstVal = Object.values(parsed)[0];
        if (Array.isArray(firstVal)) {
          rawArray = firstVal;
        }
      }
    } catch (parseErr: any) {
      console.error("[AI Categorization Error] Erreur lors du parse JSON brut :", parseErr?.message || parseErr);
      const firstBracket = cleanedText.indexOf("[");
      const lastBracket = cleanedText.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
          rawArray = JSON.parse(cleanedText.slice(firstBracket, lastBracket + 1));
        } catch {}
      }
    }

    if (!rawArray || rawArray.length === 0) {
      console.warn("[AI Categorization Error] Tableau vide extrait. Repli sur le fallback local.");
      const fallbackResults = localFallbackCategorize(items);
      return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
    }

    const finalResults: Array<{ id: string; category: string }> = [];

    rawArray.forEach((item: any) => {
      if (item && item.id) {
        const cat = normalizeCategory(item.category);
        finalResults.push({
          id: String(item.id),
          category: cat,
        });
      }
    });

    console.log('[Krona AI] Réponse reçue:', finalResults);

    return NextResponse.json({
      results: finalResults,
      mapping: finalResults,
      fallback: false,
    }, { status: 200 });
  } catch (error: any) {
    console.error("[AI Categorization Error]", error?.message || error);
    const fallbackResults = items.length > 0 ? localFallbackCategorize(items) : [];
    return NextResponse.json({ results: fallbackResults, mapping: fallbackResults, fallback: true }, { status: 200 });
  }
}
