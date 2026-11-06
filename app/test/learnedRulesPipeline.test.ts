import test from "node:test";
import assert from "node:assert/strict";
import { executeBankIngestionPipeline } from "../src/lib/bankPipeline";
import { categorizeLocally, findLearnedRule, cleanMerchantName } from "../src/lib/categorization";
import {
  cleanOpenBankingMerchantLabel,
  buildDeduplicationSignature,
} from "../src/lib/bankDeduplication";
import { LearningRuleMap } from "../src/lib/types";

test("Nettoyage du commerçant : 'Franprix 5045' et 'Franprix 5046' donnent 'Franprix' sans numéro de magasin ni code terminal", () => {
  const clean1 = cleanOpenBankingMerchantLabel("Franprix 5045", true);
  const clean2 = cleanOpenBankingMerchantLabel("Franprix 5046", true);

  assert.equal(clean1, "Franprix");
  assert.equal(clean2, "Franprix");

  // Déduplication : signatures comptables sur la même racine de commerçant
  const sig1 = buildDeduplicationSignature("2026-11-06", -15.5, "Franprix 5045");
  const sig2 = buildDeduplicationSignature("2026-11-06", -15.5, "Franprix 5046");
  assert.equal(sig1, sig2);
});

test("Règle apprise : une règle apprise sur 'Franprix 5045' s'applique à une nouvelle opération 'Franprix 5046' sans appeler l'IA", async () => {
  // 1. Règle mémorisée initialement pour 'Franprix 5045'
  const rules: LearningRuleMap = {
    "Franprix 5045": {
      categorie: "Alimentation & Courses",
      isSubscription: false,
      isInternalTransfer: false,
      source: "user_manual",
      updatedAt: "2026-11-06T10:00:00.000Z",
    },
  };

  // 2. Vérification unitaire du moteur de résolution locale
  const directMatch = findLearnedRule("Franprix 5046", "Franprix 5046", rules);
  assert.ok(directMatch, "findLearnedRule doit faire correspondre 'Franprix 5046' à la règle 'Franprix 5045'");
  assert.equal(directMatch.categorie, "Alimentation & Courses");

  const localRes = categorizeLocally({
    label: "Franprix 5046",
    rawLabel: "CB* FRANPRIX 5046 PAIEMENT CARTE",
    amount: -18.25,
    cache: rules,
  });
  assert.equal(localRes.category, "Alimentation & Courses");
  assert.equal(localRes.isSubscription, false);

  // 3. Exécution dans le pipeline bancaire avec espion IA
  let aiCallCount = 0;
  const mockAiCategorizer = async (
    items: Array<{ id: string; label: string; amount?: number }>
  ): Promise<Map<string, string>> => {
    aiCallCount += items.length;
    throw new Error("L'IA ne doit JAMAIS être appelée pour une opération couverte par une règle apprise");
  };

  const pipelineResult = await executeBankIngestionPipeline({
    rawTransactions: [
      {
        id: "eb_tx_franprix_5046",
        date: "2026-11-06",
        amount: -18.25,
        label: "Franprix 5046",
        rawLabel: "CB* FRANPRIX 5046 PAIEMENT CARTE",
      },
    ],
    existingTransactions: [],
    learningRules: rules,
    aiCategorizer: mockAiCategorizer,
  });

  // L'IA n'a été appelée aucune fois
  assert.equal(aiCallCount, 0, "L'IA ne doit pas être sollicitée");

  // L'opération a été catégorisée selon la règle apprise
  const tx = pipelineResult.allMergedTransactions.find((t) => t.id === "eb_tx_franprix_5046");
  assert.ok(tx, "La transaction doit être présente dans le résultat du pipeline");
  assert.equal(tx.type, "Alimentation & Courses");
  assert.equal(tx.name, "Franprix");
});

test("Priorité stricte : la règle apprise prime sur les règles locales par défaut et dictionnaire", () => {
  // 'Monoprix' est habituellement 'Alimentation & Courses' par défaut
  // Si l'utilisateur l'a personnalisé en 'Logement & Maison' (ex. achats déco)
  const customRules: LearningRuleMap = {
    Monoprix: {
      categorie: "Logement & Maison",
      source: "user_manual",
      updatedAt: "2026-11-06T12:00:00.000Z",
    },
  };

  const res = categorizeLocally({
    label: "Monoprix 75011",
    rawLabel: "PAIEMENT CB MONOPRIX 75011",
    amount: -45.0,
    cache: customRules,
  });

  assert.equal(res.category, "Logement & Maison", "La règle utilisateur prime sur la règle par défaut");
});

test("Protection contre la pollution : l'inférence IA n'écrase pas une règle définie par l'utilisateur", async () => {
  const userRules: LearningRuleMap = {
    "Mon Commerçant": {
      categorie: "Shopping & Mode",
      source: "user_manual",
      updatedAt: "2026-11-06T08:00:00.000Z",
    },
  };

  // Simulation d'une opération orpheline où l'IA retourne une autre catégorie
  const mockAi = async () => new Map([["tx_1", "Autre"]]);

  const result = await executeBankIngestionPipeline({
    rawTransactions: [
      {
        id: "tx_1",
        date: "2026-11-06",
        amount: -25.0,
        label: "Mon Commerçant",
      },
    ],
    learningRules: userRules,
    aiCategorizer: mockAi,
  });

  assert.equal(result.learningRules["Mon Commerçant"]?.categorie, "Shopping & Mode");
  assert.equal(result.learningRules["Mon Commerçant"]?.source, "user_manual");
});
