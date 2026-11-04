# Spécification Complète du Design System — Krona

> **Document de référence pour le Design System de Krona.**  
> Ce document formalise l'intégralité des fondations visuelles, tokens chromatiques, règles d'élévation, composants atomiques, micro-interactions et contraintes d'implémentation extraits par audit direct du code source du projet. Il est conçu pour servir de contexte pérenne (prompt / skill / guidelines) pour tout agent d'ingénierie logicielle ou designer travaillant sur l'application.

---

## 1. Philosophie & Principes Visuels

### 1.1 Direction Artistique Globale
L'application **Krona** adopte une esthétique **sombre, épurée, tactile et ultra-lisible**, directement inspirée des standards d'Apple (macOS / iOS Human Interface Guidelines) et des interfaces techniques haut de gamme (Linear, Raycast).

- **Compréhension instantanée (< 3 secondes)** : L'utilisateur doit appréhender sa trajectoire financière, son solde restant réel et ses plafonds en un coup d'œil, sans surcharge cognitive (*glanceable UI*).
- **Zéro Jargon Obscur** : Le vocabulaire bancaire complexe est proscrit. Les libellés sont immédiats, clairs et précis (*« Dépenses »*, *« Reste à vivre réel »*, *« Plafond mensuel »*, *« Épargne nette »*).
- **ZÉRO EMOJI (Interdiction formelle et absolue)** :
  - Aucun emoji système (💡, ⚡️, ✨, 🚀, 💰, 💳, etc.) n'est toléré dans l'interface, les boutons, les titres, les alertes, les notifications ou les conseils du moteur IA.
  - Tous les indicateurs iconographiques reposent **exclusivement** sur des icônes vectorielles sobres et géométriques issues de la bibliothèque **Lucide React** (`strokeWidth={1.5}` ou `strokeWidth={1.75}`, dimension standard `14px` à `18px`).
- **Tactile & Réactif** : Chaque élément interactif propose un retour haptique visuel délicat (`active:scale-[0.98]` à `active:scale-95`). Aucun saut d'état brutal.

---

### 1.2 Hiérarchie d'Élévation & Règles Strictes d'Opacité

L'application applique une séparation stricte entre les surfaces de travail et les conteneurs d'élévation flottants :

```
Élévation 0 : Fond d'application (Canvas 100 % Opaque)
  └── Élévation 1 : Cartes de contenu & Panneaux principaux (Surfaces 100 % Opaques)
        └── Élévation 2 : Dock / Navigation latérale (Capsule Glassmorphism Flottante)
              └── Élévation 3 : Popovers, Menus volants & Tooltips (Glassmorphism + Ombre portée)
                    └── Élévation 4 : Tiroirs (Drawers) & Modales (Glassmorphism + Scrim flouté)
```

#### A. Fond 100 % Opaque pour les pages, vues et cartes principales
- **Page / Application Canvas** : Fond uni 100 % opaque sans aucun flou (`#09090b` en mode sombre, `#f5f5f7` en mode clair).
- **Cartes & Conteneurs (`Card.tsx`)** : Surfaces 100 % opaques (`#0F0F11` en mode sombre, `#ffffff` en mode clair).
- **Règle** : Les cartes du dashboard, les grilles de données et les en-têtes de page ne reçoivent **JAMAIS** d'effet de verre (*glassmorphism*) afin de préserver une lisibilité maximale, un contraste accessible et de faibles dépenses de calcul GPU.

#### B. Traitement *Glassmorphism* Réservé Exclusivement aux Conteneurs Flottants
Le matériau translucide satiné avec flou d'arrière-plan (`backdrop-blur-2xl` / `backdrop-blur-md`) est **strictement réservé** aux éléments d'interaction surélevés :
1. **Dock & Navigation latérale** (`Sidebar.tsx`) : Capsules suspendues semi-transparentes (`bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150`).
2. **Popovers & Fenêtres volantes** (`AccountPopover.tsx`, `BankSelectorPopover.tsx`, menu de recatégorisation) : Matériau sombre ultra-filtrant (`bg-card/95 backdrop-blur-2xl`).
3. **Modales & Tiroirs latéraux (Drawers)** : Surfaces `bg-card/95 backdrop-blur-2xl` entourées de bordures satinées et projetées sur un rideau d'arrière-plan (`bg-black/50 dark:bg-black/70 backdrop-blur-md`).
4. **Tooltips dynamiques de données** (`ExpensesCurveChart.tsx`) : Infobulles au survol avec verre teinté.

