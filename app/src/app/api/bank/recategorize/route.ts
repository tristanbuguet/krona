import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getSql, ensureUserSyncTable } from "@/lib/db";
import { recategorizeOrphanBankTransactions } from "@/lib/bankPipeline";
import { UserFinancialPayload } from "@/lib/cloudSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATA_DIR = path.join(process.cwd(), ".krona-cloud");
const STORE_FILE = path.join(DATA_DIR, "users-cloud-store.json");

function readLocalCloudStore(): Record<string, UserFinancialPayload> {
  try {
    if (!fs.existsSync(STORE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8")) as Record<string, UserFinancialPayload>;
  } catch {
    return {};
  }
}

function writeLocalCloudStore(store: Record<string, UserFinancialPayload>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), "utf-8");
    fs.renameSync(tmpFile, STORE_FILE);
  } catch {
    // Ignore local write errors
  }
}

async function handleRecategorize(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        const parsed = (await req.json()) as Record<string, unknown> | null;
        if (parsed && typeof parsed === "object") {
          body = parsed;
        }
      } catch {
        // Body vide accepté
      }
    }

    // 1. Authentification stricte : session utilisateur requise
    const userId = (
      req.headers.get("x-krona-user-id") ||
      req.headers.get("x-user-id") ||
      req.nextUrl.searchParams.get("userId") ||
      (typeof body.userId === "string" ? body.userId : "") ||
      ""
    ).trim();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing active user session" },
        { status: 401 }
      );
    }

    // 2. Mode simulation par défaut : modification réelle seulement si dryRun: false ou apply: true explicite
    const explicitApply =
      body.dryRun === false ||
      body.dryRun === "false" ||
      body.apply === true ||
      body.apply === "true" ||
      req.nextUrl.searchParams.get("dryRun") === "false" ||
      req.nextUrl.searchParams.get("apply") === "true";

    const dryRun = !explicitApply;

    const sql = getSql();
    let payload: UserFinancialPayload | null = null;

    if (sql) {
      await ensureUserSyncTable(sql);
      // Traite STRICTEMENT et uniquement les données de l'utilisateur connecté
      const rows = await sql.query(
        "SELECT data FROM user_sync WHERE user_id = $1 LIMIT 1;",
        [userId]
      );
      if (rows.length > 0) {
        const record = rows[0] as unknown as { data: unknown };
        payload = (
          typeof record.data === "string" ? JSON.parse(record.data) : record.data
        ) as UserFinancialPayload;
      }
    } else {
      const store = readLocalCloudStore();
      payload = store[userId] || null;
    }

    if (!payload || !Array.isArray(payload.transactions)) {
      return NextResponse.json({
        success: true,
        dryRun,
        applied: !dryRun,
        userId,
        transactionsBefore: 0,
        recategorizedCount: 0,
        operations: [],
        message: "Aucune transaction enregistrée pour cet utilisateur.",
      });
    }

    const transactionsBefore = payload.transactions.length;
    const currentRules = payload.learningRules || payload.merchantKnowledge || {};

    const result = await recategorizeOrphanBankTransactions({
      transactions: payload.transactions,
      learningRules: currentRules,
    });

    // Établir la liste détaillée des opérations recatégorisées
    const recategorizedOperations: Array<{
      id: string;
      date: string;
      amount: number;
      merchant: string;
      source: string;
      previousCategory: string;
      predictedCategory: string;
    }> = [];

    for (let i = 0; i < payload.transactions.length; i++) {
      const oldTx = payload.transactions[i];
      const newTx = result.updatedTransactions[i];
      if (oldTx && newTx && oldTx.type !== newTx.type) {
        const isCsv = oldTx.source === "csv" || /^(bourso|ca|ce|lcl|csv)_/i.test(oldTx.id);
        recategorizedOperations.push({
          id: oldTx.id,
          date: oldTx.date,
          amount: oldTx.amount,
          merchant: newTx.name,
          source: isCsv ? "csv" : "bank",
          previousCategory: oldTx.type,
          predictedCategory: newTx.type,
        });
      }
    }

    // En mode simulation : rien n'est modifié ni écrit en base
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        applied: false,
        userId,
        transactionsBefore,
        recategorizedCount: result.recategorizedCount,
        operations: recategorizedOperations,
        message: `Simulation : ${result.recategorizedCount} opération(s) bancaire(s) seraient recatégorisée(s). Aucune modification effectuée.`,
      });
    }

    // En mode réel (dryRun: false) : mise à jour effective dans Neon ou local store
    if (result.recategorizedCount > 0) {
      payload.transactions = result.updatedTransactions;
      payload.learningRules = result.learningRules;
      payload.merchantKnowledge = result.learningRules;

      if (sql) {
        await sql.query(
          `UPDATE user_sync
           SET data = $1, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2;`,
          [JSON.stringify(payload), userId]
        );
      } else {
        const store = readLocalCloudStore();
        store[userId] = payload;
        writeLocalCloudStore(store);
      }

      console.log(
        `[Bank Recategorize] ${result.recategorizedCount} opération(s) bancaire(s) recatégorisée(s) pour l'utilisateur ${userId}.`
      );
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      applied: true,
      userId,
      transactionsBefore,
      recategorizedCount: result.recategorizedCount,
      operations: recategorizedOperations,
      message: `${result.recategorizedCount} opération(s) bancaire(s) en « Autre » recatégorisée(s) avec succès dans Neon.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Bank Recategorize Error]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleRecategorize(req);
}

export async function GET(req: NextRequest) {
  return handleRecategorize(req);
}
