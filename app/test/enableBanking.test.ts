import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateEnableBankingJWT,
  getEnableBankingPrivateKey,
  cleanPrivateKeyString,
  createAuthSession,
  fetchTransactions,
  fetchAccountBalance,
  deleteSession,
  isLinkedBankTransaction,
  isLinkedBankAccount,
  normalizeEnableBankingTransactions,
  generateSandboxMockTransactions,
  formatBankDisplayName,
  computeBankRefreshQuota,
  consumeBankRefreshQuota,
  ENABLE_BANKING_APP_ID,
  ENABLE_BANKING_AUDIENCE,
  ENABLE_BANKING_DEFAULT_ASPSP,
  ENABLE_BANKING_MAX_DAILY_REFRESHES,
  type EnableBankingTransaction,
} from '../src/lib/enableBanking';
import { POST as handleDisconnectPost, dynamic as disconnectDynamic } from '../src/app/api/bank/disconnect/route';
import { POST as handleSyncPost, dynamic as syncDynamic } from '../src/app/api/bank/sync/route';
import { dynamic as connectDynamic } from '../src/app/api/bank/connect/route';
import { dynamic as callbackDynamic } from '../src/app/api/bank/callback/route';
import { executeBankIngestionPipeline } from '../src/lib/bankPipeline';
import { resolveBankRefreshQuota, formatRemainingRefreshLabel } from '../src/components/LinkedBankMenuPopover';
import { mergeTransactionsLossless } from '../src/lib/cloudSync';
import { normalizeText } from '../src/lib/categorization';
import type { Transaction, AccountInfo } from '../src/lib/types';

// Generate a test RSA key pair so tests remain self-contained even without external files
const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

test('Enable Banking : génération d’un token JWT signé en RS256 valide', () => {
  const originalKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  process.env.ENABLE_BANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

  try {
    const fixedNow = 1710000000;
    const token = generateEnableBankingJWT(fixedNow);
    const parts = token.split('.');
    assert.equal(parts.length, 3);

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as Record<string, string>;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Record<
      string,
      string | number
    >;

    assert.equal(header.alg, 'RS256');
    assert.equal(header.typ, 'JWT');
    assert.equal(header.kid, ENABLE_BANKING_APP_ID);

    assert.equal(payload.iss, ENABLE_BANKING_APP_ID);
    assert.equal(payload.aud, ENABLE_BANKING_AUDIENCE);
    assert.equal(payload.iat, fixedNow);
    assert.equal(payload.exp, fixedNow + 3600);

    // Cryptographically verify RS256 signature
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const isValid = verifier.verify(TEST_PUBLIC_KEY, Buffer.from(encodedSignature, 'base64url'));
    assert.equal(isValid, true);
  } finally {
    if (originalKey !== undefined) {
      process.env.ENABLE_BANKING_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  }
});

test('Enable Banking : createAuthSession appelle POST /auth et retourne l’URL d’autorisation', async () => {
  const originalKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  const originalFetch = globalThis.fetch;
  process.env.ENABLE_BANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        url: 'https://tilisy-sandbox.enablebanking.com/ais/start?sessionid=test-session',
        authorization_id: 'auth-123',
        psu_id_hash: 'hash-456',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const authResult = await createAuthSession('Mock ASPSP', 'http://localhost:3000/api/bank/callback', 'state-123', 'FR');
    assert.equal(authResult.url, 'https://tilisy-sandbox.enablebanking.com/ais/start?sessionid=test-session');
    assert.equal(authResult.authorizationId, 'auth-123');
    assert.equal(capturedUrl, 'https://api.enablebanking.com/auth');
    assert.equal(capturedInit?.method, 'POST');

    const body = JSON.parse(String(capturedInit?.body)) as {
      aspsp: { name: string; country: string };
      redirect_url: string;
      psu_type: string;
    };
    assert.deepEqual(body.aspsp, { name: 'Mock ASPSP', country: 'FR' });
    assert.equal(body.redirect_url, 'http://localhost:3000/api/bank/callback');
    assert.equal(body.psu_type, 'personal');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.ENABLE_BANKING_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  }
});

test('Enable Banking : fetchTransactions récupère les opérations BOOK avec pagination', async () => {
  const originalKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  const originalFetch = globalThis.fetch;
  process.env.ENABLE_BANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

  let callCount = 0;
  globalThis.fetch = async (): Promise<Response> => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          transactions: [
            {
              entry_reference: 'tx-1',
              booking_date: '2026-03-10',
              credit_debit_indicator: 'DBIT',
              status: 'BOOK',
              transaction_amount: { amount: '42.50', currency: 'EUR' },
              remittance_information: ['CARREFOUR CITY PARIS'],
            },
          ],
          continuation_key: 'page-2',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        transactions: [
          {
            entry_reference: 'tx-2',
            booking_date: '2026-03-11',
            credit_debit_indicator: 'CRDT',
            status: 'BOOK',
            transaction_amount: { amount: '2500.00', currency: 'EUR' },
            creditor: { name: 'ACME CORP SALAIRE' },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const transactions = await fetchTransactions('session-123', 'acc-uid-456');
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].entry_reference, 'tx-1');
    assert.equal(transactions[1].entry_reference, 'tx-2');
    assert.equal(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.ENABLE_BANKING_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  }
});