---

## 2. Fondations & Tokens

### 2.1 Typographie

La typographie de Krona est régie par une règle absolue : **une seule et unique famille de police**.

```css
/* Configuration Tailwind v4 inline theme */
@theme inline {
  --font-sans: var(--font-space-grotesk);
}
```

- **Famille unique** : **Space Grotesk** (`next/font/google`, variable CSS `--font-space-grotesk`).
- **Interdiction formelle du Monospace (`font-mono`)** : Il est strictement interdit d'importer ou d'appliquer `font-mono`.
- **Règle absolue des montants financiers (`tabular-nums`)** : Tous les nombres, montants monétaires, pourcentages, ratios, indices d'évolution et dates doivent **systématiquement** inclure la classe CSS `tabular-nums`. Cela garantit un alignement vertical mathématique parfait dans les tableaux, listes et KPIs.

#### Échelle typographique et styles de texte

| Rôle | Classes Tailwind | Taille / Graisse / Hauteur | Usage type |
| :--- | :--- | :--- | :--- |
| **Hero Patrimoine** | `text-3xl sm:text-4xl font-bold tracking-tight tabular-nums font-sans` | 30–36px / Bold / Serré | Solde total consolidé (Comptes) |
| **KPI Chiffre Clé** | `text-xl sm:text-2xl xl:text-3xl font-semibold tracking-tight tabular-nums font-sans` | 20–30px / Semi-bold / Serré | Revenus, Dépenses, Plafond, Reste à vivre |
| **Titre de Vue (H1)** | `text-lg sm:text-xl font-semibold tracking-tight font-sans leading-none` | 18–20px / Semi-bold / Leading 1 | `PageHeader` (Vue d'ensemble, Tendances) |
| **Titre de Carte (H2/H3)** | `text-base font-semibold tracking-tight font-sans` | 16px / Semi-bold | En-têtes de cartes, tiroirs, modales |
| **Corps / Intitulé** | `text-sm font-semibold` ou `font-medium font-sans` | 14px / Medium ou Semi-bold | Noms de commerçants, intitulés de lignes |
| **Label Secondaire** | `text-xs text-muted-foreground font-sans` | 12px / Regular ou Medium | Sous-titres, dates d'opérations, indications |
| **Micro-Label / Badge** | `text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider` | 10–11px / Semi-bold / Majuscule | Catégories dans popovers, statuts, ticks d'axe |

---

### 2.2 Palette Chromatique Exacte

#### A. Variables CSS du Système (`globals.css`)

```css
:root {
  /* Light Mode (Inspiration Apple Notion / Clean White) */
  --background: #f5f5f7; 
  --foreground: #18181b; 
  --muted: #f4f4f5; 
  --muted-foreground: #71717a; 
  --border: rgba(0, 0, 0, 0.06);
  --card: #ffffff;
  --card-foreground: #18181b;
}

.dark {
  /* Dark Mode (Krona Dark Pro — Valeur par défaut) */
  --background: #09090b;
  --foreground: #ffffff;
  --muted: #18181b;
  --muted-foreground: #a1a1aa;
  --border: rgba(255, 255, 255, 0.08);
  --card: #0F0F11;
  --card-foreground: #ffffff;
}
```

#### B. Tableau des Tokens de Surface, Texte et Bordure

| Token | Hexadécimal (Dark) | Hexadécimal (Light) | Classe Tailwind | Utilisation |
| :--- | :--- | :--- | :--- | :--- |
| **Background Principal** | `#09090b` | `#f5f5f7` | `bg-background` | Fond général de l'écran |
| **Surface Carte Opaque** | `#0F0F11` | `#ffffff` | `bg-card` | Conteneur `Card.tsx`, modales |
| **Surface Surélevée Subtile** | `rgba(255,255,255,0.03)` | `rgba(0,0,0,0.03)` | `bg-neutral-50 dark:bg-white/[0.03]` | Items de liste, inputs, boutons d'icônes |
| **Surface Surélevée Hover** | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.05)` | `hover:bg-black/[0.04] dark:hover:bg-white/[0.06]` | États au survol des items cliquables |
| **Texte Principal** | `#ffffff` | `#18181b` | `text-foreground` | Titres, montants, labels forts |
| **Texte Atténué (Muted)** | `#a1a1aa` (zinc-400) | `#71717a` (zinc-500) | `text-muted-foreground` | Sous-textes, métadonnées, unités |
| **Texte Inversé** | `#18181b` | `#ffffff` | `text-background` | Texte à l'intérieur des boutons primaires |
| **Bordure Standard** | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.06)` | `border-border` | Contour des cartes, séparateurs, listes |
| **Bordure Hover Active** | `rgba(255,255,255,0.20)` | `rgba(0,0,0,0.20)` | `hover:border-foreground/20` | Élément ciblé ou survolé |
| **Bordure Satinée Interne** | `rgba(255,255,255,0.08)` | — | `inset_0_1px_0_0_rgba(255,255,255,0.08)` | Reflet supérieur dans les popovers |

#### C. Accents Sémantiques & Couleurs de Catégories Financières

Le système chromatique associe chaque pôle budgétaire à un token fixe avec déclinaisons pour les anneaux, fonds adoucis et puces :

| Pôle / Catégorie | Code Hex | Classe Fill | Classe Fond Adouci | Rôle fonctionnel |
| :--- | :--- | :--- | :--- | :--- |
| **Alimentation & Courses** | `#10B981` | `bg-emerald-500` | `bg-emerald-500/10 text-emerald-500` | Supermarché, alimentation quotidienne |
| **Revenus & Aides** | `#10B981` | `bg-emerald-500` | `bg-emerald-500/10 text-emerald-500` | Salaires, virements entrants, aides |
| **Taux d'épargne positif** | `#10B981` | `bg-emerald-500` | `text-emerald-500` | Indicateurs de solde positif |
| **Restos & Fast-Food** | `#F97316` | `bg-orange-500` | `bg-orange-500/10 text-orange-500` | Restaurants, bars, livraisons |
| **Transports** | `#3B82F6` | `bg-blue-500` | `bg-blue-500/10 text-blue-500` | Train, métro, carburant, taxis |
| **Épargne & Trésorerie** | `#3B82F6` | `bg-blue-500` | `bg-blue-500/10 text-blue-500` | Placements, versements livrets |
| **Abonnements & Forfaits**| `#8B5CF6` | `bg-purple-500` | `bg-purple-500/10 text-purple-500` | Services récurrents, box, mobile |
| **Virements proches** | `#8B5CF6` | `bg-purple-500` | `bg-purple-500/10 text-purple-500` | Lydia, remboursements entre amis |
| **Shopping & Mode** | `#EC4899` | `bg-pink-500` | `bg-pink-500/10 text-pink-500` | Habillement, équipement personnel |
| **Santé & Soins** | `#EF4444` | `bg-rose-500` | `bg-rose-500/10 text-rose-500` | Pharmacie, médecins, optique |
| **Déficit / Dépassement**| `#EF4444` / `#F43F5E` | `bg-rose-500` | `bg-rose-500/10 text-rose-500` | Alertes de plafond, solde négatif |
| **Sorties & Soirées** | `#06B6D4` | `bg-cyan-500` | `bg-cyan-500/10 text-cyan-500` | Événements, concerts, cinéma |
| **Logement & Maison** | `#EAB308` | `bg-yellow-500` | `bg-yellow-500/10 text-yellow-500` | Loyer, électricité, charges, déco |
| **Virement interne** | `#64748B` | `bg-slate-500` | `bg-slate-500/10 text-slate-500` | Opérations neutres (auto-virements) |
| **Autre** | `#71717A` | `bg-zinc-500` | `bg-zinc-500/10 text-zinc-500` | Dépenses non catégorisées |
| **Avertissement / Seuil 85%**| `#F59E0B` | `bg-amber-400` | `bg-amber-500/10 text-amber-500` | Risque de dépassement budgétaire |

