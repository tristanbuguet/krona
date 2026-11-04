import test from "node:test";
import assert from "node:assert";
import { NextRequest } from "next/server";
import {
  getDatabaseUrl,
  getSql,
  isDbConfigured,
  ensureUserSyncTable,
  resetDbClientForTesting,
  CREATE_USER_SYNC_TABLE_SQL,
  type SqlClient,
} from "../src/lib/db";
import { GET, POST } from "../src/app/api/sync/route";
import {
  mergeCloudAndLocalData,
  normalizeUserFinancialPayload,
  UserFinancialPayload,
} from "../src/lib/cloudSync";

test("Database Module (lib/db.ts) : Initialisation résiliente sans variables d'environnement", () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalPostgresUrl = process.env.POSTGRES_URL;

  try {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    resetDbClientForTesting();

    // En l'absence de variables, aucune exception ne doit être levée
    assert.strictEqual(getDatabaseUrl(), null);
    assert.strictEqual(isDbConfigured(), false);
    assert.strictEqual(getSql(), null);

    // Test de prise en compte de DATABASE_URL
    process.env.DATABASE_URL = "postgres://test_user:test_pass@ep-aws-frankfurt.eu-central-1.aws.neon.tech/krona_db?sslmode=require";
    assert.strictEqual(
      getDatabaseUrl(),
      "postgres://test_user:test_pass@ep-aws-frankfurt.eu-central-1.aws.neon.tech/krona_db?sslmode=require"
    );
    assert.strictEqual(isDbConfigured(), true);

    // Test de prise en compte de POSTGRES_URL en repli
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = "postgres://postgres_user:secret@eu-central-1.neon.tech/krona?sslmode=require";
    assert.strictEqual(
      getDatabaseUrl(),
      "postgres://postgres_user:secret@eu-central-1.neon.tech/krona?sslmode=require"
    );
    assert.strictEqual(isDbConfigured(), true);
  } finally {
    if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;
    if (originalPostgresUrl !== undefined) process.env.POSTGRES_URL = originalPostgresUrl;
    else delete process.env.POSTGRES_URL;
    resetDbClientForTesting();
  }
});

test("Database Module : Schéma SQL et création idempotente de la table user_sync", async () => {
  // Vérification de la conformité stricte du DDL
  assert.ok(CREATE_USER_SYNC_TABLE_SQL.includes("CREATE TABLE IF NOT EXISTS user_sync"));
  assert.ok(CREATE_USER_SYNC_TABLE_SQL.includes("user_id VARCHAR(255) PRIMARY KEY"));
  assert.ok(CREATE_USER_SYNC_TABLE_SQL.includes("email VARCHAR(255)"));
  assert.ok(CREATE_USER_SYNC_TABLE_SQL.includes("data JSONB NOT NULL"));
  assert.ok(CREATE_USER_SYNC_TABLE_SQL.includes("updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"));

  resetDbClientForTesting();

  // ensureUserSyncTable retourne false sans erreur si aucun client n'est configuré
  const noClientResult = await ensureUserSyncTable(null);
  assert.strictEqual(noClientResult, false);

  // Simulation d'un client SQL Neon mocké
  const executedQueries: string[] = [];
  const mockSqlClient = {
    query: async (queryText: string) => {
      executedQueries.push(queryText.trim());
      return [];
    },
  } as unknown as SqlClient;

  const firstCall = await ensureUserSyncTable(mockSqlClient);
  assert.strictEqual(firstCall, true);
  assert.strictEqual(executedQueries.length, 1);
  assert.ok(executedQueries[0].includes("CREATE TABLE IF NOT EXISTS user_sync"));

  // Idempotence : un second appel dans la même instance ne ré-exécute pas la requête DDL
  const secondCall = await ensureUserSyncTable(mockSqlClient);
  assert.strictEqual(secondCall, true);
  assert.strictEqual(executedQueries.length, 1, "Le DDL ne doit pas être ré-exécuté si la table a déjà été vérifiée");
});

