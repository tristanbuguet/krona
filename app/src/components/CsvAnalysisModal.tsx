"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

export type ImportStep = "importing" | "reading" | "categorizing" | "success";

interface CsvAnalysisModalProps {
  step: ImportStep | null;
}

function KronaLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 48 48" 
      fill="none" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask id="krona_import_overlay_mask" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
        <rect width="48" height="48" fill="#D9D9D9"/>
      </mask>
      <g mask="url(#krona_import_overlay_mask)">
        <path 
          d="M23.2335 4.16299L31.7073 4.15991C31.4734 5.06138 31.1832 6.09483 30.8764 6.97572C30.1612 9.01702 29.2238 10.9732 28.0811 12.809C23.2291 20.5663 15.0014 24.8882 6.19107 26.485C6.55881 26.498 7.66306 26.3771 8.06439 26.3262C12.1265 25.812 16.0894 24.5393 19.7264 22.6791C27.3158 18.7973 32.5755 12.27 35.1642 4.16286L41.8804 4.16192L41.8784 8.71949C41.8778 10.2935 42.023 10.2165 41.3689 11.6459C37.9432 19.1315 30.5631 23.7696 23.0482 26.3872C20.5489 27.2392 17.9961 27.9243 15.4064 28.4386C15.8156 28.4593 16.3174 28.4463 16.7327 28.4461L19.0955 28.444C19.3018 28.4453 19.6022 28.4513 19.8052 28.4373C20.2254 28.4084 20.7343 28.2817 21.1481 28.1845C22.0767 27.9662 22.9981 27.7181 23.9109 27.4407C30.6382 25.4471 37.1473 22.1025 41.8911 16.8256C41.8668 17.1161 41.8804 17.5995 41.8804 17.9052L41.881 19.833C41.881 22.145 41.912 24.5319 41.881 26.8364C41.4741 27.2215 40.9507 27.6181 40.5006 27.9508C38.1977 29.6266 35.64 30.9189 32.926 31.7778C32.0348 32.0631 31.0969 32.2797 30.1875 32.4927C30.3673 32.5002 30.5666 32.4996 30.7471 32.4959C31.8072 32.4746 32.8894 32.5276 33.9465 32.4877C34.1433 32.9524 34.3337 33.5115 34.5164 33.9912L35.5438 36.6707L38.022 43.1516C37.126 43.1673 36.1987 43.1559 35.3009 43.1561L30.3568 43.1568C30.0538 42.5296 29.7815 41.8759 29.503 41.2375L28.3274 38.5546C27.663 37.0299 26.9362 35.4697 26.3006 33.9391L5.89478 33.9395L5.89686 22.9505C11.2806 21.8278 16.1931 19.0601 19.3992 14.5111C21.536 11.4794 22.8502 7.84619 23.2335 4.16299Z" 
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function CsvAnalysisModal({ step }: CsvAnalysisModalProps) {
  const isSuccess = step === "success";
  const label =
    step === "success"
      ? "Relevé importé"
      : step === "categorizing"
      ? "Catégorisation IA..."
      : "Importation...";

  return (
    <AnimatePresence>
      {step && (
        <motion.div
          key="import-overlay-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto select-none"
        >
          <motion.div
            key="import-overlay-card"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-full max-w-[210px] sm:max-w-[220px] p-6 bg-card/90 backdrop-blur-2xl border border-border rounded-3xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.08)] flex flex-col items-center justify-center text-center gap-4"
          >
            {/* Élément central : Logo Krona + Anneau fluide de chargement ou Coche discrète */}
            <div className="relative w-14 h-14 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {isSuccess ? (
                  <motion.div
                    key="success-indicator"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                    className="w-14 h-14 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400"
                  >
                    <Check size={24} strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="loading-indicator"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="relative w-14 h-14 flex items-center justify-center"
                  >
                    {/* Piste circulaire subtile */}
                    <div className="absolute inset-0 rounded-full border border-border" />
                    {/* Anneau de chargement circulaire fluide fin et net */}
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-foreground animate-spin" />
                    {/* Logo SVG Krona centré */}
                    <KronaLogo className="w-6 h-6 text-foreground" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Libellé unique direct (aucun sous-texte) */}
            <div className="h-5 flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.span
                  key={label}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="text-sm font-semibold tracking-tight text-foreground font-sans truncate"
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
