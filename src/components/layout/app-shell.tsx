"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { BottomBar } from "./bottom-bar";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { useDraftsStore } from "@/stores/drafts-store";
import { useAuthStore } from "@/stores/auth-store";

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
  const { isConnected, setConnected, setDisconnected, setLoading } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Check auth status on mount
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.connected && data.user) {
          setConnected(data.user);
        } else {
          setDisconnected();
        }
      })
      .catch(() => {
        if (!cancelled) setDisconnected();
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AuroraBackground />
      <Sidebar />
      <TopNav />
      <main className="md:ml-64 pt-20 pb-28 min-h-screen px-6 md:px-10 relative">
        {children}
      </main>
      {showBottomBar && <BottomBar showExport={showExport} onExport={onExport} />}
    </>
  );
}