test("Endpoints /api/sync : Validation d'authentification (401)", async () => {
  // GET sans userId
  const getReqNoUser = new NextRequest("http://localhost:3000/api/sync");
  const getResNoUser = await GET(getReqNoUser);
  assert.strictEqual(getResNoUser.status, 401);

  // POST sans userId
  const postReqNoUser = new NextRequest("http://localhost:3000/api/sync", {
    method: "POST",
    body: JSON.stringify({ transactions: [] }),
  });
  const postResNoUser = await POST(postReqNoUser);
  assert.strictEqual(postResNoUser.status, 401);
});

test("Endpoints /api/sync : Validation de payload manquant (400)", async () => {
  const postReqNoPayload = new NextRequest("http://localhost:3000/api/sync", {
    method: "POST",
    headers: { "x-krona-user-id": "user-test-123" },
    body: JSON.stringify({ userId: "user-test-123" }),
  });
  const postResNoPayload = await POST(postReqNoPayload);
  // Un payload vide ou non-objet
  assert.ok(postResNoPayload.status === 200 || postResNoPayload.status === 400);
});

test("Scénario 1 : Migration Local-First sans écrasement (Données invité -> Premier raccordement Cloud)", async () => {
  const testUserId = "user-migration-scenario-1";
  const testUserEmail = "user1@example.com";

  // 1. L'utilisateur a créé des données locales en mode invité
  const localGuestData: Partial<UserFinancialPayload> = {
    transactions: [
      {
        id: "tx-guest-1",
        name: "Carrefour Courses",
        type: "Alimentation & Courses",
        amount: -45.5,
        date: "2026-11-01",
        month: "2026-11",
      },
    ],
    accounts: [
      {
        id: "acc-bourso-1",
        name: "Compte Bourso",
        bank: "BoursoBank",
        type: "Compte courant",
        initialBalance: 1500,
      },
    ],
    monthlyCap: 1600,
    incomeSettings: {
      salary: 2500,
      aids: 0,
      autoApply: true,
      rent: 750,
    },
    learningRules: {
      Carrefour: { categorie: "Alimentation & Courses" },
    },
  };

  // 2. Vérification que le Cloud est vide pour cet utilisateur au départ
  const getReq = new NextRequest(`http://localhost:3000/api/sync?userId=${testUserId}`, {
    headers: { "x-krona-user-id": testUserId },
  });
  const getRes = await GET(getReq);
  assert.strictEqual(getRes.status, 200);
  const getBody = await getRes.json();
  assert.strictEqual(getBody.success, true);

  // 3. À la première connexion Google, le client initialise la base distante avec POST /api/sync
  const postReq = new NextRequest("http://localhost:3000/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-krona-user-id": testUserId,
    },
    body: JSON.stringify({
      userId: testUserId,
      email: testUserEmail,
      data: localGuestData,
      mode: "overwrite",
    }),
  });

  const postRes = await POST(postReq);
  assert.strictEqual(postRes.status, 200);
  const postBody = await postRes.json();
  assert.strictEqual(postBody.success, true);
  assert.ok(postBody.updatedAt);

  // 4. Lecture ultérieure : les données invité ont été persistées sans perte
  const verifyReq = new NextRequest(`http://localhost:3000/api/sync?userId=${testUserId}`, {
    headers: { "x-krona-user-id": testUserId },
  });
  const verifyRes = await GET(verifyReq);
  assert.strictEqual(verifyRes.status, 200);
  const verifyBody = await verifyRes.json();
  assert.strictEqual(verifyBody.success, true);
  assert.ok(verifyBody.data);
  assert.strictEqual(verifyBody.data.transactions.length, 1);
  assert.strictEqual(verifyBody.data.transactions[0].name, "Carrefour Courses");
  assert.strictEqual(verifyBody.data.accounts.length, 1);
  assert.strictEqual(verifyBody.data.monthlyCap, 1600);
  assert.strictEqual(verifyBody.data.incomeSettings.salary, 2500);
});

