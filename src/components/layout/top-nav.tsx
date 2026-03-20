"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useAuthStore } from "@/stores/auth-store";

export function TopNav() {
  const { isConnected } = useAuthStore();

  return (
    <header className="fixed top-0 right-0 w-full md:w-[calc(100%-6rem)] h-16 z-40 bg-[#131315]/60 backdrop-blur-2xl border-b border-white/5 flex justify-between items-center px-6 md:px-10 text-sm font-medium">
      {/* Search */}
      <div className="flex items-center flex-1 max-w-md bg-surface-container-lowest/40 rounded-full px-4 py-2 focus-within:ring-1 focus-within:ring-primary/30 focus-within:bg-surface-container-lowest/60 transition-all duration-200">
        <Icon name="search" className="text-on-surface-variant/60 text-xl mr-2" />
        <input
          type="text"
          className="bg-transparent border-none focus:ring-0 focus:outline-none text-on-surface w-full placeholder:text-on-surface-variant/30 text-sm"
          placeholder="Search vibes, artists..."
        />
      </div>

      {/* Nav links */}
      <nav className="hidden lg:flex items-center gap-8 mx-8">
        <Link href="/" className="text-on-surface-variant hover:text-white transition-colors duration-200">
          New Releases
        </Link>
        <Link href="/" className="text-on-surface-variant hover:text-white transition-colors duration-200">
          Radio
        </Link>
        <Link href="/" className="text-on-surface-variant hover:text-white transition-colors duration-200">
          Live
        </Link>
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button type="button" className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/5 transition-all duration-200">
          <Icon name="notifications" />
        </button>
        <button type="button" className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/5 transition-all duration-200">
          <Icon name="account_circle" />
        </button>
      </div>
    </header>
  );
}
