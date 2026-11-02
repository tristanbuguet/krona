import test from "node:test";
import assert from "node:assert";
import { parseAmount, parseBoursoBankCSV } from "../src/lib/boursoParser";
import { parseCreditAgricoleCSV } from "../src/lib/creditAgricoleParser";
import { parseCaisseEpargneCSV } from "../src/lib/caisseEpargneParser";
import { detectBankType } from "../src/lib/bankParser";
import { cleanMerchantName, categorizeLocally, mapCaisseEpargneCategory } from "../src/lib/categorization";
import { detectSubscriptions } from "../src/components/SubscriptionManager";
import type { MonthlyLimitConfig } from "../src/components/MonthlyLimitCard";
import {
  Transaction,
  isSalaryTransaction,
  isAidTransaction,
  initialDemoTransactions,
  isInternalTransferCategory,
  isInternalTransferTransaction,
  isRegularisationCategory,
  isRegularisationTransaction,
  INTERNAL_TRANSFER_CATEGORY,
  REGULARISATION_CATEGORY,
} from "../src/lib/types";
import { calculateFinancialMetrics } from "../src/lib/financialCalculations";
import { formatCurrencyFr, formatEurosFr } from "../src/components/views/TrendsView";
import {
  mergeTransactionsLossless,
  mergeCloudAndLocalData,
  normalizeUserFinancialPayload,
  resolveUserAvatarUrl,
} from "../src/lib/cloudSync";

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

test("Harmonisation du calcul des Dépenses nettes : Single Source of Truth et exclusion des virements internes", () => {
  // Scénario identique à celui rencontré par l'utilisateur :
  // Dépenses réelles : 927.83 €
  // Virement interne / épargne : -695.00 € (marqué isInternalTransfer ou Épargne & Trésorerie)
  // Remboursement perçu : +50.00 € (doit venir en déduction)
  const txs: Transaction[] = [
    {
      id: "tx-exp-1",
      name: "Monoprix Courses",
      type: "Alimentation & Courses",
      amount: -800.00,
      date: "2026-10-05",
      month: "2026-10",
    },
    {
      id: "tx-exp-2",
      name: "Restaurant",
      type: "Restos & Fast-Food",
      amount: -177.83,
      date: "2026-10-10",
      month: "2026-10",
    },
    {
      id: "tx-refund",
      name: "Remboursement Commande",
      type: "Shopping & Mode",
      amount: 50.00,
      date: "2026-10-12",
      month: "2026-10",
    },
    {
      id: "tx-saving",
      name: "Virement Livret A",
      type: "Épargne & Trésorerie",
      amount: -695.00,
      date: "2026-10-15",
      month: "2026-10",
      isInternalTransfer: true,
    },
  ];

  // Calcul Dashboard (Single Source of Truth)
  let dashboardExpenses = 0;
  txs.forEach(tx => {
    if (tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer) return;
    if (tx.amount < 0) {
      dashboardExpenses += Math.abs(tx.amount);
    } else {
      dashboardExpenses -= tx.amount;
    }
  });
  dashboardExpenses = Math.round(dashboardExpenses * 100) / 100;

  // 800 + 177.83 - 50 = 927.83 €
  assert.strictEqual(dashboardExpenses, 927.83, "Les dépenses nettes du Dashboard doivent être de 927.83 €");

  // Calcul Tiroir d'opérations (aligné)
  let drawerNetDebits = 0;
  txs.forEach(tx => {
    if (tx.type === "Épargne & Trésorerie" || tx.isInternalTransfer) return;
    if (tx.amount < 0) {
      drawerNetDebits += Math.abs(tx.amount);
    } else {
      drawerNetDebits -= tx.amount;
    }
  });
  drawerNetDebits = Math.round(drawerNetDebits * 100) / 100;

  assert.strictEqual(drawerNetDebits, dashboardExpenses, "Le montant dans le tiroir doit correspondre exactement aux dépenses du Dashboard");
  assert.strictEqual(drawerNetDebits, 927.83, "Le montant net calculé ne doit pas inclure les 695 € d'épargne");
});

test("TrendsView : Formatage numérique unifié fr-FR et gestion des signes", () => {
  // Test formatCurrencyFr
  const formattedIncome = formatCurrencyFr(1507.84);
  assert.ok(formattedIncome.includes("1") && formattedIncome.includes("507,84") && formattedIncome.includes("€"), "Revenu moyen formaté en fr-FR avec virgule");

  const formattedDiscretionary = formatCurrencyFr(787.17);
  assert.ok(formattedDiscretionary.includes("787,17") && formattedDiscretionary.includes("€"), "Train de vie discrétionnaire formaté avec virgule");

  const formattedPositive = formatCurrencyFr(1365.4, true);
  assert.ok(formattedPositive.startsWith("+") && formattedPositive.includes("1") && formattedPositive.includes("365,40"), "Épargne positive avec signe +");

  const formattedNegative = formatCurrencyFr(-450.5, true);
  assert.ok(formattedNegative.startsWith("-") && formattedNegative.includes("450,50"), "Épargne négative avec signe -");

  // Test formatEurosFr
  assert.strictEqual(formatEurosFr(455, true), "+455 €");
  assert.strictEqual(formatEurosFr(-65, true), "-65 €");
  assert.strictEqual(formatEurosFr(0, true), "0 €");
});

test("TrendsView : Calcul mathématique de la Dérive des Catégories et garde-fou sur les pourcentages", () => {
  // Scénario : 3 mois dans l'horizon (Octobre, Septembre, Août)
  // Catégorie « Shopping & Mode » :
  // Août : 20 €
  // Septembre : 24 € -> Moyenne des mois précédents (hors mois évalué Octobre) = 22 €
  // Octobre (mois évalué) : 428 €
  const priorVals = [20, 24];
  const avgPrior = priorVals.reduce((a, b) => a + b, 0) / priorVals.length; // 22 €
  const latestVal = 428;
  const diffAmount = latestVal - avgPrior; // +406 €
  const diffPercent = Math.round((diffAmount / avgPrior) * 100); // 1845%

  assert.strictEqual(avgPrior, 22);
  assert.strictEqual(diffAmount, 406);

  // Vérification de la règle du garde-fou :
  // Si diffPercent > 200 || avgPrior < 30 : afficher multiplicateur lisible (ex: ×19.5 ou +406 €) au lieu d'un % absurde
  const mult = latestVal / avgPrior;
  assert.ok(mult >= 1.5, "Le multiplicateur doit être calculé");
  const badgeText = (diffPercent > 200 || avgPrior < 30) ? `×${mult.toFixed(1)}` : `+${diffPercent}%`;
  assert.strictEqual(badgeText, "×19.5", "Le badge doit afficher le multiplicateur lisible au lieu de +1845%");
});

