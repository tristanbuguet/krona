"use client";

import { motion } from "framer-motion";
import { LayoutGrid, ArrowRightLeft, TrendingUp, Landmark, Search, Bell, User, Flag, Sun, Moon, Plus, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import clsx from "clsx";
import { useTheme } from "@/components/ThemeProvider";

import Link from "next/link";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "transactions", label: "Transactions", icon: ArrowRightLeft },
  { id: "trends", label: "Tendances", icon: TrendingUp },
  { id: "accounts", label: "Comptes", icon: Landmark },
];

const KronaLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg 
    viewBox="0 0 48 48" 
    fill="none" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <mask id="mask0_495_406" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
      <rect width="48" height="48" fill="#D9D9D9"/>
    </mask>
    <g mask="url(#mask0_495_406)">
      <path d="M23.2335 4.16299L31.7073 4.15991C31.4734 5.06138 31.1832 6.09483 30.8764 6.97572C30.1612 9.01702 29.2238 10.9732 28.0811 12.809C23.2291 20.5663 15.0014 24.8882 6.19107 26.485C6.55881 26.498 7.66306 26.3771 8.06439 26.3262C12.1265 25.812 16.0894 24.5393 19.7264 22.6791C27.3158 18.7973 32.5755 12.27 35.1642 4.16286L41.8804 4.16192L41.8784 8.71949C41.8778 10.2935 42.023 10.2165 41.3689 11.6459C37.9432 19.1315 30.5631 23.7696 23.0482 26.3872C20.5489 27.2392 17.9961 27.9243 15.4064 28.4386C15.8156 28.4593 16.3174 28.4463 16.7327 28.4461L19.0955 28.444C19.3018 28.4453 19.6022 28.4513 19.8052 28.4373C20.2254 28.4084 20.7343 28.2817 21.1481 28.1845C22.0767 27.9662 22.9981 27.7181 23.9109 27.4407C30.6382 25.4471 37.1473 22.1025 41.8911 16.8256C41.8668 17.1161 41.8804 17.5995 41.8804 17.9052L41.881 19.833C41.881 22.145 41.912 24.5319 41.881 26.8364C41.4741 27.2215 40.9507 27.6181 40.5006 27.9508C38.1977 29.6266 35.64 30.9189 32.926 31.7778C32.0348 32.0631 31.0969 32.2797 30.1875 32.4927C30.3673 32.5002 30.5666 32.4996 30.7471 32.4959C31.8072 32.4746 32.8894 32.5276 33.9465 32.4877C34.1433 32.9524 34.3337 33.5115 34.5164 33.9912L35.5438 36.6707L38.022 43.1516C37.126 43.1673 36.1987 43.1559 35.3009 43.1561L30.3568 43.1568C30.0538 42.5296 29.7815 41.8759 29.503 41.2375L28.3274 38.5546C27.663 37.0299 26.9362 35.4697 26.3006 33.9391L5.89478 33.9395L5.89686 22.9505C11.2806 21.8278 16.1931 19.0601 19.3992 14.5111C21.536 11.4794 22.8502 7.84619 23.2335 4.16299Z" fill="currentColor"/>
    </g>
  </svg>
);

interface NavbarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isDemoMode?: boolean;
  isBlurred?: boolean;
  onExitDemo?: () => void;
}

