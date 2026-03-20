"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { BottomBar } from "./bottom-bar";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { useDraftsStore } from "@/stores/drafts-store";

interface AppShellProps {
  children: React.ReactNode;
  showBottomBar?: boolean;
  showExport?: boolean;
  onExport?: () => void;
}

export function AppShell({
  children,
  showBottomBar = true,
  showExport = false,
  onExport,
}: AppShellProps) {
  const hydrate = useDraftsStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      <AuroraBackground />
      <Sidebar />
      <TopNav />
      <main className="md:ml-64 pt-20 pb-32 min-h-screen px-6 md:px-10 relative">
        {children}
      </main>
      {showBottomBar && <BottomBar showExport={showExport} onExport={onExport} />}
    </>
  );
}