---

### 2.3 Rayons de Courbure (Border Radius)

L'échelle géométrique est strictement hiérarchisée selon l'envergure du composant :

```
rounded-full (9999px) ──> Boutons pilules, sélecteurs segmentés, badges, toggles iOS
rounded-3xl  (24px)   ──> Grandes modales (Paramètres), tiroirs (Drawers)
rounded-2xl  (16px)   ──> Cartes standard (Card.tsx), popovers flottants, modale CSV
rounded-xl   (12px)   ──> Inputs, items de liste cliquables, pastilles d'icônes
rounded-lg   (8px)    ──> Puces d'indicateurs internes ultra-compactes
```

| Classe Tailwind | Valeur Pixels | Famille de Composants |
| :--- | :--- | :--- |
| `rounded-full` | `9999px` | Boutons primaires/secondaires, capsules dock, filtres, badges de statut, switch iOS, jauges |
| `rounded-3xl` | `24px` à `32px` | Modale centrale de réglages (`max-w-4xl`), tiroir latéral `sm:rounded-3xl` |
| `rounded-2xl` | `16px` | Cartes KPIs, graphiques, conteneur `Card.tsx`, popovers latéraux, modale d'analyse |
| `rounded-xl` | `12px` | Champs de formulaires (`input`, `select`), lignes de commerçants cliquables, conteneurs d'icônes (`w-8.5 h-8.5`) |
| `rounded-lg` | `8px` | Badges intérieurs compacts, sous-blocs |