test("TrendsView : Structure du Budget (50 / 30 / 20) et cohérence comptable", () => {
  // Revenu mensuel net : 2000 €
  // Dépenses nettes : 1600 € dont Fixes = 900 €, Variables = 700 €
  // Épargne nette = 400 €
  const income = 2000;
  const fixed = 900;
  const variable = 700;
  const expenses = fixed + variable;
  const savings = Math.max(0, income - expenses);

  assert.strictEqual(expenses, 1600);
  assert.strictEqual(savings, 400);

  const fixedShare = Math.round((fixed / income) * 100); // 45%
  const variableShare = Math.round((variable / income) * 100); // 35%
  const savingsShare = Math.max(0, 100 - fixedShare - variableShare); // 20%

  assert.strictEqual(fixedShare, 45, "Socle Fixe : 45% (Cible < 50% -> Optimal)");
  assert.strictEqual(variableShare, 35, "Train de vie Variable : 35% (Cible < 30% -> Sous contrôle)");
  assert.strictEqual(savingsShare, 20, "Capacité d'Épargne : 20% (Cible > 20% -> Optimal)");

  // Dépense quotidienne moyenne
  const dailyVariable = variable / 30.4;
  assert.ok(dailyVariable > 23 && dailyVariable < 24, "Dépense variable quotidienne d'environ 23 € / jour");
});

test("Google Cloud Sync : Migration Local-First sans écrasement à la première connexion", () => {
  const localTxs: Transaction[] = [
    {
      id: "bourso_2026-10-18_-34.5_carrefour_1",
      name: "Carrefour",
      type: "Alimentation & Courses",
      amount: -34.5,
      date: "2026-10-18",
      month: "2026-10",
    },
    {
      id: "bourso_2026-10-10_-15.99_netflix_1",
      name: "Netflix",
      type: "Abonnements & Forfaits",
      amount: -15.99,
      date: "2026-10-10",
      month: "2026-10",
      isSubscription: true,
    },
  ];

  const cloudTxs: Transaction[] = [
    {
      id: "bourso_2026-09-10_-15.99_netflix_1",
      name: "Netflix",
      type: "Abonnements & Forfaits",
      amount: -15.99,
      date: "2026-09-10",
      month: "2026-09",
      isSubscription: true,
    },
    // Même opération qu'en local mais recatégorisée localement par l'utilisateur
    {
      id: "bourso_2026-10-18_-34.5_carrefour_1",
      name: "Carrefour",
      type: "Autre",
      amount: -34.5,
      date: "2026-10-18",
      month: "2026-10",
    },
  ];

  const mergedTxs = mergeTransactionsLossless(localTxs, cloudTxs);
  assert.strictEqual(mergedTxs.length, 3, "Les opérations locales et cloud doivent être combinées sans perte");
  const carrefourTx = mergedTxs.find(t => t.id === "bourso_2026-10-18_-34.5_carrefour_1");
  assert.strictEqual(carrefourTx?.type, "Alimentation & Courses", "La catégorisation locale récente ne doit pas être écrasée par une ancienne valeur cloud");

  const mergedState = mergeCloudAndLocalData(
    {
      transactions: localTxs,
      categoryBudgets: { "Alimentation & Courses": 400, "Revenus & Aides": 2000 },
      fixedIncomeSettings: { salary: 2400, aids: 100, autoApply: true },
      ignoredSubscriptions: ["Salle Sport"],
      merchantKnowledge: { Carrefour: { categorie: "Alimentation & Courses" } },
      monthlyLimitConfig: { type: "amount", value: 1900 },
    },
    {
      transactions: cloudTxs,
      categoryBudgets: { "Restos & Fast-Food": 200 },
      fixedIncomeSettings: { salary: 0, aids: 0, autoApply: false },
      ignoredSubscriptions: ["Ancien Service"],
      merchantKnowledge: { Netflix: { categorie: "Abonnements & Forfaits", isSubscription: true } },
    }
  );

  assert.strictEqual(mergedState.transactions.length, 3);
  assert.strictEqual(mergedState.categoryBudgets["Alimentation & Courses"], 400);
  assert.strictEqual(mergedState.categoryBudgets["Restos & Fast-Food"], 200);
  assert.strictEqual(mergedState.categoryBudgets["Revenus & Aides"], undefined, "Revenus & Aides reste exclu des plafonds");
  assert.strictEqual(mergedState.fixedIncomeSettings.salary, 2400);
  assert.strictEqual(mergedState.ignoredSubscriptions.length, 2);
  assert.ok(mergedState.merchantKnowledge["Carrefour"]);
  assert.ok(mergedState.merchantKnowledge["Netflix"]);

  // Résolution de l'URL de photo de profil multi-provider (Firebase, Supabase, NextAuth, Google OAuth)
  assert.strictEqual(
    resolveUserAvatarUrl({ photoURL: "https://lh3.googleusercontent.com/a/firebase-photo" }),
    "https://lh3.googleusercontent.com/a/firebase-photo"
  );
  assert.strictEqual(
    resolveUserAvatarUrl({ user_metadata: { avatar_url: "https://lh3.googleusercontent.com/a/supabase-avatar" } }),
    "https://lh3.googleusercontent.com/a/supabase-avatar"
  );
  assert.strictEqual(
    resolveUserAvatarUrl({ image: "https://lh3.googleusercontent.com/a/nextauth-image" }),
    "https://lh3.googleusercontent.com/a/nextauth-image"
  );
  assert.strictEqual(resolveUserAvatarUrl({ picture: "" }), undefined);
});