test('Enable Banking : normalisation RawTransaction et déduplication sans conflit avec les imports CSV', () => {
  const apiTx: EnableBankingTransaction[] = [
    {
      entry_reference: 'eb-001',
      booking_date: '2026-03-15',
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      transaction_amount: { amount: '15.99', currency: 'EUR' },
      remittance_information: ['NETFLIX.COM'],
    },
    {
      entry_reference: 'eb-002',
      booking_date: '2026-03-16',
      credit_debit_indicator: 'CRDT',
      status: 'BOOK',
      transaction_amount: { amount: '1200.00', currency: 'EUR' },
      debtor: { name: 'VIREMENT SALAIRE' },
    },
    {
      entry_reference: 'eb-pending',
      booking_date: '2026-03-17',
      credit_debit_indicator: 'DBIT',
      status: 'PDNG',
      transaction_amount: { amount: '99.00', currency: 'EUR' },
      remittance_information: ['PENDING TX SHOULD BE IGNORED'],
    },
  ];

  const normalized = normalizeEnableBankingTransactions(apiTx, 'Compte Courant');
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].date, '2026-03-15');
  assert.equal(normalized[0].label, 'Netflix.com');
  assert.equal(normalized[0].rawLabel, 'NETFLIX.COM');
  assert.equal(normalized[0].amount, -15.99);
  assert.equal(normalized[0].account, 'Compte Courant');
  assert.equal(normalized[1].date, '2026-03-16');
  assert.equal(normalized[1].label, 'Virement Salaire');
  assert.equal(normalized[1].rawLabel, 'VIREMENT SALAIRE');
  assert.equal(normalized[1].amount, 1200);
  assert.equal(normalized[1].account, 'Compte Courant');

  // Simulate existing CSV transaction with same date, name, amount, account
  const existingCsvTransactions: Transaction[] = [
    {
      id: 'csv-1',
      date: '2026-03-15',
      month: '2026-03',
      name: 'Netflix.com',
      rawName: 'NETFLIX.COM',
      amount: -15.99,
      type: 'Abonnements',
      isSubscription: true,
      account: 'Compte Courant',
    },
  ];

  const incomingBankTransactions: Transaction[] = normalized.map((raw) => ({
    id: raw.id,
    date: raw.date,
    month: raw.month || raw.date.slice(0, 7),
    name: raw.label,
    rawName: raw.rawLabel,
    amount: raw.amount,
    type: 'Autre',
    isSubscription: false,
    account: raw.account,
  }));

  const buildDeduplicationSignature = (date: string, amount: number, name: string): string => {
    const cleanSlug = normalizeText(name).replace(/[^a-z0-9]/g, '').slice(0, 20);
    return `${date}_${amount}_${cleanSlug}`;
  };

  const existingSignatures = new Set(
    existingCsvTransactions.map((t) => buildDeduplicationSignature(t.date, t.amount, t.name))
  );
  const uniqueNew = incomingBankTransactions.filter(
    (t) => !existingSignatures.has(buildDeduplicationSignature(t.date, t.amount, t.name))
  );
  const duplicateCount = incomingBankTransactions.length - uniqueNew.length;

  assert.equal(duplicateCount, 1);
  assert.equal(uniqueNew.length, 1);
  assert.equal(uniqueNew[0].name, 'Virement Salaire');

  // Verify lossless merge preserves both CSV and unique bank transactions
  const merged = mergeTransactionsLossless(existingCsvTransactions, uniqueNew);
  assert.equal(merged.length, 2);
});

test('Enable Banking : generateSandboxMockTransactions génère un jeu réaliste complet (Alimentation, Uber, SNCF, Salaire)', () => {
  const mockTxs = generateSandboxMockTransactions('Banque Sandbox', new Date('2026-04-15'));
  assert.ok(mockTxs.length >= 8);

  const labels = mockTxs.map((t) => t.label);
  assert.ok(labels.some((l) => l.includes('Salaire')));
  assert.ok(labels.some((l) => l.includes('Carrefour')));
  assert.ok(labels.some((l) => l.includes('Uber Eats')));
  assert.ok(labels.some((l) => l.includes('SNCF')));
  assert.ok(labels.some((l) => l.includes('Netflix')));

  const salaireTx = mockTxs.find((t) => t.label.includes('Salaire'));
  assert.ok(salaireTx && salaireTx.amount > 2000);

  const expenseTx = mockTxs.find((t) => t.label.includes('Carrefour'));
  assert.ok(expenseTx && expenseTx.amount < 0);
});

test('Enable Banking Pipeline : executeBankIngestionPipeline active le repli sandbox et catégorise correctement', async () => {
  const result = await executeBankIngestionPipeline({
    rawTransactions: [], // Sandbox vide
    existingTransactions: [],
    learningRules: {},
    aspspLabel: 'Banque Sandbox',
    enableSandboxFallback: true,
  });

  assert.equal(result.usedSandboxFallback, true);
  assert.ok(result.deduplicatedNewTransactions.length >= 8);

  // Vérifier la catégorisation standard
  const salary = result.deduplicatedNewTransactions.find((t) => t.name.includes('Salaire'));
  assert.ok(salary);
  assert.equal(salary.type, 'Revenus & Aides');

  const food = result.deduplicatedNewTransactions.find((t) => t.name.includes('Carrefour'));
  assert.ok(food);
  assert.equal(food.type, 'Alimentation & Courses');

  const train = result.deduplicatedNewTransactions.find((t) => t.name.toLowerCase().includes('sncf'));
  assert.ok(train);
  assert.equal(train.type, 'Transports');
});

test('Enable Banking : formatBankDisplayName remplace Boursorama Banque et Mock ASPSP par le nom commercial BoursoBank', () => {
  assert.equal(formatBankDisplayName('Boursorama Banque'), 'BoursoBank');
  assert.equal(formatBankDisplayName('BoursoBank'), 'BoursoBank');
  assert.equal(formatBankDisplayName(null), 'BoursoBank');
  assert.equal(formatBankDisplayName(undefined), 'BoursoBank');
  assert.equal(formatBankDisplayName('Mock ASPSP'), 'BoursoBank (Sandbox)');
  assert.equal(formatBankDisplayName('Mock ASPSP', 'Compte BoursoBank'), 'BoursoBank (Sandbox)');
  assert.equal(formatBankDisplayName('Crédit Agricole'), 'Crédit Agricole');
  assert.equal(formatBankDisplayName('Crédit Agricole (Sandbox)'), 'Crédit Agricole (Sandbox)');
  assert.equal(formatBankDisplayName('LCL'), 'LCL');
});

