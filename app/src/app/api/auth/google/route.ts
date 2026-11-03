import { NextRequest, NextResponse } from "next/server";
import { GoogleUserProfile } from "@/lib/cloudSync";

const FALLBACK_GOOGLE_CLIENT_ID =
  "364266284096-8fflm97j1n422q7omq3uggrr5uf9ou8f.apps.googleusercontent.com";

export async function GET() {
  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    FALLBACK_GOOGLE_CLIENT_ID;

  return NextResponse.json(
    {
      clientId: clientId.replace(/^"|"$/g, "").trim(),
      configured: Boolean(clientId && clientId.trim().length > 0),
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const accessToken = body?.accessToken ? String(body.accessToken).trim() : "";
    const credential = body?.credential ? String(body.credential).trim() : "";

    const clientId = (
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      FALLBACK_GOOGLE_CLIENT_ID
    )
      .replace(/^"|"$/g, "")
      .trim();

    if (accessToken) {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: "Jeton Google OAuth invalide ou expiré." },
          { status: 401 }
        );
      }

      const info = await res.json();
      const pic = info.picture ? String(info.picture) : undefined;
      const profile: GoogleUserProfile = {
        id: String(info.sub || info.id || info.email),
        name: String(info.name || info.given_name || info.email),
        givenName: info.given_name ? String(info.given_name) : undefined,
        familyName: info.family_name ? String(info.family_name) : undefined,
        email: String(info.email),
        picture: pic,
        photoURL: pic,
        image: pic,
        avatar_url: pic,
        user_metadata: {
          avatar_url: pic,
          picture: pic,
        },
      };

      return NextResponse.json({ user: profile }, { status: 200 });
    }

    if (credential) {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
          credential
        )}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        return NextResponse.json(
          { error: "ID Token Google invalide." },
          { status: 401 }
        );
      }

      const info = await res.json();
      if (clientId && info.aud && info.aud !== clientId) {
        return NextResponse.json(
          { error: "Le Client ID du jeton ne correspond pas à l'application." },
          { status: 401 }
        );
      }

      const pic = info.picture ? String(info.picture) : undefined;
      const profile: GoogleUserProfile = {
        id: String(info.sub || info.email),
        name: String(info.name || info.given_name || info.email),
        givenName: info.given_name ? String(info.given_name) : undefined,
        familyName: info.family_name ? String(info.family_name) : undefined,
        email: String(info.email),
        picture: pic,
        photoURL: pic,
        image: pic,
        avatar_url: pic,
        user_metadata: {
          avatar_url: pic,
          picture: pic,
        },
      };

      return NextResponse.json({ user: profile }, { status: 200 });
    }

    return NextResponse.json(
      { error: "Paramètre accessToken ou credential manquant." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erreur de validation Google OAuth.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

