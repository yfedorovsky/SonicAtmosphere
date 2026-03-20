"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ModeSelector } from "@/components/generator/mode-selector";
import { PromptInput } from "@/components/generator/prompt-input";
import { FilterSidebar } from "@/components/generator/filter-sidebar";
import { TrackResultsList } from "@/components/generator/track-results-list";
import { CurrentDraftPanel } from "@/components/generator/current-draft-panel";
import { ImportModal } from "@/components/import/import-modal";
import { useDraftsStore } from "@/stores/drafts-store";
import type { GeneratorMode, FilterValues, SpotifyTrack } from "@/types";
import { DEFAULT_FILTERS } from "@/types";

export default function GeneratorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <GeneratorContent />
    </Suspense>
  );
}

function GeneratorContent() {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "";

  const [mode, setMode] = useState<GeneratorMode>("vibe");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const addRecentPrompt = useDraftsStore((s) => s.addRecentPrompt);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setHasSearched(true);
    addRecentPrompt(prompt.trim());

    try {
      const params = new URLSearchParams({
        q: prompt.trim(),
        type: mode,
        energy: String(filters.energy),
        acousticness: String(filters.acousticness),
        popularity: String(filters.popularity),
      });
      if (filters.moods.length > 0) {
        params.set("moods", filters.moods.join(","));
      }
      const res = await fetch(`/api/spotify/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.tracks || []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, mode, filters, addRecentPrompt]);

  // Auto-generate if prompt came from URL
  useEffect(() => {
    if (initialPrompt) {
      handleGenerate();
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleModeChange(newMode: GeneratorMode) {
    setMode(newMode);
    if (newMode === "import") {
      setShowImportModal(true);
    }
  }

  return (
    <AppShell>
      {/* Hero prompt section */}
      <section className="max-w-4xl py-10 animate-fade-up">
        <label className="text-xs uppercase tracking-[0.2em] text-secondary mb-4 block font-semibold">
          AI Multi-Modal Prompt
        </label>
        <div className="mb-6">
          <ModeSelector mode={mode} onChange={handleModeChange} />
        </div>
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          onGenerate={handleGenerate}
          isLoading={isLoading}
          placeholder={
            mode === "song"
              ? "Enter a song name, e.g., 'Heartbeats by José González'"
              : mode === "artist"
                ? "Enter an artist name, e.g., 'Radiohead'"
                : mode === "genre"
                  ? "Enter a genre, e.g., 'shoegaze', 'ambient electronic'"
                  : "Describe the vibe... 'Late night neon rainy city streets with lo-fi jazz beats'"
          }
        />
      </section>

      {/* Two-column layout: filters | results */}
      <div className="flex gap-10 items-start pb-8">
        <div className="hidden lg:block shrink-0">
          <FilterSidebar filters={filters} onChange={setFilters} />
        </div>

        <div className="flex-1 min-w-0">
          <TrackResultsList
            tracks={results}
            isLoading={isLoading}
            hasSearched={hasSearched}
          />
        </div>
      </div>

      {/* Floating draft panel (shows when tracks added) */}
      <CurrentDraftPanel />

      {/* Import modal */}
      <ImportModal
        open={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setMode("vibe");
        }}
      />
    </AppShell>
  );
}
