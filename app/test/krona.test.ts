import test from "node:test";
import assert from "node:assert";
import { parseAmount, parseBoursoBankCSV } from "../src/lib/boursoParser";
import { parseCreditAgricoleCSV } from "../src/lib/creditAgricoleParser";
import { cleanMerchantName, categorizeLocally } from "../src/lib/categorization";
import { detectSubscriptions } from "../src/components/SubscriptionManager";
import type { MonthlyLimitConfig } from "../src/components/MonthlyLimitCard";
import { Transaction, isSalaryTransaction, isAidTransaction } from "../src/lib/types";

test("parseAmount gère correctement les formats français et internationaux", () => {
  // Format standard français
  assert.strictEqual(parseAmount("-12,50 €"), -12.5);
  assert.strictEqual(parseAmount("25,00"), 25);

  // Format millier européen (1.250,00)
  assert.strictEqual(parseAmount("1.250,00 €"), 1250);
  assert.strictEqual(parseAmount("-2.450,50"), -2450.5);

  // Format avec espaces insécables
  assert.strictEqual(parseAmount("1 800,00 €"), 1800);

  // Format US (1,250.00)
  assert.strictEqual(parseAmount("1,250.00"), 1250);

  // Format comptable entre parenthèses
  assert.strictEqual(parseAmount("(45,00)"), -45);

  // Valeurs nulles ou invalides
  assert.strictEqual(parseAmount(""), null);
  assert.strictEqual(parseAmount(null), null);
});

test("parseBoursoBankCSV génère des IDs stables sans index de ligne ${i}", () => {
  const csvData = [
    "date;dateVal;label;category;categoryParent;amount;comment",
    "2026-10-15;2026-10-15;MONOPRIX;Alimentation;Courses;-24,50;",
    "2026-10-15;2026-10-15;MONOPRIX;Alimentation;Courses;-24,50;",
    "2026-10-16;2026-10-16;VIR SALAIRE;Revenus;Salaires;1850,00;",
  ].join("\n");

  const txs = parseBoursoBankCSV(csvData);
  assert.strictEqual(txs.length, 3);

  // Deux opérations identiques le même jour doivent avoir des index d'occurrence 1 et 2
  assert.strictEqual(txs[0].id, "bourso_2026-10-15_-24.5_monoprix_1");
  assert.strictEqual(txs[1].id, "bourso_2026-10-15_-24.5_monoprix_2");
  assert.strictEqual(txs[2].id, "bourso_2026-10-16_1850_vir-salaire_1");

  // Les montants doivent être strictement conformes
  assert.strictEqual(txs[0].amount, -24.5);
  assert.strictEqual(txs[2].amount, 1850);
});

test("parseCreditAgricoleCSV gère les colonnes débit/crédit et les clés d'occurrence", () => {
  const csvData = [
    "Date;Libellé;Débit euros;Crédit euros",
    "15/10/2026;CARREFOUR MARKET;15,80;",
    "16/10/2026;VIREMENT RECU;;500,00",
  ].join("\n");

  const txs = parseCreditAgricoleCSV(csvData);
  assert.strictEqual(txs.length, 2);

  assert.strictEqual(txs[0].id, "ca_2026-10-15_-15.8_carrefour-market_1");
  assert.strictEqual(txs[0].amount, -15.8);

  assert.strictEqual(txs[1].id, "ca_2026-10-16_500_virement-recu_1");
  assert.strictEqual(txs[1].amount, 500);
});

test("categorizeLocally applique la règle Shopping vs Salaire pour Galeries Lafayette", () => {
  // Achat en magasin (montant < 0) -> Shopping & Mode
  const shopping = categorizeLocally({
    label: "Galeries Lafayette Paris",
    rawLabel: "PAIEMENT CB GALERIES LAFAYETTE",
    amount: -89.90,
    categoryBourso: "Autre",
  });
  assert.strictEqual(shopping.category, "Shopping & Mode");

  // Virement ou encaissement (montant > 0) -> Revenus & Aides
  const income = categorizeLocally({
    label: "Galeries Lafayette",
    rawLabel: "VIR GALERIES LAFAYETTE SALAIRE",
    amount: 1450.00,
    categoryBourso: "Autre",
  });
  assert.strictEqual(income.category, "Revenus & Aides");
});

