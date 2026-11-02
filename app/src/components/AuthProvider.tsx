"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  GoogleUserProfile,
  SyncStatus,
  CloudSyncPayload,
  mergeCloudAndLocalData,
  readLocalFinancialData,
  writeLocalFinancialData,
} from "@/lib/cloudSync";

interface AuthContextValue {
  user: GoogleUserProfile | null;
  isAuthenticated: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  signInWithGoogle: (customProfile?: Partial<GoogleUserProfile>) => Promise<void>;
  signOut: () => void;
  triggerCloudSync: (mode?: "merge" | "overwrite") => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_STORAGE_KEY = "krona_google_user_v1";
const CLOUD_FALLBACK_PREFIX = "krona_cloud_backup_";

const DEFAULT_GOOGLE_USER: GoogleUserProfile = {
  id: "google-tristan-bgt",
  name: "Tristan Bgt",
  givenName: "Tristan",
  familyName: "Bgt",
  email: "tristan.bgt@gmail.com",
  picture: "",
};

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<GoogleUserProfile | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<GoogleUserProfile | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Synchronisation effective avec le Cloud (API + fallback stockage isolé par compte)
  const performSync = useCallback(
    async (
      activeUser: GoogleUserProfile,
      mode: "merge" | "overwrite" = "merge",
      notifyComponents = false
    ) => {
      setSyncStatus("syncing");
      try {
        const localData = readLocalFinancialData();

        // Lecture du backup cloud local de secours au cas où le serveur est hors-ligne
        let localBackupCloud: Partial<CloudSyncPayload> | null = null;
        try {
          const rawBackup = localStorage.getItem(
            `${CLOUD_FALLBACK_PREFIX}${activeUser.id}`
          );
          if (rawBackup) {
            localBackupCloud = JSON.parse(rawBackup);
          }
        } catch {}

        // Appel à l'API de synchronisation Cloud Next.js
        let syncedPayload: CloudSyncPayload | null = null;
        try {
          const res = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: activeUser.id,
              payload: localData,
              mode,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data?.payload) {
              syncedPayload = data.payload as CloudSyncPayload;
            }
          }
        } catch {
          // Repli silencieux en local-first si hors-ligne
        }

        if (!syncedPayload) {
          syncedPayload = mergeCloudAndLocalData(localData, localBackupCloud);
        }

        // Sauvegarde du miroir cloud par utilisateur et mise à jour du stockage local
        try {
          localStorage.setItem(
            `${CLOUD_FALLBACK_PREFIX}${activeUser.id}`,
            JSON.stringify(syncedPayload)
          );
        } catch {}

        writeLocalFinancialData(syncedPayload);

        if (notifyComponents && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("krona-cloud-data-restored", {
              detail: { payload: syncedPayload },
            })
          );
        }

