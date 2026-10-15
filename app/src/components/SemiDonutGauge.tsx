"use client";

import React, { useMemo, useState, useEffect, useId } from "react";
import { motion } from "framer-motion";
import { CATEGORY_COLORS } from "@/lib/types";
import { AlternatingDigitAmount } from "./AlternatingDigitAmount";

interface SemiDonutGaugeProps {
  categoryData: { name: string; value: number }[];
  totalExpenses: number;
  isAllTime?: boolean;
  monthsCount?: number;
  selectedMonth?: string;
  hoveredCategory: string | null;
  onHoverCategory: (categoryName: string | null) => void;
  className?: string;
}

export function SemiDonutGauge({
  categoryData,
  totalExpenses,
  isAllTime = false,
  monthsCount = 1,
  selectedMonth,
  hoveredCategory,
  onHoverCategory,
  className = "",
}: SemiDonutGaugeProps) {
  const rawId = useId();
  const maskId = `semi-donut-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // L'animation par chiffres alternés ne se joue que lors des interactions au survol,
  // et reste sobre et immédiate au chargement initial ou au changement de mois.
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (hoveredCategory !== null) {
      setHasInteracted(true);
    }
  }, [hoveredCategory]);

  useEffect(() => {
    setHasInteracted(false);
  }, [selectedMonth]);

  const isInteracting = hasInteracted || hoveredCategory !== null;

  // SVG coordinates for a 180° dome arc (headroom on all sides so rounded caps never clip)
  const cx = 100;
  const cy = 88;
  const r = 72;
  const strokeWidth = 13;

  // Angular distance covered by a half-circle cap (radius strokeWidth / 2) along the circle
  const capAngle = (strokeWidth / 2) / r;

  // Total perimeter of the 180° arc for dash calculations
  const arcLength = Math.ceil(Math.PI * r + strokeWidth * 2);

  const total = totalExpenses > 0 ? totalExpenses : categoryData.reduce((sum, c) => sum + c.value, 0);

  // Animation key strictly tied to selectedMonth to avoid double-spawns on data recalculation
  const animKey = selectedMonth || "all";

  // Background track path coordinates with rounded caps matching the arc extremes
  const bgD = useMemo(() => {
    const bgStart = capAngle;
    const bgEnd = Math.PI - capAngle;
    const bgX1 = cx - r * Math.cos(bgStart);
    const bgY1 = cy - r * Math.sin(bgStart);
    const bgX2 = cx - r * Math.cos(bgEnd);
    const bgY2 = cy - r * Math.sin(bgEnd);
    return `M ${bgX1.toFixed(2)} ${bgY1.toFixed(2)} A ${r} ${r} 0 0 1 ${bgX2.toFixed(2)} ${bgY2.toFixed(2)}`;
  }, [cx, cy, r, capAngle]);

  // Calculate arc segments with rounded caps, guaranteed floor, and clean 3.5° breathing gaps
  const segments = useMemo(() => {
    if (total <= 0 || categoryData.length === 0) return [];

    const N = categoryData.length;
    // Net visual gap between rounded tips (~3.5° for breathing room without overlap)
    const visualGapDeg = N <= 2 ? 3.8 : N <= 4 ? 3.5 : Math.max(2.5, 18 / N);
    const visualGapAngle = N > 1 ? (visualGapDeg * Math.PI) / 180 : 0;
    
    // Distance between arc path endpoints accounting for the 2 rounded caps
    const pathGap = visualGapAngle + 2 * capAngle;

    // Total angular budget available for the path centers
    const totalPathBudget = Math.max(0.1, (Math.PI - 2 * capAngle) - (N - 1) * pathGap);

    // Guaranteed minimum path span so even tiny categories have a visible pill body
    const minPathSpan = Math.max(0.025, Math.min((2.0 * Math.PI) / 180, (totalPathBudget / N) * 0.4));

    // Softened weight scale (power 0.72) to prevent dominant categories from crushing smaller ones
    const weights = categoryData.map((cat) => Math.pow(Math.max(cat.value, 0.01), 0.72));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let spans = weights.map((w) => (w / totalWeight) * totalPathBudget);

    // Iterative floor enforcement with proportional redistribution
    for (let iter = 0; iter < 5; iter++) {
      let needed = 0;
      spans.forEach((s) => {
        if (s < minPathSpan) needed += minPathSpan - s;
      });
      if (needed <= 0.0001) break;
      const largeSum = spans.reduce((sum, s) => (s > minPathSpan ? sum + s : sum), 0);
      if (largeSum <= 0) break;
      spans = spans.map((s) => {
        if (s < minPathSpan) return minPathSpan;
        return s - needed * (s / largeSum);
      });
    }

    let currentAngle = capAngle;
    return categoryData.map((cat, i) => {
      const span = spans[i];
      const start = currentAngle;
      const end = currentAngle + span;
      currentAngle = end + (i < N - 1 ? pathGap : 0);

      // SVG coordinates: curves upward as dome
      const x1 = cx - r * Math.cos(start);
      const y1 = cy - r * Math.sin(start);
      const x2 = cx - r * Math.cos(end);
      const y2 = cy - r * Math.sin(end);

      const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
      const color = CATEGORY_COLORS[cat.name]?.ring || CATEGORY_COLORS["Autre"].ring;
      const percentage = total > 0 ? ((cat.value / total) * 100).toFixed(0) : "0";

      return {
        name: cat.name,
        value: cat.value,
        d,
        color,
        percentage,
      };
    });
  }, [categoryData, total, cx, cy, r, capAngle]);

  // Center display text
  const activeCat = hoveredCategory ? categoryData.find((c) => c.name === hoveredCategory) : null;
  const displayAmount = activeCat
    ? activeCat.value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : (isAllTime ? total / (monthsCount || 1) : total).toLocaleString("fr-FR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });

  const displayLabel = activeCat
    ? activeCat.name
    : isAllTime
    ? "Moyenne mensuelle"
    : "Total dépenses";

  return (
    <div className={`w-full flex items-center justify-center shrink-0 ${className}`}>
      {/* Wrapper dédié pilotant la taille du semi-donut de manière 100% autonome */}
      <div className="semi-donut-wrapper relative mx-auto flex items-center justify-center shrink-0">
        <svg
          viewBox="0 0 200 100"
          className="w-full h-full block select-none"
          aria-label="Graphique de répartition en demi-cercle"
        >
          <defs>
            {/* Masque SVG animé pour le sweep progressif de gauche à droite */}
            <mask id={maskId}>
              <rect x="0" y="0" width="200" height="100" fill="black" />
              <motion.path
                key={animKey}
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none"
                stroke="white"
                strokeWidth={strokeWidth + 14}
                strokeLinecap="round"
                strokeDasharray={`${arcLength} ${arcLength}`}
                initial={{ strokeDashoffset: arcLength }}
                animate={{ strokeDashoffset: 0 }}
                transition={{
                  duration: 0.9,
                  ease: [0.16, 1, 0.3, 1], // Transition Apple fluide (easeOutExpo) sur 900ms
                }}
              />
            </mask>
          </defs>

          {/* Background track (arc 180° avec terminaisons arrondies) */}
          <path
            d={bgD}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="text-zinc-100 dark:text-white/[0.06]"
          />

          {/* Segments avec terminaisons arrondies et animation sweep progressive */}
          <g mask={`url(#${maskId})`}>
            {segments.map((seg) => {
              const isHovered = hoveredCategory === seg.name;
              const isAnyHovered = Boolean(hoveredCategory);
              return (
                <path
                  key={seg.name}
                  d={seg.d}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  opacity={isAnyHovered ? (isHovered ? 1 : 0.35) : 1}
                  className="transition-opacity duration-150 cursor-pointer"
                  onMouseEnter={() => onHoverCategory(seg.name)}
                  onMouseLeave={() => onHoverCategory(null)}
                />
              );
            })}
          </g>
        </svg>

        {/* Intégré au creux sous l'arc : montant central avec chiffres alternés sur hover & sous-texte */}
        <motion.div
          key={`center-${animKey}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-x-0 bottom-[8%] sm:bottom-[10%] flex flex-col items-center justify-center text-center pointer-events-none select-none"
        >
          <div className="inline-flex items-baseline justify-center overflow-hidden text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white tabular-nums font-sans leading-none">
            <AlternatingDigitAmount value={displayAmount} animate={isInteracting} />
            <span className="ml-1 select-none font-semibold text-lg sm:text-xl xl:text-2xl text-zinc-900 dark:text-white shrink-0">
              €
            </span>
          </div>
          <span className="text-[10px] sm:text-xs font-medium text-zinc-500 dark:text-neutral-400 mt-1 sm:mt-1.5 font-sans leading-none truncate max-w-[140px] sm:max-w-[180px] xl:max-w-[220px]">
            {displayLabel}
          </span>
        </motion.div>
      </div>
    </div>
  );
}

