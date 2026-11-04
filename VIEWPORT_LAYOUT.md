# Spécification de l'Architecture Viewport & Layout — Krona

> **Document de référence pour le Layout, l'App Shell et le Viewport.**  
> Ce document formalise l'architecture spatiale native de Krona : verrouillage 100dvh sans double ascenseur, marges périphériques régulières (*floating inset frame*), dock latéral gauche à 3 blocs verticaux calibrés, en-tête unifié et canevas de données à grille responsive de 12 colonnes.

---

## 1. Principes & Contraintes du Viewport (App Shell Mode)

Krona est conçue comme une **application logicielle native de bureau** encapsulée dans le navigateur (similaire à Slack, Linear, Raycast ou Apple Notes). Elle obéit à trois règles spatiales fondamentales :

```
┌────────────────────────────────────────────────────────────────────────┐
│ WINDOW VIEWPORT (100dvh, overflow: hidden)                             │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ PADDING PÉRIPHÉRIQUE FLOTTANT (p-3.5 sm:p-4 lg:p-5)                │ │
│ │ ┌─────────┐ ┌────────────────────────────────────────────────────┐ │ │
│ │ │ DOCK    │ │ CANEVAS PRINCIPAL (flex-1 h-full overflow-hidden)  │ │ │
│ │ │ LATÉRAL │ │ ┌────────────────────────────────────────────────┐ │ │ │
│ │ │         │ │ │ PAGE HEADER / TOPBAR (h-9, mb-3.5)             │ │ │ │
│ │ │ w-12    │ │ ├────────────────────────────────────────────────┤ │ │ │
│ │ │ (48px)  │ │ │ GRILLE DES KPIs (grid-cols-4, mb-4, shrink-0)  │ │ │ │
│ │ │ shrink-0│ │ ├────────────────────────────────────────────────┤ │ │ │
│ │ │ h-full  │ │ │ GRILLE 12 COLONNES OU CANEVAS DÉFILANT         │ │ │ │
│ │ │         │ │ │ (flex-1 min-h-0 items-stretch overflow-hidden) │ │ │ │
│ │ │         │ │ └────────────────────────────────────────────────┘ │ │ │
│ │ └─────────┘ └────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Verrouillage Plein Écran Absolu (100dvh / Anti-Double Scroll)

- **Interdiction formelle du scroll global** : Le document `<html>` et `<body>` est strictement verrouillé à 100 % de hauteur sans aucun défilement possible.
  ```css
  /* globals.css */
  html, body {
    height: 100%;
    overflow: hidden;
  }
  ```
- **Conteneur Racine (`main`)** :
  ```tsx
  <main className="h-screen w-screen overflow-hidden flex flex-row p-3.5 sm:p-4 lg:p-5 gap-3.5 sm:gap-4 lg:gap-5 box-border bg-background text-foreground min-h-screen transition-colors duration-300">
  ```
- **Zéro Double Ascenseur** : L'utilisateur ne voit jamais d'ascenseur sur le bord droit de la fenêtre globale du navigateur. Si du contenu dépasse, le scroll est strictement circonscrit au sous-conteneur dédié (`overflow-y-auto` avec classe `.no-scrollbar`).

### 1.2 Séparation Stricte : Fixe vs Scrollable

| Zone d'interface | Comportement de défilement | Hauteur / Largeur | Rôle |
| :--- | :--- | :--- | :--- |
| **Dock Latéral Gauche** | Fixe / Non défilant | `w-12 h-full shrink-0` | Navigation, état bancaire, date, outils |
| **Page Header / Topbar**| Fixe / Non défilant | `h-9 min-h-[36px] w-full shrink-0` | Titre H1, date textuelle, actions |
| **Grille des 4 KPIs** | Fixe (Dashboard) | `min-h-[120px] w-full shrink-0` | Cartes métriques d'en-tête |
| **Grille 12 Colonnes** | Viewport-Fit (Auto) | `flex-1 min-h-0` | Graphiques et bannières dimensionnés à l'écran |
| **Listes / Tableaux** | Scrollable interne | `flex-1 min-h-0 overflow-y-auto` | Défilement confiné aux lignes d'opérations |

### 1.3 Marges d'Ambiance Extérieures (Floating Inset Frame)

Au lieu de coller l'interface aux bords de la fenêtre comme un site web classique, Krona applique un **cadre d'ambiance périphérique flottant** :
- **Padding externe** : `p-3.5` (14px sur mobile/tablette), `sm:p-4` (16px), `lg:p-5` (20px sur grand écran).
- **Gouttière entre le Dock et le Canevas** : `gap-3.5 sm:gap-4 lg:gap-5` rigoureusement égal au padding périphérique.
- **Résultat visuel** : La barre latérale et le canevas de données apparaissent comme des modules suspendus au-dessus du fond d'application (`#09090b` / `#f5f5f7`), créant un sentiment d'élégance et de respiration spatiale.

