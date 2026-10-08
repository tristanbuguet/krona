import { Navbar } from "@/components/Navbar";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="h-full w-full relative">
      <Navbar />
      <Dashboard />
    </main>
  );
}
