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
        "bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col overflow-hidden",
        noPadding ? "" : "p-3 sm:p-3.5 xl:p-4",
        className
      )}
    >
      {children}
    </div>
  );
}
