"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useAuthStore } from "@/stores/auth-store";

const navItems = [
  { href: "/library", icon: "library_music", label: "Library" },
  { href: "/", icon: "explore", label: "Discover" },
  { href: "/generator", icon: "auto_awesome", label: "Generator" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected, user } = useAuthStore();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="h-screen w-64 fixed left-0 top-0 border-r border-white/5 bg-[#131315]/60 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col py-8 px-4 z-50 font-headline tracking-tight hidden md:flex">
      {/* Logo */}
      <div className="mb-12 px-4">
        <Link href="/">
          <h1 className="text-2xl font-bold tracking-tighter text-primary">
            Sonic Atmosphere
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60 font-medium mt-1">
            Premium Experience
          </p>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-300 active:scale-95",
                active
                  ? "text-primary font-bold border-r-2 border-primary bg-gradient-to-r from-primary/10 to-transparent"
                  : "text-on-surface-variant hover:text-white hover:bg-white/5"
              )}
            >
              <Icon name={item.icon} filled={active} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto px-4">
        {isConnected ? (
          <div className="flex items-center gap-3 p-2 rounded-2xl bg-white/5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary overflow-hidden flex items-center justify-center">
              {user?.images?.[0]?.url ? (
                <img
                  src={user.images[0].url}
                  alt={user.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Icon name="person" className="text-on-primary" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold truncate">
                {user?.display_name || "Connected"}
              </span>
              <span className="text-[10px] text-on-surface-variant">Spotify Connected</span>
            </div>
          </div>
        ) : (
          <Link href="/api/auth/spotify">
            <button
              type="button"
              className="w-full py-3 bg-primary text-on-primary font-bold rounded-full active:scale-95 transition-transform"
            >
              Connect Spotify
            </button>
          </Link>
        )}
      </div>
    </aside>
  );
}
