"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ImportStep = "reading" | "categorizing" | "subscriptions" | "finalizing";

export interface StepInfo {
  label: string;
  progress: number;
  stepNumber: number;
}

export const IMPORT_STEPS: Record<ImportStep, StepInfo> = {
  reading: {
    label: "Lecture et validation du relevé…",
    progress: 25,
    stepNumber: 1,
  },
  categorizing: {
    label: "Catégorisation intelligente par l'IA…",
    progress: 60,
    stepNumber: 2,
  },
  subscriptions: {
    label: "Détection des abonnements et charges fixes…",
    progress: 85,
    stepNumber: 3,
  },
  finalizing: {
    label: "Finalisation de ton espace…",
    progress: 100,
    stepNumber: 4,
  },
};

interface CsvAnalysisModalProps {
  step: ImportStep | null;
}

export function CsvAnalysisModal({ step }: CsvAnalysisModalProps) {
  const [displayProgress, setDisplayProgress] = useState(0);

  // Smooth frame-synced interpolation for progress bar & tabular counter
  useEffect(() => {
    if (!step) {
      setDisplayProgress(0);
      return;
    }

    const target = IMPORT_STEPS[step]?.progress ?? 0;
    let animationFrameId: number;
    const startProgress = displayProgress;
    const delta = target - startProgress;

    if (Math.abs(delta) < 0.2) {
      setDisplayProgress(target);
      return;
    }

    const startTime = performance.now();
    const duration = 550; // ms

    const update = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // Apple fluid curve: smooth ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      const current = startProgress + delta * ease;
      setDisplayProgress(current);

      if (t < 1) {
        animationFrameId = requestAnimationFrame(update);
      } else {
        setDisplayProgress(target);
      }
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [step]);

  const currentStepData = step ? IMPORT_STEPS[step] : IMPORT_STEPS.reading;

  return (
    <AnimatePresence>
      {step && (
        <motion.div
          key="csv-analysis-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-[150] bg-black/75 backdrop-blur-xl sm:backdrop-blur-2xl flex items-center justify-center p-4 pointer-events-auto select-none"
        >
          <motion.div
            key="csv-analysis-card"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="w-full max-w-[360px] sm:max-w-[380px] p-6 sm:p-7 bg-[#0F0F11] border border-white/[0.08] rounded-2xl shadow-[0_24px_50px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08)] flex flex-col items-center text-center relative overflow-hidden"
          >
            {/* Top Identity: Krona Monochrome Logo with Gentle Aura */}
            <div className="relative mx-auto w-12 h-12 flex items-center justify-center mb-5">
              {/* Soft diffused aura pulse */}
              <motion.div
                animate={{
                  opacity: [0.25, 0.55, 0.25],
                  scale: [0.95, 1.12, 0.95],
                }}
                transition={{
                  duration: 2.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute -inset-1.5 rounded-2xl bg-white/15 blur-xl pointer-events-none"
              />

              {/* Discreet ambient border breathing */}
              <motion.div
                animate={{
                  opacity: [0.2, 0.45, 0.2],
                  scale: [0.98, 1.04, 0.98],
                }}
                transition={{
                  duration: 2.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.15,
                }}
                className="absolute -inset-1 rounded-2xl border border-white/[0.08] pointer-events-none"
              />

              {/* Logo box */}
              <div className="relative w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
                <svg
                  viewBox="0 0 48 48"
                  fill="none"
                  className="w-6 h-6 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <mask id="krona_import_mask" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
                    <rect width="48" height="48" fill="#D9D9D9"/>
                  </mask>
                  <g mask="url(#krona_import_mask)">
                    <path
                      d="M23.2335 4.16299L31.7073 4.15991C31.4734 5.06138 31.1832 6.09483 30.8764 6.97572C30.1612 9.01702 29.2238 10.9732 28.0811 12.809C23.2291 20.5663 15.0014 24.8882 6.19107 26.485C6.55881 26.498 7.66306 26.3771 8.06439 26.3262C12.1265 25.812 16.0894 24.5393 19.7264 22.6791C27.3158 18.7973 32.5755 12.27 35.1642 4.16286L41.8804 4.16192L41.8784 8.71949C41.8778 10.2935 42.023 10.2165 41.3689 11.6459C37.9432 19.1315 30.5631 23.7696 23.0482 26.3872C20.5489 27.2392 17.9961 27.9243 15.4064 28.4386C15.8156 28.4593 16.3174 28.4463 16.7327 28.4461L19.0955 28.444C19.3018 28.4453 19.6022 28.4513 19.8052 28.4373C20.2254 28.4084 20.7343 28.2817 21.1481 28.1845C22.0767 27.9662 22.9981 27.7181 23.9109 27.4407C30.6382 25.4471 37.1473 22.1025 41.8911 16.8256C41.8668 17.1161 41.8804 17.5995 41.8804 17.9052L41.881 19.833C41.881 22.145 41.912 24.5319 41.881 26.8364C41.4741 27.2215 40.9507 27.6181 40.5006 27.9508C38.1977 29.6266 35.64 30.9189 32.926 31.7778C32.0348 32.0631 31.0969 32.2797 30.1875 32.4927C30.3673 32.5002 30.5666 32.4996 30.7471 32.4959C31.8072 32.4746 32.8894 32.5276 33.9465 32.4877C34.1433 32.9524 34.3337 33.5115 34.5164 33.9912L35.5438 36.6707L38.022 43.1516C37.126 43.1673 36.1987 43.1559 35.3009 43.1561L30.3568 43.1568C30.0538 42.5296 29.7815 41.8759 29.503 41.2375L28.3274 38.5546C27.663 37.0299 26.9362 35.4697 26.3006 33.9391L5.89478 33.9395L5.89686 22.9505C11.2806 21.8278 16.1931 19.0601 19.3992 14.5111C21.536 11.4794 22.8502 7.84619 23.2335 4.16299Z"
                      fill="currentColor"
                    />
                  </g>
                </svg>
              </div>
            </div>

            {/* Fixed Main Title */}
            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white font-sans text-center mb-1">
              Analyse du relevé en cours
            </h3>

            {/* Dynamic Step Subtitle with Smooth Micro-transitions */}
            <div className="h-6 relative overflow-hidden flex items-center justify-center mb-5 w-full">
              <AnimatePresence mode="wait">
                <motion.p
                  key={step}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="text-xs sm:text-[13px] text-neutral-400 font-sans tracking-tight text-center truncate px-2"
                >
                  {currentStepData.label}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Apple-style Linear Progress Gauge */}
            <div className="w-full">
              {/* Minimal horizontal rail */}
              <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden relative">
                <div
                  className="h-full bg-white rounded-full relative shadow-[0_0_8px_rgba(255,255,255,0.7)] will-change-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, displayProgress))}%` }}
                />
              </div>

              {/* Progress info: Step order & Tabular percentage */}
              <div className="flex justify-between items-center mt-2.5 text-[11px] text-neutral-500 font-sans tabular-nums font-normal px-0.5">
                <span>Étape {currentStepData.stepNumber} sur 4</span>
                <span>{Math.round(displayProgress)}%</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
