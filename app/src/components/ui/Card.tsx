import React from "react";
import clsx from "clsx";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = "", noPadding = false, onClick }: CardProps) {
  return (
    <div 
      onClick={onClick} 
      className={clsx(
        "bg-white dark:bg-zinc-900/50 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl shadow-sm flex flex-col overflow-hidden",
        noPadding ? "" : "p-3 sm:p-3.5 xl:p-4",
        className
      )}
    >
      {children}
    </div>
  );
}
