"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Repeat, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { CloseButton } from "./ui/CloseButton";

export interface SubscriptionItem {
  id: string;
  name: string;
  amount: number;
  date: string;
  type?: string;
}

export interface SubscriptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscriptions: SubscriptionItem[];
  totalMonthly: number;
  onManageSubscriptions?: () => void;
}

export function SubscriptionsModal({
  isOpen,
  onClose,
  subscriptions,
  totalMonthly,
  onManageSubscriptions,
}: SubscriptionsModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
          {/* Backdrop avec fondu fluide Apple */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal Container avec spring scale & fade */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0F0F11] border border-white/[0.08] rounded-3xl p-6 md:p-8 shadow-2xl relative z-10 mx-4 flex flex-col max-h-[85vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-6 pb-4 border-b border-white/[0.06] pr-10">
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h2 className="text-xl font-bold tracking-tight text-white font-sans">
                    Abonnements récurrents
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.06] border border-white/[0.08] text-neutral-300 font-sans tabular-nums">
                    {totalMonthly.toFixed(2)} € / mois
                  </span>
                  <span className="text-xs text-neutral-400 font-sans">
                    {subscriptions.length} service{subscriptions.length > 1 ? "s" : ""} identifié{subscriptions.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <CloseButton
                onClick={onClose}
                className="absolute top-6 right-6 z-10"
                iconSize={18}
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 min-h-0 pr-0.5">
              {subscriptions.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-400">
                  <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3 text-neutral-400">
                    <Repeat size={20} />
                  </div>
                  <p className="text-sm font-medium text-white font-sans">
                    Aucun abonnement détecté
                  </p>
                  <p className="text-xs text-neutral-400 mt-1 max-w-xs font-sans">
                    Tes prélèvements récurrents mensuels s&apos;afficheront ici automatiquement.
                  </p>
                </div>
              ) : (
                subscriptions.map((sub, index) => (
                  <div
                    key={sub.id || `sub-${index}`}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-neutral-300 shrink-0">
                        <Repeat size={17} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-white truncate font-sans">
                          {sub.name}
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5 font-sans">
                          Dernier débit : {sub.date}
                        </div>
                      </div>
                    </div>
                    <div className="font-sans font-semibold text-sm text-white tabular-nums shrink-0 ml-4">
                      {Math.abs(sub.amount).toFixed(2)} €
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer action */}
            {onManageSubscriptions && (
              <div className="pt-4 mt-4 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-sans">
                  Gestion des règles de récurrence
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onManageSubscriptions();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white hover:text-neutral-300 transition-colors cursor-pointer font-sans"
                >
                  <span>Configurer</span>
                  <ArrowUpRight size={13} />
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
