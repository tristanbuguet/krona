import test from "node:test";
import assert from "node:assert";
import {
  parseCreditAgricoleCSV,
  cleanCALabel,
  detectCADelimiter,
  fixMojibake,
} from "../src/lib/creditAgricoleParser";
import { categorizeLocally } from "../src/lib/categorization";

test("Crédit Agricole : Détection automatique du séparateur (; ou \\t)", () => {
  const semiCsv = [
    "Compte de dépôt n° 12345678901;;;;",
    "Date de l'opération;Date de valeur;Libellé de l'opération;Débit euros;Crédit euros",
    "06/10/2026;06/10/2026;CARTE 06/10/2026 MONOPRIX PARIS;24,50;",
  ].join("\n");

  const tsvData = [
    "Compte de dépôts\tn° 12345678901",
    "Date de l'opération\tDate de valeur\tLibellé de l'opération\tDébit euros\tCrédit euros",
    "06/10/2026\t06/10/2026\tCARTE 06/10/2026 MONOPRIX PARIS\t24,50\t",
  ].join("\n");

  assert.strictEqual(detectCADelimiter(semiCsv), ";");
  assert.strictEqual(detectCADelimiter(tsvData), "\t");
});

test("Crédit Agricole : Lignes de métadonnées initiales et colonne 'Date de valeur' intercalée", () => {
  const csvContent = [
    "Crédit Agricole d'Aquitaine",
    "Compte de dépôts n° 01234567890 - M. DUPONT JEAN",
    "IBAN : FR7612345678901234567890123",
    "Solde au 15/10/2026 : +1 520,30 EUR",
    "",
    "Date de l'opération;Date de valeur;Libellé de l'opération;Débit euros;Crédit euros",
    "06/10/2026;07/10/2026;CARTE 06/10/2026 MONOPRIX PARIS;24,50;",
    "08/10/2026;08/10/2026;PAIEMENT PAR CARTE DU 08/10/2026 SPOTIFY;9,99;",
    "10/10/2026;10/10/2026;CARTE DU 10/10/2026 FNAC PARIS;49,00;",
    "12/10/2026;12/10/2026;VIR SEPA RECU DE ENTREPRISE ACME SALAIRE;;2450,00",
  ].join("\n");

  const txs = parseCreditAgricoleCSV(csvContent);
  assert.strictEqual(txs.length, 4);

  // Vérification stricte : AUCUN libellé ne doit être une date !
  txs.forEach((tx) => {
    assert.ok(
      !/^\d{1,2}[\/\-\.]\d{1,2}([\/\-\.]\d{2,4})?$/.test(tx.label),
      `Le libellé ne doit JAMAIS être une date, reçu : "${tx.label}"`
    );
    assert.ok(
      !/^\d{4}-\d{2}-\d{2}$/.test(tx.label),
      `Le libellé ne doit JAMAIS être une date ISO, reçu : "${tx.label}"`
    );
  });

  // Transaction 1 : Monoprix (Débit)
  assert.strictEqual(txs[0].date, "2026-10-06");
  assert.strictEqual(txs[0].month, "2026-10");
  assert.strictEqual(txs[0].label, "Monoprix Paris");
  assert.strictEqual(txs[0].rawLabel, "CARTE 06/10/2026 MONOPRIX PARIS");
  assert.strictEqual(txs[0].amount, -24.5);
  assert.strictEqual(txs[0].account, "Crédit Agricole");
  assert.strictEqual(txs[0].id, "ca_2026-10-06_-24.5_monoprix-paris_1");

  // Transaction 2 : Spotify (Abonnement récurrent)
  assert.strictEqual(txs[1].date, "2026-10-08");
  assert.strictEqual(txs[1].label, "Spotify");
  assert.strictEqual(txs[1].amount, -9.99);

  // Transaction 3 : Fnac
  assert.strictEqual(txs[2].date, "2026-10-10");
  assert.strictEqual(txs[2].label, "Fnac Paris");
  assert.strictEqual(txs[2].amount, -49);

  // Transaction 4 : Salaire (Crédit)
  assert.strictEqual(txs[3].date, "2026-10-12");
  assert.strictEqual(txs[3].label, "Entreprise Acme Salaire");
  assert.strictEqual(txs[3].amount, 2450);
});