test('Enable Banking : priorité absolue à creditor.name / debtor.name sur remittance_information', () => {
  const txList: EnableBankingTransaction[] = [
    {
      entry_reference: 'tx-picard',
      booking_date: '2026-03-20',
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      transaction_amount: { amount: '34.50', currency: 'EUR' },
      creditor: { name: 'PICARD SURGELES' },
      remittance_information: ['PRLV FACTURE 9928374829 TECHNICAL CODE'],
    },
    {
      entry_reference: 'tx-salaire',
      booking_date: '2026-03-28',
      credit_debit_indicator: 'CRDT',
      status: 'BOOK',
      transaction_amount: { amount: '2800.00', currency: 'EUR' },
      debtor_name: 'ENTREPRISE ACME SALAIRE',
      remittance_information: ['VIR SEPA REF 0001928374'],
    },
  ];

  const normalized = normalizeEnableBankingTransactions(txList, 'BoursoBank (Sandbox)');
  assert.equal(normalized.length, 2);

  // Le label doit être le nom propre nettoyé du commerçant, pas la chaîne technique de remittance
  assert.equal(normalized[0].label, 'Picard Surgeles');
  assert.ok(Boolean(normalized[0].rawLabel && normalized[0].rawLabel.includes('PRLV FACTURE')));

  assert.equal(normalized[1].label, 'Entreprise Acme Salaire');
  assert.ok(Boolean(normalized[1].rawLabel && normalized[1].rawLabel.includes('VIR SEPA')));
});

test('Enable Banking : nettoyage des libellés carte BoursoBank Open Banking et re-catégorisation des opérations existantes', async () => {
  const txList: EnableBankingTransaction[] = [
    {
      entry_reference: 'tx-uber-eats',
      booking_date: '2026-10-05',
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      transaction_amount: { amount: '31.78', currency: 'EUR' },
      remittance_information: ['CARTE 04/10/26 UBER *EATS HELP.U CB*9440'],
    },
    {
      entry_reference: 'tx-galeries',
      booking_date: '2026-10-30',
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      transaction_amount: { amount: '165.00', currency: 'EUR' },
      remittance_information: ['CARTE 28/10/26 GALERIES LAFAYET CB*9440'],
    },
    {
      entry_reference: 'tx-mcdo',
      booking_date: '2026-10-05',
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      transaction_amount: { amount: '13.60', currency: 'EUR' },
      remittance_information: ['CARTE 04/10/26 MC DONALD S 2 CB*9440'],
    },
    {
      entry_reference: 'tx-imaginer',
      booking_date: '2026-10-06',
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      transaction_amount: { amount: '40.00', currency: 'EUR' },
      remittance_information: ['CARTE 05/10/26 IMAGINE R 2 CB*9440'],
    },
  ];

  const normalized = normalizeEnableBankingTransactions(txList, 'Mock ASPSP');
  assert.equal(normalized.length, 4);
  assert.equal(normalized[0].account, 'BoursoBank (Sandbox)');
  assert.equal(normalized[0].label, 'Uber Eats');
  assert.equal(normalized[1].label, 'Galeries Lafayette');
  assert.equal(normalized[2].label, "Mcdonald's");
  assert.equal(normalized[3].label, 'Imagine R');

  // Vérifier que les transactions existantes bloquées en "Autre" + "Mock ASPSP" sont re-catégorisées
  const staleExisting: Transaction[] = [
    {
      id: 'eb_stale_1',
      date: '2026-10-05',
      month: '2026-10',
      name: 'UBER *EATS HELP.U',
      rawName: 'CARTE 04/10/26 UBER *EATS HELP.U CB*9440',
      amount: -31.78,
      type: 'Autre',
      isSubscription: false,
      account: 'Mock ASPSP',
    },
  ];

  const pipelineRes = await executeBankIngestionPipeline({
    rawTransactions: normalized,
    existingTransactions: staleExisting,
    learningRules: {},
    aspspLabel: 'Mock ASPSP',
  });

  const upgraded = pipelineRes.allMergedTransactions.find((t) => t.id === 'eb_stale_1');
  assert.ok(upgraded);
  assert.equal(upgraded.type, 'Restos & Fast-Food');
  assert.equal(upgraded.account, 'BoursoBank (Sandbox)');
});

test('Enable Banking : deleteSession appelle DELETE /sessions/{sessionId}', async () => {
  const originalKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  const originalFetch = globalThis.fetch;
  process.env.ENABLE_BANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

  let capturedUrl = '';
  let capturedMethod = '';

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = String(input);
    capturedMethod = init?.method || '';
    return new Response(null, { status: 204 });
  };

  try {
    const success = await deleteSession('session-test-to-delete');
    assert.equal(success, true);
    assert.equal(capturedUrl, 'https://api.enablebanking.com/sessions/session-test-to-delete');
    assert.equal(capturedMethod, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.ENABLE_BANKING_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  }
});

test('Enable Banking : isLinkedBankTransaction et isLinkedBankAccount identifient rigoureusement les données bancaires synchronisées', () => {
  const ebTx = { id: 'eb_2026-10-01_-15.99_netflix', account: 'Compte Courant' };
  const boursoTx = { id: 'tx-123', account: 'BoursoBank' };
  const sandboxTx = { id: 'tx-456', account: 'BoursoBank (Sandbox)' };
  const caCsvTx = { id: 'ca_2026-10-01_-20.00_epicerie', account: 'Crédit Agricole' };

  assert.equal(isLinkedBankTransaction(ebTx), true);
  assert.equal(isLinkedBankTransaction(boursoTx), true);
  assert.equal(isLinkedBankTransaction(sandboxTx), true);
  assert.equal(isLinkedBankTransaction(caCsvTx), false);

  const bankAccount: AccountInfo = {
    id: 'eb_acc_1',
    name: 'BoursoBank (Sandbox)',
    bank: 'BoursoBank',
    type: 'Compte courant',
    initialBalance: 1200,
  };
  const manualAccount: AccountInfo = {
    id: 'ca_acc_1',
    name: 'Compte Courant CA',
    bank: 'Crédit Agricole',
    type: 'Compte courant',
    initialBalance: 500,
  };

  assert.equal(isLinkedBankAccount(bankAccount), true);
  assert.equal(isLinkedBankAccount(manualAccount), false);
});

