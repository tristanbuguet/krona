import { X } from "lucide-react";
import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  iconSize?: number;
}

export const CloseButton = ({ className, iconSize = 16, onClick, ...props }: CloseButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fermer"
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 cursor-pointer",
        "bg-transparent text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground",
        className
      )}
      {...props}
    >
      <X size={iconSize} />
    </button>
  );
};