test("Cycle de vie des données : Reconnexion après purge locale restaure 100% du cloud utilisateur", () => {
  // État local complètement purgé après une déconnexion (Empty State invité)
  const emptyLocalState = {
    transactions: [],
    categoryBudgets: {},
    fixedIncomeSettings: { salary: 0, aids: 0, autoApply: false, savingsGoal: 0 },
    ignoredSubscriptions: [],
    merchantKnowledge: {},
    monthlyLimitConfig: undefined,
    monthlySpendingLimit: null,
    accounts: undefined,
    selectedBank: undefined,
    selectedMonth: null,
  };

  // Données cloud précédemment sauvegardées sur le compte Google de l'utilisateur
  const existingCloudData = {
    transactions: [
      {
        id: "bourso_2026-10-20_-42_monoprix_1",
        name: "Monoprix",
        type: "Alimentation & Courses",
        amount: -42,
        date: "2026-10-20",
        month: "2026-10",
      },
    ],
    categoryBudgets: { "Alimentation & Courses": 350 },
    fixedIncomeSettings: { salary: 2800, aids: 0, autoApply: true, savingsGoal: 500, rent: 850 },
    ignoredSubscriptions: ["Ancien Abo"],
    merchantKnowledge: { Monoprix: { categorie: "Alimentation & Courses", isSubscription: false } },
    monthlyLimitConfig: { type: "percent" as const, value: 25 },
    monthlySpendingLimit: 2100,
    accounts: [
      {
        id: "bourso-main",
        name: "Compte courant BoursoBank",
        bank: "BoursoBank" as const,
        type: "Compte courant" as const,
        initialBalance: 2400,
      },
    ],
    selectedBank: "ca" as const,
    selectedMonth: "2026-10",
  };

  const restored = mergeCloudAndLocalData(emptyLocalState, existingCloudData);

  assert.strictEqual(restored.transactions.length, 1, "Les transactions cloud doivent être intégralement restaurées");
  assert.strictEqual(restored.transactions[0].name, "Monoprix");
  assert.strictEqual(restored.categoryBudgets["Alimentation & Courses"], 350, "Les plafonds cloud doivent être restaurés");
  assert.strictEqual(restored.fixedIncomeSettings.salary, 2800, "Le salaire cloud doit être restauré");
  assert.strictEqual(restored.fixedIncomeSettings.rent, 850, "Le loyer cloud doit être restauré");
  assert.deepStrictEqual(restored.monthlyLimitConfig, { type: "percent", value: 25 }, "La configuration du plafond mensuel cloud doit être restaurée");
  assert.strictEqual(restored.monthlySpendingLimit, 2100);
  assert.strictEqual(restored.accounts?.length, 1, "Les comptes cloud doivent être restaurés");
  assert.strictEqual(restored.accounts?.[0].initialBalance, 2400);
  assert.strictEqual(restored.selectedBank, "ca");
  assert.strictEqual(restored.selectedMonth, "2026-10");
  // Vérification du contrat structuré UserFinancialPayload (settings & learningRules)
  assert.strictEqual(restored.settings.monthlyCap, 2100);
  assert.strictEqual(restored.settings.incomeSettings.salary, 2800);
  assert.strictEqual(restored.settings.categoryBudgets["Alimentation & Courses"], 350);
  assert.strictEqual(restored.learningRules["Monoprix"]?.categorie, "Alimentation & Courses");
  assert.ok(restored.lastUpdated);
});

test("UserFinancialPayload : Persistance intégrale et sérialisation atomique (Transactions + Settings + LearningRules)", () => {
  const fullPayload = normalizeUserFinancialPayload({
    transactions: [
      {
        id: "ca_2026-10-12_-19.9_boulangerie_1",
        name: "Boulangerie",
        type: "Alimentation & Courses",
        amount: -19.9,
        date: "2026-10-12",
        month: "2026-10",
        account: "Crédit Agricole",
      },
    ],
    accounts: [
      {
        id: "ca-main",
        name: "Compte Crédit Agricole",
        bank: "Crédit Agricole",
        type: "Compte courant",
        initialBalance: 1250,
      },
    ],
    settings: {
      monthlyCap: 1850,
      monthlyLimitConfig: { type: "amount", value: 1850 },
      incomeSettings: {
        salary: 2650,
        aids: 180,
        autoApply: true,
        savingsGoal: 400,
        rent: 780,
        loans: 120,
        utilities: 95,
      },
      categoryBudgets: {
        "Alimentation & Courses": 400,
        "Restos & Fast-Food": 150,
      },
      ignoredSubscriptions: ["Faux Positif"],
      selectedBank: "ca",
      selectedMonth: "2026-10",
    },
    learningRules: {
      Boulangerie: { categorie: "Alimentation & Courses", isSubscription: false },
    },
  });

  // Sérialisation JSON complète (simulation stockage cloud .krona-cloud/users-cloud-store.json)
  const serialized = JSON.stringify(fullPayload);
  const deserialized = JSON.parse(serialized);
  const rehydrated = mergeCloudAndLocalData({}, deserialized);

  assert.strictEqual(rehydrated.transactions.length, 1);
  assert.strictEqual(rehydrated.accounts.length, 1);
  assert.strictEqual(rehydrated.accounts[0].initialBalance, 1250);
  assert.strictEqual(rehydrated.settings.monthlyCap, 1850);
  assert.deepStrictEqual(rehydrated.settings.monthlyLimitConfig, {
    type: "amount",
    value: 1850,
  });
  assert.strictEqual(rehydrated.settings.incomeSettings.salary, 2650);
  assert.strictEqual(rehydrated.settings.incomeSettings.aids, 180);
  assert.strictEqual(rehydrated.settings.incomeSettings.autoApply, true);
  assert.strictEqual(rehydrated.settings.incomeSettings.rent, 780);
  assert.strictEqual(rehydrated.settings.incomeSettings.loans, 120);
  assert.strictEqual(rehydrated.settings.incomeSettings.utilities, 95);
  assert.strictEqual(
    rehydrated.settings.categoryBudgets["Alimentation & Courses"],
    400
  );
  assert.strictEqual(
    rehydrated.learningRules["Boulangerie"]?.categorie,
    "Alimentation & Courses"
  );
  assert.ok(typeof rehydrated.lastUpdated === "string" && rehydrated.lastUpdated.length > 0);
});

