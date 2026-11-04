# Spécification Exhaustive des Composants d'Interface — Krona

> **Catalogue & Bibliothèque Technique des Composants Krona.**  
> Ce document rassemble l'anatomie complète, les interfaces TypeScript, les classes Tailwind exactes et les extraits JSX prêts à l'emploi de chaque composant de navigation, de surface, de données et de formulaire de l'application Krona.  
> Chaque composant est conçu pour être immédiatement copié-collé et transposé dans un nouveau projet Next.js / Tailwind CSS / Framer Motion sans configuration obscure.

---

## Sommaire

1. [Architecture de Navigation & Dock](#1-architecture-de-navigation--dock)
   - [1.1 Dock Latéral Flottant (`Sidebar`)](#11-dock-latéral-flottant-sidebar)
   - [1.2 En-tête de Page Universel (`PageHeader`)](#12-en-tête-de-page-universel-pageheader)
   - [1.3 Bouton Circulaire de Fermeture (`CloseButton`)](#13-bouton-circulaire-de-fermeture-closebutton)
2. [Conteneurs Flottants & Fenêtres (Surface Layer)](#2-conteneurs-flottants--fenêtres-surface-layer)
   - [2.1 Popover de Compte & Synchronisation (`AccountPopover`)](#21-popover-de-compte--synchronisation-accountpopover)
   - [2.2 Avatar Utilisateur & Statut Sync (`UserAvatar`)](#22-avatar-utilisateur--statut-sync-useravatar)
   - [2.3 Sélecteur Déroulant de Banque (`BankSelectorPopover`)](#23-sélecteur-déroulant-de-banque-bankselectorpopover)
   - [2.4 Pop-up Contextuel de Recatégorisation](#24-pop-up-contextuel-de-recatégorisation)
   - [2.5 Tiroir Latéral d'Opérations (Slide-over Drawer)](#25-tiroir-latéral-dopérations-slide-over-drawer)
   - [2.6 Modale Centrale de Paramètres (`SettingsModal`)](#26-modale-centrale-de-paramètres-settingsmodal)
   - [2.7 Modale d'Analyse & Progression CSV (`CsvAnalysisModal`)](#27-modale-danalyse--progression-csv-csvanalysismodal)
   - [2.8 Modale de Formulaire de Compte Bancaire](#28-modale-de-formulaire-de-compte-bancaire)
3. [Composants de Données & Dashboard](#3-composants-de-données--dashboard)
   - [3.1 Conteneur Universel de Carte (`Card`)](#31-conteneur-universel-de-carte-card)
   - [3.2 Carte de Métrique / KPI Canonique](#32-carte-de-métrique--kpi-canonique)
   - [3.3 Carte de Plafond Mensuel (`MonthlyLimitCard`)](#33-carte-de-plafond-mensuel-monthlylimitcard)
   - [3.4 Carte de Reste à Vivre Réel & Charges Fixes (`RealDisposableIncomeCard`)](#34-carte-de-reste-à-vivre-réel--charges-fixes-realdisposableincomecard)
   - [3.5 Jauge Demi-Donut de Répartition (`SemiDonutGauge`)](#35-jauge-demi-donut-de-répartition-semidonutgauge)
   - [3.6 Compteur à Chiffres Alternés (`AlternatingDigitAmount`)](#36-compteur-à-chiffres-alternés-alternatingdigitamount)
   - [3.7 Visualiseur de Rythme Hebdomadaire (Spending Cadence)](#37-visualiseur-de-rythme-hebdomadaire-spending-cadence)
   - [3.8 Sélecteurs de Période & Contrôles Segmentés (Sliding Pills)](#38-sélecteurs-de-période--contrôles-segmentés-sliding-pills)
   - [3.9 Lignes & Tableaux de Transactions](#39-lignes--tableaux-de-transactions)
4. [Formulaires & Contrôles d'Entrée](#4-formulaires--contrôles-dentrée)
   - [4.1 Champs de Saisie (Inputs & Selects)](#41-champs-de-saisie-inputs--selects)
   - [4.2 Interrupteur Minimaliste Apple iOS (`Switch`)](#42-interrupteur-minimaliste-apple-ios-switch)
   - [4.3 Bibliothèque des Variantes de Boutons](#43-bibliothèque-des-variantes-de-boutons)

---

## 1. Architecture de Navigation & Dock

### 1.1 Dock Latéral Flottant (`Sidebar`)

#### Rôle & Contexte
Barre d'outils et de navigation ultra-compacte (`w-12`, 48px de large), positionnée verticalement sur le flanc gauche de l'écran. Elle s'inspire du Dock macOS et de l'iPadOS Side Strip :
- **Haut** : Logo Krona SVG aligné au millimètre sur la ligne médiane du titre de page, suivi de la capsule d'onglets principaux (Vue d'ensemble, Tendances, Comptes) et de la pastille ronde de la banque active.
- **Centre** : Date du jour verticale (format numérique empilé JJ / MM / AA en `tabular-nums`) séparée par un liseré fin.
- **Bas** : Bouton de bascule de thème clair/sombre, puis capsule inférieure regroupant les notifications, les paramètres et l'avatar utilisateur avec badge de synchronisation Cloud.

#### Interface TypeScript
```ts
export interface SidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isNotificationOpen?: boolean;
  isOpen?: boolean;
  onNotificationToggle?: () => void;
  isAccountPopoverOpen?: boolean;
  onAccountPopoverToggle?: () => void;
  onAccountPopoverClose?: () => void;
}
```

#### Code JSX / Tailwind
```tsx
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, TrendingUp, Landmark, Sun, Moon, Settings, Bell, User } from "lucide-react";
import clsx from "clsx";

export const navItems = [
  { id: "dashboard", label: "Vue d'ensemble", icon: LayoutGrid },
  { id: "trends", label: "Tendances", icon: TrendingUp },
  { id: "accounts", label: "Comptes", icon: Landmark },
];

export function Sidebar({
  activeTab = "dashboard",
  onTabChange,
  isNotificationOpen = false,
  onNotificationToggle,
  isAccountPopoverOpen = false,
  onAccountPopoverToggle,
}: SidebarProps) {
  const [internalTab, setInternalTab] = useState(activeTab);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [inboxCount, setInboxCount] = useState(0);

  const currentTab = onTabChange ? activeTab : internalTab;
  const now = new Date();
  const dayStr = String(now.getDate()).padStart(2, "0");
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const yearStr = String(now.getFullYear()).slice(-2);

  return (
    <aside
      aria-label="Navigation latérale"
      className="w-12 shrink-0 flex flex-col justify-between items-center h-full select-none z-30"
    >
      {/* Haut : Logo + Onglets + Sélecteur de Banque */}
      <div className="flex flex-col items-center w-full shrink-0">
        {/* Emplacement Logo */}
        <div className="w-12 h-9 flex items-center justify-center shrink-0">
          <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center text-background font-bold text-xs">
            K
          </div>
        </div>

        <div className="mt-2.5 flex flex-col items-center gap-2 w-full shrink-0">
          {/* Capsule Dock des Onglets Principaux */}
          <nav
            aria-label="Onglets principaux"
            className="w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full p-1 gap-1.5 relative shrink-0"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    setInternalTab(item.id);
                    onTabChange?.(item.id);
                  }}
                  className={clsx(
                    "relative w-10 h-10 rounded-full flex items-center justify-center outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all duration-200 ease-out",
                    isActive
                      ? "text-black"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  )}
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
                        mass: 0.8,
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

          {/* Pastille Ronde de Banque Active */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            className="w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-border flex items-center justify-center text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-foreground/20"
            aria-label="Sélectionner la banque"
          >
            <Landmark size={18} />
          </motion.button>
        </div>
      </div>

      {/* Bas : Date Verticale + Thème + Capsule Outils */}
      <div className="flex flex-col items-center gap-2 w-full shrink-0">
        {/* Date format JJ / MM / AA */}
        <div className="flex flex-col items-center justify-center select-none pointer-events-none text-center font-sans tracking-tight shrink-0 gap-1">
          <span className="text-[13px] font-semibold text-foreground tabular-nums leading-none">
            {dayStr}
          </span>
          <span className="text-[13px] font-semibold text-foreground tabular-nums leading-none">
            {monthStr}
          </span>
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums leading-none">
            {yearStr}
          </span>
        </div>

        {/* Séparateur discret */}
        <div className="w-5 h-[1px] bg-black/10 dark:bg-white/10 shrink-0 my-0.5" />

        {/* Bouton Thème */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-border flex items-center justify-center text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-foreground/20"
          aria-label="Basculer le thème"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </motion.button>

        {/* Capsule Outils (Notifs, Paramètres, Profil) */}
        <div
          role="toolbar"
          className="w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full p-1 gap-1.5 relative shrink-0"
        >
          {/* Notifications */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={onNotificationToggle}
            className={clsx(
              "relative w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 shrink-0",
              isNotificationOpen
                ? "bg-black/[0.08] dark:bg-white/10 text-zinc-900 dark:text-white"
                : "bg-transparent text-zinc-600 dark:text-zinc-400 hover:text-white hover:bg-black/[0.08] dark:hover:bg-white/10"
            )}
            aria-label="Notifications"
          >
            <Bell size={18} />
            {inboxCount > 0 && (
              <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-background shadow-sm" />
            )}
          </motion.button>

          {/* Paramètres */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-white hover:bg-black/[0.08] dark:hover:bg-white/10 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 shrink-0"
            aria-label="Paramètres"
          >
            <Settings size={18} />
          </motion.button>

          {/* Compte Utilisateur */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={onAccountPopoverToggle}
            className={clsx(
              "relative w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 shrink-0",
              isAccountPopoverOpen
                ? "bg-black/[0.08] dark:bg-white/10 text-zinc-900 dark:text-white"
                : "bg-transparent text-zinc-600 dark:text-zinc-400 hover:text-white hover:bg-black/[0.08] dark:hover:bg-white/10"
            )}
            aria-label="Compte & Synchronisation"
          >
            <User size={18} />
          </motion.button>
        </div>
      </div>
    </aside>
  );
}
```

---

### 1.2 En-tête de Page Universel (`PageHeader`)

#### Rôle & Contexte
Composant d'en-tête standardisé présent au sommet de chaque vue de l'application (`Dashboard`, `TrendsView`, `TransactionsView`, `AccountsView`).
- **Gauche** : Titre de la vue (H1, Space Grotesk `leading-none`) et date courante en français en capitales douces (ex. *« Mardi 3 novembre »*).
- **Droite** : Zone d'actions flexibles passées en `children` (Sélecteur de mois, bouton d'action principal, filtres).

#### Interface TypeScript
```ts
export interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
  showDate?: boolean;
}
```

#### Code JSX / Tailwind
```tsx
import React, { useState, useEffect } from "react";
import clsx from "clsx";

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
    <header className={clsx("flex items-center justify-between min-h-[36px] h-9 shrink-0 mb-3.5 w-full select-none", className)}>
      {/* Titre et Date */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground truncate font-sans leading-none">
          {title}
        </h1>
        {shouldDisplayDate && currentDate && (
          <span className="text-xs sm:text-sm font-medium text-muted-foreground select-none truncate leading-none font-sans">
            {currentDate}
          </span>
        )}
      </div>

      {/* Actions Droite */}
      {children && (
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {children}
        </div>
      )}
    </header>
  );
}
```

---

### 1.3 Bouton Circulaire de Fermeture (`CloseButton`)

#### Rôle & Contexte
Bouton circulaire compact `32x32px` (`w-8 h-8 rounded-full`), présent sur l'ensemble des modales, popovers et tiroirs latéraux. Il garantit une cible de clic standardisée et réactive.

#### Interface TypeScript
```ts
export interface CloseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  iconSize?: number;
}
```

#### Code JSX / Tailwind
```tsx
import React from "react";
import { X } from "lucide-react";
import clsx from "clsx";

export const CloseButton = ({
  className = "",
  iconSize = 16,
  onClick,
  ...props
}: CloseButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fermer"
      className={clsx(
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
```

---

## 2. Conteneurs Flottants & Fenêtres (Surface Layer)

### 2.1 Popover de Compte & Synchronisation (`AccountPopover`)

#### Rôle & Contexte
Menu contextuel flottant déployé depuis le bouton avatar de la Sidebar. Il orchestre l'authentification Google OAuth, la migration locale-vers-cloud, le statut de synchronisation en temps réel et la déconnexion.

#### Recette Tailwind du Glassmorphism
```css
bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl
```

#### Interface TypeScript
```ts
export interface AccountPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  user?: { name: string; email: string; picture?: string } | null;
  isAuthenticated?: boolean;
  syncStatus?: "idle" | "syncing" | "error";
  onSignIn?: () => void;
  onSignOut?: () => void;
  onSync?: () => void;
}
```

#### Code JSX / Tailwind
```tsx
import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cloud, Check, RefreshCw, LogOut, ShieldCheck, AlertCircle } from "lucide-react";
import { CloseButton } from "./ui/CloseButton";
import { UserAvatar } from "./UserAvatar";

export function AccountPopover({
  isOpen,
  onClose,
  user,
  isAuthenticated = false,
  syncStatus = "idle",
  onSignIn,
  onSignOut,
  onSync,
}: AccountPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 10);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          role="dialog"
          initial={{ opacity: 0, x: -8, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="absolute left-full bottom-0 ml-3 w-80 shrink-0 bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-3.5 z-[101] overflow-hidden select-none font-sans flex flex-col"
        >
          {!isAuthenticated || !user ? (
            /* Mode Invité (Déconnecté) */
            <div className="flex flex-col gap-3 shrink-0">
              <div className="flex items-start justify-between gap-2 px-1 pt-0.5 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
                    <Cloud size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground tracking-tight leading-tight truncate">
                      Synchronisation Cloud
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
                      <span className="text-xs text-muted-foreground truncate">
                        Mode invité · Données locales
                      </span>
                    </div>
                  </div>
                </div>
                <CloseButton onClick={onClose} iconSize={15} />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed px-1 shrink-0 font-sans">
                Connectez votre compte pour sauvegarder vos finances et les synchroniser entre vos appareils.
              </p>

              <div className="rounded-xl bg-muted/60 border border-border px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground min-h-[36px] shrink-0 font-sans">
                <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
                <span className="truncate">Migration automatique sans écrasement</span>
              </div>

              <button
                type="button"
                onClick={onSignIn}
                className="w-full h-9 px-4 rounded-full bg-foreground text-background hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2.5 text-xs font-medium cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-foreground/20 font-sans shrink-0"
              >
                <span>Continuer avec Google</span>
              </button>
            </div>
          ) : (
            /* Mode Connecté */
            <div className="flex flex-col gap-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2 px-1 pt-0.5 shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <UserAvatar name={user.name} email={user.email} picture={user.picture} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground tracking-tight truncate">
                      {user.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {user.email}
                    </div>
                  </div>
                </div>
                <CloseButton onClick={onClose} iconSize={15} />
              </div>

              {/* Statut de Synchronisation */}
              <div className="min-h-[44px] h-[44px] rounded-xl bg-muted/60 border border-border px-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {syncStatus === "syncing" ? (
                      <RefreshCw size={13} className="text-muted-foreground animate-spin" />
                    ) : syncStatus === "error" ? (
                      <AlertCircle size={13} className="text-rose-500" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 block" />
                    )}
                  </span>
                  <span className="text-xs font-medium text-foreground truncate leading-none">
                    {syncStatus === "syncing"
                      ? "Synchronisation..."
                      : syncStatus === "error"
                      ? "Sauvegarde locale active"
                      : "Données synchronisées"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onSync}
                  className="h-6 min-w-[62px] px-2 rounded-full bg-card hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border border-border text-xs font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                >
                  <Check size={11} className="text-emerald-500" />
                  <span>Cloud</span>
                </button>
              </div>

              {/* Action Déconnexion */}
              <div className="flex items-center justify-between gap-2 px-1 pt-1 shrink-0">
                <button
                  type="button"
                  onClick={onSignOut}
                  className="h-8 px-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-all select-none active:scale-[0.98] cursor-pointer shadow-sm shrink-0"
                >
                  <LogOut size={13} className="shrink-0" />
                  <span>Se déconnecter</span>
                </button>
                <span className="text-xs text-muted-foreground truncate">
                  Cloud sauvegardé
                </span>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

### 2.2 Avatar Utilisateur & Statut Sync (`UserAvatar`)

#### Interface TypeScript
```ts
export interface UserAvatarProps {
  name?: string;
  email?: string;
  picture?: string;
  size?: "sm" | "md";
}
```

#### Code JSX / Tailwind
```tsx
import React, { useState, useMemo } from "react";
import clsx from "clsx";

export function UserAvatar({ name = "", email = "", picture, size = "sm" }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);

  const initials = useMemo(() => {
    const src = (name || email || "TB").trim();
    const parts = src.split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }, [name, email]);

  const sizeClass = size === "md" ? "w-9 h-9 text-xs" : "w-6 h-6 text-[10px]";

  return (
    <div
      className={clsx(
        sizeClass,
        "relative rounded-full overflow-hidden ring-1 ring-black/10 dark:ring-white/20 shrink-0 select-none flex items-center justify-center bg-foreground text-background font-semibold font-sans tracking-tight"
      )}
    >
      {picture && !failed ? (
        <img
          src={picture}
          alt={name || "Avatar"}
          onError={() => setFailed(true)}
          className="w-full h-full object-cover rounded-full"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
```

---

### 2.3 Sélecteur Déroulant de Banque (`BankSelectorPopover`)

#### Rôle & Contexte
Popover de sélection bancaire (BoursoBank, Crédit Agricole, Caisse d'Épargne, LCL). Il affiche la liste des établissements supportés avec leur icône vectorielle officielle dans un carré arrondi `w-8.5 h-8.5 rounded-xl bg-card border border-border`.

#### Interface TypeScript
```ts
export type BankType = "bourso" | "ca" | "ce" | "lcl";

export interface BankSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBank: (bank: BankType) => void;
  align?: "left" | "right";
  side?: "bottom" | "right";
}
```

#### Code JSX / Tailwind
```tsx
import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Landmark } from "lucide-react";
import clsx from "clsx";

const BANK_OPTIONS = [
  { id: "bourso", label: "BoursoBank", desc: "Relevé de compte CSV" },
  { id: "ca", label: "Crédit Agricole", desc: "Relevé de compte CSV" },
  { id: "ce", label: "Caisse d'Épargne", desc: "Relevé de compte CSV" },
  { id: "lcl", label: "LCL", desc: "Relevé de compte CSV" },
] as const;

export function BankSelectorPopover({
  isOpen,
  onClose,
  onSelectBank,
  side = "right",
  align = "left",
}: BankSelectorPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const clickHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", clickHandler);
      document.addEventListener("keydown", keyHandler);
    }, 10);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", clickHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          initial={side === "right" ? { opacity: 0, x: -8, scale: 0.96 } : { opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={side === "right" ? { opacity: 0, x: -8, scale: 0.96 } : { opacity: 0, y: -8, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className={clsx(
            "absolute w-64 sm:w-72 bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-2 z-[101] overflow-hidden select-none font-sans",
            side === "right" ? "left-full top-0 ml-3" : align === "left" ? "top-full mt-2 left-0" : "top-full mt-2 right-0"
          )}
        >
          <div className="px-3 pt-2 pb-1">
            <span className="text-[11px] font-semibold tracking-tight text-muted-foreground uppercase font-sans">
              Sélectionner la banque
            </span>
          </div>

          <div className="space-y-1">
            {BANK_OPTIONS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onSelectBank(b.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.05] active:scale-[0.98] transition-all text-left group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border flex items-center justify-center text-foreground shrink-0 group-hover:bg-black/[0.06] dark:group-hover:bg-white/[0.08] transition-colors">
                  <Landmark size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground tracking-tight font-sans">
                    {b.label}
                  </div>
                  <div className="text-xs text-muted-foreground font-sans truncate">
                    {b.desc}
                  </div>
                </div>
                <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground transition-colors ml-auto" />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

### 2.4 Pop-up Contextuel de Recatégorisation

#### Rôle & Contexte
Fenêtre flottante déployée depuis le tiroir d'opérations permettant de réassigner instantanément la catégorie d'une transaction à l'aide d'une puce d'état et d'une coche active.

#### Code JSX / Tailwind
```tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import clsx from "clsx";
import { CloseButton } from "./ui/CloseButton";

export function RecategorizationPopup({
  categories,
  currentCategory,
  onSelect,
  onClose,
}: {
  categories: readonly string[];
  currentCategory: string;
  onSelect: (cat: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 12, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="absolute right-full mr-3 w-72 sm:w-80 max-h-[380px] bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl z-20 overflow-hidden select-none flex flex-col font-sans"
    >
      <div className="shrink-0 w-full pt-3 px-3 pb-2 flex items-center justify-between z-10 bg-transparent">
        <span className="text-sm font-semibold text-foreground tracking-tight">
          Modifier la catégorie
        </span>
        <CloseButton onClick={onClose} iconSize={15} />
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-3 pt-1 pb-3 space-y-1.5">
        {categories.map((cat) => {
          const isCurrent = currentCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelect(cat)}
              className={clsx(
                "w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left cursor-pointer active:scale-[0.98]",
                isCurrent
                  ? "bg-neutral-100 dark:bg-white/[0.08] border-foreground/20 shadow-xs"
                  : "bg-neutral-50 dark:bg-white/[0.03] border-border hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:border-foreground/20"
              )}
            >
              <span className="text-sm font-semibold text-foreground tracking-tight truncate flex-1">
                {cat}
              </span>
              {isCurrent ? (
                <div className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 ml-auto shadow-xs">
                  <Check size={12} strokeWidth={2.8} />
                </div>
              ) : (
                <span className="w-2 h-2 rounded-full bg-black/20 dark:bg-white/30 shrink-0 ml-auto" />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
```

---

### 2.5 Tiroir Latéral d'Opérations (Slide-over Drawer)

#### Rôle & Contexte
Panneau latéral déployé de droite à gauche sur toute la hauteur (`calc(100vh - 2rem)`), logeant le moteur de recherche instantané, les puces de filtrage par flux et le défilement de l'historique complet.

#### Code JSX / Tailwind
```tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { CloseButton } from "./ui/CloseButton";

export function TransactionsDrawer({
  isOpen,
  onClose,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  filter: string;
  onFilterChange: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex justify-end p-2 sm:p-4 md:p-6 font-sans">
          {/* Scrim avec blur Apple */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
          />

          {/* Tiroir coulissant */}
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="relative z-10 h-full w-full max-w-lg md:max-w-xl rounded-2xl sm:rounded-3xl bg-card/95 backdrop-blur-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground font-sans">
                  Toutes les opérations
                </h2>
                <p className="text-xs text-muted-foreground font-sans mt-0.5">
                  Historique filtré et catégorisé
                </p>
              </div>
              <CloseButton onClick={onClose} />
            </div>

            {/* Barre de Recherche & Filtres */}
            <div className="px-4 sm:px-6 py-3 shrink-0 space-y-3 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Rechercher par libellé ou catégorie..."
                  className="w-full h-10 pl-9 pr-8 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground placeholder:text-neutral-500 outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all font-sans"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-foreground p-1 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Filtres Rapides */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: "all", label: "Tout" },
                  { id: "debit", label: "Dépenses" },
                  { id: "credit", label: "Revenus" },
                  { id: "sub", label: "Abonnements" },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => onFilterChange(chip.id)}
                    className={`h-8 px-3.5 rounded-full text-xs font-medium transition-all shrink-0 active:scale-95 cursor-pointer font-sans ${
                      filter === chip.id
                        ? "bg-white text-zinc-950 font-medium shadow-sm"
                        : "text-neutral-400 hover:text-foreground bg-transparent hover:bg-black/5 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contenu Défilant */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

---

### 2.6 Modale Centrale de Paramètres (`SettingsModal`)

#### Rôle & Contexte
Grande modale centrale (`max-w-4xl`, `rounded-3xl`) logeant les configurations avancées (Revenus socles, Charges incompressibles, Plafonds de dépenses et Détection d'abonnements). Elle intègre un contrôle segmenté glissant façon macOS et des listes groupées divisées par bordures fines.

#### Code JSX / Tailwind
```tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Repeat, Flag } from "lucide-react";
import { CloseButton } from "./ui/CloseButton";

export function SettingsModal({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"income" | "subs" | "limits">("income");

  const tabs = [
    { id: "income", label: "Revenus & Fixes", icon: Wallet },
    { id: "subs", label: "Abonnements", icon: Repeat },
    { id: "limits", label: "Plafonds & Données", icon: Flag },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 font-sans">
          {/* Backdrop Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-4xl h-[90vh] sm:h-[80vh] relative z-10 flex flex-col overflow-hidden"
          >
            {/* Header Sticky avec Contrôle Segmenté Glissant */}
            <div className="sticky top-0 z-30 bg-card border-b border-border px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
                Paramètres
              </h2>

              <nav className="inline-flex items-center rounded-full bg-muted/60 p-1 border border-border relative shadow-inner overflow-hidden">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className="relative flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all active:scale-[0.97] cursor-pointer select-none"
                    >
                      {isActive && (
                        <motion.div
                          layoutId="settingsTabPill"
                          transition={{ type: "spring", bounce: 0.12, duration: 0.35 }}
                          className="absolute inset-0 rounded-full bg-white text-black shadow-sm"
                        />
                      )}
                      <span className={`relative z-10 flex items-center gap-2 ${
                        isActive ? "text-black font-medium" : "text-zinc-400 hover:text-white"
                      }`}>
                        <Icon size={14} />
                        <span>{tab.label}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              <CloseButton onClick={onClose} iconSize={16} />
            </div>

            {/* Contenu Défilant */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-background">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

---

### 2.7 Modale d'Analyse & Progression CSV (`CsvAnalysisModal`)

#### Rôle & Contexte
Boîte de dialogue modale compacte (`max-w-[210px]`) centrée, affichée lors des phases d'importation et d'enrichissement IA d'un fichier bancaire CSV.

#### Code JSX / Tailwind
```tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

export type ImportStep = "importing" | "reading" | "categorizing" | "success";

export function CsvAnalysisModal({ step }: { step: ImportStep | null }) {
  const isSuccess = step === "success";
  const label = isSuccess
    ? "Relevé importé"
    : step === "categorizing"
    ? "Catégorisation IA..."
    : "Importation...";

  return (
    <AnimatePresence>
      {step && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-full max-w-[210px] sm:max-w-[220px] p-6 bg-card/95 backdrop-blur-2xl border border-border rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] flex flex-col items-center justify-center text-center gap-4"
          >
            <div className="relative w-14 h-14 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {isSuccess ? (
                  <motion.div
                    key="success"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                    className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400"
                  >
                    <Check size={24} strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="loading"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="relative w-14 h-14 flex items-center justify-center"
                  >
                    <div className="absolute inset-0 rounded-full border border-border" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-foreground animate-spin" />
                    <span className="text-xs font-bold text-foreground">K</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <span className="text-sm font-semibold tracking-tight text-foreground truncate">
              {label}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

### 2.8 Modale de Formulaire de Compte Bancaire

#### Rôle & Contexte
Boîte de dialogue modale (`max-w-md`, `rounded-2xl`) pour la saisie ou la modification d'un compte bancaire déclaré manuellement.

#### Code JSX / Tailwind
```tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { CloseButton } from "./ui/CloseButton";

export function AccountFormModal({
  isOpen,
  onClose,
  isEditing = false,
  onDelete,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  isEditing?: boolean;
  onDelete?: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative z-10 w-full max-w-md bg-card/95 backdrop-blur-2xl border border-border rounded-2xl p-6 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                {isEditing ? "Modifier le compte" : "Rattacher un compte"}
              </h3>
              <CloseButton onClick={onClose} />
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                  Nom du compte
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compte Courant"
                  className="w-full h-10 px-3.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                    Établissement
                  </label>
                  <select className="w-full h-10 px-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-xs text-foreground outline-none focus:border-foreground/30 cursor-pointer font-sans">
                    <option value="BoursoBank">BoursoBank</option>
                    <option value="Crédit Agricole">Crédit Agricole</option>
                    <option value="Caisse d'Épargne">Caisse d'Épargne</option>
                    <option value="LCL">LCL</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                    Solde initial (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full h-10 px-3.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground outline-none focus:border-foreground/30 tabular-nums font-sans"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                {isEditing ? (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="h-10 px-3.5 rounded-full text-rose-500 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1.5 cursor-pointer font-sans"
                  >
                    <Trash2 size={14} />
                    <span>Supprimer</span>
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-10 px-4 rounded-full text-xs font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/[0.06] cursor-pointer font-sans"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="h-10 px-5 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 active:scale-95 transition-all cursor-pointer font-sans"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

---

## 3. Composants de Données & Dashboard

### 3.1 Conteneur Universel de Carte (`Card`)

#### Interface TypeScript
```ts
export interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  onClick?: () => void;
}
```

#### Code JSX / Tailwind
```tsx
import React from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

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
```

---

### 3.2 Carte de Métrique / KPI Canonique

#### Rôle & Contexte
Composant de présentation des 4 métriques fondamentales du Dashboard (Revenus, Dépenses, Épargne nette, Abonnements).

#### Code JSX / Tailwind
```tsx
import React from "react";
import { Card } from "./ui/Card";
import { ArrowDownLeft, ArrowUpRight, Wallet, Repeat } from "lucide-react";

export function MetricCard({
  label,
  amount,
  subtext,
  iconType = "income",
  gaugeRate,
  onClick,
}: {
  label: string;
  amount: string;
  subtext: string;
  iconType?: "income" | "expense" | "savings" | "subs";
  gaugeRate?: number;
  onClick?: () => void;
}) {
  const Icon =
    iconType === "income"
      ? ArrowDownLeft
      : iconType === "expense"
      ? ArrowUpRight
      : iconType === "savings"
      ? Wallet
      : Repeat;

  return (
    <Card
      onClick={onClick}
      className={`min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] flex flex-col justify-between ${
        onClick ? "group cursor-pointer active:scale-[0.995]" : "cursor-default"
      }`}
    >
      {/* En-tête de carte */}
      <div className="flex justify-between items-start mb-1 sm:mb-2">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors font-sans truncate">
          {label}
        </span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border text-muted-foreground group-hover:text-foreground shrink-0 ml-2">
          <Icon size={15} strokeWidth={1.5} />
        </div>
      </div>

      {/* Montant & Métadonnées */}
      <div className="flex flex-col">
        <div className="text-xl sm:text-2xl xl:text-3xl font-semibold mb-0.5 sm:mb-1 tracking-tight text-foreground tabular-nums font-sans">
          {amount}
        </div>
        <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium w-full text-muted-foreground font-sans">
          <span className="truncate">{subtext}</span>
          {typeof gaugeRate === "number" && gaugeRate > 0 && (
            <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
              <div className="w-8 sm:w-10 h-1 bg-black/5 dark:bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, gaugeRate)}%` }}
                />
              </div>
              <span className="tabular-nums font-medium text-emerald-500 text-[10px] sm:text-[11px]">
                {gaugeRate}%
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
```

---

### 3.3 Carte de Plafond Mensuel (`MonthlyLimitCard`)

#### Rôle & Contexte
Carte KPI interactive pilotant le plafond de dépense mensuel. Elle affiche le montant consommé, la limite autorisée, le pourcentage dépensé et la barre de progression colorée (normal, alerte > 85%, dépassement).

#### Interface TypeScript
```ts
export interface MonthlyLimitConfig {
  type: "amount" | "percent";
  value: number;
}

export interface MonthlyLimitCardProps {
  spentAmount?: number;
  monthlyLimit?: number;
  targetPercent?: number;
  className?: string;
  onClick?: () => void;
}
```

#### Code JSX / Tailwind
```tsx
import React from "react";
import { motion } from "framer-motion";
import { Target } from "lucide-react";
import clsx from "clsx";
import { Card } from "./ui/Card";

export function MonthlyLimitCard({
  spentAmount = 1450,
  monthlyLimit = 2000,
  targetPercent = 20,
  className = "",
  onClick,
}: MonthlyLimitCardProps) {
  const percentage = monthlyLimit > 0 ? Math.round((spentAmount / monthlyLimit) * 100) : 0;
  const isOverLimit = spentAmount > monthlyLimit;

  return (
    <Card
      onClick={onClick}
      className={clsx(
        "min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] flex flex-col justify-between group cursor-pointer active:scale-[0.995]",
        className
      )}
    >
      <div className="flex justify-between items-start shrink-0">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors font-sans truncate">
          Plafond mensuel
        </span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border group-hover:border-white/20 text-muted-foreground group-hover:text-foreground shrink-0 ml-2">
          <Target size={15} strokeWidth={1.5} />
        </div>
      </div>

      <div className="flex flex-col my-auto">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight text-foreground tabular-nums font-sans">
            {spentAmount.toFixed(0)} €
          </div>
          <span
            className={clsx(
              "text-[10px] sm:text-xs font-medium tabular-nums font-sans px-2 py-0.5 rounded-full border",
              isOverLimit
                ? "text-rose-500 bg-rose-500/10 border-rose-500/20 font-semibold"
                : "text-muted-foreground bg-black/[0.03] dark:bg-white/[0.04] border-border"
            )}
          >
            {isOverLimit
              ? `+${Math.round(spentAmount - monthlyLimit)} € dépassés`
              : `${percentage}% dépensés`}
          </span>
        </div>

        <div className="text-[10px] sm:text-xs font-medium text-muted-foreground font-sans truncate mt-1">
          Objectif : garder <span className="tabular-nums font-semibold text-foreground">{targetPercent}%</span> · Limite : <span className="tabular-nums font-semibold text-foreground">{monthlyLimit.toFixed(0)} €</span>
        </div>
      </div>

      {/* Barre de progression dynamique */}
      <div className="mt-2 w-full shrink-0">
        <div className="h-2 w-full bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, percentage)}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              "h-full rounded-full transition-colors",
              isOverLimit ? "bg-rose-500" : percentage > 85 ? "bg-amber-400" : "bg-foreground"
            )}
          />
        </div>
      </div>
    </Card>
  );
}
```

---

### 3.4 Carte de Reste à Vivre Réel & Charges Fixes (`RealDisposableIncomeCard`)

#### Rôle & Contexte
Calcule et ventile le reste à vivre après déduction stricte des charges incompressibles (loyer, emprunts, abonnements, factures d'énergie). Intègre une barre de progression segmentée proportionnelle.

#### Code JSX / Tailwind
```tsx
import React from "react";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { Card } from "./ui/Card";

export function RealDisposableIncomeCard({
  income = 3200,
  rent = 900,
  loans = 300,
  subscriptions = 80,
  onClick,
}: {
  income?: number;
  rent?: number;
  loans?: number;
  subscriptions?: number;
  onClick?: () => void;
}) {
  const totalFixed = rent + loans + subscriptions;
  const disposable = Math.max(0, income - totalFixed);

  return (
    <Card
      onClick={onClick}
      className="min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] flex flex-col justify-between group cursor-pointer active:scale-[0.995]"
    >
      <div className="flex justify-between items-start shrink-0">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors font-sans truncate">
          Reste à vivre réel
        </span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border group-hover:border-white/20 text-muted-foreground group-hover:text-foreground shrink-0 ml-2">
          <Coins size={15} strokeWidth={1.5} />
        </div>
      </div>

      <div className="flex flex-col my-auto">
        <div className="text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight text-foreground tabular-nums font-sans">
          {disposable.toFixed(0)} €
        </div>
        <div className="text-[10px] sm:text-xs font-medium text-muted-foreground font-sans truncate mt-1">
          pour vivre · <span className="tabular-nums font-medium text-foreground">{totalFixed.toFixed(0)} €</span> de charges fixes
        </div>
      </div>

      {/* Barre segmentée proportionnelle */}
      <div className="mt-2 w-full shrink-0">
        <div className="w-full h-2 bg-neutral-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{ transformOrigin: "left" }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full flex items-center gap-1"
          >
            {rent > 0 && <div style={{ flex: `${rent} 1 0%` }} className="h-full rounded-full bg-foreground" />}
            {loans > 0 && <div style={{ flex: `${loans} 1 0%` }} className="h-full rounded-full bg-foreground/80" />}
            {subscriptions > 0 && <div style={{ flex: `${subscriptions} 1 0%` }} className="h-full rounded-full bg-foreground/50" />}
            {disposable > 0 && <div style={{ flex: `${disposable} 1 0%` }} className="h-full rounded-full bg-black/[0.08] dark:bg-white/10" />}
          </motion.div>
        </div>
      </div>
    </Card>
  );
}
```

---

### 3.5 Jauge Demi-Donut de Répartition (`SemiDonutGauge`)

#### Rôle & Contexte
Visualiseur SVG en arc 180° avec terminaisons arrondies (`strokeLinecap="round"`), gaps radiaux sans collision et animation sweep progressive au chargement. Il loge en son creux le compteur de montant interactif.

#### Code JSX / Tailwind
```tsx
import React, { useId, useMemo } from "react";
import { motion } from "framer-motion";
import { AlternatingDigitAmount } from "./AlternatingDigitAmount";

export function SemiDonutGauge({
  data = [
    { name: "Alimentation", value: 450, color: "#10B981" },
    { name: "Restos", value: 280, color: "#F97316" },
    { name: "Transports", value: 160, color: "#3B82F6" },
    { name: "Logement", value: 850, color: "#EAB308" },
  ],
  total = 1740,
  hoveredCategory,
  onHover,
}: {
  data: { name: string; value: number; color: string }[];
  total: number;
  hoveredCategory?: string | null;
  onHover?: (name: string | null) => void;
}) {
  const rawId = useId();
  const maskId = `gauge-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const cx = 100, cy = 88, r = 72, strokeWidth = 13;
  const capAngle = (strokeWidth / 2) / r;
  const arcLength = Math.ceil(Math.PI * r + strokeWidth * 2);

  return (
    <div className="w-full flex items-center justify-center shrink-0">
      <div className="relative w-[210px] h-[105px] sm:w-[280px] sm:h-[140px] flex items-center justify-center shrink-0">
        <svg viewBox="0 0 200 100" className="w-full h-full block select-none">
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width="200" height="100" fill="black" />
              <motion.path
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none"
                stroke="white"
                strokeWidth={strokeWidth + 14}
                strokeLinecap="round"
                strokeDasharray={`${arcLength} ${arcLength}`}
                initial={{ strokeDashoffset: arcLength }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </mask>
          </defs>

          {/* Background Track */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="text-black/[0.04] dark:text-white/[0.06]"
          />

          {/* Arcs de segments */}
          <g mask={`url(#${maskId})`}>
            {data.map((seg) => (
              <path
                key={seg.name}
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className="cursor-pointer transition-opacity duration-150"
                opacity={hoveredCategory ? (hoveredCategory === seg.name ? 1 : 0.35) : 1}
                onMouseEnter={() => onHover?.(seg.name)}
                onMouseLeave={() => onHover?.(null)}
              />
            ))}
          </g>
        </svg>

        {/* Montant central dans le creux de l'arc */}
        <div className="absolute inset-x-0 bottom-[8%] sm:bottom-[10%] flex flex-col items-center justify-center text-center pointer-events-none select-none">
          <div className="inline-flex items-baseline justify-center text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight text-foreground tabular-nums font-sans leading-none">
            <AlternatingDigitAmount value={total.toFixed(0)} />
            <span className="ml-1 text-lg sm:text-xl font-semibold">€</span>
          </div>
          <span className="text-[10px] sm:text-xs font-medium text-muted-foreground mt-1 font-sans">
            Total dépenses
          </span>
        </div>
      </div>
    </div>
  );
}
```

---

### 3.6 Compteur à Chiffres Alternés (`AlternatingDigitAmount`)

#### Rôle & Contexte
Affiche des montants animés au survol avec une transition verticale en quinconce (`y: 100% -> 0%` pour les pairs, `y: -100% -> 0%` pour les impairs), maintenant une largeur de colonne fixe pour éviter tout tressautement typographique (*layout shift*).

#### Code JSX / Tailwind
```tsx
import React, { useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function AlternatingDigitAmount({
  value,
  animate = true,
  className = "",
}: {
  value: string;
  animate?: boolean;
  className?: string;
}) {
  const chars = useMemo(() => value.split(""), [value]);
  const revChars = useMemo(() => [...chars].reverse(), [chars]);
  const maxSlotsRef = useRef(revChars.length);
  if (revChars.length > maxSlotsRef.current) maxSlotsRef.current = revChars.length;
  const totalSlots = Math.max(maxSlotsRef.current, revChars.length, 7);

  if (!animate) {
    return (
      <span className={`inline-flex items-baseline font-semibold tabular-nums font-sans ${className}`}>
        {value}
      </span>
    );
  }

  const slots = [];
  for (let i = totalSlots - 1; i >= 0; i--) {
    const char = revChars[i] || "";
    const isEven = i % 2 === 0;
    const width = !char ? "0ch" : char === " " ? "0.35ch" : char === "," ? "0.45ch" : "1ch";
    slots.push({ i, char, isEven, width, isActive: Boolean(char) });
  }

  return (
    <div className={`inline-flex items-baseline justify-center overflow-hidden font-semibold tabular-nums font-sans leading-none ${className}`}>
      {slots.map((s) => (
        <span
          key={`col-${s.i}`}
          style={{ width: s.width, opacity: s.isActive ? 1 : 0 }}
          className="relative inline-flex items-center justify-center overflow-hidden h-[1.15em] tabular-nums select-none shrink-0 transition-[width,opacity] duration-150 ease-out"
        >
          <span className="invisible leading-none">0</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {s.isActive && s.char && (
              <motion.span
                key={`${s.i}-${s.char}`}
                initial={{ y: s.isEven ? "100%" : "-100%", opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                exit={{ y: s.isEven ? "-100%" : "100%", opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 flex items-center justify-center tabular-nums leading-none select-none text-center"
              >
                {s.char}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      ))}
    </div>
  );
}
```

---

### 3.7 Visualiseur de Rythme Hebdomadaire (Spending Cadence)

#### Rôle & Contexte
Grille verticale à 4 colonnes illustrant l'intensité des sorties d'argent par semaine du mois. Les colonnes montent de bas en haut selon la courbe `easeOutExpo` sur 900ms.

#### Code JSX / Tailwind
```tsx
import React from "react";
import { motion } from "framer-motion";
import { Card } from "./ui/Card";
import { Activity } from "lucide-react";

export function SpendingCadenceCard({
  averageDaily = 42.50,
  weeks = [
    { id: "S1", label: "S1", amount: 320, pct: 45 },
    { id: "S2", label: "S2", amount: 580, pct: 85 },
    { id: "S3", label: "S3", amount: 410, pct: 60 },
    { id: "S4", label: "S4", amount: 210, pct: 30 },
  ],
}: {
  averageDaily?: number;
  weeks?: { id: string; label: string; amount: number; pct: number }[];
}) {
  return (
    <Card className="flex-1 min-h-[160px] flex flex-col justify-between">
      <div className="flex justify-between items-start mb-1 shrink-0">
        <h3 className="text-base font-semibold tracking-tight text-foreground font-sans">
          Rythme de dépense
        </h3>
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border text-muted-foreground shrink-0">
          <Activity size={15} strokeWidth={1.5} />
        </div>
      </div>

      <div className="flex items-baseline justify-between mb-2 shrink-0">
        <div className="flex items-baseline">
          <span className="text-base font-bold tabular-nums text-foreground font-sans">
            {averageDaily.toFixed(2)} €
          </span>
          <span className="text-xs text-muted-foreground ml-1.5 font-sans">
            / jour en moy.
          </span>
        </div>
      </div>

      {/* Visualiseur 4 colonnes */}
      <div className="flex-1 min-h-[80px] w-full grid grid-cols-4 gap-2 pt-1 pb-1 items-stretch">
        {weeks.map((w, idx) => (
          <div key={w.id} className="flex flex-col items-center justify-between h-full group select-none">
            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground group-hover:text-foreground transition-colors font-sans mb-1">
              {w.amount} €
            </span>
            <div className="w-full flex-1 min-h-[44px] bg-black/[0.04] dark:bg-white/[0.05] rounded-xl p-1 relative flex flex-col justify-end overflow-hidden border border-border group-hover:border-foreground/20 transition-all">
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                style={{ height: `${w.pct}%`, transformOrigin: "bottom" }}
                transition={{ duration: 0.9 - idx * 0.03, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                className="w-full rounded-lg bg-foreground transition-colors"
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium mt-1 font-sans">
              {w.label}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

---

### 3.8 Sélecteurs de Période & Contrôles Segmentés (Sliding Pills)

#### Rôle & Contexte
Sélecteur d'horizon temporel (3 mois, 6 mois, tout l'historique) calibré pour l'en-tête de page. L'indicateur blanc glisse sous l'intitulé actif via un ressort physique.

#### Code JSX / Tailwind
```tsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

export function HorizonSelector({
  value = "3m",
  onChange,
}: {
  value?: "3m" | "6m" | "all";
  onChange?: (val: "3m" | "6m" | "all") => void;
}) {
  const [selected, setSelected] = useState(value);
  const current = onChange ? value : selected;

  const options = [
    { id: "3m", label: "3 derniers mois" },
    { id: "6m", label: "6 derniers mois" },
    { id: "all", label: "Tout l'historique" },
  ] as const;

  return (
    <div className="h-9 p-0.5 rounded-full bg-card border border-border flex items-center gap-0.5 shadow-sm shrink-0 select-none">
      {options.map((opt) => {
        const isActive = current === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              setSelected(opt.id);
              onChange?.(opt.id);
            }}
            className="relative h-8 px-3.5 rounded-full text-xs font-medium cursor-pointer font-sans select-none flex items-center justify-center outline-none active:scale-[0.97]"
          >
            {isActive && (
              <motion.div
                layoutId="horizonSelectorPill"
                className="absolute inset-0 bg-white rounded-full shadow-sm"
                transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.8 }}
              />
            )}
            <span className={clsx(
              "relative z-10 transition-colors duration-200",
              isActive ? "text-black font-medium" : "text-muted-foreground hover:text-foreground"
            )}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

---

### 3.9 Lignes & Tableaux de Transactions

#### Rôle & Contexte
Lignes d'opérations bancaires formatées selon les règles comptables de Krona : date au format ISO ou FR, libellé tronqué avec badge récurrent violet optionnel, puce de catégorie teintée et montant aligné en `tabular-nums` avec signe coloré.

#### Code JSX / Tailwind
```tsx
import React from "react";
import { Repeat } from "lucide-react";
import clsx from "clsx";

export function TransactionRow({
  date = "2026-10-14",
  merchant = "Spotify",
  category = "Abonnements & Forfaits",
  amount = -10.99,
  isSubscription = true,
  onClick,
}: {
  date?: string;
  merchant?: string;
  category?: string;
  amount?: number;
  isSubscription?: boolean;
  onClick?: () => void;
}) {
  const isPositive = amount > 0;

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors group cursor-pointer font-sans select-none"
    >
      {/* Date & Marchand */}
      <div className="flex items-center gap-3 min-w-0 max-w-[60%]">
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {date}
        </span>
        <span className="font-semibold text-sm text-foreground truncate">
          {merchant}
        </span>
        {isSubscription && (
          <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[10px] shrink-0 flex items-center gap-1 font-medium">
            <Repeat size={10} />
            <span>Abo</span>
          </span>
        )}
      </div>

      {/* Catégorie & Montant */}
      <div className="flex items-center gap-4 shrink-0 text-right">
        <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-black/[0.03] dark:bg-white/[0.04] text-muted-foreground border border-border">
          {category}
        </span>
        <span className={clsx(
          "font-semibold text-sm tabular-nums",
          isPositive ? "text-emerald-500" : "text-foreground"
        )}>
          {isPositive ? `+${amount.toFixed(2)} €` : `${amount.toFixed(2)} €`}
        </span>
      </div>
    </div>
  );
}
```

---

## 4. Formulaires & Contrôles d'Entrée

### 4.1 Champs de Saisie (Inputs & Selects)

#### Code JSX / Tailwind
```tsx
import React from "react";
import { Search, ChevronDown } from "lucide-react";

/* 1. Champ Recherche */
export const SearchInput = ({ value, onChange, placeholder = "Rechercher..." }: any) => (
  <div className="relative w-full">
    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full h-9 pl-9 pr-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 transition-all font-sans"
    />
  </div>
);

/* 2. Champ Monétaire (Sans Spin Arrows) */
export const CurrencyInput = ({ value, onChange }: any) => (
  <div className="relative w-36 sm:w-40">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">€</span>
    <input
      type="number"
      value={value}
      onChange={onChange}
      placeholder="0,00"
      className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground"
    />
  </div>
);

/* 3. Sélecteur Déroulant */
export const SelectDropdown = ({ value, onChange, options = [] }: any) => (
  <div className="relative">
    <select
      value={value}
      onChange={onChange}
      className="h-9 appearance-none bg-black/[0.03] dark:bg-white/[0.04] border border-border text-foreground text-xs font-medium pl-3.5 pr-8 rounded-xl outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 cursor-pointer font-sans"
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value} className="bg-card text-foreground">{o.label}</option>
      ))}
    </select>
    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
  </div>
);
```

---

### 4.2 Interrupteur Minimaliste Apple iOS (`Switch`)

#### Rôle & Contexte
Composant toggle iOS répliquant l'effet tactile physique des réglages de l'iPhone.

#### Code JSX / Tailwind
```tsx
import React from "react";
import { motion } from "framer-motion";

export function AppleSwitch({
  checked = false,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out p-0.5 relative inline-flex items-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 ${
        checked ? "bg-emerald-500" : "bg-muted border border-border"
      }`}
    >
      <motion.span
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className="w-5 h-5 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35),0_0_1px_rgba(0,0,0,0.2)] block pointer-events-none"
      />
    </button>
  );
}
```

---

### 4.3 Bibliothèque des Variantes de Boutons

#### A. Bouton Primaire (`primary`)
```tsx
<button
  type="button"
  className="h-9 px-4 rounded-full bg-foreground text-background font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer font-sans shrink-0 focus-visible:ring-2 focus-visible:ring-foreground/20"
>
  Continuer
</button>
```

#### B. Bouton Secondaire (`secondary`)
```tsx
<button
  type="button"
  className="h-9 px-4 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/[0.1] border border-border text-xs sm:text-sm font-medium text-foreground flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer font-sans"
>
  Annuler
</button>
```

#### C. Bouton Puce / Filtre Fantôme (`ghost`)
```tsx
<button
  type="button"
  className="h-8 px-3.5 rounded-full text-xs font-medium text-neutral-400 hover:text-foreground bg-transparent hover:bg-black/5 dark:hover:bg-white/[0.04] transition-all shrink-0 active:scale-95 cursor-pointer font-sans"
>
  Filtrer
</button>
```

#### D. Bouton Destructif (`danger`)
```tsx
<button
  type="button"
  className="h-8 px-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-all select-none active:scale-[0.98] cursor-pointer shadow-sm font-sans shrink-0"
>
  Supprimer
</button>
```

#### E. Bouton de Verre Flottant (`glass`)
```tsx
<button
  type="button"
  className="w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-border flex items-center justify-center text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shadow-sm active:scale-95"
>
  Action
</button>
```

---
*Fin du catalogue des composants Krona.*