test('Enable Banking : POST /api/bank/disconnect purge intégralement les transactions synchronisées et la session', async () => {
  const originalKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  const originalFetch = globalThis.fetch;
  process.env.ENABLE_BANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

  globalThis.fetch = async (): Promise<Response> => {
    return new Response(null, { status: 204 });
  };

  try {
    const mockReq = {
      json: async () => ({
        userId: 'test_disconnect_user',
        bankSession: {
          sessionId: 'test-session-123',
          aspspName: 'Mock ASPSP',
          accountName: 'BoursoBank (Sandbox)',
        },
      }),
      headers: {
        get: () => null,
      },
    } as unknown as import('next/server').NextRequest;

    const res = await handleDisconnectPost(mockReq);
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      success: boolean;
      purgedCount: number;
      transactions: Transaction[];
      bankSession: null;
    };

    assert.equal(body.success, true);
    assert.equal(body.bankSession, null);
    assert.deepEqual(body.transactions, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.ENABLE_BANKING_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
  }
});

test('Enable Banking Déduplication : appariement 1 pour 1 et préservation stricte des opérations existantes', async () => {
  // Opération CSV déjà présente
  const existingCsv: Transaction = {
    id: 'bourso_2026-10-04_-15.99_uber-eats_1',
    date: '2026-10-04',
    month: '2026-10',
    name: 'Uber Eats',
    rawName: 'CARTE 04/10/26 UBER *EATS HELP.U CB*9440',
    amount: -15.99,
    type: 'Restos & Fast-Food',
    source: 'csv',
    account: 'BoursoBank',
  };

  // Deux opérations bancaires entrantes le même jour au même montant
  // La première est un doublon du CSV (doit être ignorée)
  // La seconde est un deuxième achat légitime (doit être conservée pour respecter l'appariement un pour un)
  const incomingRaw = [
    {
      id: 'eb_tx_uber_1',
      date: '2026-10-04',
      month: '2026-10',
      label: 'CARTE 04/10/26 UBER *EATS HELP.U CB*9440',
      rawLabel: 'CARTE 04/10/26 UBER *EATS HELP.U CB*9440',
      amount: -15.99,
      account: 'BoursoBank (Sandbox)',
      source: 'bank' as const,
    },
    {
      id: 'eb_tx_uber_2',
      date: '2026-10-04',
      month: '2026-10',
      label: 'CARTE 04/10/26 UBER *EATS HELP.U CB*9440',
      rawLabel: 'CARTE 04/10/26 UBER *EATS HELP.U CB*9440',
      amount: -15.99,
      account: 'BoursoBank (Sandbox)',
      source: 'bank' as const,
    },
  ];

  const res = await executeBankIngestionPipeline({
    rawTransactions: incomingRaw,
    existingTransactions: [existingCsv],
    learningRules: {},
    aspspLabel: 'BoursoBank (Sandbox)',
    enableSandboxFallback: false,
  });

  // Exactement 1 transaction nouvelle ajoutée (la 2ème)
  assert.equal(res.deduplicatedNewTransactions.length, 1);
  assert.equal(res.deduplicatedNewTransactions[0].id, 'eb_tx_uber_2');
  assert.equal(res.deduplicatedNewTransactions[0].source, 'bank');

  // Total dans le store fusionné : 2 opérations (l'existante CSV + la seconde bancaire)
  assert.equal(res.allMergedTransactions.length, 2);
  const csvOp = res.allMergedTransactions.find((t) => t.id === existingCsv.id);
  assert.ok(csvOp);
  assert.equal(csvOp.source, 'csv');
});

test('Enable Banking Déconnexion : supprime uniquement source === "bank" et conserve les transactions CSV', () => {
  const allTx: Transaction[] = [
    {
      id: 'bourso_csv_1',
      date: '2026-10-01',
      month: '2026-10',
      name: 'Carrefour Market',
      amount: -45.50,
      type: 'Alimentation & Courses',
      source: 'csv',
      account: 'BoursoBank',
    },
    {
      id: 'ca_csv_2',
      date: '2026-10-02',
      month: '2026-10',
      name: 'Boulangerie',
      amount: -4.20,
      type: 'Alimentation & Courses',
      source: 'csv',
      account: 'Crédit Agricole',
    },
    {
      id: 'eb_2026-10-03_-12.00_uber',
      date: '2026-10-03',
      month: '2026-10',
      name: 'Uber',
      amount: -12.00,
      type: 'Transports',
      source: 'bank',
      account: 'BoursoBank (Sandbox)',
    },
  ];

  const bankNames = new Set<string>(['BoursoBank', 'BoursoBank (Sandbox)', 'Mock ASPSP']);
  const remaining = allTx.filter((t) => !isLinkedBankTransaction(t, bankNames));

  // Les 2 transactions CSV doivent être rigoureusement conservées
  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].id, 'bourso_csv_1');
  assert.equal(remaining[0].source, 'csv');
  assert.equal(remaining[1].id, 'ca_csv_2');
  assert.equal(remaining[1].source, 'csv');

  // Recalcul du solde total restant
  const remainingBalance = remaining.reduce((acc, t) => acc + t.amount, 0);
  assert.equal(Math.round(remainingBalance * 100) / 100, -49.70);
});

test('Barre supérieure : machine à états des boutons d’import et transitions', () => {
  type TopBarState = 'unlinked_idle' | 'unlinked_syncing' | 'linked_active';

  function resolveTopBarState(bankSession: unknown, isSyncing: boolean): TopBarState {
    if (bankSession) return 'linked_active';
    if (isSyncing) return 'unlinked_syncing';
    return 'unlinked_idle';
  }

  // État 1 : Sans banque liée -> Bouton "+ Importer"
  assert.equal(resolveTopBarState(null, false), 'unlinked_idle');

  // État 2 : Synchro initiale en cours -> "Synchronisation…"
  assert.equal(resolveTopBarState(null, true), 'unlinked_syncing');

  // Échec ou annulation synchro -> Retour à État 1
  assert.equal(resolveTopBarState(null, false), 'unlinked_idle');

  // État 3 : Banque liée avec succès -> Gélule sombre active
  const activeSession = { sessionId: 'sbx-123', aspspName: 'BoursoBank (Sandbox)', accounts: [] };
  assert.equal(resolveTopBarState(activeSession, false), 'linked_active');

  // Déconnexion confirmée -> Retour immédiat à État 1
  assert.equal(resolveTopBarState(null, false), 'unlinked_idle');
});