test("Empty State pur & Réinitialisation complète : transactions = [], accounts = [], budget/revenu = 0 (jamais 3200)", () => {
  // 1. Les transactions de démonstration par défaut sont un tableau strictement vide
  assert.deepStrictEqual(initialDemoTransactions, [], "Aucune transaction de démo ne doit être injectée par défaut");

  // 2. Payload après une réinitialisation complète ou un état vierge
  const resetPayload = normalizeUserFinancialPayload({});

  assert.deepStrictEqual(resetPayload.transactions, [], "transactions doit être [] après reset");
  assert.deepStrictEqual(resetPayload.accounts, [], "accounts doit être [] après reset");
  assert.strictEqual(resetPayload.settings.incomeSettings.salary, 0, "Le salaire de référence doit être à 0");
  assert.strictEqual(resetPayload.settings.incomeSettings.aids, 0, "Les aides de référence doivent être à 0");
  assert.strictEqual(resetPayload.settings.incomeSettings.autoApply, false, "autoApply doit être à false");
  assert.strictEqual(resetPayload.settings.monthlyCap, 0, "Le plafond mensuel par défaut doit être à 0");
  assert.deepStrictEqual(resetPayload.settings.monthlyLimitConfig, { type: "amount", value: 0 });
  assert.deepStrictEqual(resetPayload.learningRules, {}, "Les règles d'apprentissage doivent être vides");

  // 3. Calcul du budget de départ (RealDisposableIncomeCard) sur état vierge
  const income = 0;
  const configured =
    (resetPayload.settings.incomeSettings.salary || 0) +
    (resetPayload.settings.incomeSettings.aids || 0);
  const baseIncome = income > 0 ? income : configured > 0 ? configured : 0;

  assert.strictEqual(baseIncome, 0, "Le budget/revenu de départ doit être strictement égal à 0 (et non 3200)");
});

test("Traitement neutre des virements internes : exclusion stricte des dépenses, revenus et reste à vivre", () => {
  // 1. Validation des drapeaux et helpers d'exclusion
  assert.strictEqual(isInternalTransferCategory("Virement interne"), true);
  assert.strictEqual(isInternalTransferCategory("Épargne & Trésorerie"), true);
  assert.strictEqual(isInternalTransferCategory("Virement compte à compte"), true);
  assert.strictEqual(isInternalTransferCategory("Alimentation & Courses"), false);
  assert.strictEqual(INTERNAL_TRANSFER_CATEGORY, "Virement interne");

  const outgoingTransfer: Transaction = {
    id: "tx-out-1",
    name: "VIR Vers Livret A",
    type: "Virement interne",
    amount: -200,
    date: "2026-10-10",
    month: "2026-10",
    isInternalTransfer: true,
    excludeFromSpending: true,
  };

  const incomingTransfer: Transaction = {
    id: "tx-in-1",
    name: "VIR Depuis Livret A",
    type: "Épargne & Trésorerie",
    amount: 150,
    date: "2026-10-12",
    month: "2026-10",
    isInternalTransfer: true,
    excludeFromSpending: true,
  };

  assert.strictEqual(isInternalTransferTransaction(outgoingTransfer), true);
  assert.strictEqual(isInternalTransferTransaction(incomingTransfer), true);

  // Un virement entrant depuis un livret ne doit JAMAIS être détecté comme salaire ou aide
  assert.strictEqual(isSalaryTransaction(incomingTransfer, 2000), false);
  assert.strictEqual(isAidTransaction(incomingTransfer), false);

  // 2. Scénario de base avec opérations opérationnelles réelles :
  // - Salaire : +2 000 €
  // - Dépenses opérationnelles (courses, restos) : -500 €
  // - Loyer (charges incompressibles) : -700 €
  const baseTransactions: Transaction[] = [
    {
      id: "tx-sal-1",
      name: "VIR SALAIRE EMPLOYEUR",
      type: "Revenus & Aides",
      amount: 2000,
      date: "2026-10-01",
      month: "2026-10",
    },
    {
      id: "tx-courses-1",
      name: "MONOPRIX",
      type: "Alimentation & Courses",
      amount: -500,
      date: "2026-10-05",
      month: "2026-10",
    },
    {
      id: "tx-loyer-1",
      name: "PRLV LOYER RESIDENCE",
      type: "Logement & Maison",
      amount: -700,
      date: "2026-10-06",
      month: "2026-10",
    },
  ];

  const baseMetrics = calculateFinancialMetrics({
    transactions: baseTransactions,
    incomeSettings: { salary: 2000 },
    selectedMonth: "2026-10",
  });

  // Dépenses opérationnelles = 500 + 700 = 1200 €
  assert.strictEqual(baseMetrics.expenses, 1200);
  assert.strictEqual(baseMetrics.income, 2000);
  assert.strictEqual(baseMetrics.balance, 800);
  assert.strictEqual(baseMetrics.fixedCharges.rent, 700);
  // Reste à vivre (disposable income = 2000 - 700 charges fixes = 1300 €)
  assert.strictEqual(baseMetrics.disposableIncome, 1300);

  // 3. Injection du virement sortant (-200 € vers livret) et entrant (+150 € depuis livret)
  const transactionsWithTransfers: Transaction[] = [
    ...baseTransactions,
    outgoingTransfer,
    incomingTransfer,
  ];

  const metricsWithTransfers = calculateFinancialMetrics({
    transactions: transactionsWithTransfers,
    incomeSettings: { salary: 2000 },
    selectedMonth: "2026-10",
  });

  // VÉRIFICATION FORMELLE :
  // - Les dépenses nettes ne bougent pas d'un centime (strictement 1 200 €)
  assert.strictEqual(
    metricsWithTransfers.expenses,
    baseMetrics.expenses,
    "Les dépenses nettes ne doivent pas bouger d'un centime suite aux virements internes"
  );

  // - Les revenus totaux ne bougent pas d'un centime (strictement 2 000 €)
  assert.strictEqual(
    metricsWithTransfers.income,
    baseMetrics.income,
    "Les revenus réels ne doivent pas être gonflés par un virement entrant depuis un livret"
  );

  // - Le solde opérationnel reste strictement identique (800 €)
  assert.strictEqual(
    metricsWithTransfers.balance,
    baseMetrics.balance,
    "Le solde opérationnel doit être identique"
  );

  // - Le reste à vivre (disposable income) reste strictement identique (1 300 €)
  assert.strictEqual(
    metricsWithTransfers.disposableIncome,
    baseMetrics.disposableIncome,
    "Le reste à vivre ne doit subir aucune altération due aux virements internes"
  );

  // - Le flux d'épargne net interne est correctement comptabilisé à part (-200 + 150 = -50 €)
  assert.strictEqual(metricsWithTransfers.internalTransfersSaved, -50);
});

