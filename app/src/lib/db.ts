import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type SqlClient = NeonQueryFunction<false, false>;

export interface UserSyncRecord {
  user_id: string;
  email: string | null;
  data: unknown;
  updated_at: string | Date;
}

/**
 * Récupère l'URL de connexion PostgreSQL Neon à partir des variables d'environnement.
 * Supporte DATABASE_URL et POSTGRES_URL.
 */
export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return null;
  }
  return url.trim();
}

/**
 * Indique si la base de données distante est configurée.
 */
export function isDbConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

let cachedSql: SqlClient | null = null;
let cachedUrl: string | null = null;
let schemaInitialized = false;

/**
 * Instancie le client SQL Neon de manière résiliente.
 * Ne lève jamais d'exception lors du build ou de l'import en l'absence temporaire des variables.
 */
export function getSql(): SqlClient | null {
  const url = getDatabaseUrl();
  if (!url) {
    return null;
  }
  if (!cachedSql || cachedUrl !== url) {
    cachedSql = neon(url);
    cachedUrl = url;
  }
  return cachedSql;
}

/**
 * Requête SQL DDL pour la table de synchronisation utilisateur.
 */
export const CREATE_USER_SYNC_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_sync (
    user_id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255),
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * Création idempotente de la table SQL `user_sync`.
 * Exécutée à l'initialisation si inexistante ou via appel explicite.
 */
export async function ensureUserSyncTable(
  client?: SqlClient | null
): Promise<boolean> {
  const sql = client || getSql();
  if (!sql) {
    return false;
  }

  if (schemaInitialized) {
    return true;
  }

  await sql.query(CREATE_USER_SYNC_TABLE_SQL);
  schemaInitialized = true;
  return true;
}

/**
 * Réinitialise l'état interne pour les tests unitaires.
 */
export function resetDbClientForTesting(): void {
  cachedSql = null;
  cachedUrl = null;
  schemaInitialized = false;
}

