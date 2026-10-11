"use client";

import React, { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, Check, Trash2 } from "lucide-react";
import { CloseButton } from "./ui/CloseButton";

export interface CardData {
  id: string;
  name: string;
  bank: string;
  accountType: string;
  last4: string;
  imageUrl: string;
  isCustom?: boolean;
}

export const CARD_PRESETS: CardData[] = [
  {
    id: "bourso-ultim",
    name: "BoursoBank",
    bank: "BoursoBank",
    accountType: "Compte courant",
    last4: "4821",
    imageUrl: "/cards/bourso-card.png",
  },
  {
    id: "ca-premium",
    name: "Crédit Agricole",
    bank: "Crédit Agricole",
    accountType: "Compte de dépôt",
    last4: "5912",
    imageUrl: "/cards/ca-card.png",
  },
];

export const DEFAULT_BANK_CARDS: Record<string, CardData> = {
  bourso: CARD_PRESETS[0],
  ca: CARD_PRESETS[1],
  BoursoBank: CARD_PRESETS[0],
  "Crédit Agricole": CARD_PRESETS[1],
  "bourso-ultim": CARD_PRESETS[0],
  "ca-premium": CARD_PRESETS[1],
};

interface CardSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCardId?: string | null;
  onSelectCard: (card: CardData) => void;
  onRemoveCard?: () => void;
}

export function CardSelectorModal({
  isOpen,
  onClose,
  selectedCardId,
  onSelectCard,
  onRemoveCard,
}: CardSelectorModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          onSelectCard({
            id: "custom",
            name: "Carte personnalisée",
            bank: "BoursoBank",
            accountType: "Compte courant",
            last4: "4821",
            imageUrl: result,
            isCustom: true,
          });
          onClose();
        }
      };
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = "";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          {/* Backdrop avec flou d'arrière-plan fidèle au design system */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Fenêtre modale */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border dark:border-white/[0.08] rounded-3xl p-5 sm:p-7 shadow-2xl w-full max-w-lg relative z-10 flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-5 pb-3 border-b border-border">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-foreground font-sans">
                  Sélectionner une carte
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5 font-sans">
                  Choisis un modèle pré-configuré ou importe ton propre visuel.
                </p>
              </div>
              <CloseButton onClick={onClose} iconSize={16} />
            </div>

            {/* Liste des presets */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-0.5">
              <div>
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-3 font-sans">
                  Modèles disponibles
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {CARD_PRESETS.map((preset) => {
                    const isCurrent = selectedCardId === preset.id || 
                      (selectedCardId === "bourso" && preset.id === "bourso-ultim") || 
                      (selectedCardId === "ca" && preset.id === "ca-premium") ||
                      (selectedCardId === "BoursoBank" && preset.bank === "BoursoBank") ||
                      (selectedCardId === "Crédit Agricole" && preset.bank === "Crédit Agricole");
                    return (
                      <div
                        key={preset.id}
                        onClick={() => {
                          onSelectCard(preset);
                          onClose();
                        }}
                        className={`group relative rounded-2xl p-2.5 border transition-all cursor-pointer flex flex-col justify-between ${
                          isCurrent
                            ? "bg-black/[0.04] dark:bg-white/[0.06] border-foreground/40 ring-1 ring-foreground/20"
                            : "bg-black/[0.02] dark:bg-white/[0.02] border-border hover:border-foreground/30 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {/* Miniature visuelle au format carte bancaire */}
                        <div className="w-full aspect-[1.586/1] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm relative bg-neutral-900 mb-2">
                          <img
                            src={preset.imageUrl}
                            alt={preset.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          {isCurrent && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shadow-md">
                              <Check size={11} strokeWidth={3} />
                            </div>
                          )}
                        </div>

                        {/* Informations texte du preset */}
                        <div>
                          <div className="text-xs font-semibold text-foreground font-sans truncate">
                            {preset.name}
                          </div>
                          <div className="text-[11px] text-neutral-400 font-sans truncate">
                            {preset.bank} · •••• {preset.last4}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Option d'import personnalisé */}
              <div className="pt-2 border-t border-border">
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2 font-sans">
                  Visuel personnalisé
                </span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-border hover:border-foreground/40 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] flex items-center justify-center gap-2.5 transition-all text-xs font-medium text-foreground cursor-pointer group font-sans"
                >
                  <UploadCloud size={16} className="text-neutral-400 group-hover:text-foreground transition-colors" />
                  <span>Importer un fichier PNG personnalisé</span>
                </button>
              </div>
            </div>

            {/* Footer : Action de suppression si carte active */}
            {selectedCardId && onRemoveCard && (
              <div className="pt-4 mt-3 border-t border-border flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => {
                    onRemoveCard();
                    onClose();
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1.5 transition-colors cursor-pointer font-sans"
                >
                  <Trash2 size={13} />
                  <span>Retirer la carte</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 px-4 rounded-full text-xs font-medium text-neutral-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer font-sans"
                >
                  Fermer
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
