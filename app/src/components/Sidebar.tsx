"use client";

import { motion } from "framer-motion";
import { LayoutGrid, TrendingUp, Landmark, Sun, Moon, Settings, Bell, User } from "lucide-react";
import { useState, useEffect } from "react";
import clsx from "clsx";
import { useTheme } from "@/components/ThemeProvider";
import { BoursoBankLogo, CreditAgricoleLogo, BankType, BankSelectorPopover } from "@/components/BankSelectorPopover";

export const KronaLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg 
    viewBox="0 0 48 48" 
    fill="none" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <mask id="sidebar_krona_mask" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
      <rect width="48" height="48" fill="#D9D9D9"/>
    </mask>
    <g mask="url(#sidebar_krona_mask)">
      <path 
        d="M23.2335 4.16299L31.7073 4.15991C31.4734 5.06138 31.1832 6.09483 30.8764 6.97572C30.1612 9.01702 29.2238 10.9732 28.0811 12.809C23.2291 20.5663 15.0014 24.8882 6.19107 26.485C6.55881 26.498 7.66306 26.3771 8.06439 26.3262C12.1265 25.812 16.0894 24.5393 19.7264 22.6791C27.3158 18.7973 32.5755 12.27 35.1642 4.16286L41.8804 4.16192L41.8784 8.71949C41.8778 10.2935 42.023 10.2165 41.3689 11.6459C37.9432 19.1315 30.5631 23.7696 23.0482 26.3872C20.5489 27.2392 17.9961 27.9243 15.4064 28.4386C15.8156 28.4593 16.3174 28.4463 16.7327 28.4461L19.0955 28.444C19.3018 28.4453 19.6022 28.4453 19.8052 28.4373C20.2254 28.4084 20.7343 28.2817 21.1481 28.1845C22.0767 27.9662 22.9981 27.7181 23.9109 27.4407C30.6382 25.4471 37.1473 22.1025 41.8911 16.8256C41.8668 17.1161 41.8804 17.5995 41.8804 17.9052L41.881 19.833C41.881 22.145 41.912 24.5319 41.881 26.8364C41.4741 27.2215 40.9507 27.6181 40.5006 27.9508C38.1977 29.6266 35.64 30.9189 32.926 31.7778C32.0348 32.0631 31.0969 32.2797 30.1875 32.4927C30.3673 32.5002 30.5666 32.4996 30.7471 32.4959C31.8072 32.4746 32.8894 32.5276 33.9465 32.4877C34.1433 32.9524 34.3337 33.5115 34.5164 33.9912L35.5438 36.6707L38.022 43.1516C37.126 43.1673 36.1987 43.1559 35.3009 43.1561L30.3568 43.1568C30.0538 42.5296 29.7815 41.8759 29.503 41.2375L28.3274 38.5546C27.663 37.0299 26.9362 35.4697 26.3006 33.9391L5.89478 33.9395L5.89686 22.9505C11.2806 21.8278 16.1931 19.0601 19.3992 14.5111C21.536 11.4794 22.8502 7.84619 23.2335 4.16299Z" 
        fill="currentColor"
      />
    </g>
  </svg>
);

const navItems = [
  { id: "dashboard", label: "Vue d'ensemble", icon: LayoutGrid },
  { id: "trends", label: "Tendances", icon: TrendingUp },
  { id: "accounts", label: "Comptes", icon: Landmark },
];

