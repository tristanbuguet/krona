"use client";

import React, { useState, useEffect, useRef } from "react";
import { Plus, Check, Copy, Pencil } from "lucide-react";
import clsx from "clsx";
import { CardSelectorModal, CardData, CARD_PRESETS, DEFAULT_BANK_CARDS } from "./CardSelectorModal";

interface PaymentCardBannerProps {
  className?: string;
  onOpenSettings?: () => void;
}

const STORAGE_KEY = "krona_selected_card";

export function PaymentCardBanner({ className = "", onOpenSettings }: PaymentCardBannerProps) {
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // 3D Tilt & Glare State
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [tilt, setTilt] = useState({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 50,
    glareOpacity: 0,
  });

  // Synchronisation avec localStorage et la banque active
  useEffect(() => {
    const syncCard = () => {
      try {
        const savedBank = localStorage.getItem("krona_selected_bank") || "bourso";
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: CardData = JSON.parse(saved);
          if (parsed.isCustom) {
            setSelectedCard(parsed);
          } else {
            const matched = CARD_PRESETS.find(
              (p) => p.id === parsed.id || p.imageUrl === parsed.imageUrl || p.bank.toLowerCase() === parsed.bank?.toLowerCase()
            );
            if (matched) {
              setSelectedCard(matched);
            } else {
              const fallback = DEFAULT_BANK_CARDS[savedBank] || CARD_PRESETS[0];
              setSelectedCard(fallback);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
            }
          }
        } else {
          // Carte par défaut de l'établissement actif
          const defaultCard = DEFAULT_BANK_CARDS[savedBank] || CARD_PRESETS[0];
          setSelectedCard(defaultCard);
        }
      } catch (err) {
        setSelectedCard(CARD_PRESETS[0]);
      } finally {
        setIsLoaded(true);
      }
    };

    syncCard();
    window.addEventListener("krona-card-updated", syncCard);
    window.addEventListener("krona-bank-changed", syncCard);
    return () => {
      window.removeEventListener("krona-card-updated", syncCard);
      window.removeEventListener("krona-bank-changed", syncCard);
    };
  }, []);

  const handleSelectCard = (card: CardData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(card));
      window.dispatchEvent(new CustomEvent("krona-card-updated"));
    } catch (err) {}
    setSelectedCard(card);
  };

  const handleRemoveCard = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent("krona-card-updated"));
    } catch (err) {}
    setSelectedCard(null);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedCard) return;
    try {
      navigator.clipboard?.writeText(selectedCard.last4);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {}
  };

  // Calcul du tilt 3D et reflet spéculaire dynamique au survol
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const percentX = (x - centerX) / centerX;
    const percentY = (y - centerY) / centerY;

    // Angle d'inclinaison calibré pour un rendu subtil et noble
    const maxTilt = 13;
    const rotateX = -percentY * maxTilt;
    const rotateY = percentX * maxTilt;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    setTilt({
      rotateX,
      rotateY,
      glareX,
      glareY,
      glareOpacity: 0.65,
    });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({
      rotateX: 0,
      rotateY: 0,
      glareX: 50,
      glareY: 50,
      glareOpacity: 0,
    });
  };

  return (
    <>
      <div
        className={clsx(
          "bg-white dark:bg-card border border-black/[0.06] dark:border-border rounded-2xl shadow-sm p-4 sm:p-5 flex items-center justify-between gap-4 transition-all duration-200 shrink-0",
          className
        )}
      >
        {/* Partie gauche : Informations minimalistes */}
        <div className="flex flex-col justify-between h-full min-w-0 pr-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white font-sans truncate">
              Votre carte
            </h3>
            <div className="text-xs text-zinc-500 dark:text-neutral-400 mt-0.5 font-sans truncate">
              {selectedCard
                ? `${selectedCard.bank} · ${selectedCard.accountType}`
                : "Aucune carte configurée"}
            </div>
          </div>

          {/* Numéro masqué si carte active ou texte d'incitation si vide */}
          <div className="mt-3 sm:mt-3.5 flex items-center">
            {selectedCard ? (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 text-zinc-900 dark:text-white hover:opacity-80 transition-opacity cursor-pointer select-none group/num"
                aria-label="Copier les 4 chiffres"
              >
                <span className="text-zinc-400 dark:text-neutral-500 tracking-widest text-xs">••••</span>
                <span className="font-semibold text-sm sm:text-base tracking-wider tabular-nums font-sans">
                  {selectedCard.last4}
                </span>
                {copied ? (
                  <span className="text-[11px] text-emerald-500 dark:text-emerald-400 font-sans flex items-center gap-0.5 ml-1 font-medium">
                    <Check size={12} strokeWidth={2.5} /> Copié
                  </span>
                ) : (
                  <Copy size={12} className="text-zinc-400 dark:text-neutral-400 opacity-0 group-hover/num:opacity-100 transition-opacity ml-0.5" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-neutral-400 dark:hover:text-foreground transition-colors cursor-pointer font-sans inline-flex items-center gap-1.5 select-none"
              >
                <Plus size={13} strokeWidth={2.2} />
                <span>Sélectionner un modèle</span>
              </button>
            )}
          </div>
        </div>

        {/* Partie droite : Soit zone vide pointillée, soit carte avec inclinaison 3D */}
        {!selectedCard ? (
          /* 1. État initial vide (Placeholder pointillé) */
          <div
            onClick={() => setIsModalOpen(true)}
            className="w-28 sm:w-32 lg:w-36 aspect-[1.586/1] rounded-xl border-2 border-dashed border-black/10 dark:border-border/80 hover:border-black/30 dark:hover:border-foreground/40 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer group/placeholder text-center p-2 shrink-0 select-none"
            role="button"
            aria-label="Ajouter une carte"
          >
            <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center text-zinc-500 group-hover/placeholder:text-zinc-900 dark:text-neutral-400 dark:group-hover/placeholder:text-foreground transition-colors">
              <Plus size={14} strokeWidth={2.2} />
            </div>
            <span className="text-[10px] font-medium text-zinc-500 group-hover/placeholder:text-zinc-900 dark:text-neutral-400 dark:group-hover/placeholder:text-foreground transition-colors font-sans leading-tight">
              Ajouter une carte
            </span>
          </div>
        ) : (
          /* 2. Affichage actif avec effet d'inclinaison 3D au survol (Style CardArt / Apple Wallet) */
          <div
            className="relative shrink-0 select-none group/tilt"
            style={{ perspective: "1000px" }}
          >
            <div
              ref={cardRef}
              onMouseMove={handleMouseMove}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={() => setIsModalOpen(true)}
              className="w-28 sm:w-32 lg:w-36 aspect-[1.586/1] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 relative cursor-pointer bg-neutral-900"
              style={{
                transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale3d(${isHovered ? 1.04 : 1}, ${isHovered ? 1.04 : 1}, 1)`,
                transformStyle: "preserve-3d",
                transition: isHovered
                  ? "transform 0.08s ease-out, box-shadow 0.15s ease-out"
                  : "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
                boxShadow: isHovered
                  ? `${-tilt.rotateY * 1.5}px ${tilt.rotateX * 1.5 + 8}px 24px rgba(0,0,0,0.35)`
                  : "0 2px 8px rgba(0,0,0,0.15)",
              }}
              role="button"
              aria-label="Changer de carte"
            >
              {/* Visuel PNG de la carte */}
              <img
                src={selectedCard.imageUrl}
                alt={selectedCard.name}
                className="w-full h-full object-cover select-none pointer-events-none"
                onError={() => {
                  setSelectedCard(prev => prev ? { ...prev, imageUrl: "/cards/bourso-card.png" } : null);
                }}
              />

              {/* Reflet spéculaire dynamique (Specular Glare) */}
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.12) 30%, transparent 65%)`,
                  opacity: tilt.glareOpacity,
                  transition: isHovered ? "opacity 0.15s ease-out" : "opacity 0.4s ease-out",
                  mixBlendMode: "overlay",
                }}
              />

              {/* Reflet linéaire diagonal subtil */}
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  background: `linear-gradient(${115 + tilt.rotateY * 2}deg, transparent 20%, rgba(255,255,255,0.15) 45%, transparent 70%)`,
                  opacity: isHovered ? 0.75 : 0,
                  transition: "opacity 0.2s ease-out",
                  mixBlendMode: "soft-light",
                }}
              />

              {/* Bouton discret au survol pour modifier */}
              <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center opacity-0 group-hover/tilt:opacity-100 transition-opacity shadow-sm z-20">
                <Pencil size={11} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modale de sélection de carte */}
      <CardSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedCardId={selectedCard?.id || null}
        onSelectCard={handleSelectCard}
        onRemoveCard={selectedCard ? handleRemoveCard : undefined}
      />
    </>
  );
}
