"use client";

import React from "react";
import clsx from "clsx";

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, children, className = "" }: PageHeaderProps) {
  return (
    <div className={clsx("flex items-center justify-between min-h-[36px] shrink-0 mb-2.5 sm:mb-3 lg:mb-3.5 w-full", className)}>
      <h1 className="text-lg font-semibold tracking-tight text-white truncate font-sans">
        {title}
      </h1>
      {children && (
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
