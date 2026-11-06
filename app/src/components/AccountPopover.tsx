"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud,
  Check,
  RefreshCw,
  LogOut,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "./AuthProvider";
import { GoogleUserProfile, resolveUserAvatarUrl } from "@/lib/cloudSync";
import { formatBankDisplayName } from "@/lib/bankFormatting";
import { CloseButton } from "./ui/CloseButton";

export const GoogleGLogo = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export function UserAvatar({
  user,
  picture,
  name,
  email,
  size = "sm",
}: {
  user?: Partial<GoogleUserProfile> | null;
  picture?: string;
  name?: string;
  email?: string;
  size?: "sm" | "md";
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const avatarUrl =
    resolveUserAvatarUrl(user) ||
    user?.photoURL ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.image ||
    picture;

  const resolvedName = name || user?.name || "";
  const resolvedEmail = email || user?.email || "";

  const initials = React.useMemo(() => {
    const source = (resolvedName || resolvedEmail || "TB").trim();
    const parts = source.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  }, [resolvedName, resolvedEmail]);

  const sizeClasses = size === "md" ? "w-9 h-9 text-xs" : "w-6 h-6 text-[10px]";
  const showImg = Boolean(avatarUrl && failedUrl !== avatarUrl);

  return (
    <div
      className={clsx(
        sizeClasses,
        "relative rounded-full overflow-hidden ring-1 ring-black/10 dark:ring-white/20 shrink-0 select-none flex items-center justify-center bg-foreground text-background font-semibold font-sans tracking-tight"
      )}
    >
      {showImg ? (
        <img
          src={avatarUrl}
          alt={resolvedName || "Profil Google"}
          onError={() => setFailedUrl(avatarUrl || null)}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover rounded-full"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

interface AccountPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountPopover({ isOpen, onClose }: AccountPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const {
    user,
    isAuthenticated,
    authError,
    clearAuthError,
    syncStatus,
    signInWithGoogle,
    signOut,
    triggerCloudSync,
  } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [linkedBankName, setLinkedBankName] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    try {
      const stored = localStorage.getItem("financeTransactions_v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        setHasLocalData(Array.isArray(parsed) && parsed.length > 0);
      } else {
        setHasLocalData(false);
      }

      const storedBank = localStorage.getItem("krona_bank_session_v1");
      if (storedBank) {
        const parsedBank = JSON.parse(storedBank);
        if (parsedBank && parsedBank.sessionId) {
          setLinkedBankName(
            formatBankDisplayName(parsedBank.aspspName, parsedBank.accounts?.[0]?.name)
          );
        } else {
          setLinkedBankName(null);
        }
      } else {
        setLinkedBankName(null);
      }
    } catch {
      setHasLocalData(false);
      setLinkedBankName(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        popoverRef.current &&
        target &&
        !popoverRef.current.contains(target) &&
        !target.closest("#sidebar-account-btn")
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleGoogleSignIn = async () => {
    try {
      setIsConnecting(true);
      clearAuthError();
      await signInWithGoogle();
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          role="dialog"
          aria-label={isAuthenticated ? "Menu du compte Google" : "Connexion Google"}
          initial={{ opacity: 0, x: -8, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="absolute left-full bottom-0 ml-3 w-80 shrink-0 bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-3.5 z-[101] overflow-hidden select-none font-sans flex flex-col"
        >
          {!isAuthenticated || !user ? (
            /* ÉTAT DÉCONNECTÉ (INVITÉ / LOCAL-FIRST) */
            <div className="flex flex-col gap-3 shrink-0">
              <div className="flex items-start justify-between gap-2 px-1 pt-0.5 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
                    <Cloud size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground tracking-tight leading-tight truncate font-sans">
                      Synchronisation Cloud
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
                      <span className="text-xs text-muted-foreground truncate font-sans">
                        {linkedBankName
                          ? `Mode invité · ${linkedBankName}`
                          : hasLocalData
                            ? "Mode invité · Données locales"
                            : "Mode invité"}
                      </span>
                    </div>
                  </div>
                </div>
                <CloseButton onClick={onClose} iconSize={15} />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed px-1 shrink-0 font-sans">
                {linkedBankName
                  ? "Banque connectée. Connectez votre compte Google pour sauvegarder et synchroniser vos accès bancaires dans le cloud."
                  : "Connectez votre compte Google pour synchroniser vos finances et y accéder sur tous vos appareils."}
              </p>

              <div className="rounded-xl bg-muted/60 border border-border px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground min-h-[36px] shrink-0 font-sans">
                <ShieldCheck size={13} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span className="truncate">Migration automatique sans écrasement</span>
              </div>

              {authError && !authError.includes("Clé OAuth manquante") && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 flex items-start gap-2 text-xs text-rose-500 dark:text-rose-400 shrink-0 font-sans">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span className="leading-snug">{authError}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isConnecting}
                onClick={handleGoogleSignIn}
                className="w-full h-9 px-4 rounded-full bg-foreground text-background hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2.5 text-xs font-medium cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:opacity-50 shrink-0 font-sans"
              >
                <span className="w-4.5 h-4.5 rounded-full bg-white flex items-center justify-center shrink-0">
                  <GoogleGLogo className="w-3.5 h-3.5" />
                </span>
                <span>
                  {isConnecting ? "Connexion en cours..." : "Continuer avec Google"}
                </span>
              </button>
            </div>
          ) : (
            /* ÉTAT CONNECTÉ */
            <div className="flex flex-col gap-2.5 shrink-0">
              {/* En-tête Profil + Croix de fermeture */}
              <div className="flex items-center justify-between gap-2 px-1 pt-0.5 shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <UserAvatar
                    user={user}
                    picture={user.picture}
                    name={user.name}
                    email={user.email}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground tracking-tight truncate font-sans">
                      {user.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate font-sans mt-0.5">
                      {user.email}
                    </div>
                  </div>
                </div>

                <CloseButton onClick={onClose} iconSize={15} />
              </div>

              {/* Indicateur discret de statut de synchronisation (hauteur fixe min-h-[44px] & DOM constant sans layout shift) */}
              <div className="min-h-[44px] h-[44px] rounded-xl bg-muted/60 border border-border px-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {syncStatus === "syncing" ? (
                      <RefreshCw
                        size={13}
                        className="text-muted-foreground animate-spin"
                      />
                    ) : syncStatus === "error" ? (
                      <AlertCircle size={13} className="text-rose-500" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 block" />
                    )}
                  </span>
                  <span className="text-xs font-medium text-foreground truncate leading-none font-sans">
                    {syncStatus === "syncing"
                      ? "Synchronisation..."
                      : syncStatus === "error"
                        ? "Sauvegarde locale active"
                        : "Données synchronisées"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => triggerCloudSync("merge")}
                  title="Synchroniser maintenant"
                  aria-label="Synchroniser maintenant"
                  className="h-6 min-w-[62px] px-2 rounded-full bg-card hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border border-border text-xs font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 font-sans"
                >
                  <span className="w-3 h-3 flex items-center justify-center shrink-0">
                    {syncStatus === "syncing" ? (
                      <RefreshCw size={10} className="animate-spin" />
                    ) : (
                      <Check size={11} className="text-emerald-500 dark:text-emerald-400" />
                    )}
                  </span>
                  <span className="leading-none">Cloud</span>
                </button>
              </div>

              {/* Rangée inférieure : Bouton destructif « Se déconnecter » + Mention « Cloud sauvegardé » */}
              <div className="flex items-center justify-between gap-2 px-1 pt-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    onClose();
                  }}
                  className="h-8 px-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-all select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-rose-400/40 focus-visible:outline-none cursor-pointer shadow-sm font-sans shrink-0"
                >
                  <LogOut size={13} className="shrink-0" />
                  <span>Se déconnecter</span>
                </button>
                <span className="text-xs text-muted-foreground font-sans truncate">
                  Cloud sauvegardé
                </span>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
