import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  cleanDatabaseDuplicates,
  diagnoseBankDuplicates,
  sanitizeAndDeduplicateTransactions,
  deduplicateBeforeInsertion,
} from '../src/lib/bankDeduplication';
import { Transaction } from '../src/lib/types';
import { POST as handleSyncPost } from '../src/app/api/sync/route';
import { UserFinancialPayload, normalizeUserFinancialPayload } from '../src/lib/cloudSync';

const mkTx = (over: Partial<Transaction>): Transaction => ({
  id: 'tx_default',
  name: 'Commerçant',
  type: 'Autre',
  amount: -10,
  date: '2026-11-01',
  month: '2026-11',
  source: 'bank',
  ...over,
});

test('Nettoyage doublons : trois copies provenant de trois lots donnent une seule gardée', () => {
  // 1 signature identique présente 1 fois dans 3 lots de synchronisation distincts
  const copyBatch1: Transaction = mkTx({
    id: 'eb_2026-11-01_-42.50_monoprix_1',
    date: '2026-11-01',
    month: '2026-11',
    name: 'Monoprix',
    rawName: 'MONOPRIX PARIS 11',
    amount: -42.5,
    type: 'Alimentation & Courses',
    source: 'bank',
    bankAccountUid: 'acc_courant_123',
    account: 'Compte courant',
    bankTransactionId: 'eb_tx_unique_001',
    importBatchId: 'bank_sync_2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  });

  const copyBatch2: Transaction = mkTx({
    id: 'eb_2026-11-01_-42.50_monoprix_2',
    date: '2026-11-01',
    month: '2026-11',
    name: 'Monoprix',
    rawName: 'MONOPRIX PARIS 11 CB*1234',
    amount: -42.5,
    type: 'Alimentation & Courses',
    source: 'bank',
    bankAccountUid: 'acc_courant_123',
    account: 'Compte courant',
    bankTransactionId: 'eb_tx_unique_002',
    importBatchId: 'bank_sync_2026-11-02T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
  });

  const copyBatch3: Transaction = mkTx({
    id: 'eb_2026-11-01_-42.50_monoprix_3',
    date: '2026-11-01',
    month: '2026-11',
    name: 'Monoprix',
    rawName: 'CARTE 01/11/26 MONOPRIX PARIS',
    amount: -42.5,
    type: 'Alimentation & Courses',
    source: 'bank',
    bankAccountUid: 'acc_courant_123',
    account: 'Compte courant',
    bankTransactionId: 'eb_tx_unique_003',
    importBatchId: 'bank_sync_2026-11-03T10:00:00Z',
    updatedAt: '2026-11-03T10:00:00Z',
  });

  const triplicates = [copyBatch1, copyBatch2, copyBatch3];

  const result = cleanDatabaseDuplicates(triplicates, { apply: true });

  // Exactement 1 exemplaire conservé (lot max = 1, 3 lots de 1 exemplaire)
  assert.equal(result.cleanedTransactions.length, 1);
  assert.equal(result.removedDuplicatesCount, 2);
  assert.equal(result.removedTransactions.length, 2);

  // Le plus ancien (copyBatch1 du 1er novembre) est conservé
  assert.equal(result.cleanedTransactions[0].id, copyBatch1.id);
  assert.equal(result.cleanedTransactions[0].importBatchId, copyBatch1.importBatchId);
});

test('Nettoyage doublons : trois copies avec 1 CSV et 2 Bank conservent l’opération CSV', () => {
  const csvTx: Transaction = mkTx({
    id: 'bourso_2026-11-01_-30.00_restaurant_1',
    date: '2026-11-01',
    month: '2026-11',
    name: 'Le Bouillon Chartier',
    amount: -30.0,
    type: 'Restos & Fast-Food',
    source: 'csv',
    account: 'BoursoBank',
    importBatchId: 'csv_import_initial',
    updatedAt: '2026-11-01T08:00:00Z',
  });

  const bankTx1: Transaction = mkTx({
    id: 'eb_2026-11-01_-30.00_restaurant_1',
    date: '2026-11-01',
    month: '2026-11',
    name: 'Le Bouillon Chartier',
    amount: -30.0,
    type: 'Restos & Fast-Food',
    source: 'bank',
    bankAccountUid: 'acc_cacc_1',
    bankTransactionId: 'eb_tx_rest_1',
    importBatchId: 'bank_sync_1',
    updatedAt: '2026-11-02T10:00:00Z',
  });

  const bankTx2: Transaction = mkTx({
    id: 'eb_2026-11-01_-30.00_restaurant_2',
    date: '2026-11-01',
    month: '2026-11',
    name: 'Le Bouillon Chartier',
    amount: -30.0,
    type: 'Restos & Fast-Food',
    source: 'bank',
    bankAccountUid: 'acc_cacc_1',
    bankTransactionId: 'eb_tx_rest_2',
    importBatchId: 'bank_sync_2',
    updatedAt: '2026-11-03T10:00:00Z',
  });

  const result = cleanDatabaseDuplicates([bankTx1, csvTx, bankTx2], { apply: true });

  assert.equal(result.cleanedTransactions.length, 1);
  assert.equal(result.removedDuplicatesCount, 2);
  // Priorité CSV respectée
  assert.equal(result.cleanedTransactions[0].id, csvTx.id);
  assert.equal(result.cleanedTransactions[0].source, 'csv');
});

test('Nettoyage doublons : deux achats identiques dans un même lot restent deux', () => {
  // Deux achats réels identiques le même jour dans la même synchronisation (ex. deux cafés Starbucks)
  const coffee1: Transaction = mkTx({
    id: 'eb_2026-11-02_-4.50_starbucks_1',
    date: '2026-11-02',
    month: '2026-11',
    name: 'Starbucks',
    rawName: 'STARBUCKS OPERA 1',
    amount: -4.5,
    type: 'Restos & Fast-Food',
    source: 'bank',
    bankAccountUid: 'acc_courant_123',
    account: 'Compte courant',
    bankTransactionId: 'eb_sbux_001',
    importBatchId: 'bank_sync_2026-11-02T18:00:00Z',
    updatedAt: '2026-11-02T18:00:00Z',
  });

  const coffee2: Transaction = mkTx({
    id: 'eb_2026-11-02_-4.50_starbucks_2',
    date: '2026-11-02',
    month: '2026-11',
    name: 'Starbucks',
    rawName: 'STARBUCKS OPERA 2',
    amount: -4.5,
    type: 'Restos & Fast-Food',
    source: 'bank',
    bankAccountUid: 'acc_courant_123',
    account: 'Compte courant',
    bankTransactionId: 'eb_sbux_002',
    importBatchId: 'bank_sync_2026-11-02T18:00:00Z',
    updatedAt: '2026-11-02T18:00:00Z',
  });

  const legitimateDoubles = [coffee1, coffee2];

  const result = cleanDatabaseDuplicates(legitimateDoubles, { apply: true });

  // Les deux achats d'un même lot sont strictement conservés
  assert.equal(result.cleanedTransactions.length, 2);
  assert.equal(result.removedDuplicatesCount, 0);
  assert.equal(result.removedTransactions.length, 0);

  const ids = result.cleanedTransactions.map((t) => t.id);
  assert.ok(ids.includes(coffee1.id));
  assert.ok(ids.includes(coffee2.id));
});

test('Nettoyage doublons : deux achats identiques répétés dans un 2e lot donnent 2 conservés au total', () => {
  // Lot 1 : 2 vrais achats
  const lot1_tx1: Transaction = mkTx({
    id: 'eb_2026-11-02_-4.50_starbucks_1',
    date: '2026-11-02',
    month: '2026-11',
    name: 'Starbucks',
    amount: -4.5,
    source: 'bank',
    importBatchId: 'lot_1',
    updatedAt: '2026-11-02T10:00:00Z',
  });
  const lot1_tx2: Transaction = mkTx({
    id: 'eb_2026-11-02_-4.50_starbucks_2',
    date: '2026-11-02',
    month: '2026-11',
    name: 'Starbucks',
    amount: -4.5,
    source: 'bank',
    importBatchId: 'lot_1',
    updatedAt: '2026-11-02T10:00:00Z',
  });

  // Lot 2 (sync réexécutée) : les mêmes 2 achats réinjectés
  const lot2_tx1: Transaction = mkTx({
    id: 'eb_2026-11-02_-4.50_starbucks_3',
    date: '2026-11-02',
    month: '2026-11',
    name: 'Starbucks',
    amount: -4.5,
    source: 'bank',
    importBatchId: 'lot_2',
    updatedAt: '2026-11-03T10:00:00Z',
  });
  const lot2_tx2: Transaction = mkTx({
    id: 'eb_2026-11-02_-4.50_starbucks_4',
    date: '2026-11-02',
    month: '2026-11',
    name: 'Starbucks',
    amount: -4.5,
    source: 'bank',
    importBatchId: 'lot_2',
    updatedAt: '2026-11-03T10:00:00Z',
  });

  // Total 4 opérations
  const allFour = [lot1_tx1, lot1_tx2, lot2_tx1, lot2_tx2];
  const result = cleanDatabaseDuplicates(allFour, { apply: true });

  // Max copies in a single lot = 2 (Lot 1 a 2, Lot 2 a 2).
  // Donc exactement 2 exemplaires sont conservés, les 2 exemplaires en surplus du lot 2 sont supprimés.
  assert.equal(result.cleanedTransactions.length, 2);
  assert.equal(result.removedDuplicatesCount, 2);
  assert.equal(result.cleanedTransactions[0].id, lot1_tx1.id);
  assert.equal(result.cleanedTransactions[1].id, lot1_tx2.id);
});

test('Diagnostic en lecture seule : affiche les exemplaires par signature et les comptes liés sans modifier les données', () => {
  const tx1: Transaction = mkTx({
    id: 'eb_tx_1',
    date: '2026-11-04',
    month: '2026-11',
    name: 'Fnac',
    amount: -59.99,
    source: 'bank',
    bankAccountUid: 'acc-courant-001',
    account: 'Compte courant',
    importBatchId: 'batch_alpha',
  });
  const tx2: Transaction = mkTx({
    id: 'eb_tx_2',
    date: '2026-11-04',
    month: '2026-11',
    name: 'Fnac',
    amount: -59.99,
    source: 'bank',
    bankAccountUid: 'acc-courant-001',
    account: 'Compte courant',
    importBatchId: 'batch_beta',
  });
  const tx3: Transaction = mkTx({
    id: 'eb_tx_3',
    date: '2026-11-04',
    month: '2026-11',
    name: 'Fnac',
    amount: -59.99,
    source: 'bank',
    bankAccountUid: 'acc-courant-001',
    account: 'Compte courant',
    importBatchId: 'batch_gamma',
  });

  const accountsMeta = [
    { uid: 'acc-courant-001', name: 'Compte courant', cashAccountType: 'CACC' },
    { uid: 'acc-livret-002', name: "Livret d'épargne", cashAccountType: 'SVGS' },
  ];

  const originalLength = [tx1, tx2, tx3].length;
  const report = diagnoseBankDuplicates([tx1, tx2, tx3], accountsMeta);

  // Vérifie les comptes liés
  assert.equal(report.linkedAccountsCount, 2);
  assert.deepEqual(report.linkedAccountNames, ['Compte courant', "Livret d'épargne"]);

  // Vérifie le diagnostic de doublons
  assert.equal(report.totalSignatures, 1);
  assert.equal(report.duplicateSignaturesCount, 1);
  assert.equal(report.totalDuplicatesCount, 2);

  const sigDiag = report.signatures[0];
  assert.equal(sigDiag.totalCopies, 3);
  assert.equal(sigDiag.lotsCount, 3);
  assert.equal(sigDiag.keptCopiesCount, 1);
  assert.equal(sigDiag.removedCopiesCount, 2);
  assert.equal(sigDiag.copies.length, 3);
  assert.equal(sigDiag.copies[0].lotId, 'batch_alpha');
  assert.equal(sigDiag.copies[0].bankAccountId, 'acc-courant-001');

  // N'écrit rien en base ni en mémoire : le tableau original n'est pas modifié
  assert.equal([tx1, tx2, tx3].length, originalLength);
});

test('Prévention : dédoublonne en priorité sur bankTransactionId / entryReference', () => {
  const existingTx: Transaction = mkTx({
    id: 'eb_existing_001',
    date: '2026-11-05',
    month: '2026-11',
    name: 'Uber Eats',
    amount: -22.5,
    source: 'bank',
    bankTransactionId: 'eb_entry_ref_xyz',
    entryReference: 'eb_entry_ref_xyz',
    account: 'Compte courant',
  });

  // Opération entrante avec le même entry_reference mais un libellé légèrement différent
  const incomingTx: Transaction = mkTx({
    id: 'eb_new_001',
    date: '2026-11-05',
    month: '2026-11',
    name: 'Uber Eats Paris',
    amount: -22.5,
    source: 'bank',
    bankTransactionId: 'eb_entry_ref_xyz',
    entryReference: 'eb_entry_ref_xyz',
    account: 'Compte courant',
  });

  const res = deduplicateBeforeInsertion([incomingTx], [existingTx]);

  // Détecté comme doublon prioritaire sur entryReference -> 0 nouvelle transaction
  assert.equal(res.newTransactions.length, 0);
  assert.equal(res.removedDuplicatesCount, 1);
  assert.equal(res.allMergedTransactions.length, 1);
  assert.equal(res.allMergedTransactions[0].id, 'eb_existing_001');
});

test('Cohérence du store : le store local ne réintroduit pas de doublons après nettoyage', async () => {
  const userId = `test-user-sync-reintroduction-${Date.now()}`;

  // 1. État propre dans le Cloud (issu d'un nettoyage ou d'une synchro propre à 15h00)
  const cleanCloudPayload: UserFinancialPayload = normalizeUserFinancialPayload({
    transactions: [
      mkTx({
        id: 'tx_clean_1',
        date: '2026-11-01',
        month: '2026-11',
        name: 'Monoprix',
        amount: -42.5,
        type: 'Alimentation & Courses',
        source: 'bank',
        importBatchId: 'clean_batch',
        updatedAt: '2026-11-06T15:00:00.000Z',
      }),
    ],
    updatedAt: '2026-11-06T15:00:00.000Z',
    lastUpdated: '2026-11-06T15:00:00.000Z',
  });

  // Enregistrer cet état propre sur le serveur
  const initReq = new NextRequest('http://localhost:3000/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      payload: cleanCloudPayload,
      mode: 'overwrite',
    }),
  });
  const initRes = await handleSyncPost(initReq);
  assert.equal(initRes.status, 200);

  // 2. Client tente d'envoyer un store local obsolète (horodaté à 12h00) contenant encore les 3 doublons
  const staleLocalPayload: UserFinancialPayload = normalizeUserFinancialPayload({
    transactions: [
      mkTx({
        id: 'tx_clean_1',
        date: '2026-11-01',
        month: '2026-11',
        name: 'Monoprix',
        amount: -42.5,
        type: 'Alimentation & Courses',
        source: 'bank',
        importBatchId: 'batch_1',
        updatedAt: '2026-11-06T12:00:00.000Z',
      }),
      mkTx({
        id: 'tx_stale_dup_2',
        date: '2026-11-01',
        month: '2026-11',
        name: 'Monoprix',
        amount: -42.5,
        type: 'Alimentation & Courses',
        source: 'bank',
        importBatchId: 'batch_2',
        updatedAt: '2026-11-06T12:00:00.000Z',
      }),
      mkTx({
        id: 'tx_stale_dup_3',
        date: '2026-11-01',
        month: '2026-11',
        name: 'Monoprix',
        amount: -42.5,
        type: 'Alimentation & Courses',
        source: 'bank',
        importBatchId: 'batch_3',
        updatedAt: '2026-11-06T12:00:00.000Z',
      }),
    ],
    updatedAt: '2026-11-06T12:00:00.000Z',
    lastUpdated: '2026-11-06T12:00:00.000Z',
  });

  const stalePushReq = new NextRequest('http://localhost:3000/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      payload: staleLocalPayload,
    }),
  });

  const stalePushRes = await handleSyncPost(stalePushReq);
  assert.equal(stalePushRes.status, 200);
  const responseJson = (await stalePushRes.json()) as { data: UserFinancialPayload };

  // Le serveur a refusé d'écraser la base propre avec la copie obsolète
  // et renvoie la version propre du cloud (1 seule transaction) pour mise à jour du store local
  assert.equal(responseJson.data.transactions.length, 1);
  assert.equal(responseJson.data.transactions[0].id, 'tx_clean_1');

  // 3. Même si un store sans horodatage ou avec un doublon forcé est synchronisé,
  // sanitizeAndDeduplicateTransactions s'assure qu'aucun doublon ne pénètre dans Neon
  const deduplicatedPayload = sanitizeAndDeduplicateTransactions(staleLocalPayload.transactions);
  assert.equal(deduplicatedPayload.length, 1);
  assert.equal(deduplicatedPayload[0].id, 'tx_clean_1');
});
