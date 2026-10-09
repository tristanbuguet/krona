"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const [hasRealData, setHasRealData] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);

  useEffect(() => {
    const checkData = () => {
      const savedTx = localStorage.getItem('financeTransactions_v1');
      if (savedTx) {
        try {
          const parsed = JSON.parse(savedTx);
          const has = Boolean(parsed && parsed.length > 0);
          setHasRealData(has);
          if (has) {
            setShowWelcomeModal(false);
          }
        } catch {
          setHasRealData(false);
        }
      } else {
        setHasRealData(false);
      }
    };

    checkData();
    window.addEventListener("finance-data-state", checkData);
    return () => window.removeEventListener("finance-data-state", checkData);
  }, []);

  // When no real data has been imported, demo mode is active both under the blur and when modal is dismissed
  const isDemoMode = !hasRealData;
  const isBlurred = !hasRealData && showWelcomeModal;

  const handleExitDemo = useCallback(() => {
    setShowWelcomeModal(true);
    window.dispatchEvent(new CustomEvent("exit-demo-mode"));
  }, []);

  const handleDismissWelcome = useCallback(() => {
    setShowWelcomeModal(false);
    window.dispatchEvent(new CustomEvent("welcome-modal-state", { detail: { isOpen: false } }));
  }, []);

  return (
    <main className="h-full w-full relative">
      <Navbar 
        isDemoMode={isDemoMode} 
        isBlurred={isBlurred} 
        onExitDemo={handleExitDemo} 
      />
      <Suspense fallback={null}>
        <Dashboard 
          isDemoMode={isDemoMode}
          showWelcomeModal={isBlurred}
          onDismissWelcome={handleDismissWelcome}
          onExitDemo={handleExitDemo}
        />
      </Suspense>
    </main>
  );
}
