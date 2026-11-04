import test from "node:test";
import assert from "node:assert";
import { parseLCLCSV, detectLCLDelimiter, cleanLCLLabel, fixEncoding, lclParser } from "../src/lib/lclParser";
import { detectBankType, parseBankCsvFile } from "../src/lib/bankParser";
import { categorizeLocally } from "../src/lib/categorization";

test("LCL : Détection automatique du format LCL (CSV, TSV, métadonnées et signatures)", () => {
  // 1. Détection avec mention explicite LCL
  const lclExplicit = [
    `LCL - Le Crédit Lyonnais`,
    `Compte n° : 30002 00123 0001234567A 89`,
    `Solde au : 15/10/2026 : +1 250,00 EUR`,
    `Date;Libellé;Débit;Crédit`,
    `15/10/2026;CARREFOUR MARKET;15,80;`,
  ].join("\n");
  assert.strictEqual(detectBankType(lclExplicit), "lcl");

  // 2. Détection par métadonnées caractéristiques LCL sans mention du mot LCL
  const lclMetadata = [
    `Compte n° : 0123456789A`,
    `Solde au : 15/10/2026 : +2 340,50 EUR`,
    `Devise : EUR`,
    ``,
    `Date;Libellé;Débit;Crédit`,
    `16/10/2026;MONOPRIX;25,00;`,
  ].join("\n");
  assert.strictEqual(detectBankType(lclMetadata), "lcl");

  // 3. Détection d'un export LCL au format TSV (séparateur tabulation)
  const lclTsv = [
    `Date\tLibellé\tDébit\tCrédit`,
    `15/10/2026\tMONOPRIX NATION\t42,50\t`,
  ].join("\n");
  assert.strictEqual(detectBankType(lclTsv), "lcl");

  // 4. Détection avec en-têtes longues "Date de l'opération" et "Libellé de l'opération"
  const lclLongHeaders = [
    `Compte n° : 0123456789A`,
    `Date de l'opération;Libellé de l'opération;Débit;Crédit`,
    `15/10/2026;VIR SEPA LOYER;850,00;`,
  ].join("\n");
  assert.strictEqual(detectBankType(lclLongHeaders), "lcl");

  // 5. Non-régression stricte sur les autres banques
  const boursoSample = `date;dateVal;label;category;categoryParent;amount;comment\n2026-10-15;2026-10-15;MONOPRIX;Alimentation;Courses;-24,50;`;
  const caSample = `Compte de depot n° 12345678901;;;\nDate;Libellé;Débit euros;Crédit euros;\n15/10/2026;CARREFOUR MARKET;15,80;`;
  const ceSample = `"Compte de dépôt n° 08000123456 - Caisse d'Épargne Île-de-France";;;;\n"Solde au 15/10/2026 : +2 340,50 EUR";;;;\n"Date de l'opération";"Date de valeur";"Libellé";"Débit";"Crédit"`;

  assert.strictEqual(detectBankType(boursoSample), "bourso");
  assert.strictEqual(detectBankType(caSample), "ca");
  assert.strictEqual(detectBankType(ceSample), "ce");
});

test("LCL : Extrait représentatif avec 2 colonnes Débit / Crédit et virgules décimales", () => {
  const csvData = [
    `Date;Libellé;Débit;Crédit`,
    `15/10/2026;CARREFOUR MARKET;15,80;`,
    `16/10/2026;VIR SEPA RECU DE SOCIETE GENERALE SALAIRE;;2450,00`,
    `17/10/2026;PRLV SEPA TOTAL DIRECT ENERGIE;82,30;`,
    `18/10/2026;VIR RECU REMBOURSEMENT AMELI;;35,50`,
  ].join("\n");

  const txs = parseLCLCSV(csvData);
  assert.strictEqual(txs.length, 4);

  // Débit -> montant strictement négatif
  assert.strictEqual(txs[0].date, "2026-10-15");
  assert.strictEqual(txs[0].month, "2026-10");
  assert.strictEqual(txs[0].amount, -15.8);
  assert.strictEqual(txs[0].label, "Carrefour Market");
  assert.strictEqual(txs[0].account, "LCL");
  assert.strictEqual(txs[0].id, "lcl_2026-10-15_-15.8_carrefour-market_1");

  // Crédit -> montant strictement positif
  assert.strictEqual(txs[1].date, "2026-10-16");
  assert.strictEqual(txs[1].month, "2026-10");
  assert.strictEqual(txs[1].amount, 2450.0);
  assert.ok(txs[1].label.includes("Societe Generale Salaire"));
  assert.strictEqual(txs[1].account, "LCL");
  assert.strictEqual(txs[1].id, "lcl_2026-10-16_2450_societe-generale-salaire_1");

  // Autre débit
  assert.strictEqual(txs[2].amount, -82.3);
  assert.strictEqual(txs[2].label, "Total Direct Energie");

  // Autre crédit
  assert.strictEqual(txs[3].amount, 35.5);
  assert.ok(txs[3].label.includes("Ameli"));
});