---

## 3. Composants Atomiques & Patterns d'UI

### 3.1 Boutons

Les boutons sont exclusivement au format **gélule (pill)** ou **cercle parfait (icon button)**. Les boutons rectangulaires à angles droits sont interdits.

#### A. Bouton Primaire (Primary Action Pill)
Gélule blanche opaque au fort contraste, texte inversé :
```tsx
<button
  type="button"
  className="h-9 px-4 rounded-full bg-foreground text-background font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-sm cursor-pointer font-sans shrink-0 focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:outline-none"
>
  <Plus size={15} />
  <span>Ajouter une opération</span>
</button>
```

#### B. Bouton Secondaire (Subtle Pill)
Gélule sombre discrète à bordure satinée :
```tsx
<button
  type="button"
  className="h-9 px-4 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/[0.1] border border-border text-xs sm:text-sm font-medium text-foreground flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer font-sans"
>
  <span>Annuler</span>
</button>
```

#### C. Bouton Puce de Filtre (Filter Chip / Tab Pill)
Pour les barres d'onglets rapides (ex. "Tout", "Dépenses", "Revenus", "Abonnements") :
```tsx
{/* État Inactif */}
<button className="h-8 px-3.5 rounded-full text-xs font-medium text-neutral-400 hover:text-foreground bg-transparent hover:bg-black/5 dark:hover:bg-white/[0.04] transition-all shrink-0 active:scale-95 cursor-pointer font-sans">
  Dépenses
</button>

{/* État Actif */}
<button className="h-8 px-3.5 rounded-full text-xs font-medium bg-white text-zinc-950 font-medium shadow-sm transition-all shrink-0 active:scale-95 cursor-pointer font-sans">
  Tout
</button>
```

#### D. Bouton Circulaire de Fermeture (`CloseButton.tsx`)
Bouton circulaire compact présent sur toutes les modales et popovers :
```tsx
<button
  type="button"
  aria-label="Fermer"
  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 cursor-pointer bg-transparent text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
>
  <X size={16} />
</button>
```

#### E. Bouton Destructif (Danger Pill)
Action critique de déconnexion ou suppression :
```tsx
<button
  type="button"
  className="h-8 px-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-all select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-rose-400/40 focus-visible:outline-none cursor-pointer shadow-sm font-sans shrink-0"
>
  <LogOut size={13} />
  <span>Se déconnecter</span>
</button>
```

---

### 3.2 Cartes & Conteneurs (`Card.tsx`)