export function Navbar({ 
  activeTab: propActiveTab,
  onTabChange,
  isDemoMode: propIsDemoMode, 
  isBlurred: propIsBlurred, 
  onExitDemo 
}: NavbarProps = {}) {
  const [internalDemoMode, setInternalDemoMode] = useState(true);
  const [internalBlurred, setInternalBlurred] = useState(true);
  const isDemoMode = propIsDemoMode !== undefined ? propIsDemoMode : internalDemoMode;
  const isBlurred = propIsBlurred !== undefined ? propIsBlurred : internalBlurred;
  const [internalActiveTab, setInternalActiveTab] = useState("dashboard");
  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab;
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).__IS_DEMO_MODE__ !== undefined) {
      setInternalDemoMode(!!(window as any).__IS_DEMO_MODE__);
    }
    const handleDemoState = (e: any) => {
      setInternalDemoMode(!!e.detail?.isDemoMode);
    };
    const handleWelcomeModal = (e: any) => {
      setInternalBlurred(!!e.detail?.isOpen);
    };
    const handleNav = (e: any) => {
      if (e.detail?.tab) {
        setInternalActiveTab(e.detail.tab);
        if (onTabChange) onTabChange(e.detail.tab);
      }
    };
    window.addEventListener("demo-mode-state", handleDemoState);
    window.addEventListener("welcome-modal-state", handleWelcomeModal);
    window.addEventListener("navigate-tab", handleNav);
    return () => {
      window.removeEventListener("demo-mode-state", handleDemoState);
      window.removeEventListener("welcome-modal-state", handleWelcomeModal);
      window.removeEventListener("navigate-tab", handleNav);
    };
  }, []);

  useEffect(() => {
    const checkData = () => {
      const savedTx = localStorage.getItem('financeTransactions_v1');
      if (savedTx) {
        try {
          const parsed = JSON.parse(savedTx);
          const has = Boolean(parsed && parsed.length > 0);
          setHasData(has);
          if (propIsDemoMode === undefined) {
            setInternalDemoMode(!has);
          }
          if (propIsBlurred === undefined) {
            setInternalBlurred(!has);
          }
        } catch(e) { 
          setHasData(false);
          if (propIsDemoMode === undefined) setInternalDemoMode(true);
          if (propIsBlurred === undefined) setInternalBlurred(true);
        }
      } else {
        setHasData(false);
        if (propIsDemoMode === undefined) setInternalDemoMode(true);
        if (propIsBlurred === undefined) setInternalBlurred(true);
      }
    };
    checkData();
    window.addEventListener("finance-data-state", checkData);
    return () => window.removeEventListener("finance-data-state", checkData);
  }, [propIsDemoMode, propIsBlurred]);

  // Avoid hydration mismatch by only rendering theme toggle after mount
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleInboxCount = (e: any) => {
      setInboxCount(e.detail.count);
    };
    window.addEventListener("update-inbox-count", handleInboxCount);
    return () => window.removeEventListener("update-inbox-count", handleInboxCount);
  }, []);

  const triggerCSVUpload = () => {
    const savedBank = typeof window !== "undefined" ? localStorage.getItem("krona_selected_bank") || "bourso" : "bourso";
    window.dispatchEvent(new CustomEvent("trigger-csv-upload", { detail: { bank: savedBank } }));
  };

  const handleExitDemo = () => {
    if (onExitDemo) {
      onExitDemo();
    }
    setInternalBlurred(true);
    setInternalActiveTab("dashboard");
    if (onTabChange) onTabChange("dashboard");
    window.dispatchEvent(new CustomEvent("welcome-modal-state", { detail: { isOpen: true } }));
    window.dispatchEvent(new CustomEvent("exit-demo-mode"));
  };

  return (
    <header className={clsx(
      "fixed top-4 sm:top-[40px] left-0 right-0 z-40 flex items-center justify-between h-14 sm:h-16 w-full px-4 sm:px-[40px] transition-all duration-700",
      isBlurred && "blur-[6px] opacity-25 pointer-events-none select-none"
    )}>
      {/* Logo */}
      <Link 
        href="/"
        onClick={(e) => {
          setInternalActiveTab("dashboard");
          if (onTabChange) onTabChange("dashboard");
        }}
        className="flex items-center gap-2 cursor-pointer group outline-none rounded-xl p-1 -m-1 transition-opacity hover:opacity-80 active:scale-95 shrink-0"
        aria-label="Accueil krona"
      >
        <KronaLogo className="w-7 h-7 sm:w-8 sm:h-8 text-neutral-900 dark:text-white shrink-0 transition-transform duration-200 group-hover:scale-105" />
        <span className="text-lg sm:text-xl font-bold lowercase tracking-tight text-neutral-900 dark:text-white hidden sm:block transition-colors">krona</span>
      </Link>

      {/* Pill Navbar */}
      <nav className={clsx(
        "flex items-center bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full p-1 relative transition-colors shrink-0"
      )}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <motion.button
              type="button"
              key={item.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setInternalActiveTab(item.id);
                if (onTabChange) onTabChange(item.id);
                window.dispatchEvent(new CustomEvent("navigate-tab", { detail: { tab: item.id } }));
              }}
              className={clsx(
                "relative px-2.5 sm:px-3 lg:px-4 xl:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 sm:gap-2 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none",
                isActive 
                  ? "text-background" 
                  : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.08]"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="navbar-pill"
                  className="absolute inset-0 bg-foreground rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                <Icon size={16} />
                <span className="hidden lg:inline">{item.label}</span>
              </span>
            </motion.button>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0">
        {/* CSV Import CTA */}
        <motion.button 
          type="button"
          whileTap={{ scale: 0.96 }} 
          onClick={isDemoMode ? handleExitDemo : triggerCSVUpload}
          className="h-9 sm:h-10 px-3 sm:px-4 rounded-full bg-black text-white dark:bg-white dark:text-black text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-all hover:opacity-90 hover:shadow-md cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none shrink-0"
        >
          {isDemoMode ? (
            <span>
              <span className="inline sm:hidden">Quitter</span>
              <span className="hidden sm:inline">Quitter la démo</span>
            </span>
          ) : (
            <>
              <Plus size={16} />
              <span className="hidden sm:inline">Importer un CSV</span>
            </>
          )}
        </motion.button>

        <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>

        {/* Theme Switcher */}
        {mounted && (
          <motion.button 
            type="button"
            whileTap={{ scale: 0.95 }} 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-card/60 backdrop-blur-xl backdrop-saturate-150 border border-border flex items-center justify-center text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none hidden sm:flex"
            aria-label="Basculer le thème"
            title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </motion.button>
        )}

        {/* Settings */}
        <motion.button 
          type="button"
          whileTap={isDemoMode ? undefined : { scale: 0.95 }} 
          onClick={isDemoMode ? undefined : () => window.dispatchEvent(new CustomEvent("open-settings"))}
          className={clsx(
            "w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-card/60 backdrop-blur-xl backdrop-saturate-150 border border-border items-center justify-center text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none hidden md:flex",
            isDemoMode && "opacity-40 pointer-events-none cursor-not-allowed"
          )}
          aria-label="Paramètres"
          title="Paramètres"
        >
          <Settings size={18} />
        </motion.button>

        {/* Notifications / Profile */}
        <motion.button 
          type="button"
          whileTap={isDemoMode ? undefined : { scale: 0.95 }} 
          onClick={isDemoMode ? undefined : () => window.dispatchEvent(new CustomEvent("open-inbox"))}
          className={clsx(
            "relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-card/60 backdrop-blur-xl backdrop-saturate-150 border border-border items-center justify-center text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none hidden md:flex",
            isDemoMode && "opacity-40 pointer-events-none cursor-not-allowed"
          )}
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell size={18} />
          {inboxCount > 0 && (
            <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-background shadow-sm" />
          )}
        </motion.button>
        <motion.button 
          type="button"
          whileTap={isDemoMode ? undefined : { scale: 0.95 }} 
          onClick={isDemoMode ? undefined : () => window.dispatchEvent(new CustomEvent("open-profile"))}
          className={clsx(
            "w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-card/60 backdrop-blur-xl backdrop-saturate-150 border border-border items-center justify-center overflow-hidden text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer group focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none hidden md:flex",
            isDemoMode && "opacity-40 pointer-events-none cursor-not-allowed"
          )}
          aria-label="Profil utilisateur"
          title="Profil"
        >
          <User size={18} className="text-muted-foreground group-hover:text-foreground transition-colors" />
        </motion.button>
      </div>
    </header>
  );
}
