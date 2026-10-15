"use client";

import React, { useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AlternatingDigitAmountProps {
  value: string;
  animate?: boolean;
  className?: string;
}

export function AlternatingDigitAmount({
  value,
  animate = true,
  className = "",
}: AlternatingDigitAmountProps) {
  const chars = useMemo(() => value.split(""), [value]);
  const revChars = useMemo(() => [...chars].reverse(), [chars]);

  // Garde un nombre de colonnes stable pour éviter les suppressions / réinsertions destructives dans le flexbox
  const maxSlotsRef = useRef(revChars.length);
  if (revChars.length > maxSlotsRef.current) {
    maxSlotsRef.current = revChars.length;
  }
  const totalSlots = Math.max(maxSlotsRef.current, revChars.length, 7);

  // 1. Rendu statique direct si l'animation est désactivée (chargement initial / changement de mois)
  if (!animate) {
    return (
      <div
        className={`inline-flex items-baseline justify-center overflow-hidden whitespace-nowrap font-semibold tracking-tight text-zinc-900 dark:text-white tabular-nums font-sans leading-none ${className}`}
      >
        {chars.map((char, index) => {
          const isSpace = char === " " || char === "\u00A0" || char === "\u202F";
          const isPunctuation = char === "," || char === ".";
          const widthClass = isSpace
            ? "w-[0.35ch]"
            : isPunctuation
            ? "w-[0.45ch]"
            : "w-[1ch]";

          return (
            <span
              key={`static-col-${index}`}
              className={`relative inline-flex items-center justify-center overflow-hidden h-[1.15em] ${widthClass} tabular-nums select-none shrink-0`}
            >
              <span
                className="invisible select-none pointer-events-none leading-none"
                aria-hidden="true"
              >
                {isSpace ? "\u00A0" : char}
              </span>
              <span className="absolute inset-0 flex items-center justify-center tabular-nums leading-none select-none text-center">
                {isSpace ? "\u00A0" : char}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  // 2. Rendu animé avec colonnes étanches, positionnement absolu et nettoyage immédiat
  const slots = [];
  for (let posFromRight = totalSlots - 1; posFromRight >= 0; posFromRight--) {
    const char = revChars[posFromRight] || "";
    const isActive = Boolean(char);
    const isSpace = char === " " || char === "\u00A0" || char === "\u202F";
    const isPunctuation = char === "," || char === ".";
    const isEven = posFromRight % 2 === 0;

    const widthStyle = !isActive
      ? "0ch"
      : isSpace
      ? "0.35ch"
      : isPunctuation
      ? "0.45ch"
      : "1ch";

    slots.push({
      posFromRight,
      char,
      isActive,
      isSpace,
      isPunctuation,
      isEven,
      widthStyle,
    });
  }

  return (
    <div
      className={`inline-flex items-baseline justify-center overflow-hidden whitespace-nowrap font-semibold tracking-tight text-zinc-900 dark:text-white tabular-nums font-sans leading-none ${className}`}
    >
      {slots.map((slot) => {
        return (
          <span
            key={`col-${slot.posFromRight}`}
            style={{
              width: slot.widthStyle,
              opacity: slot.isActive ? 1 : 0,
            }}
            className="relative inline-flex items-center justify-center overflow-hidden h-[1.15em] tabular-nums select-none shrink-0 transition-[width,opacity] duration-150 ease-out"
          >
            {/* Ancre invisible pour alignement parfait de la ligne de base typographique */}
            <span
              className="invisible select-none pointer-events-none leading-none"
              aria-hidden="true"
            >
              {slot.isSpace ? "\u00A0" : "0"}
            </span>

            {/* Chiffre animé strictement confiné en absolute inset-0 */}
            <AnimatePresence mode="popLayout" initial={false}>
              {slot.isActive && slot.char && (
                <motion.span
                  key={`${slot.posFromRight}-${slot.char}`}
                  initial={{
                    y: slot.isEven ? "100%" : "-100%",
                    opacity: 0,
                  }}
                  animate={{
                    y: "0%",
                    opacity: 1,
                  }}
                  exit={{
                    y: slot.isEven ? "-100%" : "100%",
                    opacity: 0,
                    transition: { duration: 0.1, ease: "easeIn" },
                  }}
                  transition={{
                    duration: 0.16,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="absolute inset-0 flex items-center justify-center tabular-nums leading-none select-none text-center pointer-events-none"
                >
                  {slot.isSpace ? "\u00A0" : slot.char}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        );
      })}
    </div>
  );
}
