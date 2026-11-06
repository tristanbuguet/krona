import { NextRequest, NextResponse } from "next/server";
import { createAuthSession, ENABLE_BANKING_DEFAULT_ASPSP, ENABLE_BANKING_APP_ID } from "@/lib/enableBanking";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Diagnostic serveur Vercel discret
    const rawKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
    const hasKey = Boolean(rawKey && rawKey.trim().length > 0);
    const keyLength = rawKey ? rawKey.trim().length : 0;
    const keyPreview = hasKey
      ? `${rawKey!.trim().slice(0, 15).replace(/[\r\n]/g, " ")}...`
      : "absente";

    const rawAppId = process.env.ENABLE_BANKING_APP_ID;
    const hasAppId = Boolean(rawAppId && rawAppId.trim().length > 0);
    const resolvedAppId = (rawAppId || ENABLE_BANKING_APP_ID).trim();
    const appIdPreview = `${resolvedAppId.slice(0, 8)}...`;

    console.log(
      `[EnableBanking Connect] Diagnostic environnement Vercel : ` +
      `ENABLE_BANKING_PRIVATE_KEY=${hasKey ? `détectée (longueur: ${keyLength}, aperçu: "${keyPreview}")` : "absente"} | ` +
      `ENABLE_BANKING_APP_ID=${hasAppId ? `présent ("${appIdPreview}")` : `absent (fallback sur "${appIdPreview}")`}`
    );
    let body: Record<string, unknown> = {};
    try {
      const parsed = (await req.json()) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object") {
        body = parsed;
      }
    } catch {
      // Allow empty POST body
    }

    const aspspTitle =
      typeof body.aspspTitle === "string" && body.aspspTitle.trim().length > 0
        ? body.aspspTitle.trim()
        : typeof body.aspsp === "string" && body.aspsp.trim().length > 0
          ? body.aspsp.trim()
          : ENABLE_BANKING_DEFAULT_ASPSP;

    const country =
      typeof body.country === "string" && body.country.trim().length === 2
        ? body.country.trim().toUpperCase()
        : "FR";

    const userId = (
      (typeof body.userId === "string" ? body.userId : "") ||
      req.headers.get("x-krona-user-id") ||
      req.headers.get("x-user-id") ||
      ""
    ).trim();

    const origin = req.nextUrl.origin || "http://localhost:3000";
    const redirectUrl =
      typeof body.redirectUrl === "string" && body.redirectUrl.trim().length > 0
        ? body.redirectUrl.trim()
        : `${origin}/api/bank/callback`;

    const statePayload = userId
      ? Buffer.from(JSON.stringify({ userId, aspspTitle, ts: Date.now() })).toString("base64url")
      : `krona_${Date.now()}`;

    const session = await createAuthSession(aspspTitle, redirectUrl, statePayload, country);

    return NextResponse.json(
      {
        url: session.url,
        authorizationId: session.authorizationId,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Impossible d'initialiser la connexion Enable Banking.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