#### A. Conteneur Maître (`Card.tsx`)
Structure réutilisable de base avec gestion uniforme des paddings et coins :
```tsx
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

#### B. Structure Canonique d'une Carte KPI (Métriques)
Toute carte statistique respecte strictement la triade : En-tête / Chiffre Clé / Pied de carte.

```tsx
<Card className="min-h-[120px] sm:min-h-[126px] xl:min-h-[132px] flex flex-col justify-between">
  {/* 1. En-tête : Titre & Bouton d'icône d'action en haut à droite */}
  <div className="flex justify-between items-start mb-1 sm:mb-2">
    <span className="text-xs sm:text-sm font-medium text-muted-foreground font-sans truncate">
      Revenus & Entrées
    </span>
    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.05] border border-border text-muted-foreground shrink-0 ml-2">
      <ArrowDownLeft size={15} strokeWidth={1.5} />
    </div>
  </div>

  {/* 2. Centre : Chiffre clé au format Space Grotesk tabular-nums */}
  <div className="flex flex-col">
    <div className="text-xl sm:text-2xl xl:text-3xl font-semibold mb-0.5 sm:mb-1 tracking-tight text-foreground tabular-nums font-sans">
      3 250,00 €
    </div>

    {/* 3. Pied de carte : Micro-label contextuel ou mini-jauge */}
    <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium w-full text-muted-foreground font-sans">
      <span className="truncate">Total crédité net</span>
    </div>
  </div>
</Card>
```

---

### 3.3 Formulaires & Champs de Saisie

#### A. Champ de Recherche Instantanée
```tsx
<div className="relative w-full">
  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
  <input
    type="text"
    placeholder="Rechercher par libellé ou catégorie..."
    className="w-full h-9 pl-9 pr-8 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 transition-all font-sans"
  />
</div>
```

#### B. Champ Numérique Monétaire (Sans Flèches Spin)
```tsx
<div className="relative w-36 sm:w-40">
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-sans">€</span>
  <input
    type="number"
    placeholder="0,00"
    className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-background border border-border focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 text-right text-sm font-medium text-foreground tabular-nums font-sans transition-all focus:outline-none placeholder:text-muted-foreground"
  />
</div>
```

#### C. Menu Déroulant (Select)
```tsx
<div className="relative">
  <select className="h-9 appearance-none bg-black/[0.03] dark:bg-white/[0.04] border border-border text-foreground text-xs font-medium pl-3.5 pr-8 rounded-xl outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/10 cursor-pointer font-sans">
    <option value="all">Toutes les opérations</option>
  </select>
  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
</div>
```

#### D. Interrupteur Style Apple iOS (`Switch`)
```tsx
<button
  type="button"
  role="switch"
  aria-checked={enabled}
  onClick={() => setEnabled(!enabled)}
  className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out p-0.5 relative inline-flex items-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 active:scale-95 ${
    enabled ? "bg-emerald-500" : "bg-muted border border-border"
  }`}
>
  <motion.span
    animate={{ x: enabled ? 20 : 0 }}
    transition={{ type: "spring", stiffness: 600, damping: 35 }}
    className="w-5 h-5 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35),0_0_1px_rgba(0,0,0,0.2)] block pointer-events-none"
  />
</button>
```

#### E. Contrôle Segmenté Glissant (Apple Sliding Segmented Control)
```tsx
<nav className="inline-flex items-center rounded-full bg-muted/60 p-1 border border-border relative shadow-inner overflow-hidden">
  {tabs.map((tab) => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => setActiveTab(tab.id)}
        className="relative flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all active:scale-[0.97] cursor-pointer select-none"
      >
        {isActive && (
          <motion.div
            layoutId="activeTabPill"
            transition={{ type: "spring", bounce: 0.12, duration: 0.35 }}
            className="absolute inset-0 rounded-full bg-white text-black shadow-sm"
          />
        )}
        <span className={`relative z-10 transition-colors duration-150 ${
          isActive ? "text-black font-medium" : "text-zinc-400 hover:text-white"
        }`}>
          {tab.label}
        </span>
      </button>
    );
  })}
</nav>
```

---

### 3.4 Dock & Navigation (`Sidebar.tsx`)

Le dock est une barre verticale ultra-compacte (`w-12`, 48px) articulée en capsules flottantes en verre sombre :