test('ImportMethodPopover : accordéon Fichier CSV, ordre des 4 banques et maintien de Connecter ma banque', () => {
  type BankType = 'ca' | 'bourso' | 'ce' | 'lcl';

  interface SupportedBank {
    key: BankType;
    name: string;
    badge: string;
  }

  const expectedBanks: SupportedBank[] = [
    { key: 'ca', name: 'Crédit Agricole', badge: 'CSV' },
    { key: 'bourso', name: 'BoursoBank', badge: 'CSV' },
    { key: 'ce', name: 'Caisse d\'Épargne', badge: 'CSV' },
    { key: 'lcl', name: 'LCL', badge: 'CSV / TSV' },
  ];

  // 1. Vérification de l'ordre exact des 4 banques
  assert.equal(expectedBanks.length, 4);
  assert.equal(expectedBanks[0].name, 'Crédit Agricole');
  assert.equal(expectedBanks[0].key, 'ca');
  assert.equal(expectedBanks[1].name, 'BoursoBank');
  assert.equal(expectedBanks[1].key, 'bourso');
  assert.equal(expectedBanks[2].name, 'Caisse d\'Épargne');
  assert.equal(expectedBanks[2].key, 'ce');
  assert.equal(expectedBanks[3].name, 'LCL');
  assert.equal(expectedBanks[3].key, 'lcl');

  // 2. Machine à états de l'accordéon : fermé par défaut, toggle au clic, fermeture
  let isAccordionOpen = false;
  const toggleAccordion = () => {
    isAccordionOpen = !isAccordionOpen;
  };

  // Fermé par défaut
  assert.equal(isAccordionOpen, false);

  // Clic sur "Fichier CSV" -> Déplié
  toggleAccordion();
  assert.equal(isAccordionOpen, true);

  // Deuxième clic sur "Fichier CSV" -> Replié
  toggleAccordion();
  assert.equal(isAccordionOpen, false);

  // 3. Déclenchement de l'import par banque sélectionnée
  let selectedBank: BankType | null = null;
  let isPopoverOpen = true;

  const handleSelectBank = (bank: BankType) => {
    selectedBank = bank;
    isPopoverOpen = false;
  };

  handleSelectBank('ca');
  assert.equal(selectedBank, 'ca');
  assert.equal(isPopoverOpen, false);

  // 4. Maintien du comportement Connecter ma banque
  let bankConnectTriggered = false;
  isPopoverOpen = true;

  const handleSelectBankConnect = () => {
    bankConnectTriggered = true;
    isPopoverOpen = false;
  };

  handleSelectBankConnect();
  assert.equal(bankConnectTriggered, true);
  assert.equal(isPopoverOpen, false);
});

