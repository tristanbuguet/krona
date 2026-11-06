import { OFFICIAL_CATEGORIES, isSubscriptionCategory, isInternalTransferCategory, isRegularisationCategory } from "./types";

export type OfficialCategory = (typeof OFFICIAL_CATEGORIES)[number];

export interface CategorizationResult {
  category: OfficialCategory;
  isSubscription: boolean;
  isInternalTransfer: boolean;
  excludeFromSpending?: boolean;
  excludeFromIncome?: boolean;
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
    /^(PAIEMENT\s+PAR\s+CARTE|PAIEMENT\s+CARTE|PAIEMENT\s+CB|ACHAT\s+CB|ACHAT\s+CARTE|CB\*)(\s+(DU\s+)?\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?)?(\s+\d{1,2}[hH:]\d{2})?\s+/i,
    /^(CARTE\s+(DU\s+)?(X\d{4}\s+\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?|X\d{4}|(N[°O]?|NUM[EÉ]RO)\s*\d+\s+\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?|(N[°O]?|NUM[EÉ]RO)\s*\d+|\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?))\s+/i,
    /^CARTE(?:\s+(?:DU|DE))?(?:\s+(?:N[°O]?|NUM[EÉ]RO)\s*\d+)?(?:\s+X\d{4})?(?:\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)?(?:\s+\d{1,2}[hH:]\d{2})?\s+/i,
    /^CB\s+(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\s+)?/i,
    /^(VIR(EMENT)?\s+)?(SEPA\s+)?(RECU|EMIS|INST(ANTAN[EÉ])?)(\s+(DE|POUR|VERS|EN\s+VOTRE\s+FAVEUR\s+(DE\s+)?))?\s+/i,
    /^(VIR(EMENT)?\s+SEPA|VIR(EMENT)?\s+EN\s+VOTRE\s+FAVEUR(\s+DE)?|VIR(EMENT)?\s+RECU(\s+DE)?|VIR(EMENT)?\s+EMIS(\s+(POUR|VERS))?|VIR(EMENT)?\s+(DE|VERS))\s+/i,
    /^(PRLV\s+SEPA\s+(DE\s+)?|PRLV\s+DE\s+|PRLV\s+|PRELEVEMENT\s+SEPA\s+(DE\s+)?|PRELEVEMENT\s+DE\s+|PRELEVEMENT\s+)/i,
    /^(RETRAIT\s+DAB|RETRAIT\s+AU\s+DISTRIBUTEUR|RETRAIT|DAB)(\s+(DU\s+)?\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?)?\s+/i,
    /^(COTIS(ATION)?(\s+MENSUELLE)?|COMMISSION|FRAIS\s+BANCAIRES?)\s+/i,
    /^(DU|DE|VERS|POUR)\s+/i,
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

  // Nettoyage des heures éventuelles (14H30, 14:30)
  name = name.replace(/(?:^|\s+)\d{1,2}[Hh:]\d{2}(?:[:\.]\d{2})?(?:\s+|$)/g, " ");

  // Nettoyage des dates intermédiaires ou en début de ligne comme "04/10" ou "04/10/2026"
  name = name.replace(/(?:^|\s+)\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?(?:\s+|$)/g, " ");

  // Nettoyage des identifiants techniques / codes cartes résiduels (ex: CB*1234, X1234, etc.)
  name = name.replace(/\bCB\*\d+\b/gi, "");
  name = name.replace(/\bX\d{4}\b/gi, "");

  // Nettoyage des codes hexadécimaux / alphanumériques longs de fin de ligne (comportant au moins un chiffre)
  name = name.replace(/\s+(?=[A-Z0-9]*\d)[A-Z0-9]{8,}\s*$/g, "");

  // Espaces superflus
  name = name.replace(/\s+/g, " ").trim();

  // Si le nettoyage a vidé tout le libellé (ex: "VIREMENT RECU"), préserver le libellé d'origine
  const target = name || rawLabel.replace(/[\r\n\t]+/g, " ").trim();
  if (!target) return "Inconnu";