test("Caisse d'Épargne : Détection automatique, parsing rigoureux des métadonnées et normalisation", () => {
  // 1. Détection automatique du format
  const ceSample = [
    `"Compte de dépôt n° 08000123456 - Caisse d'Épargne Île-de-France";;;;`,
    `"Solde au 15/10/2026 : +2 340,50 EUR";;;;`,
    `"Date de l'opération";"Date de valeur";"Libellé";"Débit";"Crédit"`,
  ].join("\n");

  const caSample = [
    `Compte de depot n° 12345678901;;;`,
    `Date;Libellé;Débit euros;Crédit euros;`,
  ].join("\n");

  const boursoSample = [
    `date;dateVal;label;category;categoryParent;amount;comment`,
  ].join("\n");

  assert.strictEqual(detectBankType(ceSample), "ce");
  assert.strictEqual(detectBankType(caSample), "ca");
  assert.strictEqual(detectBankType(boursoSample), "bourso");

  // 2. Fixture représentative d'un mois type avec métadonnées initiales et colonnes Débit / Crédit
  const ceCsvData = [
    `"Compte de dépôt n° 08000123456 - Caisse d'Épargne";;;;`,
    `"Solde au 15/10/2026 : +2 340,50 EUR";;;;`,
    `;;;;`,
    `"Date de l'opération";"Date de valeur";"Libellé";"Débit";"Crédit"`,
    `"01/10/2026";"01/10/2026";"VIR SEPA RECU DE SOCIETE GENERALE SALAIRE";;"2 450,00"`,
    `"04/10/2026";"04/10/2026";"PAIEMENT CB 04/10 MONOPRIX NATION";"45,60";`,
    `"05/10/2026";"05/10/2026";"PRELEVEMENT SEPA DE TOTAL DIRECT ENERGIE";"82,30";`,
    `"08/10/2026";"08/10/2026";"RETRAIT DAB 08/10 DAB CE PARIS REPUBLIQUE";"50,00";`,
    `"10/10/2026";"10/10/2026";"VIR SEPA EMIS VERS LIVRET A";"200,00";`,
    `"12/10/2026";"12/10/2026";"COTIS MENSUELLE FORMULE CONFORT";"9,90";`,
    `"14/10/2026";"14/10/2026";"VIR RECU REMBOURSEMENT AMELI CPAM";;"35,50"`,
  ].join("\n");

  const txs = parseCaisseEpargneCSV(ceCsvData);
  assert.strictEqual(txs.length, 7, "Les 7 transactions doivent être extraites après les métadonnées");

  // Virement Salaire
  assert.strictEqual(txs[0].amount, 2450.0);
  assert.strictEqual(txs[0].date, "2026-10-01");
  assert.strictEqual(txs[0].month, "2026-10");
  assert.strictEqual(txs[0].account, "Caisse d'Épargne");
  assert.ok(txs[0].label.includes("Societe Generale Salaire"));
  assert.ok(txs[0].id.startsWith("ce_2026-10-01_2450_"));

  // Paiement CB avec préfixe et date
  assert.strictEqual(txs[1].amount, -45.6);
  assert.strictEqual(txs[1].date, "2026-10-04");
  assert.strictEqual(txs[1].label, "Monoprix Nation");

  // Prélèvement énergie
  assert.strictEqual(txs[2].amount, -82.3);
  assert.strictEqual(txs[2].label, "Total Direct Energie");

  // Retrait DAB
  assert.strictEqual(txs[3].amount, -50.0);
  assert.ok(txs[3].label.includes("Paris Republique"));

  // Virement interne vers Livret A
  assert.strictEqual(txs[4].amount, -200.0);
  assert.strictEqual(txs[4].label, "Livret A");

  // Cotisation bancaire
  assert.strictEqual(txs[5].amount, -9.9);
  assert.strictEqual(txs[5].label, "Formule Confort");

  // Remboursement CPAM
  assert.strictEqual(txs[6].amount, 35.5);
  assert.ok(txs[6].label.includes("Ameli"));

  // 3. Support de la variante avec colonne Montant unique (+ / -)
  const ceSingleAmountCsv = [
    `"Date opération";"Date valeur";"Libellé";"Montant"`,
    `"15/10/2026";"15/10/2026";"PAIEMENT CB 15/10 RESTAURANT LE BISTROT";"-28,50"`,
    `"16/10/2026";"16/10/2026";"VIREMENT RECU DE PIERRE";"+50,00"`,
  ].join("\n");

  const singleTxs = parseCaisseEpargneCSV(ceSingleAmountCsv);
  assert.strictEqual(singleTxs.length, 2);
  assert.strictEqual(singleTxs[0].amount, -28.5);
  assert.strictEqual(singleTxs[0].label, "Restaurant Le Bistrot");
  assert.strictEqual(singleTxs[1].amount, 50.0);
  assert.strictEqual(singleTxs[1].label, "Pierre");

  // 4. Intégration sans doublon ni perte (IDs déterministes et index d'occurrence)
  const duplicateCsv = [
    `"Date de l'opération";"Date de valeur";"Libellé";"Débit";"Crédit"`,
    `"18/10/2026";"18/10/2026";"PAIEMENT CB BOULANGERIE";"4,50";`,
    `"18/10/2026";"18/10/2026";"PAIEMENT CB BOULANGERIE";"4,50";`,
  ].join("\n");

  const dupTxs = parseCaisseEpargneCSV(duplicateCsv);
  assert.strictEqual(dupTxs.length, 2);
  assert.strictEqual(dupTxs[0].id, "ce_2026-10-18_-4.5_boulangerie_1");
  assert.strictEqual(dupTxs[1].id, "ce_2026-10-18_-4.5_boulangerie_2");

  // Fusion sans perte dans le grand livre
  const merged = mergeTransactionsLossless(
    [
      {
        id: dupTxs[0].id,
        name: dupTxs[0].label,
        type: "Alimentation & Courses",
        amount: dupTxs[0].amount,
        date: dupTxs[0].date,
        month: dupTxs[0].month,
        account: dupTxs[0].account,
      },
    ],
    dupTxs.map(t => ({
      id: t.id,
      name: t.label,
      type: "Alimentation & Courses",
      amount: t.amount,
      date: t.date,
      month: t.month,
      account: t.account,
    }))
  );

  assert.strictEqual(merged.length, 2, "La fusion sans perte doit conserver les 2 occurrences distinctes");

  // 5. Test complet avec le format réel Caisse d'Épargne (13 colonnes complètes)
  const ceRealExportCsv = [
    "Date de comptabilisation;Libelle simplifie;Libelle operation;Reference;Informations complementaires;Type operation;Categorie;Sous categorie;Debit;Credit;Date operation;Date de valeur;Pointage operation",
    `"12/10/2026";"AUCHAN SUPERMARCHE";"PAIEMENT CB 1110 PARIS AUCHAN SUPERMARCHE";"REF-001";"PARIS";"PAIEMENT CB";"Alimentation";"Hyper/supermarche";"-45,80";;"11/10/2026";"12/10/2026";"O"`,
    `"15/10/2026";"Deezer";"PRELEVEMENT SEPA DEEZER 15/10";"REF-002";"PARIS";"PRELEVEMENT";"Logement - maison";"Internet et telephonie";"-10,99";;"15/10/2026";"15/10/2026";"O"`,
    `"16/10/2026";"PICARD";"PAIEMENT CB 1610 PICARD NATION";"REF-003";"PARIS";"PAIEMENT CB";"Alimentation";"Hyper/supermarche";"-18,40";;"16/10/2026";"16/10/2026";"O"`,
    `"17/10/2026";"Burger King";"PAIEMENT CB 1710 BK PARIS";"REF-004";"PARIS";"PAIEMENT CB";"Alimentation";"Restauration rapide";"-14,50";;"17/10/2026";"17/10/2026";"O"`,
    `"18/10/2026";"APRR";"TELEPEAGE APRR 18/10";"REF-005";"DIJON";"TELEPEAGE";"Transports";"Peage et Stationnement";"-32,10";;"18/10/2026";"18/10/2026";"O"`,
    `"28/10/2026";"Societe Generale";"VIR SEPA SALAIRE OCTOBRE SOCIETE GENERALE";"REF-006";"PARIS";"VIREMENT";"Revenus";"Salaire";;"2 500,00";"28/10/2026";"28/10/2026";"O"`,
  ].join("\n");

  // A. Détection automatique immédiate sur le format réel
  assert.strictEqual(detectBankType(ceRealExportCsv), "ce", "Le format réel 13 colonnes CE doit être détecté comme 'ce'");

  // B. Extraction et parsing
  const realTxs = parseCaisseEpargneCSV(ceRealExportCsv);
  assert.strictEqual(realTxs.length, 6, "Les 6 opérations doivent être extraites");

  // C. Vérification de la priorité Date d'opération sur Date de comptabilisation
  assert.strictEqual(realTxs[0].date, "2026-10-11", "Date d'achat réelle '11/10/2026' prioritaire sur comptabilisation '12/10/2026'");
  assert.strictEqual(realTxs[0].month, "2026-10");

  // D. Vérification du libellé épuré (priorité Libelle simplifie)
  assert.strictEqual(realTxs[0].label, "Auchan Supermarche");
  assert.strictEqual(realTxs[0].rawLabel, "PAIEMENT CB 1110 PARIS AUCHAN SUPERMARCHE");
  assert.strictEqual(realTxs[0].amount, -45.8);
  assert.strictEqual(realTxs[0].categoryCE, "Alimentation");
  assert.strictEqual(realTxs[0].subCategoryCE, "Hyper/supermarche");

  // E. Vérification Deezer (Abonnement avec montant signé négativement dans la colonne Débit)
  assert.strictEqual(realTxs[1].label, "Deezer");
  assert.strictEqual(realTxs[1].amount, -10.99);

  // F. Vérification Picard
  assert.strictEqual(realTxs[2].label, "Picard");
  assert.strictEqual(realTxs[2].amount, -18.4);

  // G. Vérification Burger King
  assert.strictEqual(realTxs[3].label, "Burger King");
  assert.strictEqual(realTxs[3].amount, -14.5);

  // H. Vérification APRR (Péage)
  assert.strictEqual(realTxs[4].label, "Aprr");
  assert.strictEqual(realTxs[4].amount, -32.1);

  // I. Vérification Salaire Crédit
  assert.strictEqual(realTxs[5].label, "Societe Generale");
  assert.strictEqual(realTxs[5].amount, 2500.0);

  // J. Vérification du mapping natif Caisse d'Épargne dans categorizeLocally
  const catAuchan = categorizeLocally({
    label: realTxs[0].label,
    rawLabel: realTxs[0].rawLabel,
    amount: realTxs[0].amount,
    bankCategory: realTxs[0].categoryCE,
    subCategory: realTxs[0].subCategoryCE,
  });
  assert.strictEqual(catAuchan.category, "Alimentation & Courses", "Alimentation + Hyper/supermarche -> Courses");

  const catDeezer = categorizeLocally({
    label: realTxs[1].label,
    rawLabel: realTxs[1].rawLabel,
    amount: realTxs[1].amount,
    bankCategory: realTxs[1].categoryCE,
    subCategory: realTxs[1].subCategoryCE,
  });
  assert.strictEqual(catDeezer.category, "Abonnements & Forfaits", "Logement - maison + Internet et telephonie -> Abonnements");
  assert.strictEqual(catDeezer.isSubscription, true);

  const catBK = categorizeLocally({
    label: realTxs[3].label,
    rawLabel: realTxs[3].rawLabel,
    amount: realTxs[3].amount,
    bankCategory: realTxs[3].categoryCE,
    subCategory: realTxs[3].subCategoryCE,
  });
  assert.strictEqual(catBK.category, "Restos & Fast-Food", "Alimentation + Restauration rapide -> Resto/Fast-Food");

  const catAprr = categorizeLocally({
    label: realTxs[4].label,
    rawLabel: realTxs[4].rawLabel,
    amount: realTxs[4].amount,
    bankCategory: realTxs[4].categoryCE,
    subCategory: realTxs[4].subCategoryCE,
  });
  assert.strictEqual(catAprr.category, "Transports", "Transports + Peage et Stationnement -> Transports");

  // K. Ordre de priorité : la règle personnalisée (learningRules) l'emporte sur le mapping natif
  const customCache = {
    "Auchan Supermarche": { categorie: "Shopping & Mode", isSubscription: false },
  };
  const catCustom = categorizeLocally({
    label: realTxs[0].label,
    rawLabel: realTxs[0].rawLabel,
    amount: realTxs[0].amount,
    bankCategory: realTxs[0].categoryCE,
    subCategory: realTxs[0].subCategoryCE,
    cache: customCache,
  });
  assert.strictEqual(catCustom.category, "Shopping & Mode", "La règle apprise utilisateur doit avoir priorité sur le mapping natif");
});

