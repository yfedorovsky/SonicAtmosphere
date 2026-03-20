"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Hero } from "@/components/landing/hero";
import { FeatureBento } from "@/components/landing/feature-bento";
import { RecentPlaylists } from "@/components/landing/recent-playlists";

export default function LandingPage() {
  return (
    <AppShell showBottomBar={false}>
      <div className="max-w-7xl mx-auto py-8">
        <Hero />
        <FeatureBento />
        <RecentPlaylists />
      </div>
    </AppShell>
  );
}