test("LCL : Lignes de métadonnées initiales (compte, solde, devise, lignes vides)", () => {
  const csvWithMetadata = [
    `LCL - RELEVÉ DE COMPTE`,
    `Compte n° : 30002 00123 0001234567A 89`,
    `Solde au : 15/10/2026 : +1 250,00 EUR`,
    `Devise : EUR`,
    ``,
    `Date;Libellé;Débit;Crédit`,
    `01/10/2026;PAIEMENT PAR CARTE 01/10 MONOPRIX NATION;45,60;`,
    `02/10/2026;VIREMENT SEPA LOYER 75011;850,00;`,
  ].join("\n");

  const txs = parseLCLCSV(csvWithMetadata);
  assert.strictEqual(txs.length, 2, "Les 2 transactions doivent être extraites après les métadonnées");
  assert.strictEqual(txs[0].amount, -45.6);
  assert.strictEqual(txs[0].label, "Monoprix Nation");
  assert.strictEqual(txs[1].amount, -850.0);
  assert.strictEqual(txs[1].label, "Loyer 75011");
});

test("LCL : Gestion des montants avec espaces insécables et symboles monétaires", () => {
  const csvWithNonBreakingSpaces = [
    `Date;Libellé;Débit;Crédit`,
    `10/10/2026;VIREMENT EMIS;\u00A01\u00A0250,00\u00A0€;`,
    `11/10/2026;VIREMENT RECU SALAIRE;;\u202F2\u202F450,50\u202F€`,
    `12/10/2026;PRELEVEMENT LOYER;1 800,00 EUR;`,
  ].join("\n");

  const txs = parseLCLCSV(csvWithNonBreakingSpaces);
  assert.strictEqual(txs.length, 3);
  assert.strictEqual(txs[0].amount, -1250.0);
  assert.strictEqual(txs[1].amount, 2450.5);
  assert.strictEqual(txs[2].amount, -1800.0);
});

test("LCL : Libellés avec caractères accentués et nettoyage des préfixes bancaires", () => {
  const csvWithAccents = [
    `Date;Libellé;Débit;Crédit`,
    `15/10/2026;PAIEMENT PAR CARTE 15/10 BOULANGERIE DU CHÂTELET;4,80;`,
    `16/10/2026;ACHAT CB ÉPICERIE FINE & CAFÉ;18,50;`,
    `17/10/2026;VIR SEPA PRÊT IMMOBILIER LCL;650,00;`,
    `18/10/2026;VIR INST SEPA ALICE DUPONT;;50,00`,
    `19/10/2026;COTISATION MENSUELLE LCL AVERTIS;3,90;`,
    `20/10/2026;RETRAIT DAB 20/10 LCL PARIS REPUBLIQUE;60,00;`,
  ].join("\n");

  const txs = parseLCLCSV(csvWithAccents);
  assert.strictEqual(txs.length, 6);

  // Préservation des accents français
  assert.strictEqual(txs[0].label, "Boulangerie Du Châtelet");
  assert.strictEqual(txs[1].label, "Épicerie Fine & Café");
  assert.strictEqual(txs[2].label, "Prêt Immobilier Lcl");

  // Virement instantané SEPA
  assert.strictEqual(txs[3].label, "Alice Dupont");
  assert.strictEqual(txs[3].amount, 50.0);

  // Cotisation bancaire
  assert.strictEqual(txs[4].label, "Lcl Avertis");

  // Retrait DAB
  assert.strictEqual(txs[5].label, "Lcl Paris Republique");
});

test("LCL : Support des exports TSV (tabulations) et CSV avec virgules", () => {
  // Test TSV (tabulations)
  const tsvData = [
    `Compte n° : 0123456789A`,
    `Date\tLibellé\tDébit\tCrédit`,
    `15/10/2026\tMONOPRIX NATION\t34,20\t`,
    `16/10/2026\tVIREMENT ALICE\t\t50,00`,
  ].join("\n");

  assert.strictEqual(detectLCLDelimiter(tsvData), "\t");
  const tsvTxs = parseLCLCSV(tsvData);
  assert.strictEqual(tsvTxs.length, 2);
  assert.strictEqual(tsvTxs[0].amount, -34.2);
  assert.strictEqual(tsvTxs[0].label, "Monoprix Nation");
  assert.strictEqual(tsvTxs[1].amount, 50.0);
  assert.strictEqual(tsvTxs[1].label, "Alice");

  // Test CSV avec séparateur virgule
  const commaCsvData = [
    `Compte n° : 0123456789A`,
    `Date,Libellé,Débit,Crédit`,
    `15/10/2026,FRANPRIX,12.50,`,
    `16/10/2026,VIREMENT BOB,,30.00`,
  ].join("\n");

  assert.strictEqual(detectLCLDelimiter(commaCsvData), ",");
  const commaTxs = parseLCLCSV(commaCsvData);
  assert.strictEqual(commaTxs.length, 2);
  assert.strictEqual(commaTxs[0].amount, -12.5);
  assert.strictEqual(commaTxs[0].label, "Franprix");
  assert.strictEqual(commaTxs[1].amount, 30.0);
});

