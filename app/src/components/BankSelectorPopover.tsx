"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Logo BoursoBank (Officiel)
export const BoursoBankLogo = ({ className = "w-4.5 h-4.5" }: { className?: string }) => (
  <svg viewBox="0 0 31 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M30.4004 0.0517578C30.5991 -0.0997255 30.8993 0.101661 30.8496 0.402344L27.792 17.5469H27.7949L24.5361 35.793C24.5359 36.0437 24.1857 36.0438 24.1357 35.8428V35.8447L18.4834 18.3896L0.222656 19.8516C0.0212473 19.8516 -0.0784181 19.6002 0.0732422 19.4512L15.6621 9.47656V9.47559L30.4004 0.0517578Z" fill="currentColor" />
  </svg>
);

// Logo Crédit Agricole (Officiel)
export const CreditAgricoleLogo = ({ className = "w-5 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 36 25" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M23.7431 11.5845L21.4915 5.90262L18.5643 12.1808C17.5736 14.161 14.3312 14.7349 12.0682 15.0499L12.4848 14.206L19.0371 1.84091H24.1484L27.8074 9.3455L29.4173 12.9009L32.7273 20.0455L30.4418 20.0342L28.663 20.0229C27.92 20.0342 27.1882 19.9779 26.8729 19.1904L26.2425 17.6602L25.1842 15.0836L23.7431 11.5845Z" fill="currentColor" />
    <path d="M33.5454 22.0909H0V24.9545H33.5454V22.0909Z" fill="currentColor" />
    <path d="M35.9777 0L34.64 0.712695L29.8912 3.20713C29.8912 3.20713 28.2525 4.08686 27.2046 4.30958C27.4944 5.21158 27.7843 5.79064 28.063 6.24721C28.141 6.38084 28.2636 6.4922 28.3974 6.57015C28.5757 6.68151 28.7764 6.73719 28.9882 6.74833C29.2 6.75946 29.4118 6.71492 29.6125 6.6147L36 3.18485L35.9777 0Z" fill="currentColor" />
    <path d="M27.7382 9.37231L23.7024 11.5976C18.638 14.3459 12.0533 17.0052 6.35168 16.5379C3.93689 16.3376 2.49473 15.4364 2.62888 13.9009C2.7854 12.154 4.30582 10.3181 6.96656 8.48217C9.00124 7.08021 10.79 6.31247 11.7291 5.98979C12.9588 5.55585 14.0097 5.3667 15.1276 5.31106C15.396 5.31106 15.6531 5.33332 15.8431 5.38895C15.8431 5.35557 15.832 5.32219 15.8208 5.28881C15.3065 2.02869 14.4569 1.59475 13.1041 1.63925C9.32545 1.76165 4.58531 4.35417 2.06991 7.3695C0.717177 8.98287 0.035223 10.9189 0.00168427 12.2986C-0.043034 14.4127 0.795434 17.2945 3.3891 18.7632C6.27343 20.3989 10.3987 20.2876 14.1438 19.442C18.1685 18.5407 21.6901 16.8049 25.1445 15.0581L29.3369 12.8883L35.9776 9.09414L35.9999 4.96614L27.7382 9.37231Z" fill="currentColor" />
  </svg>
);

// Logo Caisse d'Épargne (Officiel)
export const CaisseEpargneLogo = ({ className = "w-4.5 h-4.5" }: { className?: string }) => (
  <svg viewBox="0 0 284 284" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="284" height="284" rx="42" fill="#D9001B" />
    <g transform="translate(-2843.29, -198.58)" fill="#FFFFFF">
      <path d="m 3057.68,286.484 h -49.41 c -0.97,0 -1.86,-0.507 -2.34,-1.339 l -9.63,-15.731 h 43.36 c 4.82,0 9.29,2.551 11.73,6.723" />
      <path d="m 3071.4,247.801 h -86.64 c -0.96,0 -1.86,-0.512 -2.35,-1.34 l -9.6,-15.742 h 80.57 c 4.82,0 9.28,2.558 11.72,6.719" />
      <path d="m 3046.57,368.359 -6.37,-10.488 c -0.64,-1 -0.57,-2.301 0.18,-3.211 l 16.01,-19.5 -11.41,-11.597 c -1.14,-0.973 -1.28,-2.68 -0.31,-3.833 l 7.34,-8.648 23.15,23.981" />
      <path d="m 3025.08,335.02 c 0,4.187 3.39,7.578 7.58,7.578 4.19,0 7.58,-3.391 7.58,-7.578 0,-4.192 -3.39,-7.582 -7.58,-7.582 -4.19,0 -7.58,3.39 -7.58,7.582" />
      <path d="m 2965.18,407.984 c -13.61,-9.671 -25.18,-19.589 -34.7,-29.75 h -24.92 c -0.91,0 -1.76,-0.453 -2.26,-1.211 l -6.72,-11.031 h 23.5 c -3.4,-4.469 -6.41,-8.969 -9.03,-13.508 h -21.16 c -0.9,0 -1.75,-0.453 -2.26,-1.211 l -6.72,-11.031 h 24.03 c -1.88,-4.469 -3.39,-8.98 -4.54,-13.508 h -26.17 c -0.91,0 -1.76,-0.453 -2.26,-1.211 l -6.73,-11.039 h 32.99 c -0.02,-0.152 -0.04,-0.312 -0.06,-0.472 -2.88,-28.981 7.87,-49.008 17.66,-60.489 8.35,-9.789 21.86,-19.121 29.4,-22.148 l 87.96,144.578 c 1.8,2.961 1.53,6.738 -0.67,9.418 l -8.3,9.563 -85.1,-140.09 c -9.88,7.687 -26.92,25.789 -23.77,57.461 0.07,0.726 0.16,1.457 0.26,2.179 h 26.68 c 0.97,0 1.88,0.508 2.39,1.348 l 6.64,10.902 h -32.99 c 1.45,4.618 3.34,9.118 5.62,13.508 h 34 c 0.98,0 1.89,0.5 2.4,1.34 l 6.63,10.902 h -35.49 c 3.31,4.649 7.03,9.149 11.08,13.508 h 31.05 c 0.98,0 1.88,0.512 2.39,1.34 l 6.64,10.902 h -27.44 c 26.38,23.239 60.91,41.508 88.09,54.34 3.48,1.641 6.4,4.25 8.4,7.528 l 13.06,21.402 c -23.32,-10.359 -65.62,-29.422 -99.58,-53.52" />
    </g>
  </svg>
);

import clsx from "clsx";

export type BankType = "bourso" | "ca" | "ce";

interface BankSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBank: (bank: BankType) => void;
  align?: "left" | "right";
  side?: "bottom" | "right";
}