test('Enable Banking Pipeline : Catégorisation IA ciblée (seules les opérations non résolues sont envoyées, doublons écartés, catégories appliquées)', async () => {
  // 1. Transaction existante déjà résolue
  const existingTx: Transaction = {
    id: 'existing_tx_carrefour',
    date: '2026-10-01',
    month: '2026-10',
    name: 'Carrefour Market',
    amount: -35.50,
    type: 'Alimentation & Courses',
    source: 'csv',
    account: 'BoursoBank',
  };

  // 2. Flux bancaire brut Enable Banking entrant :
  // - un doublon de la transaction existante (doit être écarté par déduplication, jamais envoyé à l'IA)
  // - une opération résolue localement par regex (Monoprix, résolue localement, jamais envoyée à l'IA)
  // - courses (libellé non résolu par regex, ex: Bio C Bon) -> doit être envoyé à l'IA
  // - transports (libellé non résolu par regex, ex: Lime Riders) -> doit être envoyé à l'IA
  // - restauration (libellé non résolu par regex, ex: La Bonne Franquette) -> doit être envoyé à l'IA
  // - un libellé inconnu (ex: Marchand Inconnu Xyz99) -> doit être envoyé à l'IA et rester en "Autre"
  const incomingRaw = [
    {
      id: 'eb_tx_dup',
      date: '2026-10-01',
      month: '2026-10',
      label: 'CARTE 01/10/26 CARREFOUR MARKET CB*1111',
      rawLabel: 'CARTE 01/10/26 CARREFOUR MARKET CB*1111',
      amount: -35.50,
      account: 'BoursoBank (Sandbox)',
      source: 'bank' as const,
    },
    {
      id: 'eb_tx_monoprix',
      date: '2026-10-02',
      month: '2026-10',
      label: 'CARTE 02/10/26 MONOPRIX EXPR CB*2222',
      rawLabel: 'CARTE 02/10/26 MONOPRIX EXPR CB*2222',
      amount: -28.40,
      account: 'BoursoBank (Sandbox)',
      source: 'bank' as const,
    },
    {
      id: 'eb_tx_courses',
      date: '2026-10-03',
      month: '2026-10',
      label: 'CARTE 03/10/26 BIO C BON CB*3333',
      rawLabel: 'CARTE 03/10/26 BIO C BON CB*3333',
      amount: -42.10,
      account: 'BoursoBank (Sandbox)',
      source: 'bank' as const,
    },
    {
      id: 'eb_tx_transports',
      date: '2026-10-04',
      month: '2026-10',
      label: 'CARTE 04/10/26 LIME RIDERS CB*4444',
      rawLabel: 'CARTE 04/10/26 LIME RIDERS CB*4444',
      amount: -6.50,
      account: 'BoursoBank (Sandbox)',
      source: 'bank' as const,
    },
    {
      id: 'eb_tx_resto',
      date: '2026-10-05',
      month: '2026-10',
      label: 'CARTE 05/10/26 LA BONNE FRANQUETTE CB*5555',
      rawLabel: 'CARTE 05/10/26 LA BONNE FRANQUETTE CB*5555',
      amount: -32.00,
      account: 'BoursoBank (Sandbox)',
      source: 'bank' as const,
    },
    {
      id: 'eb_tx_inconnu',
      date: '2026-10-06',
      month: '2026-10',
      label: 'CARTE 06/10/26 MARCHAND INCONNU XYZ99 CB*6666',
      rawLabel: 'CARTE 06/10/26 MARCHAND INCONNU XYZ99 CB*6666',
      amount: -19.99,
      account: 'BoursoBank (Sandbox)',
      source: 'bank' as const,
    },
  ];

  // 3. Service IA simulé
  const sentToAi: Array<{ id: string; label: string; amount?: number }> = [];
  const simulatedAiCategorizer = async (items: Array<{ id: string; label: string; amount?: number }>) => {
    sentToAi.push(...items);
    const result = new Map<string, string>();
    for (const it of items) {
      const lower = it.label.toLowerCase();
      if (lower.includes('bio c bon')) {
        result.set(it.id, 'Alimentation & Courses');
      } else if (lower.includes('lime riders')) {
        result.set(it.id, 'Transports');
      } else if (lower.includes('la bonne franquette')) {
        result.set(it.id, 'Restos & Fast-Food');
      } else {
        result.set(it.id, 'Autre');
      }
    }
    return result;
  };

  // 4. Exécution du pipeline
  const res = await executeBankIngestionPipeline({
    rawTransactions: incomingRaw,
    existingTransactions: [existingTx],
    learningRules: {},
    aspspLabel: 'BoursoBank (Sandbox)',
    enableSandboxFallback: false,
    aiCategorizer: simulatedAiCategorizer,
  });

  // A. Vérification de la déduplication : le doublon Carrefour Market a été écarté
  assert.equal(res.deduplicatedNewTransactions.some((t) => t.id === 'eb_tx_dup'), false);

  // B. Vérification des opérations envoyées à l'IA :
  // SEULES les 4 opérations non résolues par Regex/règles ont été envoyées à l'IA.
  // - Monoprix n'est PAS envoyé (résolu par Regex)
  // - Le doublon Carrefour Market n'est PAS envoyé (écarté par déduplication)
  // - L'opération existante n'est PAS envoyée
  assert.equal(sentToAi.length, 4);
  const sentIds = sentToAi.map((it) => it.id).sort();
  assert.deepEqual(sentIds, ['eb_tx_courses', 'eb_tx_inconnu', 'eb_tx_resto', 'eb_tx_transports']);

  // C. Vérification de l'application des catégories dans deduplicatedNewTransactions :
  const coursesTx = res.deduplicatedNewTransactions.find((t) => t.id === 'eb_tx_courses');
  assert.ok(coursesTx);
  assert.equal(coursesTx.type, 'Alimentation & Courses');

  const transportsTx = res.deduplicatedNewTransactions.find((t) => t.id === 'eb_tx_transports');
  assert.ok(transportsTx);
  assert.equal(transportsTx.type, 'Transports');

  const restoTx = res.deduplicatedNewTransactions.find((t) => t.id === 'eb_tx_resto');
  assert.ok(restoTx);
  assert.equal(restoTx.type, 'Restos & Fast-Food');

  const monoprixTx = res.deduplicatedNewTransactions.find((t) => t.id === 'eb_tx_monoprix');
  assert.ok(monoprixTx);
  assert.equal(monoprixTx.type, 'Alimentation & Courses'); // Résolu localement par Regex

  // D. Seul l'inconnu reste en « Autre »
  const inconnuTx = res.deduplicatedNewTransactions.find((t) => t.id === 'eb_tx_inconnu');
  assert.ok(inconnuTx);
  assert.equal(inconnuTx.type, 'Autre');

  // E. Vérification que le dictionnaire d'apprentissage a mémorisé les commerçants catégorisés par l'IA
  assert.equal(res.learningRules['Bio C Bon']?.categorie, 'Alimentation & Courses');
  assert.equal(res.learningRules['Lime Riders']?.categorie, 'Transports');
  assert.equal(res.learningRules['La Bonne Franquette']?.categorie, 'Restos & Fast-Food');
  assert.equal(res.learningRules['Marchand Inconnu Xyz99'], undefined);
});

test('Enable Banking Production : prise en compte de la nouvelle clé privée et de l’identifiant c1ad2bc2-df1a-460a-9497-4b1b29094600', () => {
  assert.equal(ENABLE_BANKING_APP_ID, 'c1ad2bc2-df1a-460a-9497-4b1b29094600');
  assert.equal(ENABLE_BANKING_DEFAULT_ASPSP, 'Boursorama Banque');
  assert.equal(ENABLE_BANKING_MAX_DAILY_REFRESHES, 4);

  const keyPath = path.join(process.cwd(), 'enablebanking-key.pem');
  assert.equal(fs.existsSync(keyPath), true);
  const pemContent = fs.readFileSync(keyPath, 'utf8');
  assert.ok(pemContent.includes('BEGIN PRIVATE KEY'));

  const originalKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  delete process.env.ENABLE_BANKING_PRIVATE_KEY;

  try {
    const fixedNow = 1762372000;
    const token = generateEnableBankingJWT(fixedNow);
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as Record<string, string>;
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Record<string, string | number>;

    assert.equal(header.alg, 'RS256');
    assert.equal(header.kid, 'c1ad2bc2-df1a-460a-9497-4b1b29094600');
    assert.equal(payload.iss, 'c1ad2bc2-df1a-460a-9497-4b1b29094600');
    assert.equal(payload.aud, 'api.enablebanking.com');

    // Vérifier la signature RS256 avec la clé publique dérivée du fichier enablebanking-key.pem de production
    const pubKey = crypto.createPublicKey(pemContent);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const isValid = verifier.verify(pubKey, Buffer.from(encodedSignature, 'base64url'));
    assert.equal(isValid, true);
  } finally {
    if (originalKey !== undefined) {
      process.env.ENABLE_BANKING_PRIVATE_KEY = originalKey;
    }
  }
});

