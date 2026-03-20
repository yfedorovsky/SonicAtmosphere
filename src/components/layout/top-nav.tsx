"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useAuthStore } from "@/stores/auth-store";

export function TopNav() {
  const { isConnected } = useAuthStore();

  return (
    <header className="fixed top-0 right-0 w-full md:w-[calc(100%-16rem)] h-20 z-40 bg-[#131315]/40 backdrop-blur-2xl flex justify-between items-center px-6 md:px-10 text-sm font-medium">
      {/* Search */}
      <div className="flex items-center flex-1 max-w-md bg-surface-container-lowest/50 rounded-full px-4 py-2 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
        <Icon name="search" className="text-on-surface-variant text-xl mr-2" />
        <input
          type="text"
          className="bg-transparent border-none focus:ring-0 focus:outline-none text-on-surface w-full placeholder:text-on-surface-variant/40 text-sm"
          placeholder="Search vibes, artists..."
        />
      </div>

      {/* Nav links */}
      <nav className="hidden lg:flex items-center gap-8 mx-8">
        <Link href="/" className="text-on-surface-variant hover:text-white transition-opacity">
          New Releases
        </Link>
        <Link href="/" className="text-on-surface-variant hover:text-white transition-opacity">
          Radio
        </Link>
        <Link href="/" className="text-on-surface-variant hover:text-white transition-opacity">
          Live
        </Link>
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-6">
        <button type="button" className="text-on-surface-variant hover:text-white transition-opacity">
          <Icon name="notifications" />
        </button>
        <button type="button" className="text-on-surface-variant hover:text-white transition-opacity">
          <Icon name="account_circle" />
        </button>
        {!isConnected && (
          <Link
            href="/api/auth/spotify"
            className="hidden md:block px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold hover:bg-primary/20 transition-all"
          >
            Connect Spotify
          </Link>
        )}
      </div>
    </header>
  );
}
