"use client";

import { Suspense, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-row p-3.5 sm:p-4 lg:p-5 gap-3.5 sm:gap-4 lg:gap-5 box-border bg-[#F5F5F7] text-zinc-900 dark:bg-black dark:text-white min-h-screen transition-colors duration-300">
      <Sidebar 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        <Suspense fallback={null}>
          <Dashboard 
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </Suspense>
      </div>
    </main>
  );
}
