import React from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

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
      className={twMerge(
        clsx(
          "bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden",
          noPadding ? "" : "p-3.5 sm:p-4 xl:p-4.5",
          className
        )
      )}
    >
      {children}
    </div>
  );
}
