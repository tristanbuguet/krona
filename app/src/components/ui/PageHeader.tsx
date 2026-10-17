"use client";

import React, { useState, useEffect } from "react";
import clsx from "clsx";

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
  showDate?: boolean;
}

export function PageHeader({ title, children, className = "", showDate }: PageHeaderProps) {
  const [currentDate, setCurrentDate] = useState("");

  const shouldDisplayDate = showDate !== undefined ? showDate : title === "Vue d'ensemble";

  useEffect(() => {
    if (!shouldDisplayDate) return;
    const now = new Date();
    const formatted = now.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    setCurrentDate(formatted.charAt(0).toUpperCase() + formatted.slice(1));
  }, [shouldDisplayDate]);

  return (
    <div className={clsx("flex items-center justify-between min-h-[36px] h-9 shrink-0 mb-3.5 w-full", className)}>
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground truncate font-sans leading-none">
          {title}
        </h1>
        {shouldDisplayDate && currentDate && (
          <span className="text-xs sm:text-sm font-medium text-muted-foreground select-none truncate leading-none">
            {currentDate}
          </span>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
