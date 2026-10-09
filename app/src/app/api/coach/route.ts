import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY missing, coach is disabled.");
      return NextResponse.json({ tips: [] });
    }
    const ai = new GoogleGenAI({ apiKey });

    const data = await req.json();
    const prompt = `Tu es un coach financier d'une vingtaine d'années très direct, bienveillant et qui ne parle pas avec le jargon des banques.
Ton but est d'analyser les finances du mois en cours et de donner exactement 3 conseils ultra percutants.

Voici les données du mois :
- Revenus : ${data.income.toFixed(2)} €
- Dépenses (hors épargne) : ${data.expenses.toFixed(2)} €
- Reste à vivre (Solde) : ${data.balance.toFixed(2)} €
- Épargne & Virements internes : ${data.savedAmount ? data.savedAmount.toFixed(2) : 0} €
- Total Abonnements : ${data.subs ? data.subs.toFixed(2) : 0} €
- Rythme journalier (si en cours) : ${data.dailyPace ? `${data.dailyPace.amount.toFixed(2)} € / jour` : 'Clôturé'}
- Top catégories de dépenses : ${JSON.stringify(data.categoryData)}
- Top commerçants : ${JSON.stringify(data.topMerchants)}

Règles ABSOLUES (Sous peine d'erreur grave) :
- Renvoie TOUJOURS EXACTEMENT 3 OBJETS dans le tableau JSON. Ni 2, ni 4.
- Chaque conseil doit faire entre 60 et 90 CARACTÈRES maximum (très court, 1 seule ligne visuelle).
- Pas de "budget", "arbitrage", "solvabilité". Parle de manière directe et amicale.
- Chaque objet doit avoir le format suivant :
  - "type": "warning" | "success" | "tip"
  - "text": Le message court (60-90 caractères)
  
Exemple de format attendu :
[
  { "type": "warning", "text": "T'as cramé beaucoup trop en restos ce mois-ci, lève le pied !" },
  { "type": "success", "text": "T'es super large niveau solde, bien joué." }
]
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    if (!response.text) {
      return NextResponse.json({ tips: [] });
    }

    const cleanJson = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const json = JSON.parse(cleanJson);
    return NextResponse.json({ tips: json });
  } catch (error) {
    console.error("AI Tips Error:", error);
    return NextResponse.json({ tips: [] });
  }
}
