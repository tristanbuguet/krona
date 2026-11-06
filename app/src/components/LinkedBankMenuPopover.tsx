"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Unlink, Clock } from "lucide-react";
import clsx from "clsx";
import { BankRefreshQuota, BankSessionInfo } from "@/lib/types";
import { formatBankDisplayName } from "@/lib/bankFormatting";
import { CloseButton } from "./ui/CloseButton";

export const MAX_DAILY_BANK_REFRESHES = 4;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export function resolveBankRefreshQuota(
  bankSession: BankSessionInfo | null,
  nowMs: number = Date.now()
): BankRefreshQuota {
  const rawTimestamps =
    bankSession?.refreshTimestamps ||
    bankSession?.refreshQuota?.timestamps ||
    [];
  const validRecent = rawTimestamps
    .map((ts) => {
      const parsed = Date.parse(ts);
      return isNaN(parsed) ? null : { iso: new Date(parsed).toISOString(), ms: parsed };
    })
    .filter((item): item is { iso: string; ms: number } => {
      if (!item) return false;
      const age = nowMs - item.ms;
      return age >= -60_000 && age < QUOTA_WINDOW_MS;
    })
    .sort((a, b) => a.ms - b.ms);

  if (
    rawTimestamps.length === 0 &&
    bankSession?.refreshQuota &&
    typeof bankSession.refreshQuota.remaining === "number"
  ) {
    return bankSession.refreshQuota;
  }

  const used = Math.min(MAX_DAILY_BANK_REFRESHES, validRecent.length);
  const remaining = Math.max(0, MAX_DAILY_BANK_REFRESHES - used);
  const resetAt =
    validRecent.length >= MAX_DAILY_BANK_REFRESHES
      ? new Date(validRecent[validRecent.length - MAX_DAILY_BANK_REFRESHES].ms + QUOTA_WINDOW_MS).toISOString()
      : validRecent.length > 0
        ? new Date(validRecent[0].ms + QUOTA_WINDOW_MS).toISOString()
        : null;

  return {
    limit: MAX_DAILY_BANK_REFRESHES,
    used,
    remaining,
    timestamps: validRecent.map((v) => v.iso),
    resetAt,
  };
}

export function formatRemainingRefreshLabel(remaining: number): string {
  if (remaining <= 0) {
    return "0 actualisation restante aujourd'hui";
  }
  if (remaining === 1) {
    return "1 actualisation restante aujourd'hui";
  }
  return `${remaining} actualisations restantes aujourd'hui`;
}

export interface LinkedBankMenuPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  bankSession: BankSessionInfo | null;
  isSyncing: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
  align?: "start" | "center" | "end";
}

