import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  cleanOpenBankingMerchantLabel,
  fetchTransactions,
  normalizeEnableBankingTransactions,
  deduplicateCrossAccountBankTransactions,
  EnableBankingError,
  isSessionExpiredError,
  authorizeOrGetSession,
  mapCashAccountType,
  type EnableBankingTransaction,
} from '../src/lib/enableBanking';
import {
  executeBankIngestionPipeline,
  buildDeduplicationSignature,
  sanitizeAndDeduplicateTransactions,
} from '../src/lib/bankPipeline';
import { mergeCloudAndLocalData } from '../src/lib/cloudSync';
import { POST as handleCategorizePost } from '../src/app/api/categorize/route';
import { NextRequest } from 'next/server';
import type { Transaction, BankSessionInfo } from '../src/lib/types';

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

test('deduplicateCrossAccountBankTransactions : élimine les opérations ombres du compte carte BoursoBank', () => {
  const accountsMeta = [
    { uid: 'acc-courant', cashAccountType: 'CACC', name: 'Compte de dépôt' },
    { uid: 'acc-carte', cashAccountType: 'CARD', name: 'Carte Bancaire Visa Premier' },
  ];

  const rawList = [
    {
      id: 'tx_cacc_uber',
      date: '2026-11-04',
      month: '2026-11',
      label: 'Uber *Trip Amsterdam',
      amount: -24.5,
      source: 'bank' as const,
      bankAccountUid: 'acc-courant',
    },
    {
      id: 'tx_card_uber',
      date: '2026-11-04',
      month: '2026-11',
      label: 'Uber *Trip Amsterdam',
      amount: -24.5,
      source: 'bank' as const,
      bankAccountUid: 'acc-carte',
    },
    {
      id: 'tx_card_unique',
      date: '2026-11-05',
      month: '2026-11',
      label: 'Fnac Paris',
      amount: -15.99,
      source: 'bank' as const,
      bankAccountUid: 'acc-carte',
    },
  ];

  const deduplicated = deduplicateCrossAccountBankTransactions(rawList, accountsMeta);
  // Uber doit être présent 1 seule fois (conservant le compte courant)
  assert.equal(deduplicated.filter((t) => t.amount === -24.5).length, 1);
  assert.equal(deduplicated.find((t) => t.amount === -24.5)?.bankAccountUid, 'acc-courant');
  // L'opération unique Fnac sur carte doit être conservée
  assert.equal(deduplicated.filter((t) => t.amount === -15.99).length, 1);
  assert.equal(deduplicated.length, 2);
});

