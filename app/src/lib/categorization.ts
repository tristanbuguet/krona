import { OFFICIAL_CATEGORIES } from "./types";

export type OfficialCategory = (typeof OFFICIAL_CATEGORIES)[number];

export interface CategorizationResult {
  category: OfficialCategory;
  isSubscription: boolean;
  isInternalTransfer: boolean;
}

/**
 * Normalise une chaîne pour une comparaison insensible à la casse et aux accents.
 */
export function normalizeText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Nettoyage approfondi du nom de commerçant / libellé :
 * - Supprime les préfixes bancaires courants (cartes, virements, prélèvements)
 * - Supprime les dates internes (04/10, etc.) et identifiants techniques
 * - Gère les retours à la ligne internes
 * - Met en forme avec une casse propre (Title Case)
 */
export function cleanMerchantName(rawLabel: string): string {
  if (!rawLabel) return "Inconnu";

  // Remplacer les retours à la ligne et tabulations par des espaces
  let name = rawLabel.replace(/[\r\n\t]+/g, " ");

  // Normalisation majuscule pour le filtrage des préfixes
  name = name.toUpperCase();

  // Nettoyage itératif des préfixes et mentions techniques usuelles
  const prefixRegexes = [
    /^(PAIEMENT\s+PAR\s+CARTE|PAIEMENT\s+CARTE|PAIEMENT\s+CB|ACHAT\s+CB|CB\*)\s*/i,
    /^(CARTE\s+X\d{4}\s+\d{2}\/\d{2}|CARTE\s+X\d{4}|CARTE\s+\d{2}\/\d{2}|CARTE)\s*/i,
    /^(VIR(EMENT)?\s+SEPA\s+RECU\s+(DE\s+)?|VIR(EMENT)?\s+SEPA\s+|VIR(EMENT)?\s+RECU\s+(DE\s+)?|VIR(EMENT)?\s+INST(ANTANE)?\s+(RECU\s+)?(DE\s+)?)/i,
    /^(VIR(EMENT)?\s+EN\s+VOTRE\s+FAVEUR\s+(DE\s+)?|VIR(EMENT)?\s+EMIS\s+(POUR\s+)?|VIR(EMENT)?\s+(DE|VERS)\s+)/i,
    /^(PRLV\s+SEPA\s+(DE\s+)?|PRLV\s+DE\s+|PRLV\s+|PRELEVEMENT\s+SEPA\s+(DE\s+)?|PRELEVEMENT\s+DE\s+|PRELEVEMENT\s+)/i,
    /^(RETRAIT\s+DAB\s+|RETRAIT\s+AU\s+DISTRIBUTEUR\s+|RETRAIT\s+)/i,
    /^(COTISATION\s+MENSUELLE\s+|COTISATION\s+|COMMISSION\s+|FRAIS\s+BANCAIRES?\s+)/i,
  ];

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    for (const rx of prefixRegexes) {
      if (rx.test(name)) {
        name = name.replace(rx, "").trim();
        changed = true;
      }
    }
  }

  // Nettoyage des dates intermédiaires comme "04/10" ou "04/10/2026"
  name = name.replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?(\s+|$)/g, " ");

  // Nettoyage des identifiants techniques / codes cartes résiduels (ex: CB*1234, X1234, etc.)
  name = name.replace(/\bCB\*\d+\b/gi, "");
  name = name.replace(/\bX\d{4}\b/gi, "");

  // Nettoyage des codes hexadécimaux / alphanumériques longs de fin de ligne
  name = name.replace(/\s+[A-Z0-9]{8,}\s*$/g, "");

  // Espaces superflus
  name = name.replace(/\s+/g, " ").trim();

  if (!name) return "Inconnu";

  // Titrage en Title Case
  return name
    .split(" ")
    .map(word => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Dictionnaire complet de catégorisation locale par mots-clés (insensible à la casse et accents).
 */
export function categorizeLocally({
  label,
  rawLabel,
  amount,
  categoryBourso,
  cache = {},
}: {
  label: string;
  rawLabel?: string;
  amount: number;
  categoryBourso?: string;
  cache?: Record<string, any>;
}): CategorizationResult {
  const normLabel = normalizeText(label);
  const normRaw = normalizeText(rawLabel || "");
  const normCat = normalizeText(categoryBourso || "");
  const combined = `${normLabel} ${normRaw}`;

  // 1. RÈGLE PRIORITAIRE ABSOLUE : Épargne & Mouvements internes
  // Jamais écrasé par le cache ou un autre motif
  if (
    combined.includes("livret") ||
    combined.includes("bourso+") ||
    combined.includes("epargne") ||
    combined.includes("virement interne") ||
    combined.includes("comptes a comptes") ||
    combined.includes("mouvements internes") ||
    combined.includes("tristan buguet") ||
    normCat.includes("mouvements internes") ||
    normCat.includes("comptes a comptes")
  ) {
    return {
      category: "Épargne & Trésorerie",
      isSubscription: false,
      isInternalTransfer: true,
    };
  }

  // 2. RÈGLE MÉTIER STRICTE : Galeries Lafayette
  if (combined.includes("galeries lafayette") || combined.includes("societe anonyme des galeries la")) {
    if (amount > 0) {
      return { category: "Revenus & Aides", isSubscription: false, isInternalTransfer: false };
    } else {
      return { category: "Shopping & Mode", isSubscription: false, isInternalTransfer: false };
    }
  }

  // 3. CACHE LOCAL UTILISATEUR (krona_merchant_knowledge)
  if (cache[label]?.categorie && OFFICIAL_CATEGORIES.includes(cache[label].categorie)) {
    return {
      category: cache[label].categorie,
      isSubscription: cache[label].isSubscription || false,
      isInternalTransfer: false,
    };
  }

  // 4. DICTIONNAIRE LOCAL ÉTENDU PAR MOTS-CLÉS

  // --- LOGEMENT & ÉNERGIE (vérifié avant 'total' pour éviter collision avec total direct energie) ---
  // loyer, edf, engie, total direct energie, eau, veolia, charges, assurance
  if (
    combined.includes("total direct energie") ||
    /\b(loyer|edf|engie|veolia|charges|assurance habitation|assurance)\b/.test(combined) ||
    combined.includes("eau de paris") ||
    combined.includes("suez")
  ) {
    return { category: "Logement & Maison", isSubscription: false, isInternalTransfer: false };
  }

  // --- REVENUS & SALAIRES ---
  // virement recu, salaire, remboursement, paye, caf, cpam, pole emploi, france travail
  if (
    combined.includes("virement recu") ||
    combined.includes("vir recu") ||
    combined.includes("vir sepa recu") ||
    combined.includes("pole emploi") ||
    combined.includes("france travail") ||
    combined.includes("remboursement") ||
    combined.includes("virement en votre faveur") ||
    /\b(salaire|paye|caf|cpam|employeur)\b/.test(combined) ||
    (amount > 0 && normCat.includes("salaire"))
  ) {
    return { category: "Revenus & Aides", isSubscription: false, isInternalTransfer: false };
  }

  // --- SHOPPING, MODE & HIGH-TECH (cas apple store avant apple) ---
  if (combined.includes("apple store")) {
    return { category: "Shopping & Mode", isSubscription: false, isInternalTransfer: false };
  }

  // --- ALIMENTATION & COURSES (boulangerie avant boulanger) ---
  // carrefour, auchan, lidl, aldi, monoprix, franprix, intermarche, e.leclerc, leclerc, super u, biocoop, naturalia, picard, boulangerie, paul, marie blachere
  if (
    combined.includes("boulangerie") ||
    combined.includes("marie blachere") ||
    combined.includes("e.leclerc") ||
    combined.includes("super u") ||
    combined.includes("u express") ||
    combined.includes("intermarche") ||
    combined.includes("biocoop") ||
    combined.includes("naturalia") ||
    combined.includes("monoprix") ||
    combined.includes("franprix") ||
    combined.includes("carrefour") ||
    combined.includes("auchan") ||
    combined.includes("picard") ||
    combined.includes("lidl") ||
    combined.includes("aldi") ||
    /\b(leclerc|epicerie|hyper u)\b/.test(combined)
  ) {
    return { category: "Alimentation & Courses", isSubscription: false, isInternalTransfer: false };
  }

  // --- RESTAURANTS, CAFÉS & FAST-FOOD ---
  // mcdonalds, mcdo, burger king, kfc, subway, starbucks, columbus, uber eats, deliveroo, just eat, dominos, pizza, kebab, tacos, sushi, brasserie, bistrot, cafe, bar
  if (
    combined.includes("uber eats") ||
    combined.includes("burger king") ||
    combined.includes("mcdonald") ||
    combined.includes("mcdo") ||
    combined.includes("just eat") ||
    combined.includes("deliveroo") ||
    combined.includes("starbucks") ||
    combined.includes("columbus") ||
    combined.includes("dominos") ||
    combined.includes("subway") ||
    combined.includes("kfc") ||
    /\b(pizza|kebab|tacos|sushi|brasserie|bistrot|bistro|cafe|bar|crous|tasty|restaurant|cantine)\b/.test(combined)
  ) {
    return { category: "Restos & Fast-Food", isSubscription: false, isInternalTransfer: false };
  }

  // --- TÉLÉPHONIE & INTERNET (Abonnements & Forfaits) ---
  // free mobile, freebox, orange, sosh, sfr, red by sfr, bouygues
  if (
    combined.includes("free mobile") ||
    combined.includes("freebox") ||
    combined.includes("red by sfr") ||
    combined.includes("bouygues") ||
    combined.includes("sosh") ||
    /\b(orange|sfr)\b/.test(combined) ||
    (normLabel.includes("free") && (normLabel.includes("telecom") || normLabel.includes("mobile") || normLabel.includes("box")))
  ) {
    return { category: "Abonnements & Forfaits", isSubscription: true, isInternalTransfer: false };
  }

  // --- SPORT, SANTÉ & BIEN-ÊTRE ---
  // Sport -> Abonnements & Forfaits (avec isSubscription: true)
  // basic-fit, basic fit, fitness park, on air, keep cool
  if (
    combined.includes("basic fit") ||
    combined.includes("basic-fit") ||
    combined.includes("fitness park") ||
    combined.includes("on air") ||
    combined.includes("keep cool")
  ) {
    return { category: "Abonnements & Forfaits", isSubscription: true, isInternalTransfer: false };
  }

  // Santé -> Santé & Soins
  // pharmacie, doctolib, laboratoire, dentiste, optique
  if (
    combined.includes("pharmacie") ||
    combined.includes("doctolib") ||
    combined.includes("laboratoire") ||
    combined.includes("dentiste") ||
    combined.includes("optique") ||
    combined.includes("livi") ||
    /\b(medecin|mutuelle|clinique|hopital)\b/.test(combined)
  ) {
    return { category: "Santé & Soins", isSubscription: false, isInternalTransfer: false };
  }

  // --- ABONNEMENTS, DIVERTISSEMENT & MÉDIAS ---
  // netflix, spotify, apple.com/bill, apple, google play, youtube, disney, prime video, amazon prime, canal+, deezer, pathe, ugc, cinema
  if (
    combined.includes("apple.com/bill") ||
    combined.includes("prime video") ||
    combined.includes("amazon prime") ||
    combined.includes("google play") ||
    combined.includes("netflix") ||
    combined.includes("spotify") ||
    combined.includes("youtube") ||
    combined.includes("disney") ||
    combined.includes("canal+") ||
    combined.includes("canal plus") ||
    combined.includes("deezer") ||
    combined.includes("pathe") ||
    combined.includes("ugc") ||
    combined.includes("cinema") ||
    combined.includes("icloud") ||
    combined.includes("uber one") ||
    (/\bapple\b/.test(combined) && !combined.includes("apple store"))
  ) {
    return { category: "Abonnements & Forfaits", isSubscription: true, isInternalTransfer: false };
  }

  // --- SHOPPING, MODE & HIGH-TECH ---
  // zara, h&m, uniqlo, asos, zalando, fnac, darty, boulanger, action, primark, ikea, leroy merlin
  if (
    combined.includes("leroy merlin") ||
    combined.includes("h&m") ||
    combined.includes("uniqlo") ||
    combined.includes("zalando") ||
    combined.includes("primark") ||
    combined.includes("darty") ||
    combined.includes("ikea") ||
    combined.includes("zara") ||
    combined.includes("asos") ||
    combined.includes("fnac") ||
    combined.includes("action") ||
    combined.includes("bershka") ||
    combined.includes("decathlon") ||
    combined.includes("sephora") ||
    combined.includes("amazon") ||
    /\b(boulanger|normal|tabac)\b/.test(combined)
  ) {
    return { category: "Shopping & Mode", isSubscription: false, isInternalTransfer: false };
  }

  // --- TRANSPORTS & MOBILITÉ ---
  // sncf, ratp, ile-de-france mobilites, transpole, ilevia, uber, bolt, total, totalenergies, bp, esso, shell, station, peage, aprr, sanef, vinci autoroutes, parking
  if (
    combined.includes("ile-de-france mobilites") ||
    combined.includes("vinci autoroutes") ||
    combined.includes("totalenergies") ||
    combined.includes("transpole") ||
    combined.includes("ilevia") ||
    combined.includes("sanef") ||
    combined.includes("aprr") ||
    combined.includes("sncf") ||
    combined.includes("ratp") ||
    combined.includes("idfm") ||
    combined.includes("navigo") ||
    combined.includes("bolt") ||
    combined.includes("esso") ||
    combined.includes("shell") ||
    combined.includes("peage") ||
    combined.includes("parking") ||
    (/\b(uber|bp|total|station|vinci)\b/.test(combined) && !combined.includes("uber eats"))
  ) {
    return { category: "Transports", isSubscription: false, isInternalTransfer: false };
  }


  // --- SORTIES & SOIRÉES ---
  if (
    combined.includes("pacha club") ||
    combined.includes("pamela club") ||
    combined.includes("fluctuart") ||
    /\b(discotheque|boite de nuit|nightclub)\b/.test(combined)
  ) {
    return { category: "Sorties & Soirées", isSubscription: false, isInternalTransfer: false };
  }

  // --- VIREMENTS PROCHES ---
  if (combined.includes("lydia") || combined.includes("paylib") || combined.includes("vir inst")) {
    return { category: "Virements proches & Remboursements", isSubscription: false, isInternalTransfer: false };
  }

  // 5. MOTS-CLÉS NORMES BOURSOBANK (catégories natives de la banque)
  if (normCat) {
    if (normCat.includes("restaurant") || normCat.includes("bar") || normCat.includes("discotheque")) {
      return { category: "Restos & Fast-Food", isSubscription: false, isInternalTransfer: false };
    }
    if (normCat.includes("alimentation")) {
      return { category: "Alimentation & Courses", isSubscription: false, isInternalTransfer: false };
    }
    if (normCat.includes("vetement") || normCat.includes("mobilier") || normCat.includes("decoration")) {
      return { category: "Shopping & Mode", isSubscription: false, isInternalTransfer: false };
    }
    if (normCat.includes("transport") || normCat.includes("taxi")) {
      return { category: "Transports", isSubscription: false, isInternalTransfer: false };
    }
    if (normCat.includes("telephonie") || normCat.includes("club") || normCat.includes("association")) {
      return { category: "Abonnements & Forfaits", isSubscription: true, isInternalTransfer: false };
    }
    if (normCat.includes("medecin") || normCat.includes("frais medicaux") || normCat.includes("sante")) {
      return { category: "Santé & Soins", isSubscription: false, isInternalTransfer: false };
    }
    if (normCat.includes("virement emis") || normCat.includes("virement recu") || normCat.includes("don") || normCat.includes("cadeau")) {
      return { category: "Virements proches & Remboursements", isSubscription: false, isInternalTransfer: false };
    }
    if (normCat.includes("allocation") || normCat.includes("salaire")) {
      return { category: "Revenus & Aides", isSubscription: false, isInternalTransfer: false };
    }
    if (normCat.includes("loyer") || normCat.includes("habitation")) {
      return { category: "Logement & Maison", isSubscription: false, isInternalTransfer: false };
    }
  }

  // Opération non catégorisée localement -> Orpheline ("Autre")
  return {
    category: "Autre",
    isSubscription: false,
    isInternalTransfer: false,
  };
}