export function LinkedBankMenuPopover({
  isOpen,
  onClose,
  bankSession,
  isSyncing,
  onRefresh,
  onDisconnect,
  align = "end",
}: LinkedBankMenuPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        popoverRef.current &&
        target &&
        !popoverRef.current.contains(target) &&
        !target.closest("[data-bank-status-pill]")
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

  const rawBankName = bankSession?.aspspName || "";
  const firstAccountName = bankSession?.accounts?.[0]?.name || "";
  const displayName = formatBankDisplayName(rawBankName, firstAccountName);
  const quota = resolveBankRefreshQuota(bankSession);
  const isQuotaReached = quota.remaining <= 0;
  const remainingLabel = formatRemainingRefreshLabel(quota.remaining);
  const consentMs = bankSession?.validUntil ? Date.parse(bankSession.validUntil) : NaN;
  const consentDaysLeft = isNaN(consentMs) ? null : Math.floor((consentMs - Date.now()) / 86_400_000);
  const accountCount = bankSession?.accounts?.length || 0;

  const alignmentClasses =
    align === "start"
      ? "left-0"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "right-0";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          role="dialog"
          aria-label={`Options du compte ${displayName}`}
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={clsx(
            "absolute top-full mt-2 z-[101] w-72 sm:w-80 rounded-2xl border border-border bg-card/95 backdrop-blur-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] p-3.5 font-sans select-none flex flex-col gap-3 overflow-hidden",
            alignmentClasses
          )}
        >
          {/* En-tête : Informations à gauche + Bouton de fermeture circulaire à droite */}
          <div className="flex items-start justify-between gap-2 px-1 pt-0.5 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground tracking-tight leading-tight truncate font-sans">
                {displayName}
              </div>
              <div className="flex items-center gap-1.5 mt-1 font-sans">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                <span className="text-xs text-muted-foreground truncate font-sans">
                  Liaison active (Open Banking)
                </span>
              </div>
              <div
                data-bank-refresh-quota
                className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground font-sans tabular-nums"
              >
                <Clock
                  size={11}
                  strokeWidth={2}
                  className={clsx(
                    "shrink-0",
                    isQuotaReached ? "text-amber-500" : "text-muted-foreground"
                  )}
                />
                <span className="truncate">{remainingLabel}</span>
              </div>
              {consentDaysLeft !== null && (
                <div
                  data-bank-consent-expiry
                  className={clsx(
                    "mt-1 text-[11px] font-sans tabular-nums truncate",
                    consentDaysLeft <= 7 ? "text-amber-500" : "text-muted-foreground"
                  )}
                >
                  {consentDaysLeft < 0
                    ? "Accès expiré · reconnexion requise"
                    : `Accès valide encore ${consentDaysLeft} jour${consentDaysLeft > 1 ? "s" : ""}`}
                  {accountCount > 1 ? ` · ${accountCount} comptes` : ""}
                </div>
              )}
            </div>

            <CloseButton onClick={onClose} iconSize={15} />
          </div>

          {/* Liste des actions : Boutons complets espacés verticalement sans séparateur horizontal */}
          <div className="flex flex-col gap-2 shrink-0">
            {/* Action 1 : Actualiser les flux */}
            <button
              type="button"
              disabled={isSyncing || isQuotaReached}
              aria-disabled={isSyncing || isQuotaReached}
              onClick={() => {
                if (isSyncing || isQuotaReached) return;
                onClose();
                onRefresh();
              }}
              className={clsx(
                "w-full h-10 px-4 rounded-full border border-border bg-neutral-50 dark:bg-white/[0.04] transition-all flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-foreground font-sans group",
                isQuotaReached
                  ? "opacity-45 cursor-not-allowed pointer-events-none"
                  : "hover:bg-neutral-100 dark:hover:bg-white/[0.08] hover:border-foreground/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              )}
            >
              <RefreshCw
                size={14}
                strokeWidth={2}
                className={clsx(
                  "text-muted-foreground shrink-0 transition-transform",
                  !isQuotaReached && "group-hover:text-foreground",
                  isSyncing && "animate-spin"
                )}
              />
              <span className="truncate">Actualiser les flux</span>
            </button>

            {isQuotaReached && (
              <div
                role="status"
                data-bank-quota-notice
                className="rounded-xl border border-border bg-neutral-50/70 dark:bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground font-sans"
              >
                La limite réglementaire quotidienne de <span className="tabular-nums font-medium text-foreground">4</span> consultations est atteinte. Un nouveau rafraîchissement sera disponible un peu plus tard.
              </div>
            )}

            {/* Action 2 : Déconnecter la banque (Bouton destructif plein gélule aligné sur "Tout réinitialiser") */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onDisconnect();
              }}
              className="w-full h-10 bg-rose-500 hover:bg-rose-600 text-white rounded-full px-4 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-rose-400/40 focus-visible:outline-none cursor-pointer shadow-sm font-sans shrink-0"
            >
              <Unlink
                size={14}
                strokeWidth={2}
                className="text-white shrink-0"
              />
              <span className="truncate">Déconnecter la banque</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
