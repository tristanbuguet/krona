import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  cleanOpenBankingMerchantLabel,
  fetchTransactions,
  normalizeEnableBankingTransactions,
  EnableBankingError,
  isSessionExpiredError,
  authorizeOrGetSession,
  mapCashAccountType,
  type EnableBankingTransaction,
} from '../src/lib/enableBanking';
import { executeBankIngestionPipeline, buildDeduplicationSignature } from '../src/lib/bankPipeline';
import type { Transaction } from '../src/lib/types';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

async function withMockFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const origFetch = globalThis.fetch;
  const origKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  process.env.ENABLE_BANKING_PRIVATE_KEY = KEY;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    else process.env.ENABLE_BANKING_PRIVATE_KEY = origKey;
  }
}

test('Nettoyage : scories de terminaux supprimées', () => {
  assert.equal(cleanOpenBankingMerchantLabel('Ebay 0*04-15396-3', true), 'eBay');
  assert.equal(cleanOpenBankingMerchantLabel('EBAY O*04-15396-3', true), 'eBay');
  assert.equal(cleanOpenBankingMerchantLabel('Bolt.eu/o/2611010', true), 'Bolt');
  assert.equal(cleanOpenBankingMerchantLabel('SNP*MLG EVENTS', true), 'MLG Events');
  assert.equal(cleanOpenBankingMerchantLabel('CARTE 12/10/26 AMAZON PAYMENTS CB*1234', true), 'Amazon');
  assert.equal(cleanOpenBankingMerchantLabel('PAYPAL *EBAY', true), 'eBay');
  assert.equal(cleanOpenBankingMerchantLabel('Picard', true), 'Picard');
  // Idempotence
  const once = cleanOpenBankingMerchantLabel('Snp*mlg Events', true);
  assert.equal(cleanOpenBankingMerchantLabel(once, true), once);
});

test('Signature : variantes d’intitulé du même débit eBay identiques', () => {
  assert.equal(
    buildDeduplicationSignature('2026-11-03', -360, 'Ebay 0*04-15396-3'),
    buildDeduplicationSignature('2026-11-03', -360, 'eBay')
  );
  // Le sens du flux fait partie de la signature
  assert.notEqual(
    buildDeduplicationSignature('2026-11-03', -360, 'eBay'),
    buildDeduplicationSignature('2026-11-03', 360, 'eBay')
  );
});

test('fetchTransactions : date_from = 89 jours et pagination complète', async () => {
  const urls: string[] = [];
  let call = 0;
  await withMockFetch(
    (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      call++;
      return new Response(
        JSON.stringify({
          transactions: [{ status: 'BOOK', booking_date: '2026-09-01', transaction_amount: { amount: '1', currency: 'EUR' } }],
          ...(call < 15 ? { continuation_key: `k${call}` } : {}),
        }),
        { status: 200 }
      );
    }) as typeof fetch,
    async () => {
      const txs = await fetchTransactions('s', 'acc', { now: new Date('2026-11-06T10:00:00Z') });
      assert.equal(txs.length, 15, 'plus de 10 pages doivent être lues');
    }
  );
  assert.match(urls[0], /date_from=2026-08-09/);
});

test('fetchTransactions : retry sur 503 puis succès', async () => {
  let call = 0;
  await withMockFetch(
    (async () => {
      call++;
      if (call === 1) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({ transactions: [] }), { status: 200 });
    }) as typeof fetch,
    async () => {
      assert.deepEqual(await fetchTransactions('s', 'acc'), []);
    }
  );
  assert.equal(call, 2);
});

test('Erreurs : 401 = session expirée (sans retry), 500 = transitoire', async () => {
  let call = 0;
  await withMockFetch(
    (async () => {
      call++;
      return new Response(JSON.stringify({ message: 'Session expired' }), { status: 401 });
    }) as typeof fetch,
    async () => {
      await assert.rejects(fetchTransactions('s', 'acc'), (e: unknown) => isSessionExpiredError(e));
    }
  );
  assert.equal(call, 1);
  assert.equal(new EnableBankingError('x', 500).isSessionExpired, false);
  assert.equal(new EnableBankingError('x', 500).isTransient, true);
});

test('GET /sessions : statut EXPIRED détecté', async () => {
  await withMockFetch(
    (async () => new Response(JSON.stringify({ status: 'EXPIRED', accounts: ['a1'] }), { status: 200 })) as typeof fetch,
    async () => {
      await assert.rejects(authorizeOrGetSession('sid', false), (e: unknown) => isSessionExpiredError(e));
    }
  );
});