test("LCL : Support du format Cas B avec colonne unique Montant signée", () => {
  const singleAmountCsv = [
    `Compte n° : 0123456789A`,
    `Date opération;Libellé de l'opération;Montant`,
    `15/10/2026;RESTAURANT LE BISTROT;-28,50`,
    `16/10/2026;VIREMENT RECU DE PIERRE;+50,00`,
  ].join("\n");

  const txs = parseLCLCSV(singleAmountCsv);
  assert.strictEqual(txs.length, 2);
  assert.strictEqual(txs[0].amount, -28.5);
  assert.strictEqual(txs[0].label, "Restaurant Le Bistrot");
  assert.strictEqual(txs[1].amount, 50.0);
  assert.strictEqual(txs[1].label, "Pierre");
});

test("LCL : Déduplication et identifiants déterministes sur doublons légitimes", () => {
  const duplicateCsv = [
    `Date;Libellé;Débit;Crédit`,
    `15/10/2026;BOULANGERIE DU COIN;2,50;`,
    `15/10/2026;BOULANGERIE DU COIN;2,50;`,
    `15/10/2026;BOULANGERIE DU COIN;2,50;`,
  ].join("\n");

  const txs = parseLCLCSV(duplicateCsv);
  assert.strictEqual(txs.length, 3);
  assert.strictEqual(txs[0].id, "lcl_2026-10-15_-2.5_boulangerie-du-coin_1");
  assert.strictEqual(txs[1].id, "lcl_2026-10-15_-2.5_boulangerie-du-coin_2");
  assert.strictEqual(txs[2].id, "lcl_2026-10-15_-2.5_boulangerie-du-coin_3");
});

test("LCL : Intégration complète avec l'interface BankParser et le moteur de catégorisation", () => {
  assert.strictEqual(lclParser.name, "LCL");
  assert.strictEqual(typeof lclParser.parse, "function");

  const sampleCsv = [
    `Date;Libellé;Débit;Crédit`,
    `15/10/2026;PAIEMENT PAR CARTE 15/10 MONOPRIX;35,00;`,
    `16/10/2026;PRLV SEPA TOTAL DIRECT ENERGIE;95,00;`,
    `17/10/2026;VIR SEPA RECU DE EMPLOYEUR SALAIRE;;2800,00`,
  ].join("\n");

  const rawTxs = lclParser.parse(sampleCsv);
  assert.strictEqual(rawTxs.length, 3);

  // Intégration catégorisation locale Krona
  const cat1 = categorizeLocally({
    label: rawTxs[0].label,
    rawLabel: rawTxs[0].rawLabel,
    amount: rawTxs[0].amount,
  });
  assert.strictEqual(cat1.category, "Alimentation & Courses");

  const cat2 = categorizeLocally({
    label: rawTxs[1].label,
    rawLabel: rawTxs[1].rawLabel,
    amount: rawTxs[1].amount,
  });
  assert.strictEqual(cat2.category, "Logement & Maison");

  const cat3 = categorizeLocally({
    label: rawTxs[2].label,
    rawLabel: rawTxs[2].rawLabel,
    amount: rawTxs[2].amount,
  });
  assert.strictEqual(cat3.category, "Revenus & Aides");

  // Règle mémorisée utilisateur prioritaire (learningRules / cache)
  const userCache = {
    [rawTxs[0].label]: {
      categorie: "Restos & Fast-Food",
      isSubscription: false,
    },
  };
  const catWithCache = categorizeLocally({
    label: rawTxs[0].label,
    rawLabel: rawTxs[0].rawLabel,
    amount: rawTxs[0].amount,
    cache: userCache,
  });
  assert.strictEqual(catWithCache.category, "Restos & Fast-Food", "La règle utilisateur doit prévaloir");
});

test("LCL : Réparation gracieuse de l'encodage (mojibake Windows-1252 / ISO-8859-1 en UTF-8)", () => {
  const mojibakeText = "PAIEMENT PAR CARTE Ã‰PICERIE CHÃ‚TELET PRÃŠT Ã€ PARIS";
  const repaired = fixEncoding(mojibakeText);
  assert.strictEqual(repaired, "PAIEMENT PAR CARTE ÉPICERIE CHÂTELET PRÊT À PARIS");

  const csvMojibake = [
    `Date;LibellÃ©;DÃ©bit;CrÃ©dit`,
    `15/10/2026;PAIEMENT CB CAFÃ‰ DE PARIS;4,50;`,
  ].join("\n");

  const txs = parseLCLCSV(csvMojibake);
  assert.strictEqual(txs.length, 1);
  assert.strictEqual(txs[0].label, "Café De Paris");
  assert.strictEqual(txs[0].amount, -4.5);
});