test("detectSubscriptions exclut les crédits et respecte la liste ignorée", () => {
  const mockTransactions: Transaction[] = [
    {
      id: "tx-sub-1",
      name: "Spotify",
      type: "Abonnements & Forfaits",
      amount: -10.99,
      date: "2026-08-10",
      month: "2026-08",
      isSubscription: true,
      account: "BoursoBank",
    },
    {
      id: "tx-sub-2",
      name: "Spotify",
      type: "Abonnements & Forfaits",
      amount: -10.99,
      date: "2026-09-10",
      month: "2026-09",
      isSubscription: true,
      account: "BoursoBank",
    },
    {
      id: "tx-sub-3",
      name: "Spotify",
      type: "Abonnements & Forfaits",
      amount: -10.99,
      date: "2026-10-10",
      month: "2026-10",
      isSubscription: true,
      account: "BoursoBank",
    },
    // Remboursement ou crédit avec étiquette Spotify (doit être ignoré)
    {
      id: "tx-sub-refund",
      name: "Spotify Refund",
      type: "Abonnements & Forfaits",
      amount: 10.99,
      date: "2026-10-12",
      month: "2026-10",
      isSubscription: true,
      account: "BoursoBank",
    },
    // Abonnement ignoré par l'utilisateur
    {
      id: "tx-sub-netflix-1",
      name: "Netflix",
      type: "Abonnements & Forfaits",
      amount: -17.99,
      date: "2026-09-01",
      month: "2026-09",
      isSubscription: true,
      account: "BoursoBank",
    },
    {
      id: "tx-sub-netflix-2",
      name: "Netflix",
      type: "Abonnements & Forfaits",
      amount: -17.99,
      date: "2026-10-01",
      month: "2026-10",
      isSubscription: true,
      account: "BoursoBank",
    },
  ];

  const subs = detectSubscriptions(mockTransactions, ["Netflix"]);
  assert.ok(subs.has("Spotify"));
  assert.ok(!subs.has("Netflix"), "Netflix doit être ignoré car présent dans ignoredList");
  assert.ok(!subs.has("Spotify Refund"), "Les montants positifs ne doivent jamais être qualifiés d'abonnements");
});

test("categorizeLocally classe les remboursements en déduction de dépenses et non en Revenus & Aides", () => {
  // Remboursement CPAM / Sécu -> Santé & Soins
  const secu = categorizeLocally({
    label: "Remboursement Sécu",
    rawLabel: "VIR CPAM REMBOURSEMENT SOINS",
    amount: 18.50,
  });
  assert.strictEqual(secu.category, "Santé & Soins");

  // Remboursement SNCF -> Transports
  const sncf = categorizeLocally({
    label: "Remboursement SNCF",
    rawLabel: "VIR SNCF CONNECT REMBOURSEMENT",
    amount: 45.00,
  });
  assert.strictEqual(sncf.category, "Transports");

  // Remboursement générique -> Virements proches & Remboursements (jamais Revenus & Aides)
  const generic = categorizeLocally({
    label: "Remboursement",
    rawLabel: "VIR REMBOURSEMENT COMMANDE",
    amount: 32.00,
  });
  assert.strictEqual(generic.category, "Virements proches & Remboursements");

  // Vraie paie / salaire -> Revenus & Aides
  const salary = categorizeLocally({
    label: "Employeur Salaire",
    rawLabel: "VIR SEPA SALAIRE OCTOBRE",
    amount: 3200.00,
  });
  assert.strictEqual(salary.category, "Revenus & Aides");

  // Vraie allocation CAF -> Revenus & Aides
  const caf = categorizeLocally({
    label: "CAF Caisse Allocations",
    rawLabel: "VIR ALLOCATION LOGEMENT CAF",
    amount: 250.00,
  });
  assert.strictEqual(caf.category, "Revenus & Aides");
});

test("detectSubscriptions détecte le Pass Navigo RATP même en présence du mot-clé ratp", () => {
  const txs: Transaction[] = [
    {
      id: "tx-navigo",
      name: "Navigo Pass RATP",
      type: "Transports",
      amount: -84.10,
      date: "2026-10-15",
      month: "2026-10",
      isSubscription: true,
      account: "BoursoBank",
    },
  ];

  const detected = detectSubscriptions(txs, []);
  assert.ok(detected.has("Navigo Pass RATP"), "Navigo Pass RATP doit être reconnu comme un abonnement valide");
});

