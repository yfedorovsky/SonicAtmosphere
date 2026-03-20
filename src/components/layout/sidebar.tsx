"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useAuthStore } from "@/stores/auth-store";

const navItems = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/library", icon: "library_music", label: "Library" },
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
    <aside className="h-screen w-24 fixed left-0 top-0 bg-[#131315] flex flex-col items-center py-8 z-50 hidden md:flex">
      {/* Logo */}
      <div className="mb-12">
        <Link href="/">
          <span className="text-primary font-black text-2xl tracking-tighter font-headline">
            S
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-6 flex-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-200 active:scale-90 w-16",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-on-surface-variant/50 hover:text-primary hover:bg-white/5"
              )}
            >
              <Icon name={item.icon} filled={active} />
              <span className="text-[10px] font-bold mt-1 font-headline tracking-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto flex flex-col items-center gap-4">
        {isConnected && user?.images?.[0]?.url ? (
          <div className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant/20">
            <img
              src={user.images[0].url}
              alt={user.display_name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <Link
            href="/api/auth/spotify"
            className="flex flex-col items-center text-on-surface-variant/50 hover:text-primary transition-colors duration-200"
          >
            <Icon name="account_circle" />
          </Link>
        )}
        <button className="flex flex-col items-center text-on-surface-variant/50 hover:text-primary transition-colors duration-200 p-2">
          <Icon name="settings" />
        </button>
      </div>
    </aside>
  );
}
