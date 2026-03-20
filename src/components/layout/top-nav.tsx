"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

export function TopNav() {
  const { isConnected, user } = useAuthStore();
  const pathname = usePathname();

  return (
    <header className="fixed top-0 right-0 w-full md:w-[calc(100%-6rem)] h-16 z-40 bg-[#131315]/60 backdrop-blur-2xl border-b border-white/5 flex justify-between items-center px-4 md:px-10 text-sm font-medium">
      {/* Mobile nav links */}
      <nav className="flex md:hidden items-center gap-1">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
            pathname === "/" ? "bg-primary/10 text-primary" : "text-on-surface-variant/60"
          )}
        >
          <Icon name="home" size="sm" />
        </Link>
        <Link
          href="/generator"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
            pathname.startsWith("/generator") ? "bg-primary/10 text-primary" : "text-on-surface-variant/60"
          )}
        >
          <Icon name="auto_awesome" size="sm" />
        </Link>
        <Link
          href="/library"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
            pathname.startsWith("/library") ? "bg-primary/10 text-primary" : "text-on-surface-variant/60"
          )}
        >
          <Icon name="library_music" size="sm" />
        </Link>
      </nav>

      {/* Desktop: Brand context */}
      <div className="hidden md:flex items-center gap-3">
        <span className="text-on-surface-variant/40 text-xs uppercase tracking-[0.2em] font-bold">
          Sonic Atmosphere
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {isConnected ? (
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-on-surface-variant/60">
              {user?.display_name}
            </span>
            {user?.images?.[0]?.url ? (
              <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant/20">
                <img
                  src={user.images[0].url}
                  alt={user.display_name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon name="person" size="sm" className="text-primary" />
              </div>
            )}
          </div>
        ) : (
          <a
            href="/api/auth/spotify"
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1DB954]/10 text-[#1DB954] text-xs font-bold hover:bg-[#1DB954]/20 transition-all"
          >
            <Icon name="link" size="sm" />
            <span className="hidden sm:inline">Connect Spotify</span>
          </a>
        )}
      </div>
    </header>
  );
}
