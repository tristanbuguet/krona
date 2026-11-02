"use client";

import { Suspense, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isAccountPopoverOpen, setIsAccountPopoverOpen] = useState(false);

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-row p-3.5 sm:p-4 lg:p-5 gap-3.5 sm:gap-4 lg:gap-5 box-border bg-background text-foreground min-h-screen transition-colors duration-300">
      <Sidebar 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isNotificationOpen={isNotificationOpen}
        isOpen={isNotificationOpen}
        onNotificationToggle={() => setIsNotificationOpen(prev => !prev)}
        isAccountPopoverOpen={isAccountPopoverOpen}
        onAccountPopoverClose={() => setIsAccountPopoverOpen(false)}
        onAccountPopoverToggle={() => setIsAccountPopoverOpen(prev => !prev)}
      />
      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        <Suspense fallback={null}>
          <Dashboard 
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isNotificationOpen={isNotificationOpen}
            isOpen={isNotificationOpen}
            onNotificationChange={setIsNotificationOpen}
            onNotificationClose={() => setIsNotificationOpen(false)}
            onOpenAccountPopover={() => setIsAccountPopoverOpen(true)}
          />
        </Suspense>
      </div>
    </main>
  );
}