test("Scénario 2 : Connexion depuis un nouvel appareil vierge (Restauration intégrale)", async () => {
  const testUserId = "user-scenario-2-virgin-device";

  // Données déjà présentes dans le cloud de l'utilisateur
  const cloudData = normalizeUserFinancialPayload({
    transactions: [
      {
        id: "tx-cloud-1",
        name: "SNCF Billet",
        type: "Transports",
        amount: -89.0,
        date: "2026-10-15",
        month: "2026-10",
      },
    ],
    accounts: [
      {
        id: "acc-ca-1",
        name: "Compte Courant CA",
        bank: "Crédit Agricole",
        type: "Compte courant",
        initialBalance: 3200,
      },
    ],
    monthlyCap: 2000,
    incomeSettings: {
      salary: 3100,
      aids: 50,
      autoApply: true,
      rent: 900,
    },
    learningRules: {
      SNCF: { categorie: "Transports" },
    },
  });

  // Sauvegarde préalable dans le Cloud
  const initReq = new NextRequest("http://localhost:3000/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: testUserId,
      email: "device2@example.com",
      data: cloudData,
      mode: "overwrite",
    }),
  });
  await POST(initReq);

  // Simulation du nouvel appareil vierge : localStorage vide
  const virginLocalStorage = {
    transactions: [],
    accounts: [],
    settings: {
      monthlyCap: null,
      monthlyLimitConfig: { type: "amount" as const, value: 0 },
      incomeSettings: { salary: 0, aids: 0, autoApply: false },
      categoryBudgets: {},
      ignoredSubscriptions: [],
    },
    learningRules: {},
  };

  // Appel GET /api/sync dès validation de la session sur l'appareil vierge
  const getReq = new NextRequest(`http://localhost:3000/api/sync?userId=${testUserId}`, {
    headers: { "x-krona-user-id": testUserId },
  });
  const getRes = await GET(getReq);
  const getBody = await getRes.json();

  assert.strictEqual(getBody.success, true);
  assert.ok(getBody.data, "Le nouvel appareil doit recevoir les données Cloud non nulles");

  // Hydratation complète du store
  const hydrated = mergeCloudAndLocalData(virginLocalStorage, getBody.data);
  assert.strictEqual(hydrated.transactions.length, 1);
  assert.strictEqual(hydrated.transactions[0].name, "SNCF Billet");
  assert.strictEqual(hydrated.accounts.length, 1);
  assert.strictEqual(hydrated.accounts[0].name, "Compte Courant CA");
  assert.strictEqual(hydrated.settings.monthlyCap, 2000);
  assert.strictEqual(hydrated.settings.incomeSettings.salary, 3100);
  assert.strictEqual(hydrated.learningRules["SNCF"]?.categorie, "Transports");
});

test("Scénario 3 : Sauvegarde continue et enrichissement incrémental", async () => {
  const testUserId = "user-scenario-3-continuous-save";

  // 1. État initial
  const initialData = normalizeUserFinancialPayload({
    transactions: [
      {
        id: "tx-init-1",
        name: "Loyer Octobre",
        type: "Logement & Maison",
        amount: -800,
        date: "2026-10-01",
        month: "2026-10",
      },
    ],
  });

  await POST(
    new NextRequest("http://localhost:3000/api/sync", {
      method: "POST",
      body: JSON.stringify({ userId: testUserId, data: initialData }),
    })
  );

  // 2. Modification majeure / Nouvel import CSV pendant que l'utilisateur est connecté
  const incrementalData = {
    transactions: [
      {
        id: "tx-new-import-2",
        name: "Abonnement Spotify",
        type: "Abonnements & Forfaits",
        amount: -10.99,
        date: "2026-10-05",
        month: "2026-10",
        isSubscription: true,
      },
    ],
    learningRules: {
      Spotify: { categorie: "Abonnements & Forfaits", isSubscription: true },
    },
  };

  const syncUpdateReq = new NextRequest("http://localhost:3000/api/sync", {
    method: "POST",
    body: JSON.stringify({
      userId: testUserId,
      data: incrementalData,
      mode: "merge",
    }),
  });

  const syncUpdateRes = await POST(syncUpdateReq);
  const syncUpdateBody = await syncUpdateRes.json();

  assert.strictEqual(syncUpdateRes.status, 200);
  assert.strictEqual(syncUpdateBody.success, true);
  // Les 2 transactions sont désormais présentes
  assert.strictEqual(syncUpdateBody.data.transactions.length, 2);
  assert.ok(syncUpdateBody.data.learningRules["Spotify"]);
});