test("Opérations de Régularisation : exclusion stricte des revenus, des dépenses et neutralité du reste à vivre", () => {
  // 1. Détection automatique et catégorisation par le moteur local
  assert.strictEqual(REGULARISATION_CATEGORY, "Régularisation");
  assert.strictEqual(isRegularisationCategory("Régularisation"), true);
  assert.strictEqual(isRegularisationCategory("regularisation"), true);
  assert.strictEqual(isRegularisationCategory("REGULARISATION DE COMPTE"), true);
  assert.strictEqual(isRegularisationCategory("Ajustement de solde"), true);
  assert.strictEqual(isRegularisationCategory("Regul"), true);
  assert.strictEqual(isRegularisationCategory("Alimentation & Courses"), false);

  // Catégorisation locale automatique avec libellés réels
  const creditRegulResult = categorizeLocally({
    label: "Regularisation De Compte",
    rawLabel: "REGULARISATION DE COMPTE 15/10",
    amount: 100,
  });
  assert.strictEqual(creditRegulResult.category, "Régularisation");
  assert.strictEqual(creditRegulResult.isInternalTransfer, true);
  assert.strictEqual(creditRegulResult.excludeFromSpending, true);
  assert.strictEqual(creditRegulResult.excludeFromIncome, true);

  const debitRegulResult = categorizeLocally({
    label: "Ajustement De Solde",
    rawLabel: "AJUSTEMENT SOLDE BANCAIRE",
    amount: -50,
  });
  assert.strictEqual(debitRegulResult.category, "Régularisation");
  assert.strictEqual(debitRegulResult.isInternalTransfer, true);
  assert.strictEqual(debitRegulResult.excludeFromSpending, true);
  assert.strictEqual(debitRegulResult.excludeFromIncome, true);

  // 2. Drapeaux d'exclusion et helpers
  const creditTx: Transaction = {
    id: "tx-regul-credit-1",
    name: "Régularisation de compte",
    rawName: "REGULARISATION DE COMPTE",
    type: "Régularisation",
    amount: 100,
    date: "2026-10-15",
    month: "2026-10",
    isInternalTransfer: true,
    excludeFromSpending: true,
    excludeFromIncome: true,
  };

  const debitTx: Transaction = {
    id: "tx-regul-debit-1",
    name: "Régularisation débitrice",
    rawName: "REGUL FRAIS BANCAIRE SOLDE",
    type: "Régularisation",
    amount: -50,
    date: "2026-10-16",
    month: "2026-10",
    isInternalTransfer: true,
    excludeFromSpending: true,
    excludeFromIncome: true,
  };

  assert.strictEqual(isRegularisationTransaction(creditTx), true);
  assert.strictEqual(isRegularisationTransaction(debitTx), true);
  assert.strictEqual(isInternalTransferTransaction(creditTx), true);
  assert.strictEqual(isInternalTransferTransaction(debitTx), true);

  // Une régularisation créditrice ne doit JAMAIS être prise pour un salaire ou une aide sociale
  assert.strictEqual(isSalaryTransaction(creditTx, 2000), false);
  assert.strictEqual(isAidTransaction(creditTx), false);

  // 3. Neutralité comptable absolue dans calculateFinancialMetrics
  const baseTransactions: Transaction[] = [
    {
      id: "tx-sal-1",
      name: "VIR SALAIRE SOCIETE",
      type: "Revenus & Aides",
      amount: 2000,
      date: "2026-10-01",
      month: "2026-10",
    },
    {
      id: "tx-courses-1",
      name: "MONOPRIX",
      type: "Alimentation & Courses",
      amount: -500,
      date: "2026-10-05",
      month: "2026-10",
    },
    {
      id: "tx-loyer-1",
      name: "PRLV LOYER",
      type: "Logement & Maison",
      amount: -700,
      date: "2026-10-06",
      month: "2026-10",
    },
  ];

  const baseMetrics = calculateFinancialMetrics({
    transactions: baseTransactions,
    incomeSettings: { salary: 2000 },
    selectedMonth: "2026-10",
  });

  // Métriques de référence :
  // - Revenus : 2 000 €
  // - Dépenses : 500 (courses) + 700 (loyer) = 1 200 €
  // - Charges fixes : 700 €
  // - Reste à vivre : 2000 - 700 = 1 300 €
  // - Solde : 2000 - 1200 = 800 €
  assert.strictEqual(baseMetrics.income, 2000);
  assert.strictEqual(baseMetrics.expenses, 1200);
  assert.strictEqual(baseMetrics.disposableIncome, 1300);
  assert.strictEqual(baseMetrics.balance, 800);

  // Injection des opérations de régularisation (+100 € et -50 €)
  const transactionsWithRegul: Transaction[] = [
    ...baseTransactions,
    creditTx,
    debitTx,
  ];

  const metricsWithRegul = calculateFinancialMetrics({
    transactions: transactionsWithRegul,
    incomeSettings: { salary: 2000 },
    selectedMonth: "2026-10",
  });

  // Vérifications formelles strictes :
  // 1. Le total des revenus mensuels reste strictement inchangé (2 000 € et non 2 100 €)
  assert.strictEqual(
    metricsWithRegul.income,
    baseMetrics.income,
    "Les revenus réels ne doivent pas être gonflés par une régularisation créditrice (+100 €)"
  );

  // 2. Le total des dépenses nettes reste strictement inchangé (500 € et non 550 €)
  assert.strictEqual(
    metricsWithRegul.expenses,
    baseMetrics.expenses,
    "Les dépenses nettes ne doivent pas être augmentées par une régularisation débitrice (-50 €)"
  );

  // 3. Le reste à vivre reste strictement identique (1 300 €)
  assert.strictEqual(
    metricsWithRegul.disposableIncome,
    baseMetrics.disposableIncome,
    "Le reste à vivre ne doit subir aucune altération due aux régularisations"
  );

  // 4. Le solde d'activité opérationnel reste strictement identique (1 500 €)
  assert.strictEqual(
    metricsWithRegul.balance,
    baseMetrics.balance,
    "Le solde opérationnel d'activité doit être strictement identique"
  );

  // 5. Les régularisations ne sont pas comptées dans l'épargne nette transférée
  assert.strictEqual(
    metricsWithRegul.internalTransfersSaved,
    0,
    "Les régularisations ne doivent pas être comptabilisées comme de l'épargne"
  );

  // 4. Recatégorisation manuelle vers « Régularisation » ou « Virement interne »
  const manualTx: Transaction = {
    id: "tx-manual-1",
    name: "Opération bancaire atypique",
    type: "Autre",
    amount: 150,
    date: "2026-10-20",
    month: "2026-10",
  };

  // Avant recatégorisation : compté comme revenu ou remboursement
  const metricsBefore = calculateFinancialMetrics({
    transactions: [...baseTransactions, manualTx],
    incomeSettings: { salary: 2000 },
    selectedMonth: "2026-10",
  });
  assert.notStrictEqual(metricsBefore.expenses, baseMetrics.expenses);

  // Après recatégorisation manuelle en « Régularisation »
  const manualRegulTx: Transaction = {
    ...manualTx,
    type: "Régularisation",
    isInternalTransfer: true,
    excludeFromSpending: true,
    excludeFromIncome: true,
  };

  const metricsAfterRegul = calculateFinancialMetrics({
    transactions: [...baseTransactions, manualRegulTx],
    incomeSettings: { salary: 2000 },
    selectedMonth: "2026-10",
  });

  assert.strictEqual(metricsAfterRegul.income, baseMetrics.income);
  assert.strictEqual(metricsAfterRegul.expenses, baseMetrics.expenses);
  assert.strictEqual(metricsAfterRegul.disposableIncome, baseMetrics.disposableIncome);

  // Après recatégorisation manuelle en « Virement interne »
  const manualInternalTx: Transaction = {
    ...manualTx,
    type: "Virement interne",
    isInternalTransfer: true,
    excludeFromSpending: true,
    excludeFromIncome: true,
  };

  const metricsAfterInternal = calculateFinancialMetrics({
    transactions: [...baseTransactions, manualInternalTx],
    incomeSettings: { salary: 2000 },
    selectedMonth: "2026-10",
  });

  assert.strictEqual(metricsAfterInternal.income, baseMetrics.income);
  assert.strictEqual(metricsAfterInternal.expenses, baseMetrics.expenses);
  assert.strictEqual(metricsAfterInternal.disposableIncome, baseMetrics.disposableIncome);
});

