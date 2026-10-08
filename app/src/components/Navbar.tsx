"use client";

import { motion } from "framer-motion";
import { LayoutGrid, PieChart, Briefcase, ArrowRightLeft, Search, Bell, User, Flag, Sun, Moon, Plus, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import clsx from "clsx";
import { useTheme } from "@/components/ThemeProvider";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "expenses", label: "Dépenses", icon: PieChart },
  { id: "budgets", label: "Budgets", icon: Flag },
  { id: "accounts", label: "Comptes", icon: Briefcase },
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

export function Navbar() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

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
    window.dispatchEvent(new CustomEvent("trigger-csv-upload"));
  };

  return (
    <header className="fixed top-6 left-0 right-0 z-50 flex items-center justify-between h-16 w-full px-12">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <KronaLogo className="w-8 h-8 text-neutral-900 dark:text-white shrink-0" />
        <span className="text-xl font-bold lowercase tracking-tight text-neutral-900 dark:text-white hidden sm:block transition-colors">krona</span>
      </div>

      {/* Pill Navbar */}
      <nav className="flex items-center bg-card/60 backdrop-blur-2xl shadow-sm border border-border rounded-full p-1 relative transition-colors">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
             <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                "relative px-5 py-2.5 rounded-full text-sm font-medium transition-colors flex items-center gap-2 outline-none",
                isActive ? "text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="navbar-pill"
                  className="absolute inset-0 bg-foreground rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon size={16} />
                <span className="hidden md:inline">{item.label}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* CSV Import CTA */}
        <motion.button 
          whileTap={{ scale: 0.96 }} 
          onClick={triggerCSVUpload}
          className="h-10 px-4 rounded-full bg-black text-white dark:bg-white dark:text-black font-medium flex items-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-colors hover:opacity-90"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Importer CSV</span>
        </motion.button>

        <div className="w-px h-6 bg-border mx-1"></div>

        {/* Theme Switcher */}
        {mounted && (
          <motion.button 
            whileTap={{ scale: 0.95 }} 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-10 h-10 rounded-full bg-card/60 backdrop-blur-xl border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </motion.button>
        )}

        {/* Settings */}
        <motion.button 
          whileTap={{ scale: 0.95 }} 
          onClick={() => window.dispatchEvent(new CustomEvent("open-settings"))}
          className="w-10 h-10 rounded-full bg-card/60 backdrop-blur-xl border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors"
        >
          <Settings size={18} />
        </motion.button>

        {/* Notifications / Profile */}
        <motion.button 
          whileTap={{ scale: 0.95 }} 
          onClick={() => window.dispatchEvent(new CustomEvent("open-inbox"))}
          className="relative w-10 h-10 rounded-full bg-card/60 backdrop-blur-xl border border-border flex items-center justify-center text-foreground hover:bg-muted transition-colors"
        >
          <Bell size={18} />
          {inboxCount > 0 && (
            <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-background shadow-sm" />
          )}
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} className="w-10 h-10 rounded-full bg-card/60 backdrop-blur-xl border border-border flex items-center justify-center overflow-hidden hover:bg-muted transition-colors">
          <User size={18} className="text-muted-foreground hover:text-foreground transition-colors" />
        </motion.button>
      </div>
    </header>
  );
}