test('sanitizeAndDeduplicateTransactions : fusionne les triplons de Bouygues Telecom, Uber One et Basic Fit', () => {
  const triplicates: Transaction[] = [
    // Bouygues Telecom en triple (ex: ancien ID eb_..., nouvel ID compte courant, doublon carte)
    mkTx({ id: 'eb_bouygues_1', name: 'Bouygues Telecom', amount: -29.99, date: '2026-11-01', month: '2026-11', type: 'Abonnements & Multimédia' }),
    mkTx({ id: 'eb_bourso_cacc_bouygues', name: 'BOUYGUES TELECOM SC 01', amount: -29.99, date: '2026-11-01', month: '2026-11', type: 'Autre' }),
    mkTx({ id: 'eb_bourso_card_bouygues', name: 'Bouygues Telecom', amount: -29.99, date: '2026-11-01', month: '2026-11', type: 'Abonnements & Multimédia' }),

    // Uber One en double
    mkTx({ id: 'eb_uber_one_a', name: 'Uber One', amount: -5.99, date: '2026-11-02', month: '2026-11', type: 'Abonnements & Multimédia' }),
    mkTx({ id: 'eb_uber_one_b', name: 'UBER * ONE SUBSCRIPTION', amount: -5.99, date: '2026-11-02', month: '2026-11', type: 'Autre' }),

    // Basic Fit en double
    mkTx({ id: 'eb_basic_fit_1', name: 'Basic Fit', amount: -29.99, date: '2026-11-03', month: '2026-11', type: 'Santé & Bien-être' }),
    mkTx({ id: 'eb_basic_fit_2', name: 'BASIC FIT II', amount: -29.99, date: '2026-11-03', month: '2026-11', type: 'Autre' }),

    // Achats distincts légitimes conservés
    mkTx({ id: 'eb_cafe_1', name: 'Cafe Kitsune', amount: -3.5, date: '2026-11-04', month: '2026-11' }),
    mkTx({ id: 'eb_cafe_2', name: 'Cafe Kitsune', amount: -3.5, date: '2026-11-04', month: '2026-11' }),
  ];

  const sanitized = sanitizeAndDeduplicateTransactions(triplicates);

  // Bouygues Telecom ramené à 1 seul avec catégorie conservée
  const bouygues = sanitized.filter((t) => t.amount === -29.99 && t.date === '2026-11-01');
  assert.equal(bouygues.length, 1);
  assert.equal(bouygues[0].type, 'Abonnements & Multimédia');

  // Uber One ramené à 1
  const uberOne = sanitized.filter((t) => t.amount === -5.99 && t.date === '2026-11-02');
  assert.equal(uberOne.length, 1);
  assert.equal(uberOne[0].type, 'Abonnements & Multimédia');

  // Basic Fit ramené à 1
  const basicFit = sanitized.filter((t) => t.amount === -29.99 && t.date === '2026-11-03');
  assert.equal(basicFit.length, 1);
  assert.equal(basicFit[0].type, 'Santé & Bien-être');

  // Les deux cafés distincts sont préservés
  const cafes = sanitized.filter((t) => t.amount === -3.5 && t.date === '2026-11-04');
  assert.equal(cafes.length, 2);
});

test('mergeCloudAndLocalData : préserve cloud.bankSession lors d’une connexion sur nouvel appareil vierge', () => {
  const cloudBankSession: BankSessionInfo = {
    sessionId: 'session-xyz',
    aspspName: 'BoursoBank',
    aspspCountry: 'FR',
    connectedAt: '2026-10-01T10:00:00Z',
    accounts: [{ uid: 'acc-1', name: 'Compte Courant', cashAccountType: 'CACC' }],
    refreshTimestamps: ['2026-11-06T08:00:00Z', '2026-11-06T10:00:00Z'],
    refreshQuota: {
      limit: 4,
      used: 2,
      remaining: 2,
      timestamps: ['2026-11-06T08:00:00Z', '2026-11-06T10:00:00Z'],
      resetAt: null,
    },
  };

  const cloudData = {
    transactions: [mkTx({ id: 'eb_tx1' })],
    bankSession: cloudBankSession,
    accounts: [],
    settings: {
      monthlyCap: 1500,
      monthlyLimitConfig: { type: 'amount' as const, value: 1500 },
      incomeSettings: {
        salary: 2500,
        aids: 0,
        otherIncome: 0,
        monthlyTotal: 2500,
        incomes: [],
        autoApply: true,
      },
      categoryBudgets: {},
    },
    learningRules: {},
  };

  // Nouvel appareil vierge : pas de session locale (null)
  const localData = {
    transactions: [],
    bankSession: null,
  };

  const merged = mergeCloudAndLocalData(cloudData, localData);
  assert.ok(merged.bankSession !== null);
  assert.equal(merged.bankSession?.sessionId, 'session-xyz');
  assert.equal(merged.bankSession?.aspspName, 'BoursoBank');
  assert.equal(merged.bankSession?.refreshQuota?.used, 2);
});

test('/api/categorize : fallback gracieux en 200 même si Gemini échoue ou timeout', async () => {
  const request = new NextRequest('http://localhost:3000/api/categorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        { id: '1', label: 'MONOPRIX NATION' },
        { id: '2', label: 'UBER TRIP' },
      ],
    }),
  });

  const response = await handleCategorizePost(request);
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.ok(Array.isArray(json.results));
  assert.equal(json.results.length, 2);
  // Monoprix catégorisé en Alimentation & Courses par le fallback
  const monoprix = json.results.find((r: { id: string; category: string }) => r.id === '1');
  assert.equal(monoprix?.category, 'Alimentation & Courses');
});