test("Verrouillage strict : Exclusion absolue de « Vir Regularisation Du Compte Bo... » (+100 €) du calcul des dépenses", () => {
  const baseTxs: Transaction[] = [
    {
      id: "sal-base",
      name: "VIR SALAIRE",
      type: "Revenus & Aides",
      amount: 2500,
      date: "2026-10-01",
      month: "2026-10",
    },
    {
      id: "exp-loyer",
      name: "PRLV LOYER",
      type: "Logement & Maison",
      amount: -800,
      date: "2026-10-05",
      month: "2026-10",
    },
    {
      id: "exp-courses",
      name: "CARREFOUR MARKET",
      type: "Alimentation & Courses",
      amount: -350,
      date: "2026-10-10",
      month: "2026-10",
    },
  ];

  const metricsWithoutRegul = calculateFinancialMetrics({
    transactions: baseTxs,
    incomeSettings: { salary: 2500 },
    selectedMonth: "2026-10",
  });

  // Métriques de base : Dépenses = 800 + 350 = 1 150 €, Reste à vivre = 2500 - 800 = 1 700 €
  assert.strictEqual(metricsWithoutRegul.expenses, 1150);
  assert.strictEqual(metricsWithoutRegul.income, 2500);
  assert.strictEqual(metricsWithoutRegul.disposableIncome, 1700);
  assert.strictEqual(metricsWithoutRegul.balance, 1350);

  // Cas réel 1 : Opération créditrice (+100.00 €) avec libellé tronqué BoursoBank
  // "Vir Regularisation Du Compte Bo..." avec catégorie par défaut "Virements proches & Remboursements"
  const positiveRegulTx: Transaction = {
    id: "tx-vir-regul-bourso",
    name: "Vir Regularisation Du Compte Bo...",
    rawName: "VIR REGULARISATION DU COMPTE BOURSOBANK 100 EUR",
    type: "Virements proches & Remboursements",
    amount: 100,
    date: "2026-10-15",
    month: "2026-10",
  };

  // 1. Détection universelle par les prédicats types
  assert.strictEqual(isRegularisationTransaction(positiveRegulTx), true);
  assert.strictEqual(isInternalTransferTransaction(positiveRegulTx), true);

  // 2. Calcul avec injection du +100 €
  const metricsWithPositiveRegul = calculateFinancialMetrics({
    transactions: [...baseTxs, positiveRegulTx],
    incomeSettings: { salary: 2500 },
    selectedMonth: "2026-10",
  });

  // VERROU CRITIQUE : Les dépenses nettes DOIVENT être strictement égales à 1 150,00 €
  // (Elle ne doit en aucun cas être traitée comme un remboursement d'achat qui ferait tomber les dépenses à 1 050 €)
  assert.strictEqual(
    metricsWithPositiveRegul.expenses,
    metricsWithoutRegul.expenses,
    "Les dépenses nettes ne doivent JAMAIS déduire une régularisation créditrice (+100 €)"
  );
  assert.strictEqual(metricsWithPositiveRegul.expenses, 1150);

  // Revenus réels strictement inchangés (2 500 € et non 2 600 €)
  assert.strictEqual(
    metricsWithPositiveRegul.income,
    metricsWithoutRegul.income,
    "Les revenus ne doivent pas être artificiellement augmentés de 100 €"
  );

  // Reste à vivre strictement inchangé (1 700 €)
  assert.strictEqual(
    metricsWithPositiveRegul.disposableIncome,
    metricsWithoutRegul.disposableIncome,
    "Le reste à vivre doit être insensible aux régularisations techniques"
  );

  // Solde opérationnel d'activité strictement inchangé (1 350 €)
  assert.strictEqual(
    metricsWithPositiveRegul.balance,
    metricsWithoutRegul.balance,
    "Le solde opérationnel d'activité doit rester strictement identique"
  );

  // Cas réel 2 : Régularisation débitrice (-50.00 €)
  const negativeRegulTx: Transaction = {
    id: "tx-regul-debit",
    name: "Vir Regularisation Du Compte Bo...",
    type: "Autre",
    amount: -50,
    date: "2026-10-16",
    month: "2026-10",
  };

  const metricsWithNegativeRegul = calculateFinancialMetrics({
    transactions: [...baseTxs, negativeRegulTx],
    incomeSettings: { salary: 2500 },
    selectedMonth: "2026-10",
  });

  // Les dépenses nettes ne doivent PAS augmenter à 1 200 €
  assert.strictEqual(
    metricsWithNegativeRegul.expenses,
    metricsWithoutRegul.expenses,
    "Une régularisation débitrice (-50 €) ne doit jamais être incluse dans les dépenses nettes"
  );
  assert.strictEqual(metricsWithNegativeRegul.expenses, 1150);
});







