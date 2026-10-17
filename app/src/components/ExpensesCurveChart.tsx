"use client";

import React, { useId, useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";
import clsx from "clsx";

export interface TimelinePoint {
  day: string;
  dateFormatted: string;
  amount: number;
  cumulative: number;
  topTx?: { name: string; amount: number }[];
}

export interface ExpensesCurveChartProps {
  timeline: TimelinePoint[];
  totalExpenses: number;
  monthlyLimit?: number;
  maxSpending?: number;
  targetRemaining?: number;
  targetPercent?: number;
  initialBudget?: number;
  cutoffDay?: number;
  selectedMonth?: string;
  isDark?: boolean;
  className?: string;
}

// Nettoie et formate la date pour l'infobulle (ex. "Mercredi 14 oct." -> "14 oct.")
function formatDisplayDate(dateFormatted: string): string {
  if (!dateFormatted) return "";
  const clean = dateFormatted.trim();
  const parts = clean.split(" ");
  if (parts.length >= 3) {
    return `${parts[1]} ${parts[2].replace(".", "")}.`;
  }
  return clean;
}

// Calcule un tracé spline cubique monotone lissé (Catmull-Rom vers Bézier avec limitation des tangentes)
function getSmoothCurvePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    let cp1x = p1.x + (p2.x - p0.x) / 6;
    let cp1y = p1.y + (p2.y - p0.y) / 6;
    let cp2x = p2.x - (p3.x - p1.x) / 6;
    let cp2y = p2.y - (p3.y - p1.y) / 6;

    // Bornage monotone pour garantir l'absence de rebond / ondulation artificielle
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    cp1y = Math.max(minY, Math.min(maxY, cp1y));
    cp2y = Math.max(minY, Math.min(maxY, cp2y));

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function ExpensesCurveChart({
  timeline = [],
  totalExpenses = 0,
  monthlyLimit,
  maxSpending,
  targetRemaining,
  targetPercent,
  initialBudget,
  cutoffDay,
  selectedMonth,
  isDark = false,
  className = "",
}: ExpensesCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 400, height: 180 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const rawId = useId();
  const gradientId = `burndown-curve-grad-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // Détection dynamique et réactive de la taille du conteneur sans layout shift
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({
            width: Math.round(width),
            height: Math.round(height),
          });
        }
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Délimitation des marges du graphe
  const paddingLeft = 14;
  const paddingRight = 14;
  const paddingTop = 16;
  const paddingBottom = 26;

  const plotWidth = Math.max(20, dimensions.width - paddingLeft - paddingRight);
  const plotHeight = Math.max(20, dimensions.height - paddingTop - paddingBottom);
  const bottomY = paddingTop + plotHeight;

  // Calcul des données Burn-down et coordonnées graphiques
  const {
    points,
    activePoints,
    linePath,
    areaPath,
    idealStartX,
    idealStartY,
    idealEndX,
    idealEndY,
    limitY,
    zeroY,
    isOverBudget,
    targetLimit,
    lastActivePt,
    showActiveEndpoint,
  } = useMemo(() => {
    if (timeline.length === 0) {
      return {
        points: [],
        activePoints: [],
        linePath: "",
        areaPath: "",
        idealStartX: 0,
        idealStartY: 0,
        idealEndX: 0,
        idealEndY: 0,
        limitY: 0,
        zeroY: 0,
        isOverBudget: false,
        targetLimit: 600,
        lastActivePt: null,
        showActiveEndpoint: false,
      };
    }

    // Y_max (haut du SVG) = Total Revenus / Budget initial (100 %)
    const P_start = initialBudget && initialBudget > 0 ? initialBudget : 1800;
    const count = timeline.length;

    // Calcul du Solde Restant Cible et du Budget Dépensable Max
    let Solde_Restant_Cible: number;
    let Budget_Dépensable_Max: number;

    if (targetRemaining !== undefined && targetRemaining >= 0) {
      Solde_Restant_Cible = targetRemaining;
      Budget_Dépensable_Max = maxSpending !== undefined ? maxSpending : Math.max(0, P_start - targetRemaining);
    } else if (maxSpending !== undefined && maxSpending > 0) {
      Budget_Dépensable_Max = maxSpending;
      Solde_Restant_Cible = Math.max(0, P_start - maxSpending);
    } else if (monthlyLimit !== undefined && monthlyLimit > 0) {
      Budget_Dépensable_Max = monthlyLimit;
      Solde_Restant_Cible = Math.max(0, P_start - monthlyLimit);
    } else {
      Solde_Restant_Cible = Math.round(P_start * 0.4);
      Budget_Dépensable_Max = P_start - Solde_Restant_Cible;
    }

    // Détermination de l'indice de coupure (dernier jour connu / date actuelle)
    let activeCutoff = count;
    if (cutoffDay !== undefined && cutoffDay > 0) {
      activeCutoff = Math.min(count, Math.max(1, cutoffDay));
    } else {
      const lastTxIdx = timeline.reduce((acc, item, idx) => {
        return (item.amount > 0 || (item.topTx && item.topTx.length > 0)) ? idx : acc;
      }, -1);
      if (lastTxIdx >= 0) {
        activeCutoff = Math.min(count, lastTxIdx + 1);
      }
    }

    // 1. Calibrage strict de l'Axe Y (yScale)
    // Y_max (Haut) = Total Revenus / Budget initial (100 %)
    // Y_min (Bas) = 0 €
    const Y_max = Math.max(P_start, 1);
    const Y_min = 0;

    // Ligne Horizontale de Seuil :
    // Position Y = height - ((Solde_Restant_Cible / Y_max) * height)
    // Exemple : Si Solde Cible = 600 € (40 % de 1 500 €), la ligne se place exactement à 40 % de la hauteur en partant du bas
    const getY = (val: number) => {
      const ratio = Y_max > 0 ? val / Y_max : 0;
      const rawY = paddingTop + plotHeight - ratio * plotHeight;
      return Math.min(bottomY, Math.max(paddingTop, rawY));
    };

    const limitYCoord = getY(Solde_Restant_Cible);
    const zeroYCoord = getY(0);

    // Calcul de tous les points du mois complet pour l'axe et le repérage
    const allPts = timeline.map((item, i) => {
      const x = paddingLeft + (i / Math.max(1, count - 1)) * plotWidth;
      // Solde_jour = Budget_départ - Cumul_dépenses_jusqu'à_ce_jour
      const remaining = P_start - item.cumulative;
      // Diagonale de référence : du point (Jour 1, Y_max) jusqu'au point (Dernier jour du mois, Solde_Restant_Cible)
      const ideal = Y_max - (i / Math.max(1, count - 1)) * (Y_max - Solde_Restant_Cible);
      const diff = remaining - ideal;
      return {
        x,
        y: getY(remaining),
        remaining,
        ideal,
        diff,
        data: item,
        index: i,
      };
    });

    // 3. Calcul du solde réel et arrêt du tracé (Ligne blanche) :
    // S'arrête à activeCutoff (dernier jour de transaction connu du CSV ou date du jour)
    // Pour les jours passés sans transaction, le solde reste stable (palier horizontal)
    // Pour les jours futurs, on arrête simplement le tracé sans forcer à 0 €
    const ptsToRender = allPts.slice(0, activeCutoff);
    const lPath = getSmoothCurvePath(ptsToRender);
    const firstX = ptsToRender[0]?.x ?? paddingLeft;
    const lastActivePoint = ptsToRender[ptsToRender.length - 1] ?? allPts[0];
    const lastX = lastActivePoint?.x ?? (paddingLeft + plotWidth);
    const baselineY = bottomY;

    // Dégradé sous la section active de la courbe
    const aPath = ptsToRender.length > 1
      ? `${lPath} L ${lastX.toFixed(1)} ${baselineY.toFixed(1)} L ${firstX.toFixed(1)} ${baselineY.toFixed(1)} Z`
      : "";

    // 2. Diagonale de référence :
    // Du point (Jour 1, Y_max) jusqu'au point (Dernier jour du mois, Solde_Restant_Cible)
    // Résultat : La diagonale se termine exactement sur le point droit de la ligne de seuil !
    const iStartX = paddingLeft;
    const iStartY = getY(Y_max);
    const iEndX = paddingLeft + plotWidth;
    const iEndY = limitYCoord;

    // État d'Alerte : « Seuil Dépassé » (Rouge) UNIQUEMENT SI Dépenses_Cumulées > Budget_Dépensable_Max
    // (c'est-à-dire si le Solde Restant passe EN DESSOUS de la ligne de seuil)
    // Sinon, la ligne et les badges restent dans un état neutre / positif ("Trajectoire respectée")
    const currentCumulative = lastActivePoint ? lastActivePoint.data.cumulative : (totalExpenses || 0);
    const isOverBudget = currentCumulative > Budget_Dépensable_Max;

    return {
      points: allPts,
      activePoints: ptsToRender,
      linePath: lPath,
      areaPath: aPath,
      idealStartX: iStartX,
      idealStartY: iStartY,
      idealEndX: iEndX,
      idealEndY: iEndY,
      limitY: limitYCoord,
      zeroY: zeroYCoord,
      isOverBudget,
      targetLimit: Solde_Restant_Cible,
      maxSpending: Budget_Dépensable_Max,
      lastActivePt: lastActivePoint,
      showActiveEndpoint: ptsToRender.length > 0,
    };
  }, [timeline, totalExpenses, monthlyLimit, maxSpending, targetRemaining, targetPercent, initialBudget, cutoffDay, plotWidth, plotHeight, paddingTop, paddingLeft, bottomY]);

  // Jours clés affichés sur l'axe X (dates du mois : 01, 05, 10, 15, 20, 25, 30)
  const axisTicks = useMemo(() => ["01", "05", "10", "15", "20", "25", "30"], []);

  // Gestion des survols (restreinte aux points actifs ayant des données réelles)
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePoints.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < activePoints.length; i++) {
      const diff = Math.abs(activePoints[i].x - clientX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoveredIndex(closestIdx);
  };

  const handlePointerLeave = () => {
    setHoveredIndex(null);
  };

  if (timeline.length === 0) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-400 ${className}`}>
        <Activity size={32} className="stroke-1 text-neutral-400/40 mb-3" />
        <p className="text-sm font-medium text-foreground font-sans">Aucune dépense sur cette période</p>
        <p className="text-xs text-neutral-500 mt-0.5 font-sans">Les débits apparaîtront au fil de tes opérations</p>
      </div>
    );
  }

  const activePoint = hoveredIndex !== null && activePoints[hoveredIndex] ? activePoints[hoveredIndex] : null;

  // Calcul de positionnement intelligent du Tooltip au survol (ancré strictement au-dessus du point blanc)
  const tooltipStyle = useMemo(() => {
    if (!activePoint) return {};

    const approxWidth = 205;
    const halfWidth = approxWidth / 2;
    const padding = 8;
    const minLeft = padding;
    const maxLeft = Math.max(minLeft, dimensions.width - approxWidth - padding);
    const left = Math.round(
      Math.min(maxLeft, Math.max(minLeft, activePoint.x - halfWidth))
    );
    // Ancrage par le bas : 12px au-dessus du point y pour grandir vers le HAUT sans recouvrir le point blanc
    const bottom = Math.round(dimensions.height - activePoint.y + 12);

    return {
      bottom: `${bottom}px`,
      left: `${left}px`,
      transition: "left 0.12s ease-out, bottom 0.12s ease-out, top 0.12s ease-out, transform 0.12s ease-out",
    };
  }, [activePoint, dimensions.width, dimensions.height]);

  return (
    <div ref={containerRef} className={`w-full h-full flex-1 min-h-0 relative select-none ${className}`}>
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full block overflow-visible cursor-crosshair touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isDark ? "#ffffff" : "#18181b"} stopOpacity={isDark ? 0.12 : 0.06} />
            <stop offset="100%" stopColor={isDark ? "#ffffff" : "#18181b"} stopOpacity={0.002} />
          </linearGradient>
        </defs>

        {/* Ligne Horizontale de Seuil (Solde Restant Cible) */}
        <line
          x1={paddingLeft}
          x2={paddingLeft + plotWidth}
          y1={limitY}
          y2={limitY}
          stroke={isOverBudget ? "#f43f5e" : "currentColor"}
          strokeDasharray={isOverBudget ? "4 3" : "3 3"}
          strokeWidth={isOverBudget ? 1.5 : 1}
          className={isOverBudget ? "opacity-85" : "text-black/[0.12] dark:text-white/[0.12]"}
        />
        <text
          x={paddingLeft}
          y={Math.max(12, limitY - 6)}
          textAnchor="start"
          className={clsx(
            "text-xs font-medium font-sans select-none tabular-nums pointer-events-none",
            isOverBudget ? "fill-rose-500 dark:fill-rose-400 font-semibold" : "fill-zinc-400 dark:fill-neutral-500"
          )}
        >
          {isOverBudget ? `Seuil dépassé (${targetLimit.toFixed(0)} €)` : `Seuil cible (${targetLimit.toFixed(0)} €)`}
        </text>

        {/* 1. Dégradé subtil sous la courbe : fondu progressif d'opacité coordonné sur 900 ms */}
        {areaPath && (
          <motion.path
            key={`area-${selectedMonth || "month"}`}
            d={areaPath}
            fill={`url(#${gradientId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.9,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        )}

        {/* 2. Ligne idéale de référence : diagonale pointillée reliant (Jour 1, Budget initial) à (Dernier jour, Plafond) */}
        <motion.line
          key={`ideal-${selectedMonth || "month"}`}
          x1={idealStartX}
          y1={idealStartY}
          x2={idealEndX}
          y2={idealEndY}
          stroke="currentColor"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          className="text-black/25 dark:text-white/25"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            duration: 0.9,
            ease: [0.16, 1, 0.3, 1],
          }}
        />

        {/* 3. Courbe réelle de consommation : tracé lissé contrasté de gauche à droite sur 900 ms */}
        {linePath && (
          <motion.path
            key={`line-${selectedMonth || "month"}`}
            d={linePath}
            fill="none"
            stroke={isDark ? "#ffffff" : "#18181b"}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: 0.9,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        )}

        {/* Point terminal marquant le solde actuel si le mois n'est pas terminé */}
        {showActiveEndpoint && lastActivePt && (
          <circle
            cx={lastActivePt.x}
            cy={lastActivePt.y}
            r={3.5}
            fill={isDark ? "#ffffff" : "#18181b"}
            stroke={isDark ? "#18181b" : "#ffffff"}
            strokeWidth={1.5}
            className="pointer-events-none"
          />
        )}

        {/* Axe X : graduations des dates clés du mois ('01', '05', '10', '15', '20', '25', '30') */}
        {axisTicks.map((tick) => {
          const matchedPoint = points.find((p) => p.data.day === tick);
          if (!matchedPoint) return null;
          return (
            <text
              key={`tick-${tick}`}
              x={matchedPoint.x}
              y={bottomY + 16}
              textAnchor="middle"
              className="text-[10px] sm:text-[11px] font-sans tabular-nums fill-zinc-400 dark:fill-neutral-500 select-none pointer-events-none"
            >
              {tick}
            </text>
          );
        })}

        {/* Réticule vertical fin et point ancré sur la courbe au survol */}
        {activePoint && (
          <g className="pointer-events-none">
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={paddingTop}
              y2={bottomY}
              stroke={isDark ? "#ffffff" : "#18181b"}
              strokeOpacity={0.25}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r={4.5}
              fill={isDark ? "#ffffff" : "#18181b"}
              stroke={isDark ? "#18181b" : "#ffffff"}
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {/* Tooltip agrandi au survol avec confort visuel et fort contraste */}
      <AnimatePresence>
        {activePoint && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            style={tooltipStyle}
            className="absolute pointer-events-none z-20 px-4 py-3 w-max min-w-[180px] rounded-xl bg-zinc-900/95 dark:bg-zinc-900/95 border border-zinc-800 shadow-xl backdrop-blur-md flex flex-col whitespace-nowrap"
          >
            {/* Date du jour */}
            <div className="text-xs font-medium text-zinc-400 font-sans truncate whitespace-nowrap">
              {formatDisplayDate(activePoint.data.dateFormatted)}
            </div>

            {/* Montant principal & Badge d'écart */}
            <div className="flex items-baseline justify-between gap-3 mt-1 whitespace-nowrap">
              <span className="text-base font-semibold text-white tabular-nums font-sans whitespace-nowrap">
                {activePoint.remaining.toFixed(2)} €
              </span>
              <span
                className={clsx(
                  "text-xs font-medium tabular-nums font-sans shrink-0 whitespace-nowrap",
                  activePoint.diff > 0
                    ? "text-emerald-400"
                    : activePoint.diff < 0
                      ? "text-rose-400"
                      : "text-zinc-400"
                )}
              >
                {activePoint.diff > 0
                  ? `+${Math.round(activePoint.diff).toLocaleString("fr-FR")} € d'avance`
                  : activePoint.diff < 0
                    ? `-${Math.abs(Math.round(activePoint.diff)).toLocaleString("fr-FR")} € en retard`
                    : "Trajectoire idéale"}
              </span>
            </div>

            {/* Montant quotidien avec lisibilité renforcée */}
            {activePoint.data.amount > 0 && (
              <div className="text-xs text-zinc-300 tabular-nums font-sans mt-1.5 pt-1.5 border-t border-zinc-800/80 whitespace-nowrap">
                -{activePoint.data.amount.toFixed(2)} € dépensés ce jour
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