test("Crédit Agricole : Variantes de noms de colonnes (Opération, Détail, Montant unique)", () => {
  // Variante 1 : Colonne 'Opération' avec 'Date' et 'Date de valeur'
  const csvOp = [
    "Date;Date de valeur;Opération;Débit;Crédit",
    "06/10/2026;06/10/2026;CARTE 06/10/2026 BOULANGERIE;4,50;",
    "07/10/2026;07/10/2026;VIREMENT RECU REMBOURSEMENT;;30,00",
  ].join("\n");

  const txsOp = parseCreditAgricoleCSV(csvOp);
  assert.strictEqual(txsOp.length, 2);
  assert.strictEqual(txsOp[0].label, "Boulangerie");
  assert.strictEqual(txsOp[0].amount, -4.5);
  assert.strictEqual(txsOp[1].label, "Remboursement");
  assert.strictEqual(txsOp[1].amount, 30);

  // Variante 2 : Colonne 'Détail de l'opération' et montant unique
  const csvDetail = [
    "Date de l'opération;Date de valeur;Détail de l'opération;Montant",
    "08/10/2026;08/10/2026;CARTE 08/10/2026 DECATHLON;-59,90",
    "09/10/2026;09/10/2026;VIR SALAIRE;2100,00",
  ].join("\n");

  const txsDetail = parseCreditAgricoleCSV(csvDetail);
  assert.strictEqual(txsDetail.length, 2);
  assert.strictEqual(txsDetail[0].label, "Decathlon");
  assert.strictEqual(txsDetail[0].amount, -59.9);
  assert.strictEqual(txsDetail[1].label, "Vir Salaire");
  assert.strictEqual(txsDetail[1].amount, 2100);
});

test("Crédit Agricole : Support des fichiers TSV (export tabulations)", () => {
  const tsvData = [
    "Compte courant\tn° 00012345",
    "Date de l'opération\tDate de valeur\tLibellé\tDébit\tCrédit",
    "15/10/2026\t15/10/2026\tCARTE 15/10/2026 MONOPRIX NATION\t35,20\t",
    "16/10/2026\t16/10/2026\tPRLV SEPA NETFLIX\t13,49\t",
  ].join("\n");

  const txs = parseCreditAgricoleCSV(tsvData);
  assert.strictEqual(txs.length, 2);
  assert.strictEqual(txs[0].label, "Monoprix Nation");
  assert.strictEqual(txs[0].amount, -35.2);
  assert.strictEqual(txs[1].label, "Netflix");
  assert.strictEqual(txs[1].amount, -13.49);
});

test("Crédit Agricole : Nettoyage précis des libellés et préfixes complexes", () => {
  assert.strictEqual(
    cleanCALabel("CARTE 06/10/2026 MONOPRIX PARIS", -24.5),
    "Monoprix Paris"
  );
  assert.strictEqual(
    cleanCALabel("CARTE DU 06/10/2026 MONOPRIX PARIS", -24.5),
    "Monoprix Paris"
  );
  assert.strictEqual(
    cleanCALabel("CARTE 06/10/2026 14H30 CARREFOUR CITY", -18.2),
    "Carrefour City"
  );
  assert.strictEqual(
    cleanCALabel("PAIEMENT PAR CARTE DU 06/10/2026 SPOTIFY", -9.99),
    "Spotify"
  );
  assert.strictEqual(
    cleanCALabel("CARTE N° 1234 06/10/2026 FNAC DARTY", -89.9),
    "Fnac Darty"
  );
  assert.strictEqual(
    cleanCALabel("VIR SEPA RECU DE ENTREPRISE DUPONT MOTIF SALAIRE", 2500),
    "Entreprise Dupont Motif Salaire"
  );
  assert.strictEqual(
    cleanCALabel("PRLV SEPA NETFLIX", -15.99),
    "Netflix"
  );
  assert.strictEqual(
    cleanCALabel("RETRAIT DAB 06/10/2026 PARIS BASTILLE", -40),
    "Paris Bastille"
  );

  // Garde-fou strict : si une chaîne ne contient qu'une date, JAMAIS de date retournée
  assert.strictEqual(cleanCALabel("06/10/2026", -20), "Opération carte");
  assert.strictEqual(cleanCALabel("06/10/2026", 100), "Virement reçu");
  assert.strictEqual(cleanCALabel("CARTE 06/10/2026", -20), "Opération carte");
});

