"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ModeSelector } from "@/components/generator/mode-selector";
import { PromptInput } from "@/components/generator/prompt-input";
import { FilterSidebar } from "@/components/generator/filter-sidebar";
import { TrackResultsList } from "@/components/generator/track-results-list";
import { CurrentDraftPanel } from "@/components/generator/current-draft-panel";
import { ImportModal } from "@/components/import/import-modal";
import { Icon } from "@/components/ui/icon";
import { useDraftsStore } from "@/stores/drafts-store";
import { usePlaylistStore } from "@/stores/playlist-store";
import type { GeneratorMode, FilterValues, SpotifyTrack } from "@/types";
import { DEFAULT_FILTERS, suggestMoodsFromPrompt } from "@/types";

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
  const templateId = searchParams.get("template");

  const [mode, setMode] = useState<GeneratorMode>("vibe");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  // Server flag: results came from a plain-search fallback, not the AI engine.
  const [degraded, setDegraded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [suggestedMoods, setSuggestedMoods] = useState<string[]>([]);
  const addRecentPrompt = useDraftsStore((s) => s.addRecentPrompt);
  const currentDraftId = usePlaylistStore((s) => s.currentDraft.id);
  const setGenerationContext = usePlaylistStore((s) => s.setGenerationContext);
  const runCountRef = useRef(0);
  // Snapshot of mode+filters at the last generate — filter changes no longer
  // auto-regenerate; they surface an explicit "Update results" button.
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    const isRegenerate = runCountRef.current > 0;
    runCountRef.current += 1;
    setIsLoading(true);
    setHasSearched(true);
    addRecentPrompt(prompt.trim());

    // Generate context-aware mood suggestions from prompt
    const suggested = suggestMoodsFromPrompt(prompt);
    setSuggestedMoods(suggested);

    // Auto-select suggested moods if user hasn't manually set any
    let activeFilters = filters;
    if (filters.moods.length === 0 && suggested.length > 0) {
      activeFilters = { ...filters, moods: suggested };
      setFilters(activeFilters);
    }
    setLastGenerated(JSON.stringify({ mode, filters: activeFilters }));

    // Stamp the working draft with what produced it, so the saved draft can
    // explain and re-run its generation later.
    setGenerationContext({ prompt: prompt.trim(), mode, filters: activeFilters });

    try {
      const params = new URLSearchParams({
        q: prompt.trim(),
        type: mode,
        energy: String(activeFilters.energy),
        acousticness: String(activeFilters.acousticness),
        popularity: String(activeFilters.popularity),
        danceability: String(activeFilters.danceability),
        valence: String(activeFilters.valence),
        instrumentalness: String(activeFilters.instrumentalness),
        draftId: currentDraftId,
      });
      if (activeFilters.moods.length > 0) {
        params.set("moods", activeFilters.moods.join(","));
      }
      if (isRegenerate) {
        params.set("regen", "1");
      }
      const res = await fetch(`/api/spotify/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.tracks || []);
        setDegraded(Boolean(data.degraded));
      } else {
        setResults([]);
        setDegraded(false);
      }
    } catch {
      setResults([]);
      setDegraded(false);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, mode, filters, addRecentPrompt, currentDraftId, setGenerationContext]);

  // Auto-generate if prompt came from URL
  useEffect(() => {
    if (initialPrompt) {
      handleGenerate();
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Template flow: load the saved recipe, then generate once state settles.
  const [templateLoaded, setTemplateLoaded] = useState(false);
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}`);
      if (!res.ok || cancelled) return;
      const { template } = await res.json();
      if (cancelled) return;
      if (template.prompt) setPrompt(template.prompt);
      if (template.mode && template.mode !== "import") setMode(template.mode);
      if (template.filters) setFilters(template.filters);
      setTemplateLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    if (templateLoaded && prompt.trim()) {
      setTemplateLoaded(false);
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateLoaded, prompt]);

  const filtersDirty =
    hasSearched &&
    !isLoading &&
    lastGenerated !== null &&
    lastGenerated !== JSON.stringify({ mode, filters });

  function handleModeChange(newMode: GeneratorMode) {
    setMode(newMode);
    if (newMode === "import") {
      setShowImportModal(true);
    }
  }

  const activeFilterCount = filters.moods.length;

  return (
    <AppShell>
      {/* Hero prompt section */}
      <section className="max-w-4xl mx-auto py-10 animate-fade-up">
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
              ? "Enter a song name, e.g., 'Heartbeats by Jos\u00e9 Gonz\u00e1lez'"
              : mode === "artist"
                ? "Enter an artist name, e.g., 'Radiohead'"
                : mode === "genre"
                  ? "Enter a genre, e.g., 'shoegaze', 'ambient electronic'"
                  : "Describe the vibe... 'Late night neon rainy city streets with lo-fi jazz beats'"
          }
        />
      </section>

      {/* Mobile filter toggle */}
      <div className="lg:hidden flex justify-end mb-4">
        <button
          type="button"
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container/60 border border-white/10 text-sm font-bold text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all"
        >
          <Icon name="tune" size="sm" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile filter drawer */}
      {showMobileFilters && (
        <div className="lg:hidden mb-6 animate-fade-in">
          <div className="bg-surface-container/60 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-sm font-bold uppercase tracking-wider">Filters</h3>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="text-on-surface-variant hover:text-primary"
              >
                <Icon name="close" size="sm" />
              </button>
            </div>
            <FilterSidebar filters={filters} onChange={setFilters} suggestedMoods={suggestedMoods} />
          </div>
        </div>
      )}

      {/* Two-column layout: filters | results */}
      <div className="flex gap-10 items-start pb-8">
        <div className="hidden lg:block shrink-0">
          <FilterSidebar filters={filters} onChange={setFilters} suggestedMoods={suggestedMoods} />
        </div>

        <div className="flex-1 min-w-0">
          {degraded && !isLoading && (
            <div className="mb-4 flex items-center gap-3 bg-tertiary-container/20 border border-tertiary/30 rounded-2xl px-5 py-3 animate-fade-in">
              <Icon name="warning" size="sm" className="text-tertiary shrink-0" />
              <p className="text-sm text-on-surface-variant">
                AI engine unavailable — showing basic search results. Try again in a
                minute for curated recommendations.
              </p>
            </div>
          )}
          {filtersDirty && (
            <div className="mb-4 flex items-center justify-between gap-4 bg-surface-container/60 border border-primary/20 rounded-2xl px-5 py-3 animate-fade-in">
              <p className="text-sm text-on-surface-variant">
                Filters changed since these results were generated.
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Icon name="refresh" size="sm" />
                Update results
              </button>
            </div>
          )}
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