```
┌─────────────────────────────────┐
│ [Logo Krona SVG] (w-6 h-6)      │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │  [Vue d'ensemble] (Active)  │ │ <── Capsule Principale (w-12, rounded-full)
│ │  [Tendances]                │ │     bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl
│ │  [Comptes]                  │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │  [Bulle Banque Active]      │ │ <── Pastille Ronde (w-12 h-12)
│ └─────────────────────────────┘ │
│                                 │
│ [Date JJ / MM / AA empilée]     │ <── Chiffres verticaux tabular-nums
│ [Séparateur w-5 h-px]           │
│                                 │
│ ┌─────────────────────────────┐ │
│ │  [Thème Clair / Sombre]     │ │ <── Pastille Ronde (w-12 h-12)
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │  [Cloche Notifications]     │ │ <── Capsule Outils Inférieure
│ │  [Roue Paramètres]          │ │
│ │  [Avatar Profil Google]     │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- **Recette de la capsule dock** :
  `w-12 flex flex-col items-center bg-[#EBEBED] dark:bg-card/60 backdrop-blur-2xl backdrop-saturate-150 shadow-sm border border-border rounded-full p-1 gap-1.5 relative shrink-0`
- **Bouton d'icône d'onglet** :
  `relative w-10 h-10 rounded-full flex items-center justify-center outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20 transition-all duration-200 ease-out`
- **Pilule active glissante (Framer Motion)** :
  ```tsx
  <motion.div
    layoutId="sidebar-pill"
    layout="position"
    className="absolute inset-0 w-10 h-10 bg-white shadow-sm rounded-full"
    style={{ borderRadius: 9999 }}
    transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.8 }}
  />
  ```

---

### 3.5 Popovers & Fenêtres Flottantes (Recette du Matériau Translucide)

Les popovers (`AccountPopover`, `BankSelectorPopover`, menu de recatégorisation de ligne) partagent **rigoureusement** la même signature esthétique :

```tsx
{/* Recette exacte du conteneur popover Krona */}
<motion.div
  role="dialog"
  initial={{ opacity: 0, x: -8, scale: 0.96 }}
  animate={{ opacity: 1, x: 0, scale: 1 }}
  exit={{ opacity: 0, x: -8, scale: 0.96 }}
  transition={{ type: "spring", stiffness: 420, damping: 30 }}
  className="absolute bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl p-3.5 z-[101] overflow-hidden select-none font-sans flex flex-col"
>
  {/* Contenu du Popover */}
</motion.div>
```

#### Éléments constitutifs de la recette :
1. `bg-card/95` : Base de couleur de surface opaque à 95 %, évitant la perte de lisibilité du texte sur les éléments d'arrière-plan.
2. `backdrop-blur-2xl` : Flou optique intense lissant parfaitement les textures sous-jacentes.
3. `border border-border` : Liseré extérieur satiné fin (`rgba(255,255,255,0.08)` en sombre).
4. `shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]` : Ombre portée profonde décollant le panneau de la page.
5. `inset_0_1px_0_0_rgba(255,255,255,0.08)` : Reflet intérieur spéculaire sur l'arête supérieure (biseau Apple subtil).
6. `rounded-2xl` : Rayon de courbure fixe de 16px.

#### Structure d'une rangée cliquable dans un Popover :
```tsx
<button
  type="button"
  className="w-full flex items-center gap-3 p-2.5 bg-neutral-50 dark:bg-white/[0.03] rounded-2xl border border-border hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:border-foreground/20 active:scale-[0.98] transition-all text-left group cursor-pointer"
>
  <div className="w-8.5 h-8.5 rounded-xl bg-card border border-border flex items-center justify-center text-foreground shrink-0 group-hover:scale-105 transition-transform shadow-xs">
    <BoursoBankLogo className="w-4.5 h-4.5 text-foreground" />
  </div>
  <div className="flex-1 min-w-0">
    <div className="text-sm font-semibold text-foreground tracking-tight font-sans truncate">
      BoursoBank
    </div>
    <div className="text-xs text-muted-foreground font-sans truncate">
      Relevé de compte CSV
    </div>
  </div>
  <ChevronRight size={15} className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 ml-auto" />
</button>
```

---

## 4. Micro-interactions & Motion

### 4.1 Physique des Animations (Framer Motion)

Krona utilise des constantes de ressort (*springs*) méticuleusement calibrées pour reproduire la sensation inertielle de macOS / iOS :

| Composant | Type | Stiffness | Damping | Mass / Bounce | Rendu visuel |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Onglet actif du dock** | Spring | 480 | 38 | Mass 0.8 | Glissement rapide, ancrage ferme |
| **Popovers & Menus volants** | Spring | 420 | 30 | — | Déploiement élastique sans vibration |
| **Tiroir latéral (Drawer)** | Spring | 280 | 28 | — | Translation latérale ample et fluide |
| **Interrupteur iOS (Switch)** | Spring | 600 | 35 | — | Déplacement sec et instantané |
| **Modales centrales** | Spring | — | — | Bounce 0, Duration 0.35s | Apparition nette sans rebond |

### 4.2 Courbe Signature Krona : `easeOutExpo`

Pour les tracés SVG, les barres de progression et les demi-donuts, la courbe de référence est :
```ts
ease: [0.16, 1, 0.3, 1] // easeOutExpo sur une durée standard de 900ms
```
Cette courbe démarre à très haute vitesse et s'amortit longuement, donnant un sentiment d'exactitude et de réactivité sans lenteur perçue.

### 4.3 Composant Spécial : Compteur Chiffres Alternés (`AlternatingDigitAmount.tsx`)
Lors du survol d'une part de dépense dans le demi-donut (`SemiDonutGauge.tsx`), les chiffres du montant central ne subissent aucun saut de largeur. Chaque colonne typographique possède une largeur fixe (`1ch` pour les chiffres, `0.45ch` pour la ponctuation, `0.35ch` pour les espaces insécables). Les chiffres montent ou descendent en quinconce selon leur parité :
- Chiffres pairs : translation `y: 100% -> 0%`
- Chiffres impairs : translation `y: -100% -> 0%`
- Durée de glissement : `160ms` (`duration: 0.16, ease: [0.16, 1, 0.3, 1]`)

---

## 5. Règles d'Implémentation pour un Nouvel Agent

Copiez et appliquez ces directives lors de la conception d'un nouveau composant ou d'une nouvelle vue :

```markdown
### RÈGLES D'OR DU DESIGN SYSTEM KRONA

1. TYPOGRAPHIE :
   - Police unique : Utiliser exclusivement `font-sans` (Space Grotesk).
   - Nombres & Finances : Appliquer TOUJOURS la classe `tabular-nums` sur TOUS les montants, pourcentages et dates.
   - Proscription : Ne JAMAIS utiliser `font-mono`.

2. ICONOGRAPHIE :
   - ZÉRO EMOJI : Interdiction formelle d'insérer des emojis système (💡, ⚡️, 💰, etc.).
   - Utiliser exclusivement Lucide React (`strokeWidth={1.5}` ou `strokeWidth={1.75}`).

3. ÉLÉVATION & MATÉRIAUX :
   - Vues et cartes : Toujours opaques (`bg-background` et `bg-card`). Pas de flou ni de transparence sur les pages.
   - Glassmorphism : Réservé EXCLUSIVEMENT aux popovers, menus volants, dock et tiroirs :
     `bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl`
   - Scrim / Arrière-plan modale : `bg-black/50 dark:bg-black/70 backdrop-blur-md`.

4. GÉOMÉTRIE (BORDER RADIUS) :
   - Boutons, badges, filtres, sélecteurs : `rounded-full`.
   - Cartes de contenu, popovers : `rounded-2xl`.
   - Grandes modales, tiroirs : `rounded-3xl` ou `rounded-2xl sm:rounded-3xl`.
   - Items de liste, formulaires, conteneurs d'icônes : `rounded-xl`.

5. RETOUR TACTILE (HAPTICS) :
   - Toujours ajouter un léger scale au clic : `active:scale-95` pour les boutons, `active:scale-[0.98]` pour les items de liste et `active:scale-[0.995]` pour les cartes cliquables.

6. FERMETURE UNIFIÉE :
   - Toute modale ou popover doit être enveloppée dans `<AnimatePresence>`.
   - Doit pouvoir se fermer via clic à l'extérieur, touche Échap, et le composant `<CloseButton onClick={...} />`.
```

---
*Fin de la spécification officielle du Design System Krona.*