export interface SidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function Sidebar({ 
  activeTab: propActiveTab,
  onTabChange,
}: SidebarProps = {}) {
  const [internalActiveTab, setInternalActiveTab] = useState("dashboard");
  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab;
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [selectedBank, setSelectedBank] = useState<BankType>("bourso");
  const [isBankPopoverOpen, setIsBankPopoverOpen] = useState(false);

  useEffect(() => {
    const syncBank = () => {
      try {
        const saved = (localStorage.getItem("krona_selected_bank") || "bourso") as BankType;
        if (saved === "ca" || saved === "bourso") {
          setSelectedBank(saved);
        }
      } catch {}
    };
    syncBank();
    const handleBankChange = (e: any) => {
      if (e.detail?.bank) {
        setSelectedBank(e.detail.bank === "ca" ? "ca" : "bourso");
      } else {
        syncBank();
      }
    };
    window.addEventListener("krona-bank-changed", handleBankChange);
    return () => window.removeEventListener("krona-bank-changed", handleBankChange);
  }, []);

  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail?.tab) {
        setInternalActiveTab(e.detail.tab);
        if (onTabChange) onTabChange(e.detail.tab);
      }
    };
    window.addEventListener("navigate-tab", handleNav);
    return () => {
      window.removeEventListener("navigate-tab", handleNav);
    };
  }, [onTabChange]);

  // Avoid hydration mismatch by only rendering theme toggle after mount
  useEffect(() => setMounted(true), []);

  const [isInboxOpen, setIsInboxOpen] = useState(false);

  useEffect(() => {
    const handleInboxCount = (e: any) => {
      setInboxCount(e.detail.count);
    };
    const handleInboxState = (e: any) => {
      if (typeof e.detail?.isOpen === "boolean") {
        setIsInboxOpen(e.detail.isOpen);
      }
    };
    window.addEventListener("update-inbox-count", handleInboxCount);
    window.addEventListener("krona-inbox-state-changed", handleInboxState);
    return () => {
      window.removeEventListener("update-inbox-count", handleInboxCount);
      window.removeEventListener("krona-inbox-state-changed", handleInboxState);
    };
  }, []);

  const dateObj = mounted ? new Date() : null;
  const dayStr = dateObj ? String(dateObj.getDate()).padStart(2, "0") : "";
  const monthStr = dateObj ? String(dateObj.getMonth() + 1).padStart(2, "0") : "";
  const yearStr = dateObj ? String(dateObj.getFullYear()).slice(-2) : "";
  const dateFull = dateObj ? dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <aside 
      aria-label="Navigation latérale"
      className="w-12 shrink-0 flex flex-col justify-between items-center h-full select-none z-30"
    >
      {/* Haut de la sidebar : Logo Krona + Navigation & Bulle de la Banque */}
      <div className="flex flex-col items-center w-full shrink-0">
        {/* Logo SVG Krona (aligné horizontalement sur la ligne médiane du titre de page) */}
        <div className="w-12 h-9 flex items-center justify-center shrink-0">
          <KronaLogo className="w-6 h-6 text-zinc-900 dark:text-foreground" />
        </div>

        {/* Bloc de navigation décalé vers le bas pour démarrer à la même hauteur que le haut des cartes KPI */}
        <div className="mt-2.5 flex flex-col items-center gap-2 w-full shrink-0">
          {/* Bloc de navigation principale (icônes uniquement, verticalisées en capsule dock) */}
          <nav 
            aria-label="Onglets principaux"
            className="w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-black/[0.06] dark:border-border rounded-full p-1 gap-1.5 relative shrink-0"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <motion.button
                  type="button"
                  key={item.id}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    setInternalActiveTab(item.id);
                    if (onTabChange) onTabChange(item.id);
                    window.dispatchEvent(new CustomEvent("navigate-tab", { detail: { tab: item.id } }));
                  }}
                  className={clsx(
                    "relative w-10 h-10 rounded-full flex items-center justify-center outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all duration-200 ease-out",
                    isActive 
                      ? "text-zinc-900" 
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                  )}
                  title={item.label}
                  aria-label={item.label}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-pill"
                      layout="position"
                      className="absolute inset-0 w-10 h-10 bg-white shadow-sm rounded-full"
                      style={{ borderRadius: 9999 }}
                      transition={{ 
                        type: "spring", 
                        stiffness: 480, 
                        damping: 38,
                        mass: 0.8
                      }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center w-full h-full">
                    <Icon size={18} />
                  </span>
                </motion.button>
              );
            })}
          </nav>

          {/* Bulle / Pastille de la Banque sélectionnée (même largeur w-12 que le bloc de navigation) */}
          <div className="relative w-12 h-12 shrink-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => setIsBankPopoverOpen(!isBankPopoverOpen)}
              className="w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-black/[0.06] dark:border-border flex items-center justify-center text-zinc-700 dark:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
              aria-label="Sélectionner la banque"
              title={`Banque active : ${selectedBank === "ca" ? "Crédit Agricole" : "BoursoBank"} (cliquer pour changer)`}
            >
              {selectedBank === "ca" ? (
                <CreditAgricoleLogo className="w-5 h-5 text-zinc-900 dark:text-foreground" />
              ) : (
                <BoursoBankLogo className="w-4 h-4 text-zinc-900 dark:text-foreground" />
              )}
            </motion.button>

            <BankSelectorPopover
              isOpen={isBankPopoverOpen}
              onClose={() => setIsBankPopoverOpen(false)}
              side="right"
              onSelectBank={(bank) => {
                setSelectedBank(bank);
                localStorage.setItem("krona_selected_bank", bank);
                window.dispatchEvent(new CustomEvent("krona-bank-changed", { detail: { bank } }));
              }}
            />
          </div>
        </div>
      </div>

      {/* Bas de la sidebar : Date verticale + Capsule Dock inférieure regroupant les 4 outils */}
      <div className="flex flex-col items-center gap-2 w-full shrink-0">
        {/* Date du jour verticale (format 100% numérique empilé JJ / MM / AA) */}
        {mounted ? (
          <div 
            className="flex flex-col items-center justify-center select-none pointer-events-none text-center font-sans tracking-tight shrink-0 gap-1"
            title={dateFull}
            aria-label={`Date du jour : ${dayStr}/${monthStr}/${yearStr}`}
          >
            <span className="text-[13px] font-semibold text-zinc-800 dark:text-white tabular-nums leading-none">
              {dayStr}
            </span>
            <span className="text-[13px] font-semibold text-zinc-800 dark:text-white tabular-nums leading-none">
              {monthStr}
            </span>
            <span className="text-[13px] font-semibold text-zinc-400 dark:text-neutral-400 tabular-nums leading-none">
              {yearStr}
            </span>
          </div>
        ) : (
          <div className="h-[46px] w-full shrink-0 opacity-0" />
        )}

        {/* Séparateur discret entre la date et le bouton de thème */}
        <div className="w-5 h-[1px] bg-black/10 dark:bg-white/10 shrink-0 my-0.5" aria-hidden="true" />

        {/* 1. Bouton de thème autonome (même gabarit w-12 h-12 et style que le bouton de banque active) */}
        {mounted ? (
          <div className="relative w-12 h-12 shrink-0">
            <motion.button 
              type="button"
              whileTap={{ scale: 0.94 }} 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-black/[0.06] dark:border-border flex items-center justify-center text-zinc-700 dark:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
              aria-label="Basculer le thème"
              title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </motion.button>
          </div>
        ) : (
          <div className="w-12 h-12 rounded-full opacity-0 shrink-0" />
        )}

        {/* 2. Capsule Dock inférieure (regroupant les 3 outils restants : Notifications, Paramètres, Profil) */}
        <div 
          role="toolbar"
          aria-label="Outils et profil"
          className="w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-black/[0.06] dark:border-border rounded-full p-1 gap-1.5 relative shrink-0"
        >
          {/* Notifications (avec badge) */}
          <motion.button 
            id="sidebar-bell-btn"
            type="button"
            whileTap={{ scale: 0.94 }} 
            onClick={() => window.dispatchEvent(new CustomEvent("open-inbox"))}
            className={clsx(
              "relative w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 shrink-0",
              isInboxOpen
                ? "bg-black/[0.08] dark:bg-white/10 text-zinc-900 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/10"
            )}
            aria-label="Notifications"
            title="Notifications"
            aria-expanded={isInboxOpen}
          >
            <Bell size={18} />
            {inboxCount > 0 && (
              <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-background shadow-sm pointer-events-none" />
            )}
          </motion.button>

          {/* Paramètres */}
          <motion.button 
            type="button"
            whileTap={{ scale: 0.94 }} 
            onClick={() => window.dispatchEvent(new CustomEvent("open-settings"))}
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/10 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 shrink-0"
            aria-label="Paramètres"
            title="Paramètres"
          >
            <Settings size={18} />
          </motion.button>

          {/* Profil utilisateur */}
          <motion.button 
            type="button"
            whileTap={{ scale: 0.94 }} 
            onClick={() => window.dispatchEvent(new CustomEvent("open-profile"))}
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/10 transition-colors duration-150 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 shrink-0"
            aria-label="Profil utilisateur"
            title="Profil"
          >
            <User size={18} className="text-zinc-500 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-white transition-colors" />
          </motion.button>
        </div>
      </div>
    </aside>
  );
}
