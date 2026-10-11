"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Logo BoursoBank (Origami / Boussole)
export const BoursoBankLogo = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M22.5 5L8 35L22.5 28.5L37 35L22.5 5Z" fill="currentColor" />
    <path d="M22.5 5L8 35L22.5 28.5V5Z" fill="currentColor" fillOpacity="0.75" />
  </svg>
);

// Logo Crédit Agricole (Monogramme officiel)
export const CreditAgricoleLogo = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Tracé principal du monogramme CA */}
    <path
      d="M32 15C18.7 15 8 25.7 8 39C8 52.3 18.7 63 32 63H72V51H32C25.4 51 20 45.6 20 39C20 32.4 25.4 27 32 27H72V15H32Z"
      fill="currentColor"
    />
    <path
      d="M72 15H84V63H72V15Z"
      fill="currentColor"
    />
    {/* Barre centrale dynamique de l'accent */}
    <path
      d="M48 33L64 33L54 45L38 45L48 33Z"
      fill="currentColor"
      fillOpacity="0.8"
    />
  </svg>
);

export type BankType = "bourso" | "ca";

interface BankSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBank: (bank: BankType) => void;
}

export function BankSelectorPopover({
  isOpen,
  onClose,
  onSelectBank,
}: BankSelectorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    // Use mousedown with timeout to avoid catching the opening click
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="absolute top-full right-0 mt-2.5 w-64 sm:w-72 bg-card/95 dark:bg-[#0F0F11]/95 backdrop-blur-2xl border border-border dark:border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-2 z-[101] overflow-hidden select-none"
        >
          {/* Header */}
          <div className="px-3 pt-1.5 pb-2 border-b border-border dark:border-white/[0.06] mb-1">
            <span className="text-[11px] font-semibold tracking-tight text-neutral-400 uppercase font-sans">
              Sélectionner ta banque
            </span>
          </div>

          <div className="space-y-1">
            {/* BoursoBank Option */}
            <button
              type="button"
              onClick={() => {
                onSelectBank("bourso");
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all text-left group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border dark:border-white/[0.08] flex items-center justify-center text-foreground dark:text-white shrink-0 group-hover:bg-black/[0.06] dark:group-hover:bg-white/[0.08] transition-colors">
                <BoursoBankLogo className="w-5 h-5 text-foreground dark:text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground dark:text-white tracking-tight font-sans">
                  BoursoBank
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 font-sans truncate">
                  Relevé CSV
                </div>
              </div>
            </button>

            {/* Crédit Agricole Option */}
            <button
              type="button"
              onClick={() => {
                onSelectBank("ca");
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all text-left group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border dark:border-white/[0.08] flex items-center justify-center text-foreground dark:text-white shrink-0 group-hover:bg-black/[0.06] dark:group-hover:bg-white/[0.08] transition-colors">
                <CreditAgricoleLogo className="w-5 h-5 text-foreground dark:text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground dark:text-white tracking-tight font-sans">
                  Crédit Agricole
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 font-sans truncate">
                  Relevé de compte CSV
                </div>
              </div>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
