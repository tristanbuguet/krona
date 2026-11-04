# Spécification Technique des Fenêtres Flottantes & Overlays — Krona

> **Guide de Référence pour l'Implémentation des Overlays (Popovers, Modales, Tiroirs, Menus Contextuels et Tooltips).**  
> Ce document formalise la taxonomie spatiale complète, la matrice décisionnelle UX, les tokens de glassmorphism, la hiérarchie stricte des `z-index` et l'inventaire exhaustif de tous les composants de surface de Krona.  
> Il constitue le guide obligatoire à suivre lors de l'ajout d'une nouvelle fenêtre, d'un tiroir ou d'un menu d'interaction.

---

## Sommaire

1. [Arbre de Décision UI : Quand utiliser quoi ?](#1-arbre-de-décision-ui--quand-utiliser-quoi-)
2. [Recette Visuelle Unifiée (Design Tokens & Glassmorphism)](#2-recette-visuelle-unifiée-design-tokens--glassmorphism)
3. [Comportements d'Interaction & UX Standard](#3-comportements-dinteraction--ux-standard)
   - [3.1 Cycle de Vie & AnimatePresence](#31-cycle-de-vie--animatepresence)
   - [3.2 La Règle des 3 Voies de Fermeture](#32-la-règle-des-3-voies-de-fermeture)
   - [3.3 Pattern Click-Outside avec Anti-Rebond](#33-pattern-click-outside-avec-anti-rebond)
   - [3.4 Échelle Absolue des Z-Index](#34-échelle-absolue-des-z-index)
4. [Inventaire Exhaustif des Overlays du Codebase](#4-inventaire-exhaustif-des-overlays-du-codebase)
   - [4.1 Popovers Ancrés](#41-popovers-ancrés)
     - [A. Popover de Compte & Synchronisation (`AccountPopover`)](#a-popover-de-compte--synchronisation-accountpopover)
     - [B. Sélecteur Déroulant de Banque Dock (`BankSelectorPopover`)](#b-sélecteur-déroulant-de-banque-dock-bankselectorpopover)
     - [C. Menu d'Importation CSV Topbar (`ImportMenuPopover`)](#c-menu-dimportation-csv-topbar-importmenupopover)
     - [D. Popover des Opérations à Vérifier (`InboxPopover`)](#d-popover-des-opérations-à-vérifier-inboxpopover)
   - [4.2 Tiroirs Latéraux (Drawers)](#42-tiroirs-latéraux-drawers)
     - [E. Tiroir des Opérations Détaillées (`TransactionsDrawer`)](#e-tiroir-des-opérations-détaillées-transactionsdrawer)
   - [4.3 Menus Contextuels Volants](#43-menus-contextuels-volants)
     - [F. Pop-up Latéral de Recatégorisation (`RecategorizationPopup`)](#f-pop-up-latéral-de-recatégorisation-recategorizationpopup)
   - [4.4 Modales & Dialogues Centrés](#44-modales--dialogues-centrés)
     - [G. Modale Centrale de Paramétrage (`SettingsModal`)](#g-modale-centrale-de-paramétrage-settingsmodal)
     - [H. Modale de Confirmation Destructrice (`ResetModal`)](#h-modale-de-confirmation-destructrice-resetmodal)
     - [I. Modale de Statut & Analyse IA (`CsvAnalysisModal`)](#i-modale-de-statut--analyse-ia-csvanalysismodal)
     - [J. Modale de Saisie de Compte Bancaire (`AccountFormModal`)](#j-modale-de-saisie-de-compte-bancaire-accountformmodal)
   - [4.5 Tooltips & Toasts](#45-tooltips--toasts)
     - [K. Infobulle Dynamique de Trajectoire (`ChartTooltip`)](#k-infobulle-dynamique-de-trajectoire-charttooltip)
     - [L. Notification Flottante Pill (`FeedbackToast`)](#l-notification-flottante-pill-feedbacktoast)
5. [Règles d'Implémentation pour une Nouvelle Extension](#5-règles-dimplémentation-pour-une-nouvelle-extension)

---

## 1. Arbre de Décision UI : Quand utiliser quoi ?

Pour éviter l'accumulation anarchique de modales et conserver une fluidité de type macOS/iOS, chaque besoin d'interaction en superposition est orienté selon la matrice suivante :

| Type d'Overlay | Interruption Utilisateur | Scrim Sombre (Backdrop) | Ancrage Spatial | Durée de Présence | Cas d'Usage Exclusifs dans Krona |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Popover (Ancré)** | **Faible** (Non bloquant) | **NON** (Arrière-plan visible et cliquable) | Relatif au bouton déclencheur (`absolute`) | Rapide (< 10 sec) | Choix de banque, menu profil, notification inbox, sélection rapide. |
| **Menu Contextuel** | **Très faible** | **NON** | Relatif à la ligne/cellule active | Immédiat (1 clic) | Modification de la catégorie d'une transaction, action locale. |
| **Tiroir (Drawer)** | **Moyenne** (Semi-bloquant) | **OUI** (`backdrop-blur-md`) | Bord droit de l'écran, pleine hauteur | Moyenne (30s à 2min) | Consultation de la liste intégrale des opérations, filtres combinés. |
| **Modale (Dialog)** | **Élevée** (Bloquant) | **OUI** (`backdrop-blur-md`) | Centré au milieu du viewport | Courte à moyenne | Confirmation de purge, formulaire de compte, analyse CSV. |
| **Grande Modale** | **Forte immersion** | **OUI** (`backdrop-blur-md`) | Centré (`max-w-4xl`, 80vh) | Longue (> 1 min) | Configuration globale des budgets, salaires, charges et données. |
| **Tooltip** | **Nulle** (Passif) | **NON** | Coordonnées X/Y du curseur / point | Éphémère (temps du hover) | Montant exact et écart au jour J sur la courbe de dépenses. |
| **Toast (Pill)** | **Nulle** (Informatif) | **NON** | Flottant en bas ou haut d'écran | 3 à 4 secondes (auto-dismiss) | Confirmation d'import, feedback de synchronisation Cloud. |

```
                                  [Besoin d'afficher une interface secondaire]
                                                        │
                      ┌─────────────────────────────────┴─────────────────────────────────┐
                      ▼                                                                   ▼
          [L'action bloque-t-elle le flux ?]                                [Action d'appui ou de consultation ?]
                      │                                                                   │
           ┌──────────┴──────────┐                                             ┌──────────┴──────────┐
           ▼                     ▼                                             ▼                     ▼
     [Critique / Danger]   [Configuration / Formulaire]                  [Liée à un bouton ?]   [Liée à un tableau / liste ?]
           │                     │                                             │                     │
           ▼                     ▼                                             ▼                     ▼
     MODALE COMPACTE       GRANDE MODALE                                    POPOVER             TIROIR LATÉRAL
     (ex. ResetModal)      (ex. SettingsModal)                         (ex. BankSelector)    (ex. TransactionsDrawer)
```

---

## 2. Recette Visuelle Unifiée (Design Tokens & Glassmorphism)

### 2.1 La Signature Translucide Krona

Tous les conteneurs d'overlays partagent **rigoureusement** la même formule de matériau satiné.

```css
/* Recette exacte du matériau flottant Krona */
bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl
```

#### Décomposition des tokens :
1. `bg-card/95` : Fond de surface sombre (`#0F0F11`) ou clair (`#ffffff`) teinté à 95 % d'opacité. Cette opacité élevée prévient toute baisse de contraste ou d'illisibilité du texte financier sur les éléments graphiques sous-jacents.
2. `backdrop-blur-2xl` : Flou gaussien intense (40px) dispersant les contours des composants situés derrière la fenêtre.
3. `border border-border` : Liseré satiné extérieur (`rgba(255, 255, 255, 0.08)` en sombre, `rgba(0, 0, 0, 0.06)` en clair).
4. `shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]` : Ombre portée profonde décollant le panneau du plan de travail.
5. `inset_0_1px_0_0_rgba(255,255,255,0.08)` : Biseau spéculaire supérieur d'inspiration Apple reproduisant un reflet d'arête physique.
6. `rounded-2xl` ou `rounded-3xl` : Rayon de courbure fixe de 16px (popovers, dialogues compacts) ou 24–32px (grandes modales et tiroirs).

### 2.2 Le Scrim d'Arrière-Plan (Backdrop)

Pour les modales et tiroirs exigeant un focus exclusif, le rideau d'arrière-plan applique :
```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
  className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md"
/>
```
- `bg-black/50 dark:bg-black/70` : Obscurcissement équilibré permettant de discerner la silhouette du tableau de bord.
- `backdrop-blur-md` : Flou doux (12px) neutralisant les distractions textuelles sans alourdir le processeur graphique.

> [!CAUTION]
> **Règle absolue d'interdiction** : Il est strictement interdit d'appliquer un flou `backdrop-blur` ou une translucidité sur le fond de page (`main`, `body`) ou sur les cartes de contenu de base (`Card.tsx`). Le glassmorphism est un attribut exclusif de la couche de flottaison (*Surface Layer*).

---

## 3. Comportements d'Interaction & UX Standard

### 3.1 Cycle de Vie & AnimatePresence

Tout composant overlay doit **impérativement** être enveloppé dans un bloc `<AnimatePresence>` pour que ses transitions de sortie (*exit animations*) soient exécutées avant démontage du DOM :

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
    >
      {/* Contenu */}
    </motion.div>
  )}
</AnimatePresence>
```

---

### 3.2 La Règle des 3 Voies de Fermeture

Tout overlay sans exception (popover, modale, tiroir) doit proposer 3 mécanismes convergents de fermeture :
1. **Clic à l'extérieur (*Click Outside*)** : Clic ou toucher sur le scrim ou hors de la boîte d'encadrement.
2. **Touche Échap (*Escape Keydown*)** : Détectée par écouteur global d'événements.
3. **Bouton Circulaire de Fermeture (`CloseButton`)** : Situé systématiquement dans le coin supérieur droit de l'en-tête de l'overlay (`iconSize={15}` ou `16}`).

---

### 3.3 Pattern Click-Outside avec Anti-Rebond

Pour éviter qu'un clic sur le bouton déclencheur ne ferme immédiatement le popover au moment précis où il s'ouvre, l'écouteur `mousedown` doit être enregistré avec un délai de désensibilisation de **10 millisecondes** :

```tsx
useEffect(() => {
  if (!isOpen) return;

  const handleClickOutside = (event: MouseEvent | TouchEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      containerRef.current &&
      target &&
      !containerRef.current.contains(target) &&
      !target.closest("[data-trigger-id='mon-bouton']")
    ) {
      onClose();
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  };

  // Délai de 10ms évitant la capture de l'événement de clic d'ouverture
  const timer = setTimeout(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  }, 10);

  return () => {
    clearTimeout(timer);
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("touchstart", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  };
}, [isOpen, onClose]);
```

---

### 3.4 Échelle Absolue des Z-Index

Pour garantir qu'aucun menu volant ne soit tronqué par un conteneur parent ou masqué sous une modale, l'application applique la hiérarchie stricte suivante :

| Couche | Plage Z-Index | Composants concernés | Description |
| :--- | :--- | :--- | :--- |
| **Base Surface** | `z-0` à `z-10` | Canevas de page, cartes `Card.tsx`, en-tête `PageHeader` | Surface principale de travail |
| **Tooltips / In-Card Overlays**| `z-20` | `ChartTooltip` (courbe de budget), pop-up de recatégorisation | Éléments flottants internes confinés |
| **Dock / Sidebar** | `z-30` | Barre latérale gauche fixe (`Sidebar.tsx`) | Élément d'infrastructure permanent |
| **Modales de Second Rang** | `z-50` | `AccountFormModal` (création compte), Toasts de vue | Fenêtres contextuelles légères |
| **Grande Modale Réglages** | `z-[60]` | `SettingsModal` (Paramètres généraux) | Immersion configuration |
| **Modale Purge / Tiroir** | `z-[70]` | `ResetModal` (confirmation danger), `TransactionsDrawer` | Éléments d'action directe prioritaire |
| **Popovers Ancrés de Contrôle**| `z-[101]` | `AccountPopover`, `BankSelectorPopover`, `ImportMenu`, `Inbox` | Flottent par-dessus la Sidebar et le Drawer |
| **Toast Système Flottant** | `z-[105]` | Notification pill centrale de confirmation | Reste toujours visible sous les modales |
| **Modale Système Critique** | `z-[150]` | `CsvAnalysisModal` (Analyse IA / Import bloquant) | Verrouille l'écran pendant le parsing |

---

## 4. Inventaire Exhaustif des Overlays du Codebase

### 4.1 Popovers Ancrés

#### A. Popover de Compte & Synchronisation (`AccountPopover`)
- **Fichier source** : [`AccountPopover.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/AccountPopover.tsx)
- **Déclencheur** : Bouton avatar / profil de la Sidebar (`#sidebar-account-btn`).
- **Ancrage** : `absolute left-full bottom-0 ml-3 w-80`. Se déploie horizontalement vers la droite depuis le bas du dock.
- **Z-Index** : `z-[101]`.
- **Ressort Motion** : `{ type: "spring", stiffness: 420, damping: 30 }`.
- **Animation** : `initial={{ opacity: 0, x: -8, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -8, scale: 0.96 }}`.
- **Contenu interne** :
  - *Mode Invité* : Titre "Synchronisation Cloud", badge ambre de stockage local, puce bouclier `ShieldCheck` et bouton d'action Google OAuth.
  - *Mode Connecté* : Profil utilisateur (nom, email, photo ou initiales), indicateur de synchronisation temps réel avec bouton manuel de synchronisation et bouton destructif de déconnexion rose.

#### B. Sélecteur Déroulant de Banque Dock (`BankSelectorPopover`)
- **Fichier source** : [`BankSelectorPopover.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/BankSelectorPopover.tsx)
- **Déclencheur** : Pastille ronde de banque active dans la Sidebar.
- **Ancrage** : `absolute left-full top-0 ml-3 w-64 sm:w-72` (ou sous l'élément si aligné en bas).
- **Z-Index** : `z-[101]`.
- **Ressort Motion** : `{ type: "spring", stiffness: 420, damping: 30 }`.
- **Contenu interne** : En-tête majuscule "Sélectionner la banque", 4 options bancaires complètes avec logos vectoriels officiels (BoursoBank, Crédit Agricole, Caisse d'Épargne, LCL), sous-titre "Relevé de compte CSV" et flèche de sélection.

#### C. Menu d'Importation CSV Topbar (`ImportMenuPopover`)
- **Fichier source** : [`Dashboard.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/Dashboard.tsx#L2480-L2585)
- **Déclencheur** : Bouton primaire `+ Importer un CSV` dans le `PageHeader`.
- **Ancrage** : `absolute top-full right-0 mt-2 w-72 sm:w-80`.
- **Z-Index** : `z-[101]`.
- **Animation** : `initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}`.
- **Contenu interne** : En-tête avec `CloseButton`, liste des 4 banques cibles qui configurent `localStorage.krona_selected_bank` et déclenchent l'événement `trigger-csv-upload`.

#### D. Popover des Opérations à Vérifier (`InboxPopover`)
- **Fichier source** : [`Dashboard.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/Dashboard.tsx#L3774-L3840)
- **Déclencheur** : Bouton cloche de notifications du Dock (`#sidebar-bell-btn`).
- **Ancrage** : Positionnement calculé dynamiquement au millimètre près (`bellPosition.left`, `bellPosition.bottom`) ou fallback `fixed left-14 bottom-4 w-80 sm:w-96 max-h-[540px]`.
- **Z-Index** : `z-[101]`.
- **Contenu interne** : Titre avec pastille de comptage rouge, liste déroulante interne des opérations suspectes ou non enrichies avec menu déroulant inline pour catégorisation instantanée.

---

### 4.2 Tiroirs Latéraux (Drawers)

#### E. Tiroir des Opérations Détaillées (`TransactionsDrawer`)
- **Fichier source** : [`Dashboard.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/Dashboard.tsx#L3838-L4090)
- **Déclencheur** : Carte KPI Abonnements, bouton "Voir tout" du Top Commerçants ou clic sur une catégorie du demi-donut.
- **Ancrage** : `fixed inset-0 z-[70] flex justify-end p-2 sm:p-4 md:p-6`.
- **Conteneur** : `h-full w-full max-w-lg md:max-w-xl rounded-2xl sm:rounded-3xl bg-card/95 backdrop-blur-2xl border border-border shadow-2xl flex flex-col overflow-hidden`.
- **Scrim** : `bg-black/50 dark:bg-black/70 backdrop-blur-md`.
- **Ressort Motion** : `{ type: "spring", damping: 28, stiffness: 280 }`.
- **Animation** : `initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}`.
- **Contenu interne** :
  - En-tête avec compteur d'opérations filtrées et `CloseButton`.
  - Champ de recherche instantanée avec bouton de réinitialisation croix.
  - Barre de défilement horizontal de puces de filtrage (Tout, Dépenses, Revenus, Abonnements, Virements).
  - Liste défilante d'opérations avec édition de catégorie par ouverture du pop-up latéral contextuel.

---

### 4.3 Menus Contextuels Volants

#### F. Pop-up Latéral de Recatégorisation (`RecategorizationPopup`)
- **Fichier source** : [`Dashboard.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/Dashboard.tsx#L3864-L3923)
- **Déclencheur** : Clic sur une ligne d'opération dans le `TransactionsDrawer`.
- **Ancrage** : Ancré sur le flanc gauche du tiroir dans l'espace libre de l'écran (`lg:absolute lg:right-full lg:mr-3 lg:w-80 max-h-[420px]`). En mode mobile, bascule automatiquement en feuille inférieure (`max-lg:fixed max-lg:inset-x-4 max-lg:bottom-4`).
- **Z-Index** : `z-20` (à l'intérieur du wrapper du tiroir).
- **Ressort Motion** : `{ type: "spring", stiffness: 420, damping: 30 }`.
- **Animation** : `initial={{ opacity: 0, x: 12, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 12, scale: 0.96 }}`.
- **Contenu interne** : En-tête épuré avec `CloseButton`, liste des 13 catégories officielles avec icônes carrées adoucies (`w-8.5 h-8.5 rounded-xl bg-card`), coche blanche sur fond noir pour la sélection active.

---

### 4.4 Modales & Dialogues Centrés

#### G. Modale Centrale de Paramétrage (`SettingsModal`)
- **Fichier source** : [`Dashboard.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/Dashboard.tsx#L3174-L3715)
- **Déclencheur** : Bouton paramètres de la Sidebar ou clic sur la carte de plafond / reste à vivre.
- **Ancrage** : `fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4`.
- **Conteneur** : `bg-card border border-border rounded-3xl shadow-2xl w-full max-w-4xl h-[90vh] sm:h-[80vh] flex flex-col overflow-hidden font-sans`.
- **Scrim** : `bg-black/60 dark:bg-black/70 backdrop-blur-md`.
- **Animation** : `initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }} transition={{ type: "spring", bounce: 0, duration: 0.35 }}`.
- **Contenu interne** :
  - Barre d'en-tête sticky avec contrôle segmenté coulissant Apple (`motion.div layoutId="appleSettingsTabPill"`).
  - 3 onglets thématiques : *Revenus & Fixes* (salaires, aides, loyers, switches iOS), *Abonnements* (détection, masquage), *Plafonds & Données* (budget par catégorie, purge).

#### H. Modale de Confirmation Destructrice (`ResetModal`)
- **Fichier source** : [`Dashboard.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/Dashboard.tsx#L3719-L3771)
- **Déclencheur** : Bouton corbeille du `PageHeader` ou action "Tout réinitialiser" dans les réglages.
- **Ancrage** : `fixed inset-0 z-[70] flex items-center justify-center p-4`.
- **Conteneur** : `bg-card border border-border p-6 rounded-3xl shadow-2xl w-full max-w-sm relative z-10 mx-4 font-sans`.
- **Scrim** : `bg-black/50 dark:bg-black/70 backdrop-blur-md`.
- **Animation** : `initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}`.
- **Contenu interne** : Pastille d'alerte rouge `Trash2`, titre explicite, deux boutons d'action (effacer uniquement le mois en cours ou purger la totalité de l'application).

#### I. Modale de Statut & Analyse IA (`CsvAnalysisModal`)
- **Fichier source** : [`CsvAnalysisModal.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/CsvAnalysisModal.tsx)
- **Déclencheur** : Déposé d'un fichier CSV bancaire.
- **Ancrage** : `fixed inset-0 z-[150] flex items-center justify-center p-4`.
- **Conteneur** : `w-full max-w-[210px] sm:max-w-[220px] p-6 bg-card/95 backdrop-blur-2xl border border-border rounded-2xl shadow-2xl flex flex-col items-center justify-center text-center gap-4`.
- **Scrim** : `bg-black/40 backdrop-blur-md`.
- **Animation** : `initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: "spring", stiffness: 380, damping: 28 }}`.
- **Contenu interne** : Logo Krona SVG centré avec anneau rotatif `animate-spin`, permutation fluide vers une pastille ronde verte `Check` lors du succès de l'enrichissement.

#### J. Modale de Saisie de Compte Bancaire (`AccountFormModal`)
- **Fichier source** : [`AccountsView.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/views/AccountsView.tsx#L444-L578)
- **Déclencheur** : Bouton `+ Ajouter un compte` dans la vue Comptes.
- **Ancrage** : `fixed inset-0 z-50 flex items-center justify-center p-4`.
- **Conteneur** : `w-full max-w-md bg-card/95 backdrop-blur-2xl border border-border rounded-2xl p-6 shadow-2xl flex flex-col font-sans`.
- **Scrim** : `bg-black/50 dark:bg-black/70 backdrop-blur-md`.
- **Animation** : `initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: "spring", stiffness: 350, damping: 28 }}`.

---

### 4.5 Tooltips & Toasts

#### K. Infobulle Dynamique de Trajectoire (`ChartTooltip`)
- **Fichier source** : [`ExpensesCurveChart.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/ExpensesCurveChart.tsx#L492-L538)
- **Déclencheur** : Déplacement du pointeur sur le canevas SVG (`onPointerMove`).
- **Ancrage** : Calculé en pixels au-dessus du point actif (`bottom: calc(height - y + 12px)`, `left: clamp(...)`).
- **Z-Index** : `z-20` (à l'intérieur du conteneur de graphique).
- **Conteneur** : `absolute pointer-events-none px-4 py-3 min-w-[180px] rounded-2xl bg-card/95 border border-border shadow-2xl backdrop-blur-2xl flex flex-col whitespace-nowrap`.
- **Contenu interne** : Date formatée, solde restant à ce jour en `tabular-nums`, badge vert d'avance ou badge rose de retard par rapport à la trajectoire idéale, dépenses du jour.

#### L. Notification Flottante Pill (`FeedbackToast`)
- **Fichier source** : [`Dashboard.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/Dashboard.tsx#L2395-L2409) et [`AccountsView.tsx`](file:///Users/tristanbgt/Desktop/Dashboard%20gestion/app/src/components/views/AccountsView.tsx#L240-L253)
- **Déclencheur** : Fin de synchronisation, déconnexion, copie de données.
- **Ancrage** : `fixed bottom-6 left-1/2 -translate-x-1/2` (Dashboard) ou `fixed top-20 right-6` (Accounts).
- **Z-Index** : `z-[105]` ou `z-50`.
- **Conteneur** : `bg-neutral-900/90 dark:bg-black/90 border border-white/[0.08] backdrop-blur-md text-white px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-sm font-sans`.
- **Animation** : `initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}`.

---

## 5. Règles d'Implémentation pour une Nouvelle Extension

Lors de la création d'un nouvel overlay, respectez impérativement cette check-list :

1. **Choix du type selon la matrice** : Ne créez pas de modale bloquante si une action rapide peut être résolue par un popover ancré ou un tiroir latéral.
2. **Application rigoureuse de la recette glassmorphism** :
   ```tsx
   className="bg-card/95 backdrop-blur-2xl border border-border shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.08)] rounded-2xl"
   ```
3. **Respect du niveau Z-Index** :
   - Popover ancré au dock ou à l'en-tête : `z-[101]`.
   - Tiroir ou modale bloquante : `z-[70]`.
   - Modale système bloquante : `z-[150]`.
4. **Intégration de la triple fermeture** :
   - Clic extérieur avec listener retardé de 10ms.
   - Touche Échap.
   - `<CloseButton onClick={...} iconSize={15} />` dans l'en-tête.
5. **Enveloppement dans `<AnimatePresence>`** avec constantes de ressort validées (`stiffness: 420, damping: 30` pour les popovers, `stiffness: 280, damping: 28` pour les tiroirs).

---
*Fin de la spécification officielle des Overlays Krona.*

