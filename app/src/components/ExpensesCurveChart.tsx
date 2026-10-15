"use client";

import React, { useId, useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";

interface TimelinePoint {
  day: string;
  dateFormatted: string;
  amount: number;
  cumulative: number;
  topTx?: { name: string; amount: number }[];
}

interface ExpensesCurveChartProps {
  timeline: TimelinePoint[];
  totalExpenses: number;
  selectedMonth?: string;
  isDark?: boolean;
  className?: string;
}

// Calcule un tracé spline cubique monotone lissé (Catmull-Rom vers Bézier)
function getSmoothCurvePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function ExpensesCurveChart({
  timeline = [],
  totalExpenses = 0,
  selectedMonth,
  isDark = false,
  className = "",
}: ExpensesCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 400, height: 180 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const rawId = useId();
  const gradientId = `expense-curve-grad-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

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
  const paddingTop = 14;
  const paddingBottom = 26;

  const plotWidth = Math.max(20, dimensions.width - paddingLeft - paddingRight);
  const plotHeight = Math.max(20, dimensions.height - paddingTop - paddingBottom);
  const bottomY = paddingTop + plotHeight;

  // Calcul des coordonnées des points
  const { points, linePath, areaPath } = useMemo(() => {
    if (timeline.length === 0) {
      return { points: [], linePath: "", areaPath: "" };
    }

    const calculatedMax = Math.max(...timeline.map((d) => d.cumulative), totalExpenses, 1);
    // Légère marge de sécurité au sommet (5%) pour éviter que la ligne touche la bordure haute
    const peak = calculatedMax * 1.05;

    const pts = timeline.map((item, i) => {
      const x = paddingLeft + (i / Math.max(1, timeline.length - 1)) * plotWidth;
      const y = paddingTop + plotHeight - (item.cumulative / peak) * plotHeight;
      return { x, y, data: item, index: i };
    });

    const lPath = getSmoothCurvePath(pts);
    const firstX = pts[0].x;
    const lastX = pts[pts.length - 1].x;
    const aPath = `${lPath} L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;

    return { points: pts, linePath: lPath, areaPath: aPath };
  }, [timeline, totalExpenses, plotWidth, plotHeight, paddingTop, paddingLeft, bottomY]);

  // Jours clés affichés sur l'axe X (identique à Recharts)
  const axisTicks = useMemo(() => ["01", "05", "10", "15", "20", "25", "30"], []);

  // Gestion des survols
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i].x - clientX);
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

  if (timeline.length === 0 || totalExpenses === 0) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-400 ${className}`}>
        <Activity size={32} className="stroke-1 text-neutral-400/40 mb-3" />
        <p className="text-sm font-medium text-foreground font-sans">Aucune dépense sur cette période</p>
        <p className="text-xs text-neutral-500 mt-0.5 font-sans">Les débits apparaîtront au fil de tes opérations</p>
      </div>
    );
  }

  const activePoint = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null;

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
            <stop offset="0%" stopColor={isDark ? "#ffffff" : "#18181b"} stopOpacity={isDark ? 0.16 : 0.08} />
            <stop offset="100%" stopColor={isDark ? "#ffffff" : "#18181b"} stopOpacity={0.005} />
          </linearGradient>
        </defs>

        {/* 3 Lignes de repère horizontales discrètes (style CartesianGrid) */}
        {[0.25, 0.55, 0.85].map((fraction, idx) => {
          const y = paddingTop + plotHeight * fraction;
          return (
            <line
              key={`grid-${idx}`}
              x1={paddingLeft}
              x2={paddingLeft + plotWidth}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeDasharray="3 3"
              className="text-black/[0.08] dark:text-white/[0.08]"
              strokeWidth={1}
            />
          );
        })}

        {/* 1. Dégradé subtil sous la courbe : fondu progressif d'opacité coordonné sur 900 ms */}
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

        {/* 2. Tracé vectoriel SVG : se dessine de gauche à droite via pathLength de 0 à 1 sur 900 ms */}
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

        {/* Axe X : graduations des jours ('01', '05', '10', '15', '20', '25', '30') */}
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

        {/* Ligne de visée verticale et point actif au survol */}
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

      {/* Infobulle interactive flottante (Apple style) */}
      <AnimatePresence>
        {activePoint && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            style={{
              left: Math.min(Math.max(activePoint.x - 70, 8), dimensions.width - 150),
              top: Math.max(activePoint.y - 62, 4),
            }}
            className="absolute pointer-events-none z-20 px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-black/[0.08] dark:border-white/[0.1] shadow-lg flex flex-col min-w-[130px]"
          >
            <div className="text-[10px] text-zinc-500 dark:text-neutral-400 font-sans truncate">
              {activePoint.data.dateFormatted}
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-0.5">
              <span className="text-xs font-bold text-zinc-900 dark:text-white tabular-nums font-sans">
                {activePoint.data.cumulative.toFixed(2)} €
              </span>
              {activePoint.data.amount > 0 && (
                <span className="text-[10px] text-zinc-500 dark:text-neutral-400 tabular-nums font-sans">
                  +{activePoint.data.amount.toFixed(0)} €
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
