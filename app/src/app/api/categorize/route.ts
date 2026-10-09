import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("CRITICAL: GEMINI_API_KEY is not set in environment variables!");
      return NextResponse.json({ error: "GEMINI_API_KEY is missing" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const body = await req.json();
    const { transactions } = body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ categorized: [] }, { status: 200 });
    }

    // Deduplication to optimize tokens
    const uniqueTransactions = Array.from(new Set(transactions as string[]));

    const prompt = `
Tu es un expert FinTech français de classification bancaire. Pour chaque transaction brute, renvoie le nom propre nettoyé de l'enseigne (sans codes cartes, préfixes CB*, dates ou villes), la catégorie exacte parmi la liste autorisée, et des booléens stricts.

Catégories autorisées (et AUCUNE autre) :
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

Règles métier clés :
- Libellés VIR ... LIVRET, EPARGNE, virements au titulaire -> catégorie "Épargne & Trésorerie" avec isInternal: true.
- Libellés LYDIA, PAYLIB, remboursements entre proches -> "Virements proches & Remboursements" avec isRefund: true.
- Abonnements récurrents connus (Basic-Fit, Spotify, Netflix, Orange, Bouygues) -> "Abonnements & Forfaits" avec isSubscription: true.
- Tabac, Presse, boutiques de proximité -> "Shopping & Mode".
- Tout crédit/flux entrant substantiel provenant d'une entreprise employeur (ex. Societe Anonyme Des Galeries La, Galeries Lafayette, etc.) DOIT être catégorisé en "Revenus & Aides" et JAMAIS en "Shopping & Mode". "Shopping & Mode" ne s'applique qu'aux débits.
- Photomaton, loisirs créatifs, musées, sorties culturelles (ex: Fluctuart, Pamela), bars, clubs -> "Sorties & Soirées".
- Virements de particuliers (Vir Inst, Virement de...) reçus ou remboursements entre proches -> "Virements proches & Remboursements" avec isRefund: true.
- CAF, salaires, allocations, aides sociales -> "Revenus & Aides".
- Loyer, charges, EDF, Engie, assurance habitation -> "Logement & Maison".
- Pharmacie, médecin, CPAM, mutuelle, Livi, Doctolib -> "Santé & Soins".
- La catégorie "Autre" doit être STRICTEMENT réservée aux frais bancaires purs, prélèvements administratifs non identifiables ou libellés complètement indéchiffrables.

Liste des libellés bruts à analyser :
${JSON.stringify(uniqueTransactions)}

IMPORTANT : Retourne UNIQUEMENT un objet JSON valide avec cette structure stricte, et rien d'autre (ni markdown, ni texte autour) :
{
  "categorized": [
    {
      "raw": "LIBELLE_BRUT",
      "cleanName": "Nom Commerçant Propre",
      "category": "Une des catégories autorisées",
      "isInternal": false,
      "isRefund": false,
      "isSubscription": false
    }
  ]
}
    `;

    let lastError: any = null;
    const retryDelays = [800, 1500];

    // 1. Essai sur le modèle principal avec Retry (max 2 relances)
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        if (response.text) {
          const rawText = response.text || '';
          
          // Recherche du bloc délimité par le premier { et le dernier } correspondant
          const firstBrace = rawText.indexOf('{');
          const lastBrace = rawText.lastIndexOf('}');

          if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error("Aucun objet JSON détecté dans la réponse Gemini");
          }

          const jsonCandidate = rawText.slice(firstBrace, lastBrace + 1).trim();
          const data = JSON.parse(jsonCandidate);
          return NextResponse.json(data);
        } else {
          throw new Error("No text response from Gemini");
        }
      } catch (err: any) {
        lastError = err;
        const errStr = String(err);
        const isRetryable = errStr.includes("503") || errStr.includes("429") || errStr.includes("UNAVAILABLE") || errStr.includes("RESOURCE_EXHAUSTED");
        
        if (isRetryable && attempt < retryDelays.length) {
          console.warn(`[Gemini] Erreur 503/429 (Tentative ${attempt + 1}). Attente de ${retryDelays[attempt]}ms...`);
          await new Promise(r => setTimeout(r, retryDelays[attempt]));
        } else {
          // Soit ce n'est pas une erreur réseau temporaire, soit on a épuisé les retries
          break;
        }
      }
    }

    // 2. Modèle de secours (Fallback) si tout a échoué
    console.warn("[Gemini] Modèle principal indisponible, bascule sur gemini-3.5-flash...");
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      if (fallbackResponse.text) {
        const rawText = fallbackResponse.text || '';
        
        // Recherche du bloc délimité par le premier { et le dernier } correspondant
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
          throw new Error("Aucun objet JSON détecté dans la réponse Gemini");
        }

        const jsonCandidate = rawText.slice(firstBrace, lastBrace + 1).trim();
        const data = JSON.parse(jsonCandidate);
        return NextResponse.json(data);
      } else {
        throw new Error("No text response from Gemini Fallback");
      }
    } catch (fallbackErr: any) {
      console.error("Gemini API Error (Fallback model) during generation/parsing:", fallbackErr);
      return NextResponse.json({ 
        categorized: [], 
        fallback: true,
        serverError: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      }, { status: 200 });
    }
  } catch (error) {
    console.error("=== Error categorizing transactions ===", error);
    return NextResponse.json({ 
      categorized: [], 
      fallback: true,
      serverError: error instanceof Error ? error.message : String(error)
    }, { status: 200 });
  }
}
