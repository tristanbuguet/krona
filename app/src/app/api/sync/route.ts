import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { CloudSyncPayload, mergeCloudAndLocalData } from "@/lib/cloudSync";

const DATA_DIR = path.join(process.cwd(), ".krona-cloud");
const STORE_FILE = path.join(DATA_DIR, "users-cloud-store.json");

function readCloudStore(): Record<string, CloudSyncPayload> {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, CloudSyncPayload>;
  } catch {
    return {};
  }
}

function writeCloudStore(store: Record<string, CloudSyncPayload>): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Krona Cloud API] Écriture fichier ignorée:", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const store = readCloudStore();
    const userPayload = store[userId] || null;

    return NextResponse.json(
      {
        userId,
        payload: userPayload,
        syncedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Sync GET error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body?.userId ? String(body.userId) : "";
    const incomingPayload = body?.payload as Partial<CloudSyncPayload> | undefined;
    const mode = body?.mode === "overwrite" ? "overwrite" : "merge";

    if (!userId || !incomingPayload) {
      return NextResponse.json(
        { error: "Missing userId or payload" },
        { status: 400 }
      );
    }

    const store = readCloudStore();
    const existingCloud = store[userId] || null;

    const finalPayload: CloudSyncPayload =
      mode === "overwrite"
        ? {
            transactions: Array.isArray(incomingPayload.transactions)
              ? incomingPayload.transactions
              : [],
            categoryBudgets: incomingPayload.categoryBudgets || {},
            fixedIncomeSettings: incomingPayload.fixedIncomeSettings || {
              salary: 0,
              aids: 0,
              autoApply: false,
            },
            ignoredSubscriptions: incomingPayload.ignoredSubscriptions || [],
            merchantKnowledge: incomingPayload.merchantKnowledge || {},
            monthlyLimitConfig: incomingPayload.monthlyLimitConfig || {
              type: "amount",
              value: 2200,
            },
            monthlySpendingLimit: incomingPayload.monthlySpendingLimit ?? null,
            accounts: incomingPayload.accounts,
            selectedBank: incomingPayload.selectedBank || "bourso",
            selectedMonth: incomingPayload.selectedMonth || null,
            updatedAt: new Date().toISOString(),
          }
        : mergeCloudAndLocalData(incomingPayload, existingCloud);

    store[userId] = finalPayload;
    writeCloudStore(store);

    return NextResponse.json(
      {
        userId,
        payload: finalPayload,
        syncedAt: finalPayload.updatedAt,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Sync POST error" },
      { status: 500 }
    );
  }
}