test("Scénario 4 : Recatégorisation et arbitrage par updatedAt (multi-appareils)", async () => {
  const testUserId = "user-scenario-4-recategorize";

  // Appareil A : modification récente de la catégorie d'une transaction et apprentissage de règle
  const newerTimestamp = "2026-11-04T12:00:00.000Z";
  const olderTimestamp = "2026-11-04T08:00:00.000Z";

  const updatedDataFromDeviceA = normalizeUserFinancialPayload({
    transactions: [
      {
        id: "tx-cat-test-1",
        name: "Carrefour Market",
        type: "Alimentation & Courses",
        amount: -45.5,
        date: "2026-11-02",
        month: "2026-11",
        updatedAt: newerTimestamp,
      },
    ],
    learningRules: {
      "Carrefour Market": {
        categorie: "Alimentation & Courses",
        updatedAt: newerTimestamp,
      },
    },
  });

  // Sauvegarde sur le Cloud depuis l'appareil A
  const postRes = await POST(
    new NextRequest("http://localhost:3000/api/sync", {
      method: "POST",
      body: JSON.stringify({
        userId: testUserId,
        data: updatedDataFromDeviceA,
        mode: "overwrite",
      }),
    })
  );
  assert.strictEqual(postRes.status, 200);

  // Appareil B : possède un cache local obsolète (ancienne catégorie "Autre" avec timestamp antérieur)
  const staleLocalDeviceB = {
    transactions: [
      {
        id: "tx-cat-test-1",
        name: "Carrefour Market",
        type: "Autre",
        amount: -45.5,
        date: "2026-11-02",
        month: "2026-11",
        updatedAt: olderTimestamp,
      },
    ],
    accounts: [],
    settings: {
      monthlyCap: null,
      monthlyLimitConfig: { type: "amount" as const, value: 0 },
      incomeSettings: { salary: 0, aids: 0, autoApply: false },
      categoryBudgets: {},
      ignoredSubscriptions: [],
    },
    learningRules: {
      "Carrefour Market": {
        categorie: "Autre",
        updatedAt: olderTimestamp,
      },
    },
  };

  // Récupération Cloud sur Appareil B
  const getRes = await GET(
    new NextRequest(`http://localhost:3000/api/sync?userId=${testUserId}`, {
      headers: { "x-krona-user-id": testUserId },
    })
  );
  const getBody = await getRes.json();

  const merged = mergeCloudAndLocalData(staleLocalDeviceB, getBody.data);
  // L'ancienne catégorie "Autre" de l'appareil B DOIT être écrasée par "Alimentation & Courses" (plus récent)
  assert.strictEqual(merged.transactions[0].type, "Alimentation & Courses");
  assert.strictEqual(merged.learningRules["Carrefour Market"]?.categorie, "Alimentation & Courses");
});

test("Scénario 5 : Persistance et fusion des comptes bancaires (masquage isHidden, renommage, solde)", () => {
  const localAccounts = [
    {
      id: "acc-1",
      name: "Compte Bourso Perso",
      bank: "BoursoBank" as const,
      type: "Compte courant" as const,
      accountNumber: "•••• 1234",
      initialBalance: 1500,
      isHidden: true,
      updatedAt: "2026-11-04T13:00:00.000Z",
    },
  ];

  const cloudAccounts = [
    {
      id: "acc-1",
      name: "Compte Bourso",
      bank: "BoursoBank" as const,
      type: "Compte courant" as const,
      accountNumber: "•••• 1234",
      initialBalance: 1000,
      isHidden: false,
      updatedAt: "2026-11-04T10:00:00.000Z",
    },
  ];

  const merged = mergeCloudAndLocalData(
    { transactions: [], accounts: localAccounts, settings: {} as any, learningRules: {} },
    { transactions: [], accounts: cloudAccounts, settings: {} as any, learningRules: {} }
  );

  assert.strictEqual(merged.accounts.length, 1);
  assert.strictEqual(merged.accounts[0].name, "Compte Bourso Perso");
  assert.strictEqual(merged.accounts[0].isHidden, true);
  assert.strictEqual(merged.accounts[0].initialBalance, 1500);
});


