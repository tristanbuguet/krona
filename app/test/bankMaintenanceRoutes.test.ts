import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET as handleCleanupGet, POST as handleCleanupPost } from "../src/app/api/bank/cleanup/route";
import { GET as handleRecatGet, POST as handleRecatPost } from "../src/app/api/bank/recategorize/route";
import { UserFinancialPayload, normalizeUserFinancialPayload } from "../src/lib/cloudSync";

const DATA_DIR = path.join(process.cwd(), ".krona-cloud");
const STORE_FILE = path.join(DATA_DIR, "users-cloud-store.json");

function readStore(): Record<string, UserFinancialPayload> {
  try {
    if (!fs.existsSync(STORE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8")) as Record<string, UserFinancialPayload>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, UserFinancialPayload>): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function createTestPayload(transactions: UserFinancialPayload["transactions"]): UserFinancialPayload {
  const p = normalizeUserFinancialPayload({});
  p.transactions = transactions;
  return p;
}

test("Protection des routes : 401 Unauthorized sans session active", async () => {
  // 1. /api/bank/cleanup sans session
  const cleanupGetNoAuth = new NextRequest("http://localhost:3000/api/bank/cleanup", { method: "GET" });
  const cleanupGetRes = await handleCleanupGet(cleanupGetNoAuth);
  assert.equal(cleanupGetRes.status, 401);

  const cleanupPostNoAuth = new NextRequest("http://localhost:3000/api/bank/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const cleanupPostRes = await handleCleanupPost(cleanupPostNoAuth);
  assert.equal(cleanupPostRes.status, 401);

  // 2. /api/bank/recategorize sans session
  const recatGetNoAuth = new NextRequest("http://localhost:3000/api/bank/recategorize", { method: "GET" });
  const recatGetRes = await handleRecatGet(recatGetNoAuth);
  assert.equal(recatGetRes.status, 401);

  const recatPostNoAuth = new NextRequest("http://localhost:3000/api/bank/recategorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const recatPostRes = await handleRecatPost(recatPostNoAuth);
  assert.equal(recatPostRes.status, 401);
});

test("Nettoyage : Mode simulation (dryRun: true par défaut) sans modification des données", async () => {
  const userId = "test-user-cleanup-dryrun";
  const store = readStore();

  // Création d'un utilisateur avec deux opérations en doublon strict (Zara occurrence 1)
  store[userId] = createTestPayload([
    {
      id: "bourso_2026-11-01_-50.00_zara_1",
      date: "2026-11-01",
      month: "2026-11",
      name: "Zara",
      amount: -50.0,
      type: "Shopping & Mode",
      source: "csv",
      updatedAt: "2026-11-01T10:00:00.000Z",
    },
    {
      id: "eb_2026-11-01_-50.00_zara_1",
      date: "2026-11-01",
      month: "2026-11",
      name: "Zara",
      amount: -50.0,
      type: "Shopping & Mode",
      source: "bank",
      updatedAt: "2026-11-06T10:00:00.000Z",
    },
  ]);
  writeStore(store);

  // Appel sans paramètre explicite : dryRun doit être actif par défaut
  const req = new NextRequest("http://localhost:3000/api/bank/cleanup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-krona-user-id": userId,
    },
    body: JSON.stringify({}),
  });

  const res = await handleCleanupPost(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  // Vérification de la réponse de simulation
  assert.equal(data.success, true);
  assert.equal(data.dryRun, true);
  assert.equal(data.applied, false);
  assert.equal(data.transactionsBefore, 2);
  assert.equal(data.removedDuplicatesCount, 1);
  assert.equal(data.removedTransactions.length, 1);

  // Vérification du format détaillé pour chaque doublon détecté
  const dup = data.removedTransactions[0];
  assert.equal(dup.date, "2026-11-01");
  assert.equal(dup.amount, -50.0);
  assert.equal(dup.merchant, "Zara");
  assert.equal(dup.source, "bank");

  // VÉRIFICATION CRITIQUE : Rien n'a été modifié en base/store
  const updatedStore = readStore();
  assert.equal(updatedStore[userId]?.transactions?.length, 2, "Aucune transaction ne doit être supprimée en mode simulation");
});

test("Nettoyage : Suppression réelle uniquement avec le paramètre explicite (dryRun: false / apply: true)", async () => {
  const userId = "test-user-cleanup-apply";
  const store = readStore();

  store[userId] = createTestPayload([
    {
      id: "bourso_2026-11-01_-50.00_zara_1",
      date: "2026-11-01",
      month: "2026-11",
      name: "Zara",
      amount: -50.0,
      type: "Shopping & Mode",
      source: "csv",
      updatedAt: "2026-11-01T10:00:00.000Z",
    },
    {
      id: "eb_2026-11-01_-50.00_zara_1",
      date: "2026-11-01",
      month: "2026-11",
      name: "Zara",
      amount: -50.0,
      type: "Shopping & Mode",
      source: "bank",
      updatedAt: "2026-11-06T10:00:00.000Z",
    },
  ]);
  writeStore(store);

  // Appel avec dryRun: false explicite
  const req = new NextRequest("http://localhost:3000/api/bank/cleanup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-krona-user-id": userId,
    },
    body: JSON.stringify({ dryRun: false }),
  });

  const res = await handleCleanupPost(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.equal(data.dryRun, false);
  assert.equal(data.applied, true);
  assert.equal(data.transactionsBefore, 2);
  assert.equal(data.transactionsAfter, 1);
  assert.equal(data.removedDuplicatesCount, 1);

  // VÉRIFICATION : La suppression a bien été enregistrée
  const updatedStore = readStore();
  assert.equal(updatedStore[userId]?.transactions?.length, 1);
  // La transaction CSV (la plus ancienne) est conservée
  assert.equal(updatedStore[userId]?.transactions?.[0].id, "bourso_2026-11-01_-50.00_zara_1");
});

test("Recatégorisation : Mode simulation (dryRun: true par défaut) sans modification des données", async () => {
  const userId = "test-user-recat-dryrun";
  const store = readStore();

  store[userId] = normalizeUserFinancialPayload({
    transactions: [
      {
        id: "eb_tx_picard",
        date: "2026-11-02",
        month: "2026-11",
        name: "Picard Surgeles",
        rawName: "CARTE 02/11 PICARD SURGELES CB*1234",
        amount: -35.2,
        type: "Autre",
        source: "bank",
      },
    ],
  });
  writeStore(store);

  // Appel GET ou POST sans paramètre explicite : dryRun par défaut
  const req = new NextRequest(`http://localhost:3000/api/bank/recategorize?userId=${userId}`, {
    method: "GET",
    headers: { "x-krona-user-id": userId },
  });

  const res = await handleRecatGet(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.equal(data.dryRun, true);
  assert.equal(data.applied, false);
  assert.equal(data.recategorizedCount, 1);
  assert.equal(data.operations.length, 1);
  assert.equal(data.operations[0].previousCategory, "Autre");
  assert.equal(data.operations[0].predictedCategory, "Alimentation & Courses");

  // VÉRIFICATION : Aucune modification écrite dans le store
  const updatedStore = readStore();
  assert.equal(
    updatedStore[userId]?.transactions?.[0].type,
    "Autre",
    "La catégorie en base doit rester 'Autre' en mode simulation"
  );
});

test("Recatégorisation : Modification réelle uniquement avec le paramètre explicite (dryRun: false / apply: true)", async () => {
  const userId = "test-user-recat-apply";
  const store = readStore();

  store[userId] = normalizeUserFinancialPayload({
    transactions: [
      {
        id: "eb_tx_picard_apply",
        date: "2026-11-02",
        month: "2026-11",
        name: "Picard Surgeles",
        rawName: "CARTE 02/11 PICARD SURGELES CB*1234",
        amount: -35.2,
        type: "Autre",
        source: "bank",
      },
    ],
  });
  writeStore(store);

  // Appel POST avec dryRun: false explicite
  const req = new NextRequest("http://localhost:3000/api/bank/recategorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-krona-user-id": userId,
    },
    body: JSON.stringify({ dryRun: false }),
  });

  const res = await handleRecatPost(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.equal(data.dryRun, false);
  assert.equal(data.applied, true);
  assert.equal(data.recategorizedCount, 1);

  // VÉRIFICATION : La catégorie est mise à jour de façon effective
  const updatedStore = readStore();
  assert.equal(
    updatedStore[userId]?.transactions?.[0].type,
    "Alimentation & Courses",
    "La catégorie doit être mise à jour en mode réel"
  );
  assert.ok(
    updatedStore[userId]?.learningRules?.["Picard Surgeles"] !== undefined,
    "La règle d'apprentissage doit être mémorisée"
  );
});