        const nowIso = syncedPayload.updatedAt || new Date().toISOString();
        setLastSyncedAt(nowIso);
        setSyncStatus("synced");
      } catch (err) {
        console.warn("[Krona Auth] Erreur de synchronisation:", err);
        setSyncStatus("error");
      }
    },
    []
  );

  // Restauration de la session Google au chargement initial
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(AUTH_STORAGE_KEY);
      if (savedUser) {
        const parsed = JSON.parse(savedUser) as GoogleUserProfile;
        if (parsed && parsed.id && parsed.email) {
          setUser(parsed);
          userRef.current = parsed;
          performSync(parsed, "merge", true);
        }
      }
    } catch {}
  }, [performSync]);

  // Interception transparente des écritures localStorage pour synchroniser en tâche de fond
  useEffect(() => {
    if (typeof window === "undefined") return;

    const watchedKeys = new Set([
      "financeTransactions_v1",
      "categoryBudgets",
      "fixedIncomeSettings",
      "krona_ignored_subscriptions",
      "krona_merchant_knowledge",
      "krona_monthly_limit_config",
      "krona_monthly_spending_limit",
      "krona_accounts_v1",
      "krona_selected_bank",
    ]);

    const scheduleBackgroundSync = (mode: "merge" | "overwrite" = "overwrite") => {
      if (!userRef.current) return;
      setSyncStatus("syncing");
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        if (userRef.current) {
          performSync(userRef.current, mode, false);
        }
      }, 450);
    };

    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;

    Storage.prototype.setItem = function (key: string, value: string) {
      originalSetItem.apply(this, [key, value]);
      if (this === window.localStorage && watchedKeys.has(key)) {
        scheduleBackgroundSync("overwrite");
      }
    };

    Storage.prototype.removeItem = function (key: string) {
      originalRemoveItem.apply(this, [key]);
      if (this === window.localStorage && watchedKeys.has(key)) {
        scheduleBackgroundSync("overwrite");
      }
    };

    const handleCustomSyncEvent = () => scheduleBackgroundSync("overwrite");
    window.addEventListener("krona-local-data-mutated", handleCustomSyncEvent);

    return () => {
      Storage.prototype.setItem = originalSetItem;
      Storage.prototype.removeItem = originalRemoveItem;
      window.removeEventListener("krona-local-data-mutated", handleCustomSyncEvent);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [performSync]);

  // Connexion Google OAuth 2.0 (avec migration immédiate sans écrasement des données locales)
  const signInWithGoogle = useCallback(
    async (customProfile?: Partial<GoogleUserProfile>) => {
      setSyncStatus("syncing");

      const clientId =
        typeof process !== "undefined"
          ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
          : undefined;

      // Si Google Identity Services est configuré et disponible dans la fenêtre
      if (
        typeof window !== "undefined" &&
        clientId &&
        (window as any).google?.accounts?.id &&
        !customProfile
      ) {
        try {
          const gsiUser = await new Promise<GoogleUserProfile | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 4000);
            (window as any).google.accounts.id.initialize({
              client_id: clientId,
              callback: (response: any) => {
                clearTimeout(timeout);
                const payload = response?.credential
                  ? decodeJwtPayload(response.credential)
                  : null;
                if (payload && payload.sub && payload.email) {
                  resolve({
                    id: String(payload.sub),
                    name: String(payload.name || payload.email.split("@")[0]),
                    givenName: payload.given_name ? String(payload.given_name) : undefined,
                    familyName: payload.family_name ? String(payload.family_name) : undefined,
                    email: String(payload.email),
                    picture: payload.picture ? String(payload.picture) : undefined,
                  });
                } else {
                  resolve(null);
                }
              },
            });
            (window as any).google.accounts.id.prompt((notification: any) => {
              if (
                notification.isNotDisplayed() ||
                notification.isSkippedMoment()
              ) {
                clearTimeout(timeout);
                resolve(null);
              }
            });
          });

          if (gsiUser) {
            setUser(gsiUser);
            userRef.current = gsiUser;
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(gsiUser));
            await performSync(gsiUser, "merge", true);
            return;
          }
        } catch {}
      }

      // Profil OAuth résolu (local/dev ou personnalisé)
      const resolvedProfile: GoogleUserProfile = {
        id: customProfile?.id || DEFAULT_GOOGLE_USER.id,
        name: customProfile?.name || DEFAULT_GOOGLE_USER.name,
        givenName: customProfile?.givenName || DEFAULT_GOOGLE_USER.givenName,
        familyName: customProfile?.familyName || DEFAULT_GOOGLE_USER.familyName,
        email: customProfile?.email || DEFAULT_GOOGLE_USER.email,
        picture: customProfile?.picture ?? DEFAULT_GOOGLE_USER.picture,
      };

      setUser(resolvedProfile);
      userRef.current = resolvedProfile;
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(resolvedProfile));
      } catch {}

      // Migration et fusion automatique des opérations locales vers le cloud sans écrasement
      await performSync(resolvedProfile, "merge", true);
    },
    [performSync]
  );

  // Déconnexion fluide : réinitialise la session active sans altérer les données sauvegardées
  const signOut = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    setUser(null);
    userRef.current = null;
    setSyncStatus("idle");
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.disableAutoSelect();
      }
    } catch {}
  }, []);

  const triggerCloudSync = useCallback(
    async (mode: "merge" | "overwrite" = "merge") => {
      if (!userRef.current) return;
      await performSync(userRef.current, mode, false);
    },
    [performSync]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        syncStatus,
        lastSyncedAt,
        signInWithGoogle,
        signOut,
        triggerCloudSync,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

