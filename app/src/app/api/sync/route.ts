import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  UserFinancialPayload,
  mergeCloudAndLocalData,
  normalizeUserFinancialPayload,
} from "@/lib/cloudSync";
import { getSql, ensureUserSyncTable } from "@/lib/db";

const DATA_DIR = path.join(process.cwd(), ".krona-cloud");
const STORE_FILE = path.join(DATA_DIR, "users-cloud-store.json");

/**
 * Repli local pour le développement hors-ligne en l'absence temporaire de DATABASE_URL.
 */
function readLocalCloudStore(): Record<string, UserFinancialPayload> {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, UserFinancialPayload>;
  } catch {
    return {};
  }
}

function writeLocalCloudStore(store: Record<string, UserFinancialPayload>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tmpFile, STORE_FILE);
  } catch (err) {
    console.warn("[Krona Cloud API] Écriture fichier ignorée:", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = (
      req.nextUrl.searchParams.get("userId") ||
      req.headers.get("x-krona-user-id") ||
      req.headers.get("x-user-id") ||
      ""
    ).trim();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing active Google userId session" },
        { status: 401 }
      );
    }

    const sql = getSql();

    if (sql) {
      await ensureUserSyncTable(sql);

      const rows = await sql.query(
        "SELECT data, updated_at FROM user_sync WHERE user_id = $1 LIMIT 1;",
        [userId]
      );

      if (rows.length > 0) {
        const row = rows[0] as unknown as {
          data: unknown;
          updated_at: string | Date;
        };

        const parsedData = (
          typeof row.data === "string" ? JSON.parse(row.data) : row.data
        ) as UserFinancialPayload;

        const updatedAt =
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : String(row.updated_at);

        return NextResponse.json(
          {
            success: true,
            data: parsedData,
            updatedAt,
            // Rétrocompatibilité pour les composants et tests existants
            payload: parsedData,
            transactions: parsedData.transactions || [],
            accounts: parsedData.accounts || [],
            settings: parsedData.settings || null,
            learningRules: parsedData.learningRules || {},
            lastUpdated: updatedAt,
            syncedAt: updatedAt,
          },
          { status: 200 }
        );
      }

      // Si l'utilisateur n'a encore aucun enregistrement dans le Cloud, renvoie null sans erreur
      return NextResponse.json(
        {
          success: true,
          data: null,
          payload: null,
        },
        { status: 200 }
      );
    }

    // Repli de développement local si DATABASE_URL n'est pas encore configurée
    const store = readLocalCloudStore();
    const rawUserPayload = store[userId] || null;
    const normalizedPayload = rawUserPayload
      ? normalizeUserFinancialPayload(rawUserPayload)
      : null;

    if (!normalizedPayload) {
      return NextResponse.json(
        {
          success: true,
          data: null,
          payload: null,
        },
        { status: 200 }
      );
    }

    const updatedAt =
      normalizedPayload.updatedAt ||
      normalizedPayload.lastUpdated ||
      new Date().toISOString();

    return NextResponse.json(
      {
        success: true,
        data: normalizedPayload,
        updatedAt,
        payload: normalizedPayload,
        transactions: normalizedPayload.transactions || [],
        accounts: normalizedPayload.accounts || [],
        settings: normalizedPayload.settings || null,
        learningRules: normalizedPayload.learningRules || {},
        lastUpdated: updatedAt,
        syncedAt: updatedAt,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync GET error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown> | null;
    const userId = (
      body?.userId ||
      req.headers.get("x-krona-user-id") ||
      req.headers.get("x-user-id") ||
      ""
    )
      .toString()
      .trim();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing active Google userId session" },
        { status: 401 }
      );
    }

    const email =
      typeof body?.email === "string" && body.email.trim().length > 0
        ? body.email.trim()
        : req.headers.get("x-user-email") || null;

    const rawIncoming = (body?.data ?? body?.payload ?? body) as
      | Partial<UserFinancialPayload>
      | undefined;

    if (!rawIncoming || typeof rawIncoming !== "object") {
      return NextResponse.json(
        { success: false, error: "Missing payload" },
        { status: 400 }
      );
    }

    const mode = body?.mode === "overwrite" ? "overwrite" : "merge";
    const sql = getSql();

    if (sql) {
      await ensureUserSyncTable(sql);

      let existingCloudData: Partial<UserFinancialPayload> | null = null;
      if (mode === "merge") {
        const rows = await sql.query(
          "SELECT data FROM user_sync WHERE user_id = $1 LIMIT 1;",
          [userId]
        );
        if (rows.length > 0) {
          const row = rows[0] as unknown as { data: unknown };
          existingCloudData = (
            typeof row.data === "string" ? JSON.parse(row.data) : row.data
          ) as Partial<UserFinancialPayload>;
        }
      }

      const finalPayload: UserFinancialPayload =
        mode === "overwrite"
          ? normalizeUserFinancialPayload(rawIncoming)
          : mergeCloudAndLocalData(rawIncoming, existingCloudData);

      await sql.query(
        `INSERT INTO user_sync (user_id, email, data, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id)
         DO UPDATE SET
           data = EXCLUDED.data,
           updated_at = CURRENT_TIMESTAMP;`,
        [userId, email, JSON.stringify(finalPayload)]
      );

      return NextResponse.json(
        {
          success: true,
          updatedAt: finalPayload.updatedAt,
          data: finalPayload,
          payload: finalPayload,
          userId,
          transactions: finalPayload.transactions,
          accounts: finalPayload.accounts,
          settings: finalPayload.settings,
          learningRules: finalPayload.learningRules,
          lastUpdated: finalPayload.lastUpdated,
          syncedAt: finalPayload.updatedAt,
        },
        { status: 200 }
      );
    }

    // Repli de développement local si DATABASE_URL n'est pas encore configurée
    const store = readLocalCloudStore();
    const existingCloud = store[userId] || null;

    const finalPayload: UserFinancialPayload =
      mode === "overwrite"
        ? normalizeUserFinancialPayload(rawIncoming)
        : mergeCloudAndLocalData(rawIncoming, existingCloud);

    store[userId] = finalPayload;
    writeLocalCloudStore(store);

    return NextResponse.json(
      {
        success: true,
        updatedAt: finalPayload.updatedAt,
        data: finalPayload,
        payload: finalPayload,
        userId,
        transactions: finalPayload.transactions,
        accounts: finalPayload.accounts,
        settings: finalPayload.settings,
        learningRules: finalPayload.learningRules,
        lastUpdated: finalPayload.lastUpdated,
        syncedAt: finalPayload.updatedAt,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync POST error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
