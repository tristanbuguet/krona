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
  normalizeUserFinancialPayload,
  readLocalFinancialData,
  writeLocalFinancialData,
  clearLocalFinancialData,
  resolveUserAvatarUrl,
} from "@/lib/cloudSync";

interface AuthContextValue {
  user: GoogleUserProfile | null;
  isAuthenticated: boolean;
  isOAuthConfigured: boolean;
  authError: string | null;
  clearAuthError: () => void;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  signInWithGoogle: (customProfile?: Partial<GoogleUserProfile>) => Promise<void>;
  signOut: () => void;
  triggerCloudSync: (mode?: "merge" | "overwrite") => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_STORAGE_KEY = "krona_google_user_v1";
const CLOUD_FALLBACK_PREFIX = "krona_cloud_backup_";
const DEFAULT_CLIENT_ID =
  "364266284096-8fflm97j1n422q7omq3uggrr5uf9ou8f.apps.googleusercontent.com";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  prompt?: string;
  callback: (response: GoogleTokenResponse) => void | Promise<void>;
  error_callback?: (error: unknown) => void;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface GoogleOAuth2Namespace {
  initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
}

interface GoogleAccountsNamespace {
  oauth2?: GoogleOAuth2Namespace;
  id?: {
    disableAutoSelect: () => void;
  };
}

interface GoogleGlobalObject {
  accounts?: GoogleAccountsNamespace;
}

declare global {
  interface Window {
    google?: GoogleGlobalObject;
  }
}

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Impossible de charger le SDK Google OAuth.")),
          { once: true }
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Impossible de charger le SDK Google OAuth."));
    document.head.appendChild(script);
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<GoogleUserProfile | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const envClientId = (
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) ||
    DEFAULT_CLIENT_ID
  )
    .replace(/^"|"$/g, "")
    .trim();

  const [resolvedClientId, setResolvedClientId] = useState<string>(envClientId);

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<GoogleUserProfile | null>(null);
  const isInternalWriteRef = useRef<boolean>(false);
  const isSyncingInProgressRef = useRef<boolean>(false);
  const pendingSyncAfterCurrentRef = useRef<"merge" | "overwrite" | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Pré-chargement du Client ID depuis /api/auth/google et pré-initialisation du script GSI
  useEffect(() => {
    let active = true;
    fetch("/api/auth/google")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.clientId) {
          setResolvedClientId(String(data.clientId).replace(/^"|"$/g, "").trim());
          setAuthError(null);
        }
      })
      .catch(() => {});

    loadGoogleIdentityScript().catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const isOAuthConfigured = Boolean(
    resolvedClientId && resolvedClientId.trim().length > 0
  );

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  // Synchronisation effective avec le Cloud sans boucle infinie de localStorage
  const performSync = useCallback(
    async (
      activeUser: GoogleUserProfile,
      mode: "merge" | "overwrite" = "merge",
      notifyComponents = false
    ) => {
      if (isSyncingInProgressRef.current) {
        pendingSyncAfterCurrentRef.current = mode;
        return;
      }
      isSyncingInProgressRef.current = true;
      setSyncStatus((prev) => (prev === "syncing" ? prev : "syncing"));

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
          if (mode === "merge") {
            // 1. Récupération explicite des données cloud existantes pour cet utilisateur via GET /api/sync
            let serverCloudPayload: Partial<CloudSyncPayload> | null = null;
            try {
              const getRes = await fetch(
                `/api/sync?userId=${encodeURIComponent(activeUser.id)}`,
                {
                  method: "GET",
                  headers: {
                    "x-krona-user-id": activeUser.id,
                    "x-user-email": activeUser.email,
                  },
                }
              );
              if (getRes.ok) {
                const getData = (await getRes.json()) as {
                  success?: boolean;
                  data?: Partial<CloudSyncPayload> | null;
                  payload?: Partial<CloudSyncPayload> | null;
                };
                serverCloudPayload = getData?.data ?? getData?.payload ?? null;
              }
            } catch {}

            // 2. Fusion non destructive et sauvegarde via POST /api/sync
            const candidatePayload = mergeCloudAndLocalData(
              localData,
              serverCloudPayload || localBackupCloud
            );

            const res = await fetch("/api/sync", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-krona-user-id": activeUser.id,
                "x-user-email": activeUser.email,
              },
              body: JSON.stringify({
                userId: activeUser.id,
                email: activeUser.email,
                data: candidatePayload,
                payload: candidatePayload,
                mode: "merge",
              }),
            });

            if (res.ok) {
              const data = (await res.json()) as {
                success?: boolean;
                data?: CloudSyncPayload;
                payload?: CloudSyncPayload;
              };
              if (data?.data || data?.payload) {
                syncedPayload = (data.data || data.payload) as CloudSyncPayload;
              }
            }
          } else {
            const candidatePayload = normalizeUserFinancialPayload(localData);
            const res = await fetch("/api/sync", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-krona-user-id": activeUser.id,
                "x-user-email": activeUser.email,
              },
              body: JSON.stringify({
                userId: activeUser.id,
                email: activeUser.email,
                data: candidatePayload,
                payload: candidatePayload,
                mode: "overwrite",
              }),
            });

            if (res.ok) {
              const data = (await res.json()) as {
                success?: boolean;
                data?: CloudSyncPayload;
                payload?: CloudSyncPayload;
              };
              if (data?.data || data?.payload) {
                syncedPayload = (data.data || data.payload) as CloudSyncPayload;
              }
            }
          }
        } catch {
          // Repli silencieux en local-first si hors-ligne
        }

        if (!syncedPayload) {
          syncedPayload = mergeCloudAndLocalData(localData, localBackupCloud);
        }

        // Sauvegarde du miroir cloud par utilisateur et mise à jour du stockage local
        // Verrou isInternalWriteRef activé pour empêcher Storage.prototype.setItem de relancer une boucle infinie !
        isInternalWriteRef.current = true;
        try {
          // Tente de stocker le miroir de secours, mais en cas d'erreur ou de quota plein, on ne bloque pas
          try {
            localStorage.setItem(
              `${CLOUD_FALLBACK_PREFIX}${activeUser.id}`,
              JSON.stringify(syncedPayload)
            );
          } catch {
            // Si le quota local est saturé, la sauvegarde serveur /api/sync prime
          }

          if (mode === "merge") {
            writeLocalFinancialData(syncedPayload);
          }
        } catch {
        } finally {
          isInternalWriteRef.current = false;
        }

        if (notifyComponents && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("krona-cloud-data-restored", {
              detail: { payload: syncedPayload, data: syncedPayload },
            })
          );
        }

        const nowIso =
          syncedPayload.lastUpdated ||
          syncedPayload.updatedAt ||
          new Date().toISOString();
        setLastSyncedAt(nowIso);
        setSyncStatus((prev) => (prev === "synced" ? prev : "synced"));
      } catch (err) {
        console.warn("[Krona Auth] Erreur de synchronisation:", err);
        setSyncStatus((prev) => (prev === "error" ? prev : "error"));
      } finally {
        isSyncingInProgressRef.current = false;
        const queuedMode = pendingSyncAfterCurrentRef.current;
        pendingSyncAfterCurrentRef.current = null;
        if (queuedMode && userRef.current) {
          setTimeout(() => {
            if (userRef.current) {
              performSync(userRef.current, queuedMode, false);
            }
          }, 300);
        }
      }
    },
    []
  );

  // Restauration de la session Google au chargement initial (en ignorant tout ancien profil mocké)
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(AUTH_STORAGE_KEY);
      if (savedUser) {
        const parsed = JSON.parse(savedUser) as GoogleUserProfile;
        if (parsed && parsed.id === "google-tristan-bgt") {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          return;
        }
        if (parsed && parsed.id && parsed.email) {
          const avatar = resolveUserAvatarUrl(parsed);
          const normalizedUser: GoogleUserProfile = {
            ...parsed,
            picture: avatar || parsed.picture,
            photoURL: avatar || parsed.photoURL,
            image: avatar || parsed.image,
            avatar_url: avatar || parsed.avatar_url,
          };
          setUser(normalizedUser);
          userRef.current = normalizedUser;
          performSync(normalizedUser, "merge", true);
        }
      }
    } catch {}
  }, [performSync]);

  // Interception transparente des écritures localStorage (uniquement les mutations utilisateur réelles)
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
      "krona_selected_month",
    ]);

    const scheduleBackgroundSync = (
      mode: "merge" | "overwrite" = "overwrite",
      delayMs = 800
    ) => {
      if (!userRef.current || isInternalWriteRef.current) {
        return;
      }
      if (isSyncingInProgressRef.current) {
        pendingSyncAfterCurrentRef.current = mode;
        return;
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        if (userRef.current && !isInternalWriteRef.current) {
          performSync(userRef.current, mode, false);
        }
      }, delayMs);
    };

    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;

    Storage.prototype.setItem = function (key: string, value: string) {
      const previousValue =
        this === window.localStorage
          ? (() => {
              try {
                return this.getItem(key);
              } catch {
                return null;
              }
            })()
          : null;

      try {
        originalSetItem.apply(this, [key, value]);
      } catch (err: unknown) {
        const isQuotaExceeded =
          Boolean(err && typeof err === "object" && (
            ("name" in err && (err as { name: unknown }).name === "QuotaExceededError") ||
            ("code" in err && (err as { code: unknown }).code === 22) ||
            ("number" in err && (err as { number: unknown }).number === -2147024882)
          ));

        // En cas de dépassement de quota (QuotaExceededError), tenter de purger les anciennes sauvegardes de secours
        if (isQuotaExceeded) {
          try {
            // Supprimer les clés de miroir de secours volumineuses du localStorage
            for (let i = 0; i < window.localStorage.length; i++) {
              const k = window.localStorage.key(i);
              if (k && k.startsWith("krona_cloud_backup_")) {
                window.localStorage.removeItem(k);
              }
            }
            // Réessayer l'écriture de la clé essentielle
            originalSetItem.apply(this, [key, value]);
          } catch (retryErr) {
            console.warn(
              `[Krona Storage] Quota de stockage local dépassé pour '${key}':`,
              retryErr
            );
            return;
          }
        } else {
          console.warn(`[Krona Storage] Erreur setItem sur '${key}':`, err);
          return;
        }
      }

      if (
        this === window.localStorage &&
        !isInternalWriteRef.current &&
        watchedKeys.has(key) &&
        previousValue !== value
      ) {
        scheduleBackgroundSync("overwrite");
      }
    };

    Storage.prototype.removeItem = function (key: string) {
      try {
        originalRemoveItem.apply(this, [key]);
      } catch (err) {
        console.warn(`[Krona Storage] Erreur removeItem sur '${key}':`, err);
      }
      if (
        this === window.localStorage &&
        !isInternalWriteRef.current &&
        watchedKeys.has(key)
      ) {
        scheduleBackgroundSync("overwrite");
      }
    };

    const handleCustomSyncEvent = (e: Event) => {
      const customEv = e as CustomEvent<{ mode?: "merge" | "overwrite"; immediate?: boolean }>;
      const requestedMode = customEv?.detail?.mode === "merge" ? "merge" : "overwrite";
      const immediate = Boolean(customEv?.detail?.immediate);
      scheduleBackgroundSync(requestedMode, immediate ? 100 : 800);
    };
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

  // Vraie connexion Google OAuth 2.0 via mire officielle accounts.google.com
  const signInWithGoogle = useCallback(
    async (customProfile?: Partial<GoogleUserProfile>) => {
      setAuthError(null);

      // Permet les tests programmatiques explicites si un profil complet est passé en argument
      if (customProfile && customProfile.id && customProfile.email) {
        const resolvedAvatar = resolveUserAvatarUrl(customProfile);
        const explicitProfile: GoogleUserProfile = {
          id: customProfile.id,
          name: customProfile.name || customProfile.email.split("@")[0],
          givenName: customProfile.givenName,
          familyName: customProfile.familyName,
          email: customProfile.email,
          picture: resolvedAvatar,
          photoURL: customProfile.photoURL ?? resolvedAvatar,
          image: customProfile.image ?? resolvedAvatar,
          avatar_url: customProfile.avatar_url ?? resolvedAvatar,
          user_metadata: customProfile.user_metadata,
        };
        setUser(explicitProfile);
        userRef.current = explicitProfile;
        isInternalWriteRef.current = true;
        try {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(explicitProfile));
        } finally {
          isInternalWriteRef.current = false;
        }
        await performSync(explicitProfile, "merge", true);
        return;
      }

      const activeClientId = resolvedClientId || DEFAULT_CLIENT_ID;

      try {
        await loadGoogleIdentityScript();
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) {
          setAuthError("Le SDK Google Identity Services n'a pas pu être initialisé.");
          return;
        }

        const oauthUser = await new Promise<GoogleUserProfile>((resolve, reject) => {
          const tokenClient = oauth2.initTokenClient({
            client_id: activeClientId,
            scope: "openid email profile",
            prompt: "select_account",
            callback: async (tokenResponse: GoogleTokenResponse) => {
              if (tokenResponse?.error) {
                reject(
                  new Error(
                    tokenResponse.error_description || tokenResponse.error
                  )
                );
                return;
              }
              const accessToken = tokenResponse?.access_token;
              if (!accessToken) {
                reject(new Error("Aucun jeton d'accès retourné par Google."));
                return;
              }
              try {
                // Validation côté serveur via /api/auth/google (ou fallback direct Google userinfo)
                const apiRes = await fetch("/api/auth/google", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ accessToken }),
                });

                if (apiRes.ok) {
                  const data = (await apiRes.json()) as { user?: GoogleUserProfile };
                  if (data?.user) {
                    resolve(data.user);
                    return;
                  }
                }

                const res = await fetch(
                  "https://www.googleapis.com/oauth2/v3/userinfo",
                  {
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                    },
                  }
                );
                if (!res.ok) {
                  throw new Error("Impossible de récupérer le profil Google.");
                }
                const info = (await res.json()) as {
                  sub?: string;
                  id?: string;
                  email?: string;
                  name?: string;
                  given_name?: string;
                  family_name?: string;
                  picture?: string;
                };
                const pic = info.picture ? String(info.picture) : undefined;
                resolve({
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
                });
              } catch (err) {
                reject(err);
              }
            },
            error_callback: (err: unknown) => {
              const message =
                err && typeof err === "object" && "message" in err
                  ? String((err as { message: unknown }).message)
                  : "Connexion Google annulée ou fermée.";
              reject(new Error(message));
            },
          });

          tokenClient.requestAccessToken();
        });

        setUser(oauthUser);
        userRef.current = oauthUser;
        isInternalWriteRef.current = true;
        try {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(oauthUser));
        } finally {
          isInternalWriteRef.current = false;
        }

        await performSync(oauthUser, "merge", true);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "La connexion avec Google n'a pas pu aboutir.";
        setAuthError(message);
        setSyncStatus("idle");
      }
    },
    [resolvedClientId, performSync]
  );

  // Déconnexion sécurisée : coupe la session active, purge le cache local et conserve les données dans le cloud
  const signOut = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    setUser(null);
    userRef.current = null;
    setSyncStatus("idle");
    setAuthError(null);
    isInternalWriteRef.current = true;
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      clearLocalFinancialData();
      if (typeof window !== "undefined" && window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect();
      }
    } catch {
    } finally {
      isInternalWriteRef.current = false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("krona-user-signed-out"));
    }
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
        isOAuthConfigured,
        authError,
        clearAuthError,
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