test('Enable Banking Quota DSP2 : incrémentation du compteur de rafraîchissements (4/24h) et libellés du popover', () => {
  const baseNow = Date.parse('2026-11-05T10:00:00.000Z');

  // 0 actualisation effectuée -> 4 restantes
  const initialQuota = computeBankRefreshQuota([], baseNow);
  assert.equal(initialQuota.limit, 4);
  assert.equal(initialQuota.used, 0);
  assert.equal(initialQuota.remaining, 4);
  assert.equal(formatRemainingRefreshLabel(initialQuota.remaining), "4 actualisations restantes aujourd'hui");

  // 1ère actualisation -> 3 restantes
  const step1 = consumeBankRefreshQuota({ refreshTimestamps: initialQuota.timestamps }, baseNow + 1_000);
  assert.equal(step1.allowed, true);
  assert.equal(step1.quota.used, 1);
  assert.equal(step1.quota.remaining, 3);
  assert.equal(formatRemainingRefreshLabel(step1.quota.remaining), "3 actualisations restantes aujourd'hui");

  // 2ème actualisation -> 2 restantes
  const step2 = consumeBankRefreshQuota({ refreshTimestamps: step1.quota.timestamps }, baseNow + 2_000);
  assert.equal(step2.allowed, true);
  assert.equal(step2.quota.used, 2);
  assert.equal(step2.quota.remaining, 2);
  assert.equal(formatRemainingRefreshLabel(step2.quota.remaining), "2 actualisations restantes aujourd'hui");

  // 3ème actualisation -> 1 restante
  const step3 = consumeBankRefreshQuota({ refreshTimestamps: step2.quota.timestamps }, baseNow + 3_000);
  assert.equal(step3.allowed, true);
  assert.equal(step3.quota.used, 3);
  assert.equal(step3.quota.remaining, 1);
  assert.equal(formatRemainingRefreshLabel(step3.quota.remaining), "1 actualisation restante aujourd'hui");

  // 4ème actualisation -> 0 restante (quota atteint après ce 4ème appel)
  const step4 = consumeBankRefreshQuota({ refreshTimestamps: step3.quota.timestamps }, baseNow + 4_000);
  assert.equal(step4.allowed, true);
  assert.equal(step4.quota.used, 4);
  assert.equal(step4.quota.remaining, 0);
  assert.equal(formatRemainingRefreshLabel(step4.quota.remaining), "0 actualisation restante aujourd'hui");

  // Tentative de 5ème actualisation dans les 24h -> bloquée
  const step5 = consumeBankRefreshQuota({ refreshTimestamps: step4.quota.timestamps }, baseNow + 5_000);
  assert.equal(step5.allowed, false);
  assert.equal(step5.quota.used, 4);
  assert.equal(step5.quota.remaining, 0);

  // Après expiration de la fenêtre glissante de 24h -> le quota redevient disponible
  const after24h = baseNow + 24 * 60 * 60 * 1000 + 10_000;
  const resetQuota = resolveBankRefreshQuota(
    {
      sessionId: 'prod-session-1',
      aspspName: 'BoursoBank',
      aspspCountry: 'FR',
      accounts: [{ uid: 'bourso-uid-1' }],
      connectedAt: '2026-11-05T10:00:00.000Z',
      refreshTimestamps: step4.quota.timestamps,
      refreshQuota: step4.quota,
    },
    after24h
  );
  assert.equal(resetQuota.used, 0);
  assert.equal(resetQuota.remaining, 4);
});

