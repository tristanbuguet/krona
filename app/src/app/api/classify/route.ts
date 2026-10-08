import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    console.log("=== API /classify CALLED ===");
    if (!process.env.GEMINI_API_KEY) {
      console.error("CRITICAL: GEMINI_API_KEY is not set in environment variables!");
    }

    const body = await req.json();
    const { labels } = body;
    console.log("Labels to classify:", labels);

    if (!labels || !Array.isArray(labels) || labels.length === 0) {
      return NextResponse.json({ error: "No labels provided" }, { status: 400 });
    }

    const prompt = `
Tu es un assistant expert en classification de transactions bancaires pour des finances personnelles.
Associe chaque libellé bancaire fourni à l'une des 10 catégories cibles exactes suivantes, et évalue s'il s'agit d'un abonnement récurrent.

Catégories officielles autorisées (et AUCUNE autre) :
1. "Alimentation & Courses"
2. "Restos & Fast-Food"
3. "Sorties & Soirées"
4. "Shopping & Mode"
5. "Transports"
6. "Abonnements & Forfaits"
7. "Santé & Soins"
8. "Virements proches & Remboursements"
9. "Revenus & Aides"
10. "Épargne & Trésorerie"

Règles contextuelles indispensables :
- Basic-Fit, Bouygues Telecom, Free, Spotify, Netflix, Uber One, Uber *One Membe -> "Abonnements & Forfaits" (isSubscription: true)
- Uber Eats, McDonald's, KFC, Yankee Burger, Boulangerie, Café -> "Restos & Fast-Food"
- Aldi, Auchan, U Express, Picard, Franprix, Epicerie -> "Alimentation & Courses"
- Bershka, Uniqlo, H&M, IKEA, Galeries Lafayette, Normal -> "Shopping & Mode"
- Pacha Club, Pamela Club, Fluctuart, Bars, Soirées -> "Sorties & Soirées"
- Service Navigo, Île-de-France Mobilités, Uber Trip, VTC -> "Transports"
- Livi.fr, Pharmacie, Médecin -> "Santé & Soins"
- Virement depuis Livret Bourso+, Virement interne -> "Épargne & Trésorerie"
- CAF, Salaires, Avoirs (montants positifs) -> "Revenus & Aides"
- Virements entre personnes physiques (ex: Sixtine, Germain, Enzo...) -> "Virements proches & Remboursements"

Liste des libellés à classifier :
${JSON.stringify(labels)}
    `;

    console.log("Calling Gemini API...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            classifications: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  libelle: { type: Type.STRING },
                  categorie: { type: Type.STRING },
                  isSubscription: { type: Type.BOOLEAN },
                },
                required: ["libelle", "categorie", "isSubscription"],
              },
            },
          },
          required: ["classifications"],
        },
      },
    });

    if (response.text) {
      console.log("Gemini API Response text:", response.text);
      const jsonResponse = JSON.parse(response.text);
      return NextResponse.json(jsonResponse);
    } else {
      console.error("Gemini API returned no text.");
      throw new Error("No text response from Gemini");
    }
  } catch (error) {
    console.error("=== Error classifying labels ===");
    console.error(error);
    return NextResponse.json({ error: "Failed to classify", details: String(error) }, { status: 500 });
  }
}