test('IDs déterministes : indépendants des entry_reference éphémères', () => {
  const base: EnableBankingTransaction = {
    status: 'BOOK',
    booking_date: '2026-11-03',
    credit_debit_indicator: 'DBIT',
    transaction_amount: { amount: '360.00', currency: 'EUR' },
    remittance_information: ['EBAY 0*04-15396-3'],
  };
  const a = normalizeEnableBankingTransactions([{ ...base, entry_reference: 'ref-A' }], 'BoursoBank', 'acc1');
  const b = normalizeEnableBankingTransactions([{ ...base, entry_reference: 'ref-B' }], 'BoursoBank', 'acc1');
  assert.equal(a[0].id, b[0].id);
  assert.equal(a[0].label, 'eBay');
  assert.equal(a[0].bankAccountUid, 'acc1');
});

const mkTx = (over: Partial<Transaction>): Transaction => ({
  id: 'x',
  name: 'eBay',
  type: 'Shopping & Mode',
  amount: -360,
  date: '2026-11-03',
  month: '2026-11',
  source: 'bank',
  ...over,
});

test('Pipeline : purge des doublons historiques, conserve les achats identiques légitimes', async () => {
  const existing: Transaction[] = [
    mkTx({ id: 'eb_old_ref1', name: 'Ebay 0*04-15396-3', rawName: 'EBAY 0*04-15396-3' }),
    mkTx({ id: 'eb_old_ref2', name: 'eBay', rawName: 'EBAY' }),
    // Deux cafés identiques le même jour : légitimes car renvoyés deux fois par la banque
    mkTx({ id: 'eb_c1', name: 'Cafe Kitsune', amount: -3.5, type: 'Restos & Fast-Food' }),
    mkTx({ id: 'eb_c2', name: 'Cafe Kitsune', amount: -3.5, type: 'Restos & Fast-Food' }),
    // Hors fenêtre d'extraction : jamais touché
    mkTx({ id: 'eb_aug1', date: '2026-07-01', month: '2026-07', name: 'Lidl', amount: -10 }),
    mkTx({ id: 'eb_aug2', date: '2026-07-01', month: '2026-07', name: 'Lidl', amount: -10 }),
  ];
  const raw = [
    { id: 'eb_new_ebay', date: '2026-11-03', month: '2026-11', label: 'eBay', rawLabel: 'EBAY 0*04-15396-3', amount: -360, source: 'bank' as const },
    { id: 'eb_new_c1', date: '2026-11-03', month: '2026-11', label: 'Cafe Kitsune', amount: -3.5, source: 'bank' as const },
    { id: 'eb_new_c2', date: '2026-11-03', month: '2026-11', label: 'Cafe Kitsune', amount: -3.5, source: 'bank' as const },
  ];
  const res = await executeBankIngestionPipeline({
    rawTransactions: raw,
    existingTransactions: existing,
    enableSandboxFallback: false,
    skipAiEnrichment: true,
    historyStartDate: '2026-08-09',
  });
  const all = res.allMergedTransactions;
  assert.equal(all.filter((t) => t.amount === -360).length, 1);
  assert.equal(all.filter((t) => t.amount === -3.5).length, 2);
  assert.equal(all.filter((t) => t.amount === -10).length, 2);
  assert.equal(res.removedDuplicatesCount, 1);
  assert.equal(res.addedCount, 0);
});

test('Multi-comptes : virement courant -> livret marqué interne', async () => {
  const res = await executeBankIngestionPipeline({
    rawTransactions: [
      { id: 'eb_a_1', date: '2026-11-02', month: '2026-11', label: 'Virement Livret A', amount: -200, source: 'bank', bankAccountUid: 'cur' },
      { id: 'eb_b_1', date: '2026-11-02', month: '2026-11', label: 'Virement Compte Courant', amount: 200, source: 'bank', bankAccountUid: 'liv' },
    ],
    enableSandboxFallback: false,
    skipAiEnrichment: true,
  });
  assert.ok(res.allMergedTransactions.every((t) => t.isInternalTransfer && t.excludeFromSpending));
  assert.equal(mapCashAccountType('SVGS'), "Livret d'épargne");
  assert.equal(mapCashAccountType('CACC', 'Compte de dépôt'), 'Compte courant');
});