---

## 2. Le Dock Latéral Gauche (Sidebar)

### 2.1 Dimensions & Positionnement

- **Largeur fixe au pixel près** : `w-12` (soit 48px exacts).
- **Règle de non-écrasement** : `shrink-0` obligatoire pour éviter que le canevas central ne comprime la barre lors du redimensionnement de la fenêtre.
- **Flexbox vertical pleine hauteur** : `flex flex-col justify-between items-center h-full select-none z-30`.

```
┌─────────────────────────────────┐
│ [Logo Krona SVG] (w-6 h-6)      │ <── Alignement horizontal avec le titre H1 (h-9)
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │  [Vue d'ensemble] (Active)  │ │ <── Bloc 1 : Capsule Nav Principale (w-12)
│ │  [Tendances]                │ │     mt-2.5 (Aligné avec le haut des cartes KPIs)
│ │  [Comptes]                  │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │  [Bulle Banque Active]      │ │ <── Bloc 2A : Pastille Banque (w-12 h-12)
│ └─────────────────────────────┘ │
│                                 │
│ [Date JJ / MM / AA empilée]     │ <── Bloc 2B : Date verticale tabular-nums
│ [Séparateur w-5 h-px]           │
│                                 │
│ ┌─────────────────────────────┐ │
│ │  [Thème Clair / Sombre]     │ │ <── Bloc 3A : Pastille Thème (w-12 h-12)
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │  [Cloche Notifications]     │ │ <── Bloc 3B : Capsule Outils (w-12)
│ │  [Roue Paramètres]          │ │
│ │  [Avatar Profil Google]     │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

### 2.2 Anatomie Verticale en 3 Blocs

#### A. Bloc Supérieur (Logo + Capsule Navigation)
1. **Logo SVG Krona** :
   - Conteneur de centrage : `w-12 h-9 flex items-center justify-center shrink-0`.
   - Sa hauteur de 36px (`h-9`) correspond **exactement** à la hauteur du `PageHeader` (`h-9`), garantissant un alignement horizontal géométrique parfait entre le logo et le titre de la page.
2. **Capsule de Navigation Principale** :
   - Décalage supérieur : `mt-2.5` (10px). Ce décalage permet à la capsule de débuter précisément à la même coordonnée Y que les cartes statistiques du Dashboard.
   - Conteneur : `w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full p-1 gap-1.5 relative shrink-0`.
   - Boutons d'onglets : `w-10 h-10 rounded-full flex items-center justify-center outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20`.
   - Pilule blanche active glissante :
     ```tsx
     <motion.div
       layoutId="sidebar-pill"
       layout="position"
       className="absolute inset-0 w-10 h-10 bg-white shadow-sm rounded-full"
       style={{ borderRadius: 9999 }}
       transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.8 }}
     />
     ```
   - Retour tactile : `whileTap={{ scale: 0.94 }}`.

#### B. Bloc Central (Pastille Banque + Date Empilée)
1. **Pastille de la Banque Active** :
   - Gabarit : `w-12 h-12 shrink-0 relative`.
   - Bouton rond : `w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-border flex items-center justify-center text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shadow-sm`.
   - Affiche le logo vectoriel de l'établissement sélectionné (BoursoBank, CA, CE, LCL).
2. **Date du Jour Verticale Empilée** :
   - Format 100 % numérique sur 3 lignes : Jour (`JJ`) / Mois (`MM`) / Année (`AA`).
   - Typographie : `text-[13px] font-semibold text-foreground tabular-nums leading-none` pour le jour et le mois, `text-muted-foreground` pour l'année.
   - Conteneur : `flex flex-col items-center justify-center select-none pointer-events-none text-center font-sans tracking-tight shrink-0 gap-1`.
3. **Séparateur Fin** :
   - Trait de liaison centré : `w-5 h-[1px] bg-black/10 dark:bg-white/10 shrink-0 my-0.5`.

#### C. Bloc Inférieur (Thème + Outils Système)
1. **Bouton de Thème Autonome** :
   - Gabarit identique à la pastille bancaire : `w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-border flex items-center justify-center cursor-pointer shadow-sm active:scale-95`.
   - Icône `Sun` ou `Moon` de taille 18px.
2. **Capsule Dock Inférieure des Outils** :
   - Conteneur : `w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full p-1 gap-1.5 relative shrink-0`.
   - **Notifications** : Bouton `w-10 h-10 rounded-full` avec icône `Bell` et pastille d'alerte rouge `w-2 h-2 bg-red-500 rounded-full border border-background absolute top-2 right-2`.
   - **Paramètres** : Bouton `w-10 h-10 rounded-full` avec icône `Settings`.
   - **Profil / Compte** : Bouton `w-10 h-10 rounded-full` logeant le composant `UserAvatar` (photo Google ou initiales) et une puce de statut de synchronisation en bas à droite (`w-2 h-2 rounded-full absolute -bottom-0.5 -right-0.5` : vert = à jour, ambre = synchronisation en cours, rouge = erreur).

---

### 2.3 Recette Tailwind des Capsules Flottantes du Dock

```css
/* Signature Tailwind exacte pour les capsules et pastilles du Dock Krona */
bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full
```
- `bg-[#EBEBED]` : Gris soyeux satiné en mode clair.
- `dark:bg-card/60` : Verre sombre translucide à 60 % d'opacité en mode sombre.
- `backdrop-blur-2xl` : Flou d'arrière-plan de 40px estompant les contrastes sous-jacents.
- `backdrop-saturate-150` : Légère sursaturation chromatique reproduisant le rendu visuel de macOS Sequoia.
- `border border-border` : Liseré satiné fin (`rgba(255, 255, 255, 0.08)` en sombre).
- `rounded-full` : Rayon de courbure absolu formant une gélule parfaite.

---

## 3. La Top Bar / Page Header

### 3.1 Hauteur & Intégration dans le Canevas

- **Hauteur standardisée** : `min-h-[36px] h-9 shrink-0 mb-3.5 w-full`.
- **Règle d'intégration** : Elle est positionnée en tête du canevas principal (`flex flex-col flex-1 w-full min-h-0`). Elle ne défile pas et reste toujours visible.

### 3.2 Disposition Flexbox

```tsx
<div className="flex items-center justify-between min-h-[36px] h-9 shrink-0 mb-3.5 w-full select-none">
  {/* CÔTÉ GAUCHE : Titre H1 & Date textuelle */}
  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
    <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground truncate font-sans leading-none">
      Vue d'ensemble
    </h1>
    <span className="text-xs sm:text-sm font-medium text-muted-foreground select-none truncate leading-none font-sans">
      Mardi 3 novembre
    </span>
  </div>

  {/* CÔTÉ DROIT : Actions contextuelles */}
  <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
    {/* 1. Bouton Purge / Reset optionnel */}
    <button className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border text-foreground shadow-sm hover:text-red-500 transition-all cursor-pointer">
      <Trash2 size={16} />
    </button>

    {/* 2. Sélecteur de mois déroulant stylisé en gélule */}
    <div className="relative">
      <select className="h-9 appearance-none bg-card border border-border text-foreground shadow-sm font-medium text-sm py-1.5 pl-4 pr-10 rounded-full outline-none hover:border-foreground/20 cursor-pointer font-sans">
        <option>Octobre 2026</option>
        <option>Septembre 2026</option>
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </div>

    {/* 3. Bouton primaire d'action gélule */}
    <button className="h-9 px-3.5 sm:px-4 rounded-full bg-foreground text-background font-medium text-xs sm:text-sm flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer font-sans shrink-0">
      <Plus size={16} strokeWidth={2.5} />
      <span>Importer un CSV</span>
    </button>
  </div>
</div>
```

---

## 4. Le Canevas Central & Grilles de Contenu

### 4.1 Conteneur Maître du Canevas

Le canevas central prend toute la largeur restante et s'étend jusqu'au bas du viewport :
```tsx
<div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
  <div className="flex flex-col flex-1 w-full min-h-0 viewport-fit-scroll no-scrollbar">
    {/* PageHeader + Contenu de la vue */}
  </div>
</div>
```

### 4.2 Grille des Cartes KPIs (Top Stats Row)

Positionnée immédiatement sous le `PageHeader`, cette rangée affiche les 4 indicateurs fondamentaux :
- **Classes de grille** : `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 shrink-0`.
- **Hauteur uniforme des cartes** : `min-h-[120px] sm:min-h-[126px] xl:min-h-[132px]`.
- **Comportement responsive** :
  - Mobile (`< 640px`) : 1 colonne verticale (défilement naturel).
  - Tablette (`640px - 1024px`) : 2 colonnes x 2 lignes.
  - Écran Desktop (`>= 1024px`) : 4 colonnes horizontales côte à côte.

---

### 4.3 Grille Principale de Contenu (Dashboard 12 Colonnes)

Sous les cartes statistiques, l'espace restant (`flex-1 min-h-0`) est structuré selon une **grille à 12 colonnes** divisée en 3 blocs de 4 colonnes parfaitement équilibrés :

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 items-stretch">
  {/* COLONNE 1 (col-span-4) : Trajectoire du budget (Courbe de Burndown) */}
  <div className="col-span-1 lg:col-span-4 h-full flex flex-col min-h-0 overflow-hidden">
    <Card className="h-full flex flex-col overflow-hidden">
      {/* Titre, Solde restant final et Graphique SVG lissé interactif */}
    </Card>
  </div>

  {/* COLONNE 2 (col-span-4) : Répartition Demi-Donut + 2 Bannières Compactes */}
  <div className="col-span-1 lg:col-span-4 h-full flex flex-col justify-between gap-4 min-h-0">
    {/* Carte Haute : Demi-donut SVG 180° + Liste de catégories scrollable */}
    <Card className="flex flex-col flex-1 min-h-0 overflow-hidden justify-between">
      {/* SemiDonutGauge + Liste verticale des postes */}
    </Card>

    {/* Carte Basse 1 : Plafond mensuel de dépense */}
    <MonthlyLimitCard className="min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] shrink-0" />

    {/* Carte Basse 2 : Reste à vivre réel et charges incompressibles */}
    <RealDisposableIncomeCard className="min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] shrink-0" />
  </div>

  {/* COLONNE 3 (col-span-4) : Top Commerçants + Rythme Hebdomadaire */}
  <div className="col-span-1 lg:col-span-4 h-full flex flex-col justify-between gap-4 min-h-0">
    {/* Carte Haute : Top 4 des commerçants avec pastille iconographique et occurrences */}
    <Card className="flex flex-col relative overflow-hidden shrink-0">
      {/* TopMerchantsList */}
    </Card>

    {/* Carte Basse : Rythme de dépense hebdomadaire (4 barres verticales) */}
    <Card className="flex-1 min-h-0 flex flex-col relative overflow-hidden justify-between">
      {/* SpendingCadenceBars */}
    </Card>
  </div>
</div>
```

---

## 5. Gabarit de Code Canonique (`AppShell.tsx`)

Voici le composant coquille complet, autonome et prêt pour un usage en production dans n'importe quel projet Next.js / Tailwind CSS / Framer Motion :

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  TrendingUp,
  Landmark,
  Sun,
  Moon,
  Settings,
  Bell,
  User,
  Plus,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";

// Types d'onglets de navigation
export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  headerActions?: React.ReactNode;
  navItems?: NavItem[];
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Vue d'ensemble", icon: LayoutGrid },
  { id: "trends", label: "Tendances", icon: TrendingUp },
  { id: "accounts", label: "Comptes", icon: Landmark },
];

export function AppShell({
  children,
  title = "Vue d'ensemble",
  activeTab = "dashboard",
  onTabChange,
  headerActions,
  navItems = DEFAULT_NAV_ITEMS,
}: AppShellProps) {
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [currentDate, setCurrentDate] = useState("");

  const active = onTabChange ? activeTab : currentTab;

  // Calcul de la date du jour (JJ / MM / AA pour le dock, format textuel pour le header)
  const now = new Date();
  const dayStr = String(now.getDate()).padStart(2, "0");
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const yearStr = String(now.getFullYear()).slice(-2);

  useEffect(() => {
    const formatted = now.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    setCurrentDate(formatted.charAt(0).toUpperCase() + formatted.slice(1));
  }, []);

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-row p-3.5 sm:p-4 lg:p-5 gap-3.5 sm:gap-4 lg:gap-5 box-border bg-background text-foreground min-h-screen transition-colors duration-300 font-sans select-none">
      {/* 1. DOCK LATÉRAL GAUCHE (w-12 / 48px fixe) */}
      <aside
        aria-label="Navigation latérale"
        className="w-12 shrink-0 flex flex-col justify-between items-center h-full select-none z-30"
      >
        {/* Haut : Logo + Onglets + Sélecteur de Banque */}
        <div className="flex flex-col items-center w-full shrink-0">
          {/* Logo Krona (aligné au centre du PageHeader h-9) */}
          <div className="w-12 h-9 flex items-center justify-center shrink-0">
            <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center text-background font-bold text-xs">
              K
            </div>
          </div>

          <div className="mt-2.5 flex flex-col items-center gap-2 w-full shrink-0">
            {/* Capsule de navigation principale */}
            <nav
              aria-label="Navigation principale"
              className="w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full p-1 gap-1.5 relative shrink-0"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => {
                      setCurrentTab(item.id);
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
                        layoutId="canonical-sidebar-pill"
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

            {/* Pastille Banque Active */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              className="w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-border flex items-center justify-center text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-foreground/20"
              aria-label="Banque active"
            >
              <Landmark size={18} />
            </motion.button>
          </div>
        </div>

        {/* Bas : Date Verticale + Thème + Capsule Outils */}
        <div className="flex flex-col items-center gap-2 w-full shrink-0">
          {/* Date du jour numérique empilée */}
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

          <div className="w-5 h-[1px] bg-black/10 dark:bg-white/10 shrink-0 my-0.5" />

          {/* Bascule de thème clair/sombre */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-12 h-12 rounded-full bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 border border-border flex items-center justify-center text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-foreground/20"
            aria-label="Basculer le thème"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </motion.button>

          {/* Capsule des outils système */}
          <div
            role="toolbar"
            className="w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full p-1 gap-1.5 relative shrink-0"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-white hover:bg-black/[0.08] dark:hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-white hover:bg-black/[0.08] dark:hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Paramètres"
            >
              <Settings size={18} />
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-white hover:bg-black/[0.08] dark:hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Profil"
            >
              <User size={18} />
            </motion.button>
          </div>
        </div>
      </aside>

      {/* 2. CANEVAS PRINCIPAL (flex-1 pleine hauteur) */}
      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        {/* En-tête de page unifié (h-9) */}
        <header className="flex items-center justify-between min-h-[36px] h-9 shrink-0 mb-3.5 w-full select-none">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground truncate font-sans leading-none">
              {title}
            </h1>
            {currentDate && (
              <span className="text-xs sm:text-sm font-medium text-muted-foreground select-none truncate leading-none font-sans">
                {currentDate}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {headerActions || (
              <>
                <div className="relative">
                  <select className="h-9 appearance-none bg-card border border-border text-foreground shadow-sm font-medium text-sm py-1.5 pl-4 pr-10 rounded-full outline-none hover:border-foreground/20 cursor-pointer font-sans">
                    <option>Période courante</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>

                <button
                  type="button"
                  className="h-9 px-3.5 sm:px-4 rounded-full bg-foreground text-background font-medium text-xs sm:text-sm flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer font-sans shrink-0"
                >
                  <Plus size={16} strokeWidth={2.5} />
                  <span>Action principale</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Zone de contenu défilant ou grille viewport-fit */}
        <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </main>
  );
}
```

---
*Fin de la spécification officielle du Layout & Viewport Krona.*