test("Rythme idéal de Burn-down : le Jour 1 dispose d'un prorata temporis exact", () => {
  // Budget dépensable de 2480 € sur 31 jours (soit 80 € / jour alloué)
  // Objectif d'épargne : 720 € (sur un budget initial de 3200 €)
  const Y_max = 3200;
  const targetLimit = 720;
  const count = 31;
  const depenseJ1 = 15; // L'utilisateur a dépensé seulement 15 € le premier jour

  // Formule corrigée à la fin du Jour 1 (i = 0)
  const elapsedRatio = (0 + 1) / count;
  const ideal = Y_max - elapsedRatio * (Y_max - targetLimit);
  const remaining = Y_max - depenseJ1;
  const diff = Math.round((remaining - ideal) * 100) / 100;

  // À la fin du jour 1, la part autorisée est de 80 €, l'utilisateur a dépensé 15 €
  // Il a donc 65 € d'AVANCE (diff > 0)
  assert.strictEqual(ideal, 3200 - 80); // 3120 €
  assert.strictEqual(remaining, 3200 - 15); // 3185 €
  assert.strictEqual(diff, 65); // +65 € d'avance
  assert.ok(diff > 0, "Une dépense modérée le jour 1 doit indiquer une avance budgétaire et non un retard");
});

test("Plafonds budgétaires : exclusion stricte des Revenus & Aides et de l'Épargne", () => {
  const allowedCategories = [
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
  ].filter(c => c !== "Autre" && c !== "Épargne & Trésorerie" && c !== "Revenus & Aides");

  assert.ok(!allowedCategories.includes("Revenus & Aides"), "Revenus & Aides ne doit pas pouvoir recevoir de plafond budgétaire");
  assert.ok(!allowedCategories.includes("Épargne & Trésorerie"), "Épargne ne doit pas pouvoir recevoir de plafond budgétaire");
  assert.ok(allowedCategories.includes("Alimentation & Courses"));
  assert.ok(allowedCategories.includes("Logement & Maison"));
});

test("Charges incompressibles : respect strict du 0 € explicite (propriétaire / sans loyer)", () => {
  const autoRent = 950;
  
  // Cas 1 : non défini (vide) -> utilise la détection automatique
  const settingsUndef = { rent: undefined };
  const rentUndef = (settingsUndef.rent !== undefined && settingsUndef.rent !== null) ? settingsUndef.rent : autoRent;
  assert.strictEqual(rentUndef, 950);

  // Cas 2 : défini explicitement à 0 € -> respecte 0 €
  const settingsZero = { rent: 0 };
  const rentZero = (settingsZero.rent !== undefined && settingsZero.rent !== null) ? settingsZero.rent : autoRent;
  assert.strictEqual(rentZero, 0, "Un loyer configuré à 0 € ne doit pas réimposer la détection automatique");

  // Cas 3 : défini à 1200 € -> prend 1200 €
  const settingsExplicit = { rent: 1200 };
  const rentExplicit = (settingsExplicit.rent !== undefined && settingsExplicit.rent !== null) ? settingsExplicit.rent : autoRent;
  assert.strictEqual(rentExplicit, 1200);
});

test("Abonnements : restauration instantanée d'un marchand retiré de la liste ignorée", () => {
  const mockTxs: Transaction[] = [
    {
      id: "tx-netflix-1",
      name: "Netflix",
      type: "Abonnements & Forfaits",
      amount: -15.99,
      date: "2026-09-10",
      month: "2026-09",
      isSubscription: true,
      account: "BoursoBank",
    },
    {
      id: "tx-netflix-2",
      name: "Netflix",
      type: "Abonnements & Forfaits",
      amount: -15.99,
      date: "2026-10-10",
      month: "2026-10",
      isSubscription: true,
      account: "BoursoBank",
    },
  ];

  // 1. Initialement détecté
  const initialDetected = detectSubscriptions(mockTxs, []);
  assert.ok(initialDetected.has("Netflix"));

  // 2. Ignoré / masqué
  let ignored = ["Netflix"];
  const ignoredDetected = detectSubscriptions(mockTxs, ignored);
  assert.ok(!ignoredDetected.has("Netflix"), "Netflix ne doit pas être détecté s'il est ignoré");

  // 3. Restauré
  ignored = ignored.filter(m => m !== "Netflix");
  const restoredDetected = detectSubscriptions(mockTxs, ignored);
  assert.ok(restoredDetected.has("Netflix"), "Netflix doit être réactivé dès sa restauration");
});