  // Titrage en Title Case
  return target
    .split(" ")
    .map(word => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Table de correspondance native pour les exports Caisse d'Épargne (BPCE) :
 * Exploite les colonnes 'Categorie' et 'Sous categorie' de la banque pour mapper
 * directement vers les catégories officielles de Krona.
 */
export function mapCaisseEpargneCategory(
  category?: string,
  subCategory?: string
): { category: OfficialCategory; isSubscription?: boolean } | null {
  if (!category && !subCategory) return null;

  const cat = normalizeText(category || "");
  const sub = normalizeText(subCategory || "");

  // 1. ALIMENTATION & RESTAURATION
  if (cat.includes("alimentation") || cat.includes("nourriture") || cat.includes("repas")) {
    if (
      sub.includes("restau") ||
      sub.includes("fast food") ||
      sub.includes("fast-food") ||
      sub.includes("snack") ||
      sub.includes("bar") ||
      sub.includes("cafe") ||
      sub.includes("brasserie") ||
      sub.includes("bistrot")
    ) {
      return { category: "Restos & Fast-Food", isSubscription: false };
    }
    // Hyper/supermarché, épicerie, boulangerie, primeur, etc.
    return { category: "Alimentation & Courses", isSubscription: false };
  }

  if (
    cat.includes("restaurant") ||
    cat.includes("restauration") ||
    cat.includes("bar") ||
    cat.includes("cafe")
  ) {
    return { category: "Restos & Fast-Food", isSubscription: false };
  }

  // 2. TRANSPORTS & VÉHICULE
  if (
    cat.includes("transport") ||
    cat.includes("vehicule") ||
    cat.includes("auto") ||
    cat.includes("moto") ||
    cat.includes("deplacement")
  ) {
    if (
      sub.includes("navigo") ||
      sub.includes("commun") ||
      sub.includes("abonnement") ||
      sub.includes("forfait")
    ) {
      return { category: "Transports", isSubscription: true };
    }
    // Péage, stationnement, carburant, garage, train, avion, taxi, vtc...
    return { category: "Transports", isSubscription: false };
  }

  // 3. LOGEMENT & CHARGES FIXES
  if (
    cat.includes("logement") ||
    cat.includes("maison") ||
    cat.includes("habitat") ||
    cat.includes("immobilier")
  ) {
    // Internet & téléphonie -> Abonnements & Forfaits
    if (
      sub.includes("internet") ||
      sub.includes("telephon") ||
      sub.includes("mobile") ||
      sub.includes("box") ||
      sub.includes("communication")
    ) {
      return { category: "Abonnements & Forfaits", isSubscription: true };
    }
    // Loyer, charges, électricité, gaz, eau, syndic, assurance habitation, bricolage...
    return { category: "Logement & Maison", isSubscription: false };
  }

  // 4. ABONNEMENTS & FORFAITS / TÉLÉCOMMUNICATIONS / STREAMING
  if (
    cat.includes("abonnement") ||
    cat.includes("telecommunication") ||
    cat.includes("telephon") ||
    cat.includes("internet") ||
    cat.includes("multimedia") ||
    cat.includes("streaming")
  ) {
    return { category: "Abonnements & Forfaits", isSubscription: true };
  }

  // 5. LOISIRS, SORTIES & VOYAGES
  if (
    cat.includes("loisir") ||
    cat.includes("sortie") ||
    cat.includes("spectacle") ||
    cat.includes("culture") ||
    cat.includes("voyage") ||
    cat.includes("vacance")
  ) {
    if (
      sub.includes("streaming") ||
      sub.includes("musique") ||
      sub.includes("video") ||
      sub.includes("presse") ||
      sub.includes("abonnement")
    ) {
      return { category: "Abonnements & Forfaits", isSubscription: true };
    }
    return { category: "Sorties & Soirées", isSubscription: false };
  }

  // 6. SHOPPING & MODE
  if (
    cat.includes("shopping") ||
    cat.includes("achat") ||
    cat.includes("mode") ||
    cat.includes("vetement") ||
    cat.includes("habillement") ||
    cat.includes("chaussure") ||
    cat.includes("beaute")
  ) {
    return { category: "Shopping & Mode", isSubscription: false };
  }

  // 7. SANTÉ & SOINS
  if (
    cat.includes("sante") ||
    cat.includes("soin") ||
    cat.includes("medical") ||
    cat.includes("pharmacie") ||
    cat.includes("mutuelle")
  ) {
    return { category: "Santé & Soins", isSubscription: false };
  }

  // 8. REVENUS & AIDES
  if (
    cat.includes("revenu") ||
    cat.includes("salaire") ||
    cat.includes("remuneration") ||
    cat.includes("aide") ||
    cat.includes("allocation") ||
    cat.includes("pension")
  ) {
    return { category: "Revenus & Aides", isSubscription: false };
  }

  // 9. VIREMENTS & ÉPARGNE
  if (
    cat.includes("virement") ||
    cat.includes("epargne") ||
    cat.includes("placement") ||
    cat.includes("mouvement")
  ) {
    if (
      sub.includes("interne") ||
      sub.includes("compte a compte") ||
      sub.includes("epargne") ||
      sub.includes("livret")
    ) {
      return { category: "Virement interne", isSubscription: false };
    }
    return { category: "Virements proches & Remboursements", isSubscription: false };
  }

  // 10. FRAIS BANCAIRES
  if (cat.includes("frais bancaire") || cat.includes("cotisation") || cat.includes("banque")) {
    if (sub.includes("cotisation") || sub.includes("carte") || sub.includes("forfait")) {
      return { category: "Abonnements & Forfaits", isSubscription: true };
    }
    return { category: "Autre", isSubscription: false };
  }

  // 11. Analyse directe de la sous-catégorie si la catégorie principale n'a pas matché
  if (sub.includes("hyper") || sub.includes("supermarche") || sub.includes("courses") || sub.includes("epicerie")) {
    return { category: "Alimentation & Courses", isSubscription: false };
  }
  if (sub.includes("restau") || sub.includes("fast food") || sub.includes("fast-food")) {
    return { category: "Restos & Fast-Food", isSubscription: false };
  }
  if (sub.includes("peage") || sub.includes("stationnement") || sub.includes("carburant") || sub.includes("essence")) {
    return { category: "Transports", isSubscription: false };
  }
  if (sub.includes("internet") || sub.includes("telephonie") || sub.includes("mobile")) {
    return { category: "Abonnements & Forfaits", isSubscription: true };
  }
  if (sub.includes("pharmacie") || sub.includes("medecin") || sub.includes("dentiste")) {
    return { category: "Santé & Soins", isSubscription: false };
  }
  if (sub.includes("habillement") || sub.includes("chaussure") || sub.includes("pret a porter")) {
    return { category: "Shopping & Mode", isSubscription: false };
  }

  return null;
}

/**
 * Dictionnaire complet de catégorisation locale par mots-clés (insensible à la casse et accents).
 */
export function categorizeLocally({
  label,
  rawLabel,
  amount,
  categoryBourso,
  bankCategory,
  subCategory,
  cache = {},
}: {
  label: string;
  rawLabel?: string;
  amount: number;
  categoryBourso?: string;
  bankCategory?: string;
  subCategory?: string;
  cache?: Record<string, any>;
}): CategorizationResult {
  const normLabel = normalizeText(label);
  const normRaw = normalizeText(rawLabel || "");
  const normCat = normalizeText(bankCategory || categoryBourso || "");
  const normSub = normalizeText(subCategory || "");
  const combined = `${normLabel} ${normRaw}`
    .replace(/[*_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 1. RÈGLE APPRISE UTILISATEUR (learningRules / cache local prioritaire)
  const stemLabel = normLabel.replace(/[*_]+/g, " ").replace(/\s+\d+$/, "").replace(/\s+/g, " ").trim();
  let cachedRule =
    cache[label] ||
    cache[normLabel] ||
    cache[stemLabel] ||
    (rawLabel ? cache[rawLabel] : undefined) ||
    (rawLabel ? cache[normRaw] : undefined);

  if (!cachedRule && cache && typeof cache === "object") {
    for (const [ruleKey, ruleVal] of Object.entries(cache)) {
      const normKey = normalizeText(ruleKey).replace(/[*_]+/g, " ").replace(/\s+/g, " ").trim();
      if (normKey && (normKey === normLabel || normKey === stemLabel || (normKey.length >= 4 && stemLabel.startsWith(normKey)))) {
        cachedRule = ruleVal;
        break;
      }
    }
  }
  if (
    cachedRule?.categorie &&
    (OFFICIAL_CATEGORIES.includes(cachedRule.categorie) ||
      cachedRule.categorie === "Régularisation" ||
      isRegularisationCategory(cachedRule.categorie))
  ) {
    let cat = cachedRule.categorie;
    if (cat === "Régularisation" || isRegularisationCategory(cat)) {
      cat = "Virement interne";
    }
    const isRegul = isRegularisationCategory(cat);
    const isInternal = isInternalTransferCategory(cat) || isRegul || Boolean(cachedRule.isInternalTransfer);
    const isSub = !isInternal && (isSubscriptionCategory(cat) 
      ? cachedRule.isSubscription !== false 
      : Boolean(cachedRule.isSubscription && cat === "Transports"));
    return {
      category: cat,
      isSubscription: isSub,
      isInternalTransfer: isInternal,
      excludeFromSpending: isInternal,
      excludeFromIncome: isInternal || isRegul,
    };
  }

  // 2. EXCLUSION BUDGÉTAIRE DES FLUX NEUTRES (Virements internes, Régularisations & Ajustements comptables)
  if (
    combined.includes("regularisation") ||
    combined.includes("ajustement") ||
    /\b(regularisation|regul|reguls|ajustement|ajustements)\b/.test(combined) ||
    normCat.includes("regularisation") ||
    normCat.includes("ajustement") ||
    normSub.includes("regularisation") ||
    normSub.includes("ajustement") ||
    /\b(regul|reguls)\b/.test(normCat) ||
    /\b(regul|reguls)\b/.test(normSub)
  ) {
    return {
      category: "Virement interne",
      isSubscription: false,
      isInternalTransfer: true,
      excludeFromSpending: true,
      excludeFromIncome: true,
    };
  }

  // 2b. EXCLUSION BUDGÉTAIRE DES FLUX NEUTRES (Virements compte à compte & Mouvements internes)
  if (
    combined.includes("virement interne") ||
    combined.includes("virement depuis") ||
    combined.includes("virement vers") ||
    combined.includes("comptes a comptes") ||
    combined.includes("compte a compte") ||
    combined.includes("mouvements internes") ||
    normCat.includes("mouvements internes") ||
    normCat.includes("comptes a comptes") ||
    normCat.includes("virement interne") ||
    normSub.includes("virement interne") ||
    normSub.includes("compte a compte")
  ) {
    return {
      category: "Virement interne",
      isSubscription: false,
      isInternalTransfer: true,
      excludeFromSpending: true,
      excludeFromIncome: true,
    };
  }

  // 2c. EXCLUSION BUDGÉTAIRE DES FLUX D'ÉPARGNE (Livrets & Placements)
  if (
    combined.includes("livret") ||
    combined.includes("bourso+") ||
    combined.includes("epargne") ||
    combined.includes("tristan buguet") ||
    normCat.includes("epargne") ||
    normSub.includes("epargne") ||
    normSub.includes("livret")
  ) {
    return {
      category: "Épargne & Trésorerie",
      isSubscription: false,
      isInternalTransfer: true,
      excludeFromSpending: true,
      excludeFromIncome: true,
    };
  }

  // RÈGLE SPÉCIFIQUE : Galeries Lafayette (Shopping vs Salaire selon le signe, y compris libellé CB tronqué à 16 car.)
  if (
    combined.includes("galeries lafayette") ||
    combined.includes("galeries lafayet") ||
    combined.includes("societe anonyme des galeries la")
  ) {
    if (amount > 0) {
      return { category: "Revenus & Aides", isSubscription: false, isInternalTransfer: false, excludeFromSpending: false };
    } else {
      return { category: "Shopping & Mode", isSubscription: false, isInternalTransfer: false, excludeFromSpending: false };
    }
  }

  // 3. MAPPING NATIF BANCAIRE (Caisse d'Épargne Categorie & Sous categorie)
  const ceMapping = mapCaisseEpargneCategory(bankCategory || categoryBourso, subCategory);
  if (ceMapping) {
    const isInternal = isInternalTransferCategory(ceMapping.category) || isRegularisationCategory(ceMapping.category);
    return {
      category: ceMapping.category,
      isSubscription: Boolean(ceMapping.isSubscription),
      isInternalTransfer: isInternal,
      excludeFromSpending: isInternal,
      excludeFromIncome: isInternal,
    };
  }

  // 4. MOTEUR HEURISTIQUE / IA TEXTUEL EN FALLBACK

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
  // virement recu (hors remboursement/avoir), salaire, paye, caf, pole emploi, france travail
  if (
    !combined.includes("remboursement") &&
    !combined.includes("avoir") &&
    (
      combined.includes("virement recu") ||
      combined.includes("vir recu") ||
      combined.includes("vir sepa recu") ||
      combined.includes("pole emploi") ||
      combined.includes("france travail") ||
      combined.includes("virement en votre faveur") ||
      /\b(salaire|paye|caf|employeur)\b/.test(combined) ||
      (amount > 0 && normCat.includes("salaire"))
    )
  ) {
    return { category: "Revenus & Aides", isSubscription: false, isInternalTransfer: false };
  }

  // --- SHOPPING, MODE & HIGH-TECH (cas apple store avant apple) ---
  if (combined.includes("apple store")) {
    return { category: "Shopping & Mode", isSubscription: false, isInternalTransfer: false };
  }

  // --- ALIMENTATION & COURSES (boulangerie avant boulanger) ---
  // carrefour, auchan, lidl, aldi, monoprix, franprix, intermarche, e.leclerc, leclerc, super u, biocoop, naturalia, picard, coccinelle, boulangerie, paul, marie blachere
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
    combined.includes("coccinelle") ||
    combined.includes("lidl") ||
    combined.includes("aldi") ||
    /\b(leclerc|epicerie|hyper u)\b/.test(combined)
  ) {
    return { category: "Alimentation & Courses", isSubscription: false, isInternalTransfer: false };
  }

  // --- RESTAURANTS, CAFÉS & FAST-FOOD ---
  // mcdonalds, mc donald, mcdo, burger king, kfc, subway, starbucks, columbus, uber eats, deliveroo, just eat, dominos, pizza, kebab, tacos, sushi, brasserie, bistrot, cafe, bar
  if (
    combined.includes("uber eats") ||
    combined.includes("burger king") ||
    combined.includes("mcdonald") ||
    combined.includes("mc donald") ||
    combined.includes("mcdo") ||
    combined.includes("just eat") ||
    combined.includes("deliveroo") ||
    combined.includes("starbucks") ||
    combined.includes("columbus") ||
    combined.includes("dominos") ||
    combined.includes("subway") ||
    combined.includes("kfc") ||
    combined.includes("goodnews") ||
    combined.includes("good news") ||
    combined.includes("vic co") ||
    combined.includes("vicco") ||
    combined.includes("elf food") ||
    combined.includes("supernature") ||
    combined.includes("ab copains") ||
    combined.includes("au chat qui") ||
    /\b(pizza|kebab|tacos|sushi|brasserie|bistrot|bistro|cafe|bar|crous|tasty|restaurant|resto|cantine|danu|liebe|kisoro)\b/.test(combined)
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
  // pharmacie, doctolib, laboratoire, dentiste, optique, cpam, secu, ameli, kry.fr, livi
  if (
    combined.includes("pharmacie") ||
    combined.includes("doctolib") ||
    combined.includes("laboratoire") ||
    combined.includes("dentiste") ||
    combined.includes("optique") ||
    combined.includes("livi") ||
    combined.includes("kry.fr") ||
    combined.includes("cpam") ||
    combined.includes("ameli") ||
    combined.includes("secu") ||
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
    combined.includes("bricomarche") ||
    combined.includes("bricomarc") ||
    combined.includes("castorama") ||
    combined.includes("mr bricolage") ||
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
  // sncf, ratp, ile-de-france mobilites, imagine r, navigo, transpole, ilevia, uber, bolt, total, totalenergies, bp, esso, shell, station, peage, aprr, sanef, vinci autoroutes, parking
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
    combined.includes("imagine r") ||
    combined.includes("bolt") ||
    combined.includes("esso") ||
    combined.includes("shell") ||
    combined.includes("peage") ||
    combined.includes("parking") ||
    (/\b(uber|bp|total|station|vinci)\b/.test(combined) && !combined.includes("uber eats") && !combined.includes("uber one"))
  ) {
    return { category: "Transports", isSubscription: false, isInternalTransfer: false };
  }


  // --- SORTIES & SOIRÉES ---
  if (
    combined.includes("pacha club") ||
    combined.includes("pamela club") ||
    combined.includes("fluctuart") ||
    combined.includes("shotgun") ||
    combined.includes("centre de loisir") ||
    /\b(discotheque|boite de nuit|nightclub)\b/.test(combined)
  ) {
    return { category: "Sorties & Soirées", isSubscription: false, isInternalTransfer: false };
  }

  // --- VIREMENTS PROCHES & REMBOURSEMENTS ---
  if (
    combined.includes("lydia") || 
    combined.includes("paylib") || 
    combined.includes("vir inst") ||
    combined.includes("virement de ") ||
    combined.includes("remboursement") ||
    combined.includes("avoir")
  ) {
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