test("Crédit Agricole : Intégrité de la catégorisation (mots-clés, abonnements et règles d'apprentissage)", () => {
  const csvContent = [
    "Date de l'opération;Date de valeur;Libellé;Débit;Crédit",
    "01/10/2026;01/10/2026;CARTE 01/10/2026 MONOPRIX PARIS;45,00;",
    "02/10/2026;02/10/2026;PAIEMENT PAR CARTE DU 02/10/2026 SPOTIFY;9,99;",
    "03/10/2026;03/10/2026;PRLV SEPA NETFLIX;15,99;",
    "04/10/2026;04/10/2026;VIR SEPA RECU DE SOCIETE XYZ SALAIRE;;2800,00",
    "05/10/2026;05/10/2026;CARTE 05/10/2026 COMMERCE SPECIAL;120,00;",
  ].join("\n");

  const txs = parseCreditAgricoleCSV(csvContent);
  assert.strictEqual(txs.length, 5);

  // Cache utilisateur simulant une règle apprise pour un commerçant personnalisé
  const userCache = {
    "Commerce Special": {
      categorie: "Shopping & Mode",
      isSubscription: false,
    },
  };

  const categories = txs.map((tx) => {
    return categorizeLocally({
      label: tx.label,
      rawLabel: tx.rawLabel,
      amount: tx.amount,
      cache: userCache,
    });
  });

  // 1. Monoprix -> Alimentation & Courses (PAS "Autre")
  assert.strictEqual(categories[0].category, "Alimentation & Courses");

  // 2. Spotify -> Abonnements & Forfaits avec isSubscription = true
  assert.strictEqual(categories[1].category, "Abonnements & Forfaits");
  assert.strictEqual(categories[1].isSubscription, true);

  // 3. Netflix -> Abonnements & Forfaits avec isSubscription = true
  assert.strictEqual(categories[2].category, "Abonnements & Forfaits");
  assert.strictEqual(categories[2].isSubscription, true);

  // 4. Salaire -> Revenus & Aides
  assert.strictEqual(categories[3].category, "Revenus & Aides");

  // 5. Commerce Special -> Shopping & Mode (via userCache / learningRules)
  assert.strictEqual(categories[4].category, "Shopping & Mode");

  // Vérifier qu'AUCUNE transaction n'est tombée dans "Autre"
  const otherCount = categories.filter((c) => c.category === "Autre").length;
  assert.strictEqual(otherCount, 0, "Les transactions Crédit Agricole ne doivent plus finir à 100% dans Autre");
});

test("Crédit Agricole : Déduplication et identifiants uniques déterministes sur doublons légitimes", () => {
  const csvContent = [
    "Date de l'opération;Date de valeur;Libellé;Débit;Crédit",
    "15/10/2026;15/10/2026;CARTE 15/10/2026 BOULANGERIE;2,50;",
    "15/10/2026;15/10/2026;CARTE 15/10/2026 BOULANGERIE;2,50;",
  ].join("\n");

  const txs = parseCreditAgricoleCSV(csvContent);
  assert.strictEqual(txs.length, 2);

  assert.strictEqual(txs[0].id, "ca_2026-10-15_-2.5_boulangerie_1");
  assert.strictEqual(txs[1].id, "ca_2026-10-15_-2.5_boulangerie_2");
});

test("Crédit Agricole : Réparation mojibake encodage (caractères accentués et €)", () => {
  const rawMojibake = "CARTE 06/10/2026 CAFÃ‰ DU THÃ‰Ã‚TRE";
  assert.strictEqual(fixMojibake(rawMojibake), "CARTE 06/10/2026 CAFÉ DU THÉÂTRE");

  const csvWithMojibake = [
    "Date de l'opÃ©ration;Date de valeur;LibellÃ©;DÃ©bit;CrÃ©dit",
    "06/10/2026;06/10/2026;CARTE 06/10/2026 CAFÃ‰ DU COMMERCE;4,20;",
  ].join("\n");

  const txs = parseCreditAgricoleCSV(csvWithMojibake);
  assert.strictEqual(txs.length, 1);
  assert.strictEqual(txs[0].label, "Café Du Commerce");
});

test("Crédit Agricole : Garde-fou dynamique anti-décalage de colonnes", () => {
  // Cas pathologique où l'en-tête est manquant mais la colonne 1 contient une date de valeur
  const csvHeaderless = [
    "06/10/2026;06/10/2026;CARTE 06/10/2026 LEROY MERLIN;34,90;",
    "07/10/2026;07/10/2026;CARTE 07/10/2026 IKEA;89,00;",
  ].join("\n");

  const txs = parseCreditAgricoleCSV(csvHeaderless);
  assert.strictEqual(txs.length, 2);
  assert.strictEqual(txs[0].label, "Leroy Merlin");
  assert.strictEqual(txs[0].amount, -34.9);
  assert.strictEqual(txs[1].label, "Ikea");
  assert.strictEqual(txs[1].amount, -89);
});
