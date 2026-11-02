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
  picture,
  name,
  email,
  size = "sm",
}: {
  picture?: string;
  name?: string;
  email?: string;
  size?: "sm" | "md";
}) {
  const [imgError, setImgError] = useState(false);

  const initials = React.useMemo(() => {
    const source = (name || email || "U").trim();
    const parts = source.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  }, [name, email]);

  const sizeClasses = size === "md" ? "w-9 h-9 text-xs" : "w-6 h-6 text-[10px]";

  if (picture && !imgError) {
    return (
      <img
        src={picture}
        alt={name || "Profil Google"}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
        className={clsx(
          sizeClasses,
          "rounded-full object-cover ring-1 ring-black/10 dark:ring-white/15 shrink-0 select-none"
        )}
      />
    );
  }

  return (
    <div
      className={clsx(
        sizeClasses,
        "rounded-full bg-foreground text-background font-semibold flex items-center justify-center ring-1 ring-black/10 dark:ring-white/20 shrink-0 select-none font-sans tracking-tight"
      )}
    >
      {initials}
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
    syncStatus,
    signInWithGoogle,
    signOut,
    triggerCloudSync,
  } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
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
      document.addEventListener("keydown", handleKeyDown);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleGoogleSignIn = async () => {
    try {
      setIsConnecting(true);
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
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="absolute left-full bottom-0 ml-3 w-72 sm:w-80 bg-card border border-border shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-3 z-[101] overflow-hidden select-none font-sans"
        >
          {!isAuthenticated || !user ? (
            /* ÉTAT DÉCONNECTÉ (INVITÉ / LOCAL-FIRST) */
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2 px-1 pt-0.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
                    <Cloud size={15} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground tracking-tight leading-tight">
                      Synchronisation Cloud
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Mode local actif
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border shrink-0">
                  Invité
                </span>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed px-1">
                Connecte ton compte Google pour sauvegarder et synchroniser automatiquement tes finances sur tous tes appareils, sans rien perdre de tes données locales.
              </p>

              <div className="rounded-xl bg-muted/60 border border-border px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck size={13} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span className="truncate">Migration automatique sans écrasement</span>
              </div>

              <button
                type="button"
                disabled={isConnecting}
                onClick={handleGoogleSignIn}
                className="w-full h-9 px-4 rounded-full bg-foreground text-background hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 text-xs font-medium cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:opacity-50"
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
            <div className="flex flex-col gap-2.5">
              {/* En-tête Profil */}
              <div className="flex items-center gap-3 px-1.5 py-1">
                <UserAvatar
                  picture={user.picture}
                  name={user.name}
                  email={user.email}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground tracking-tight truncate">
                      {user.name}
                    </span>
                    <GoogleGLogo className="w-3 h-3 shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </div>
                </div>
              </div>

              {/* Indicateur discret de statut de synchronisation */}
              <div className="rounded-xl bg-muted/60 border border-border px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {syncStatus === "syncing" ? (
                    <RefreshCw
                      size={13}
                      className="text-muted-foreground animate-spin shrink-0"
                    />
                  ) : syncStatus === "error" ? (
                    <AlertCircle size={13} className="text-rose-500 shrink-0" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
                  )}
                  <span className="text-xs font-medium text-foreground truncate">
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
                  className="h-6 px-2 rounded-full bg-card hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border border-border text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer active:scale-95 shrink-0"
                >
                  {syncStatus === "synced" ? (
                    <>
                      <Check size={11} className="text-emerald-500 dark:text-emerald-400" />
                      <span>Cloud</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={10} />
                      <span>Sync</span>
                    </>
                  )}
                </button>
              </div>

              {/* Séparateur subtil */}
              <div className="h-[1px] w-full bg-border my-0.5" />

              {/* Action de déconnexion */}
              <button
                type="button"
                onClick={() => {
                  signOut();
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-rose-500 dark:hover:text-rose-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all cursor-pointer group"
              >
                <span className="flex items-center gap-2.5">
                  <LogOut
                    size={14}
                    className="text-muted-foreground group-hover:text-rose-500 dark:group-hover:text-rose-400 transition-colors"
                  />
                  <span>Se déconnecter</span>
                </span>
                <span className="text-[10px] text-muted-foreground/70 group-hover:text-rose-500/80 dark:group-hover:text-rose-400/80">
                  Local conservé
                </span>
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