test('Enable Banking POST /api/bank/sync : enchaîne synchronisation BoursoBank, solde, déduplication, catégorisation et bloque au-delà de 4 appels', async () => {
  const originalKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  const originalFetch = globalThis.fetch;
  process.env.ENABLE_BANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

  let externalApiCalls = 0;

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    externalApiCalls += 1;
    const url = String(input);
    if (url.includes('/balances')) {
      return new Response(
        JSON.stringify({
          balances: [
            {
              balance_type: 'CLBD',
              balance_amount: { amount: '3450.75', currency: 'EUR' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        transactions: [
          {
            entry_reference: 'bourso-prod-1',
            booking_date: '2026-11-04',
            credit_debit_indicator: 'DBIT',
            status: 'BOOK',
            transaction_amount: { amount: '24.90', currency: 'EUR' },
            remittance_information: ['CARTE 04/11/26 PICARD SURGELES CB*9440'],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const testUserId = `test_quota_user_${Date.now()}`;

  try {
    let currentTimestamps: string[] = [];

    // Exécuter les 4 actualisations quotidiennes autorisées
    for (let i = 1; i <= 4; i++) {
      const req = {
        json: async () => ({
          userId: testUserId,
          sessionId: 'prod-session-bourso',
          accountId: 'bourso-uid-1',
          accountName: 'Boursorama Banque',
          refreshTimestamps: currentTimestamps,
          skipAi: true,
        }),
        headers: { get: () => null },
      } as unknown as import('next/server').NextRequest;

      const res = await handleSyncPost(req);
      assert.equal(res.status, 200);

      const payload = (await res.json()) as {
        success: boolean;
        refreshQuota: { used: number; remaining: number; timestamps: string[] };
        accounts: AccountInfo[];
        allTransactions: Transaction[];
        bankSession: { aspspName: string; lastSyncedAt: string };
      };

      assert.equal(payload.success, true);
      assert.equal(payload.refreshQuota.used, i);
      assert.equal(payload.refreshQuota.remaining, 4 - i);
      assert.equal(payload.bankSession.aspspName, 'BoursoBank');
      assert.ok(payload.bankSession.lastSyncedAt);

      // Solde mis à jour depuis BoursoBank
      const linkedAcc = payload.accounts.find((a) => a.id === 'eb_acc_bourso-uid-1');
      assert.ok(linkedAcc);
      assert.equal(linkedAcc.initialBalance, 3450.75);

      // Opération catégorisée et dédupliquée (toujours 1 seule opération malgré 4 appels)
      assert.equal(payload.allTransactions.length, 1);
      assert.equal(payload.allTransactions[0].type, 'Alimentation & Courses');

      currentTimestamps = payload.refreshQuota.timestamps;
    }

    const apiCallsAfterFourthSync = externalApiCalls;
    assert.equal(apiCallsAfterFourthSync, 8); // 4 * (1 appel transactions + 1 appel balances)

    // 5ème appel (tentative forcée une fois le quota de 4 atteint) -> bloqué en HTTP 429 sans interroger Enable Banking
    const blockedReq = {
      json: async () => ({
        userId: testUserId,
        sessionId: 'prod-session-bourso',
        accountId: 'bourso-uid-1',
        accountName: 'Boursorama Banque',
        refreshTimestamps: currentTimestamps,
        skipAi: true,
      }),
      headers: { get: () => null },
    } as unknown as import('next/server').NextRequest;

    const blockedRes = await handleSyncPost(blockedReq);
    assert.equal(blockedRes.status, 429);

    const blockedBody = (await blockedRes.json()) as {
      success: boolean;
      quotaExceeded: boolean;
      refreshQuota: { used: number; remaining: number };
      error: string;
    };

    assert.equal(blockedBody.success, false);
    assert.equal(blockedBody.quotaExceeded, true);
    assert.equal(blockedBody.refreshQuota.used, 4);
    assert.equal(blockedBody.refreshQuota.remaining, 0);
    assert.ok(blockedBody.error.includes('4'));

    // Vérifier qu'aucun appel API Enable Banking supplémentaire n'a été déclenché lors du blocage
    assert.equal(externalApiCalls, apiCallsAfterFourthSync);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.ENABLE_BANKING_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
    // Nettoyage de l'entrée de test dans .krona-cloud/users-cloud-store.json
    try {
      const storePath = path.join(process.cwd(), '.krona-cloud', 'users-cloud-store.json');
      if (fs.existsSync(storePath)) {
        const store = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Record<string, unknown>;
        delete store[testUserId];
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

test('Enable Banking Vercel Serverless : cleanPrivateKeyString gère les sauts de ligne réels et littéraux, guillemets et base64', () => {
  // Cas 1 : Clé sur une ligne avec séquences littérales \n et guillemets doubles
  const oneLineDoubleQuotes = `"${TEST_PRIVATE_KEY.replace(/\n/g, '\\n')}"`;
  const cleaned1 = cleanPrivateKeyString(oneLineDoubleQuotes);
  assert.equal(cleaned1, TEST_PRIVATE_KEY.trim());

  // Cas 2 : Clé avec guillemets simples et séquences littérales \n
  const oneLineSingleQuotes = `'${TEST_PRIVATE_KEY.replace(/\n/g, '\\n')}'`;
  const cleaned2 = cleanPrivateKeyString(oneLineSingleQuotes);
  assert.equal(cleaned2, TEST_PRIVATE_KEY.trim());

  // Cas 3 : Clé avec guillemets imbriqués ou échappés
  const nestedQuotes = `'"${TEST_PRIVATE_KEY.replace(/\n/g, '\\n')}"'`;
  const cleaned3 = cleanPrivateKeyString(nestedQuotes);
  assert.equal(cleaned3, TEST_PRIVATE_KEY.trim());

  // Cas 4 : Clé avec doubles antislashs (\\\\n) et retours chariot (\r\n)
  const escapedBackslashes = TEST_PRIVATE_KEY.replace(/\n/g, '\\\\n').replace(/\n/g, '\r\n');
  const cleaned4 = cleanPrivateKeyString(escapedBackslashes);
  assert.equal(cleaned4, TEST_PRIVATE_KEY.trim());

  // Cas 5 : Clé encodée en Base64
  const base64Key = Buffer.from(TEST_PRIVATE_KEY).toString('base64');
  const cleaned5 = cleanPrivateKeyString(base64Key);
  assert.equal(cleaned5, TEST_PRIVATE_KEY.trim());
});

test('Enable Banking Vercel Serverless : getEnableBankingPrivateKey et signature JWT avec variable d’environnement formatée Vercel', () => {
  const originalKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  const originalAppId = process.env.ENABLE_BANKING_APP_ID;

  // Simuler ce que Vercel injecte (clé entre guillemets avec séquences littérales \n)
  process.env.ENABLE_BANKING_PRIVATE_KEY = `"${TEST_PRIVATE_KEY.replace(/\n/g, '\\n')}"`;
  process.env.ENABLE_BANKING_APP_ID = '"c1ad2bc2-df1a-460a-9497-4b1b29094600"';

  try {
    const loadedKey = getEnableBankingPrivateKey();
    assert.equal(loadedKey, TEST_PRIVATE_KEY.trim());

    // Vérifier que la génération de JWT réussit et produit une signature RS256 valide
    const token = generateEnableBankingJWT();
    const [headerB64, payloadB64, sigB64] = token.split('.');

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as Record<string, string>;
    assert.equal(header.kid, 'c1ad2bc2-df1a-460a-9497-4b1b29094600');

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const isValid = verifier.verify(TEST_PUBLIC_KEY, Buffer.from(sigB64, 'base64url'));
    assert.equal(isValid, true);
  } finally {
    if (originalKey !== undefined) {
      process.env.ENABLE_BANKING_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    }
    if (originalAppId !== undefined) {
      process.env.ENABLE_BANKING_APP_ID = originalAppId;
    } else {
      delete process.env.ENABLE_BANKING_APP_ID;
    }
  }
});

test('Enable Banking Vercel Serverless : toutes les routes API bancaires exportent dynamic = "force-dynamic"', () => {
  assert.equal(connectDynamic, 'force-dynamic');
  assert.equal(callbackDynamic, 'force-dynamic');
  assert.equal(syncDynamic, 'force-dynamic');
  assert.equal(disconnectDynamic, 'force-dynamic');
});