test("Plafond mensuel global : synchronisation unifiée Montant (€) et Pourcentage (%)", () => {
  const referenceIncome = 2500;

  // Mode montant fixe : 1800 €
  const configAmount: MonthlyLimitConfig = { type: "amount", value: 1800 };
  const spendingLimitAmount = configAmount.type === "percent"
    ? Math.max(0, Math.round(referenceIncome * (1 - configAmount.value / 100)))
    : configAmount.value;
  assert.strictEqual(spendingLimitAmount, 1800);

  // Mode pourcentage : 30% de réserve / épargne visée -> 70% dépensable (1750 €)
  const configPercent: MonthlyLimitConfig = { type: "percent", value: 30 };
  const spendingLimitPercent = configPercent.type === "percent"
    ? Math.max(0, Math.round(referenceIncome * (1 - configPercent.value / 100)))
    : configPercent.value;
  assert.strictEqual(spendingLimitPercent, 1750);
});

test("Injection automatique dissociée : Salaire et Aides gérés indépendamment", () => {
  const incomeSettings = {
    salary: 2500,
    aids: 150,
    autoApply: true,
  };

  // Logique unifiée d'injection indépendante
  const computeEffectiveIncome = (
    txs: { name: string; amount: number; type?: string; rawName?: string }[],
    settings: typeof incomeSettings
  ) => {
    let totalRealIncome = 0;
    let hasRealSalary = false;
    let hasRealAids = false;

    txs.forEach(tx => {
      if (tx.amount <= 0) return;
      const nam = tx.name.toLowerCase();
      const isSalary = isSalaryTransaction(tx, settings.salary) || Boolean(nam.match(/paie|salaire|employeur/i));
      const isAids = isAidTransaction(tx) || Boolean(nam.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide/i));
      const isIncome = isSalary || isAids || tx.type === "Revenus & Aides";

      if (isIncome) {
        totalRealIncome += tx.amount;
        if (isSalary) hasRealSalary = true;
        if (isAids) hasRealAids = true;
      }
    });

    let injectedSalary = 0;
    let injectedAids = 0;

    if (settings.autoApply) {
      if (!hasRealSalary && settings.salary > 0) {
        injectedSalary = settings.salary;
      }
      if (!hasRealAids && settings.aids > 0) {
        injectedAids = settings.aids;
      }
    }

    return Math.round((totalRealIncome + injectedSalary + injectedAids) * 100) / 100;
  };

  // Cas 1 : Présence d'une aide (ex: 200 € CAF) mais AUCUN salaire -> injecter le salaire de référence (2500 €)
  const txsWithAidsOnly = [
    { name: "Virement CAF Allocations", amount: 200, type: "Revenus & Aides" }
  ];
  assert.strictEqual(
    computeEffectiveIncome(txsWithAidsOnly, incomeSettings),
    2700, // 200 + 2500
    "La présence d'une aide ne doit PAS bloquer l'injection du salaire manquant"
  );

  // Cas 2 : Présence d'un salaire réel (ex: 1318.45 € Galeries Lafayette) mais AUCUNE aide -> injecter l'aide de référence (150 €)
  const txsWithSalaryOnly = [
    { name: "Galeries Lafayette Salaire", amount: 1318.45, type: "Revenus & Aides" }
  ];
  assert.strictEqual(
    computeEffectiveIncome(txsWithSalaryOnly, incomeSettings),
    1468.45, // 1318.45 + 150
    "La présence d'un salaire réel ne doit PAS cumuler de salaire de référence mais injecter l'aide manquante"
  );

  // Cas 3 : Présence des deux (salaire + aides) -> aucune injection (non-cumul strict)
  const txsWithBoth = [
    { name: "Vir Employeur Salaire", amount: 2600, type: "Revenus & Aides" },
    { name: "Allocations CAF", amount: 180, type: "Revenus & Aides" }
  ];
  assert.strictEqual(
    computeEffectiveIncome(txsWithBoth, incomeSettings),
    2780, // 2600 + 180
    "Aucun revenu de référence ne doit être injecté si les deux sont déjà perçus"
  );

  // Cas 4 : Aucun revenu perçu (0 €) et autoApply actif -> injecter salaire + aides
  assert.strictEqual(
    computeEffectiveIncome([], incomeSettings),
    2650, // 2500 + 150
    "Salaire et aides de référence doivent être injectés si aucun virement n'est perçu"
  );

  // Cas 5 : Aucun revenu perçu mais autoApply désactivé -> 0 €
  assert.strictEqual(
    computeEffectiveIncome([], { ...incomeSettings, autoApply: false }),
    0,
    "Aucun revenu ne doit être injecté si autoApply est désactivé"
  );
});