export function BankSelectorPopover({
  isOpen,
  onClose,
  onSelectBank,
  align = "left",
  side = "right",
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
          initial={side === "right" ? { opacity: 0, x: -8, scale: 0.96 } : { opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={side === "right" ? { opacity: 0, x: -8, scale: 0.96 } : { opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={clsx(
            "absolute w-64 sm:w-72 bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-2 z-[101] overflow-hidden select-none",
            side === "right"
              ? "left-full top-0 ml-3"
              : align === "left" ? "top-full mt-2.5 left-0" : "top-full mt-2.5 right-0"
          )}
        >
          {/* Header */}
          <div className="px-3 pt-2 pb-1">
            <span className="text-[11px] font-semibold tracking-tight text-muted-foreground uppercase font-sans">
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
              <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border flex items-center justify-center text-foreground shrink-0 group-hover:bg-black/[0.06] dark:group-hover:bg-white/[0.08] transition-colors">
                <BoursoBankLogo className="w-4.5 h-4.5 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground tracking-tight font-sans">
                  BoursoBank
                </div>
                <div className="text-xs text-muted-foreground font-sans truncate">
                  Relevé de compte CSV
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
              <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border flex items-center justify-center text-foreground shrink-0 group-hover:bg-black/[0.06] dark:group-hover:bg-white/[0.08] transition-colors">
                <CreditAgricoleLogo className="w-5 h-4 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground tracking-tight font-sans">
                  Crédit Agricole
                </div>
                <div className="text-xs text-muted-foreground font-sans truncate">
                  Relevé de compte CSV
                </div>
              </div>
            </button>

            {/* Caisse d'Épargne Option */}
            <button
              type="button"
              onClick={() => {
                onSelectBank("ce");
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all text-left group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border flex items-center justify-center text-foreground shrink-0 group-hover:bg-black/[0.06] dark:group-hover:bg-white/[0.08] transition-colors">
                <CaisseEpargneLogo className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground tracking-tight font-sans">
                  Caisse d'Épargne
                </div>
                <div className="text-xs text-muted-foreground font-sans truncate">
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
