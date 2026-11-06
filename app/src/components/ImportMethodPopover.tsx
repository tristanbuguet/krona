"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileSpreadsheet, Building2, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { CloseButton } from "./ui/CloseButton";
import {
  BankType,
  BoursoBankLogo,
  CreditAgricoleLogo,
  CaisseEpargneLogo,
  LCLLogo,
} from "./BankSelectorPopover";

export interface ImportMethodPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCsv: (bank?: BankType) => void;
  onSelectBankConnect: () => void;
  align?: "start" | "center" | "end";
}

interface SupportedBankOption {
  key: BankType;
  name: string;
  badge: string;
  Logo: React.ComponentType<{ className?: string }>;
}

const SUPPORTED_BANKS: SupportedBankOption[] = [
  {
    key: "ca",
    name: "Crédit Agricole",
    badge: "CSV",
    Logo: CreditAgricoleLogo,
  },
  {
    key: "bourso",
    name: "BoursoBank",
    badge: "CSV",
    Logo: BoursoBankLogo,
  },
  {
    key: "ce",
    name: "Caisse d'Épargne",
    badge: "CSV",
    Logo: CaisseEpargneLogo,
  },
  {
    key: "lcl",
    name: "LCL",
    badge: "CSV / TSV",
    Logo: LCLLogo,
  },
];

export function ImportMethodPopover({
  isOpen,
  onClose,
  onSelectCsv,
  onSelectBankConnect,
  align = "end",
}: ImportMethodPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const csvButtonRef = useRef<HTMLButtonElement>(null);
  const bankButtonRef = useRef<HTMLButtonElement>(null);
  const [isCsvAccordionOpen, setIsCsvAccordionOpen] = useState(false);

  // Réinitialiser l'accordéon à la fermeture du popover
  useEffect(() => {
    if (!isOpen) {
      setIsCsvAccordionOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Focus initial sur la première option pour une accessibilité clavier optimale
    const focusTimer = setTimeout(() => {
      csvButtonRef.current?.focus();
    }, 50);

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        popoverRef.current &&
        target &&
        !popoverRef.current.contains(target) &&
        !target.closest("[data-import-trigger]")
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowDown") {
        if (!isCsvAccordionOpen) {
          event.preventDefault();
          if (document.activeElement === csvButtonRef.current) {
            bankButtonRef.current?.focus();
          } else {
            csvButtonRef.current?.focus();
          }
        }
      } else if (event.key === "ArrowUp") {
        if (!isCsvAccordionOpen) {
          event.preventDefault();
          if (document.activeElement === bankButtonRef.current) {
            csvButtonRef.current?.focus();
          } else {
            bankButtonRef.current?.focus();
          }
        }
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 10);

    return () => {
      clearTimeout(focusTimer);
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, isCsvAccordionOpen]);

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
          role="menu"
          aria-label="Méthodes d'importation"
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={clsx(
            "absolute top-full mt-2 z-[101] w-72 sm:w-80 rounded-2xl border border-border bg-card/95 backdrop-blur-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] p-3 font-sans select-none flex flex-col gap-2.5 overflow-hidden",
            alignmentClasses
          )}
        >
          {/* En-tête épuré : Titre principal aligné avec la croix de fermeture (sous-titre supprimé pour compacité) */}
          <div className="flex items-center justify-between gap-2 px-1 pt-0.5 shrink-0">
            <span className="text-sm font-semibold text-foreground tracking-tight leading-none font-sans">
              Importer des données
            </span>
            <CloseButton onClick={onClose} iconSize={15} />
          </div>

          {/* Liste des actions */}
          <div className="flex flex-col gap-2 shrink-0" role="none">
            {/* Conteneur Accordéon Fichier CSV */}
            <div className="flex flex-col rounded-2xl border border-border bg-neutral-50/70 dark:bg-white/[0.02] overflow-hidden transition-colors">
              {/* Carte déclencheur Fichier CSV */}
              <button
                ref={csvButtonRef}
                type="button"
                role="button"
                aria-expanded={isCsvAccordionOpen}
                onClick={() => setIsCsvAccordionOpen((prev) => !prev)}
                className="w-full flex items-center gap-3 p-2.5 hover:bg-neutral-100/80 dark:hover:bg-white/[0.05] active:scale-[0.99] transition-all text-left group cursor-pointer font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              >
                <div className="w-8.5 h-8.5 rounded-xl bg-card border border-border flex items-center justify-center text-foreground shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                  <FileSpreadsheet size={16} strokeWidth={1.75} className="text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground tracking-tight font-sans">
                    Fichier CSV
                  </div>
                  <div className="text-xs text-muted-foreground font-sans truncate mt-0.5">
                    Sélectionner votre banque
                  </div>
                </div>
                <motion.div
                  animate={{ rotate: isCsvAccordionOpen ? 90 : 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                  className="shrink-0 ml-auto flex items-center justify-center text-muted-foreground group-hover:text-foreground"
                >
                  <ChevronRight size={15} />
                </motion.div>
              </button>

              {/* Tiroir interne vertical fluide (liste des 4 banques) */}
              <AnimatePresence initial={false}>
                {isCsvAccordionOpen && (
                  <motion.div
                    key="csv-banks-drawer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="overflow-hidden border-t border-border/60"
                  >
                    <div className="p-1 flex flex-col gap-0.5">
                      {SUPPORTED_BANKS.map((bank) => (
                        <button
                          key={bank.key}
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectCsv(bank.key);
                          }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-neutral-100/90 dark:hover:bg-white/[0.06] active:scale-[0.98] transition-all text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                        >
                          <div className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center text-foreground shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                            <bank.Logo className="w-4 h-4 text-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs sm:text-sm font-medium text-foreground tracking-tight font-sans truncate">
                              {bank.name}
                            </div>
                          </div>
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider font-sans shrink-0 px-1.5 py-0.5 rounded-md bg-black/[0.03] dark:bg-white/[0.04] border border-border/50">
                            {bank.badge}
                          </span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Ligne 2 : Connecter ma banque / Synchronisation automatique (maintien intact) */}
            <button
              ref={bankButtonRef}
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onSelectBankConnect();
              }}
              className="w-full flex items-center gap-3 p-2.5 bg-neutral-50 dark:bg-white/[0.03] rounded-2xl border border-border hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:border-foreground/20 active:scale-[0.98] transition-all text-left group cursor-pointer font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            >
              <div className="w-8.5 h-8.5 rounded-xl bg-card border border-border flex items-center justify-center text-foreground shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                <Building2 size={16} strokeWidth={1.75} className="text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground tracking-tight font-sans">
                  Connecter ma banque
                </div>
                <div className="text-xs text-muted-foreground font-sans truncate mt-0.5">
                  Synchronisation automatique
                </div>
              </div>
              <ChevronRight
                size={15}
                className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 ml-auto"
              />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