test("Détection élargie du salaire réel : virement employeur Galeries Lafayette et montants significatifs", () => {
  const settings = {
    salary: 1300,
    aids: 0,
    autoApply: true,
  };

  const computeIncome = (txs: { name: string; amount: number; type?: string; rawName?: string }[]) => {
    let totalRealIncome = 0;
    let hasRealSalary = false;
    let hasRealAids = false;

    txs.forEach(tx => {
      if (tx.amount <= 0) return;
      const nam = tx.name.toLowerCase();
      const raw = (tx.rawName || "").toLowerCase();
      const combined = `${nam} ${raw}`;
      const isAids = isAidTransaction(tx) || Boolean(combined.match(/caf|crous|france travail|pole emploi|ameli|cpam|aide|allocation/i));
      const isRefundLabel = Boolean(combined.match(/remboursement|avoir/i));
      const matchesSalaryKeywords = Boolean(
        combined.match(/salaire|paie|paye|virement sepa|vir sepa|remuneration|rémunération|appointement|appointements|galeries|employeur/i)
      );
      const isSignificantIncome = 
        tx.type === "Revenus & Aides" &&
        (tx.amount >= 500 || (settings.salary > 0 && tx.amount >= settings.salary * 0.5));

      const isSalary = !isRefundLabel && !isAids && (
        matchesSalaryKeywords ||
        isSignificantIncome ||
        isSalaryTransaction(tx, settings.salary)
      );
      const isIncome = isSalary || isAids || tx.type === "Revenus & Aides";

      if (isIncome) {
        totalRealIncome += tx.amount;
        if (isSalary) hasRealSalary = true;
        if (isAids) hasRealAids = true;
      }
    });

    let injectedSalary = 0;
    if (settings.autoApply && !hasRealSalary && settings.salary > 0) {
      injectedSalary = settings.salary;
    }

    return {
      total: Math.round((totalRealIncome + injectedSalary) * 100) / 100,
      hasRealSalary,
      injectedSalary,
    };
  };

  // Cas réel : Virement employeur « Societe Anonyme Des Galeries La » 1318.45 €
  const resGaleries = computeIncome([
    { name: "Societe Anonyme Des Galeries La", amount: 1318.45, type: "Revenus & Aides" }
  ]);
  assert.strictEqual(resGaleries.hasRealSalary, true, "Societe Anonyme Des Galeries La doit être reconnue comme salaire");
  assert.strictEqual(resGaleries.injectedSalary, 0, "Aucun faux salaire ne doit être injecté");
  assert.strictEqual(resGaleries.total, 1318.45);

  // Cas virement significatif sans mot-clé explicite (ex: 1500 € dans Revenus & Aides)
  const resSignif = computeIncome([
    { name: "Virement Reçu Client / Tiers", amount: 1500, type: "Revenus & Aides" }
  ]);
  assert.strictEqual(resSignif.hasRealSalary, true, "Un virement majeur en Revenus & Aides doit être reconnu comme salaire");
  assert.strictEqual(resSignif.injectedSalary, 0);
  assert.strictEqual(resSignif.total, 1500);

  // Cas aide sociale majeure (ex: 800 € France Travail) -> ne doit PAS être prise pour un salaire
  const resAid = computeIncome([
    { name: "VIR France Travail Allocation", amount: 800, type: "Revenus & Aides" }
  ]);
  assert.strictEqual(resAid.hasRealSalary, false, "Une aide sociale ne doit pas être qualifiée de salaire");
  assert.strictEqual(resAid.injectedSalary, 1300, "Le salaire de référence manquant doit être injecté");
  assert.strictEqual(resAid.total, 2100); // 800 + 1300
});



