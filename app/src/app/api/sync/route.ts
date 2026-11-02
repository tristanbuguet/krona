import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  UserFinancialPayload,
  mergeCloudAndLocalData,
  normalizeUserFinancialPayload,
} from "@/lib/cloudSync";

const DATA_DIR = path.join(process.cwd(), ".krona-cloud");
const STORE_FILE = path.join(DATA_DIR, "users-cloud-store.json");

function readCloudStore(): Record<string, UserFinancialPayload> {
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

function writeCloudStore(store: Record<string, UserFinancialPayload>): void {
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
      ""
    ).trim();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: Missing active Google userId session" },
        { status: 401 }
      );
    }

    const store = readCloudStore();
    const rawUserPayload = store[userId] || null;
    const normalizedPayload = rawUserPayload
      ? normalizeUserFinancialPayload(rawUserPayload)
      : null;

    return NextResponse.json(
      {
        userId,
        payload: normalizedPayload,
        transactions: normalizedPayload?.transactions || [],
        accounts: normalizedPayload?.accounts || [],
        settings: normalizedPayload?.settings || null,
        learningRules: normalizedPayload?.learningRules || {},
        lastUpdated:
          normalizedPayload?.lastUpdated ||
          normalizedPayload?.updatedAt ||
          new Date().toISOString(),
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
    const userId = (
      body?.userId ||
      req.headers.get("x-krona-user-id") ||
      ""
    )
      .toString()
      .trim();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized: Missing active Google userId session" },
        { status: 401 }
      );
    }

    const incomingPayload = body?.payload as
      | Partial<UserFinancialPayload>
      | undefined;
    const mode = body?.mode === "overwrite" ? "overwrite" : "merge";

    if (!incomingPayload || typeof incomingPayload !== "object") {
      return NextResponse.json(
        { error: "Missing payload" },
        { status: 400 }
      );
    }

    const store = readCloudStore();
    const existingCloud = store[userId] || null;

    const finalPayload: UserFinancialPayload =
      mode === "overwrite"
        ? normalizeUserFinancialPayload(incomingPayload)
        : mergeCloudAndLocalData(incomingPayload, existingCloud);

    store[userId] = finalPayload;
    writeCloudStore(store);

    return NextResponse.json(
      {
        userId,
        payload: finalPayload,
        transactions: finalPayload.transactions,
        accounts: finalPayload.accounts,
        settings: finalPayload.settings,
        learningRules: finalPayload.learningRules,
        lastUpdated: finalPayload.lastUpdated,
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

