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

// "Playlist length" presets → target track counts (~3 min/track). Longer targets
// are filled by running the generator multiple times, each pass excluding the
// artists already added, paced so Spotify's rolling rate limit stays clear.
const LENGTH_TARGET: Record<"1h" | "2h" | "3h", number> = { "1h": 20, "2h": 40, "3h": 60 };
const PASS_GAP_MS = 18_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Cross-pass dedup key: normalized primary artist | version-stripped title.
const trackKey = (t: SpotifyTrack) =>
  `${(t.artists[0]?.name ?? "").toLowerCase().trim()}|${t.name
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .split(" - ")[0]
    .trim()}`;

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
  const [length, setLength] = useState<"1h" | "2h" | "3h">("1h");
  // Non-null while filling a longer playlist across paced passes.
  const [fillProgress, setFillProgress] = useState<{ have: number; target: number } | null>(null);
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
    setFillProgress(null);
    addRecentPrompt(prompt.trim());

    // Context-aware mood suggestions; auto-select if the user set none.
    const suggested = suggestMoodsFromPrompt(prompt);
    setSuggestedMoods(suggested);
    let activeFilters = filters;
    if (filters.moods.length === 0 && suggested.length > 0) {
      activeFilters = { ...filters, moods: suggested };
      setFilters(activeFilters);
    }
    setLastGenerated(JSON.stringify({ mode, filters: activeFilters }));
    // Stamp the working draft with what produced it, so it can re-run later.
    setGenerationContext({ prompt: prompt.trim(), mode, filters: activeFilters });

    // One generation pass. excludeArtists steers each pass toward fresh names.
    const runPass = async (
      excludeArtists: string[]
    ): Promise<{ tracks: SpotifyTrack[]; degraded: boolean } | null> => {
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
      if (activeFilters.moods.length > 0) params.set("moods", activeFilters.moods.join(","));
      if (isRegenerate) params.set("regen", "1");
      if (excludeArtists.length > 0)
        params.set("excludeArtists", excludeArtists.slice(0, 40).join(","));
      try {
        const res = await fetch(`/api/spotify/search?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return { tracks: (data.tracks || []) as SpotifyTrack[], degraded: Boolean(data.degraded) };
      } catch {
        return null;
      }
    };

    const target = LENGTH_TARGET[length];
    try {
      const first = await runPass([]);
      setIsLoading(false);
      if (!first) {
        setResults([]);
        setDegraded(false);
        return;
      }
      let acc = first.tracks;
      setResults(acc);
      setDegraded(first.degraded);

      // Fill toward the target with additional paced passes, each excluding the
      // artists already added and deduping what comes back. Stop early on a
      // degraded pass, when nothing new arrives, or once the target is reached.
      if (target > 20 && !first.degraded && acc.length > 0) {
        const seen = new Set(acc.map(trackKey));
        const maxPass = Math.ceil(target / 20) + 1;
        for (let pass = 2; pass <= maxPass && acc.length < target; pass++) {
          setFillProgress({ have: acc.length, target });
          await sleep(PASS_GAP_MS);
          const exclude = [
            ...new Set(acc.map((t) => t.artists[0]?.name).filter((n): n is string => !!n)),
          ];
          const next = await runPass(exclude);
          if (!next || next.degraded) break;
          const fresh = next.tracks.filter((t) => {
            const k = trackKey(t);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          if (fresh.length === 0) break;
          acc = [...acc, ...fresh].slice(0, target);
          setResults(acc);
          setFillProgress({ have: acc.length, target });
        }
      }
    } finally {
      setIsLoading(false);
      setFillProgress(null);
    }
  }, [prompt, mode, filters, length, addRecentPrompt, currentDraftId, setGenerationContext]);

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

        {/* Playlist length — longer targets fill across paced passes */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-[0.15em] text-secondary font-semibold">
            Length
          </span>
          <div className="inline-flex rounded-full bg-surface-container/60 border border-white/10 p-1">
            {(["1h", "2h", "3h"] as const).map((L) => (
              <button
                key={L}
                type="button"
                onClick={() => setLength(L)}
                disabled={isLoading || fillProgress !== null}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all disabled:opacity-50 ${
                  length === L
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                {L === "1h" ? "~1 hr" : L === "2h" ? "~2 hrs" : "~3 hrs"}
              </button>
            ))}
          </div>
          {length !== "1h" && (
            <span className="text-xs text-on-surface-variant/60">
              builds in a few paced passes · uses more of the daily Spotify quota
            </span>
          )}
        </div>
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
          {fillProgress && (
            <div className="mb-4 flex items-center gap-3 bg-surface-container/60 border border-primary/20 rounded-2xl px-5 py-3 animate-fade-in">
              <Icon name="refresh" size="sm" className="text-primary shrink-0 animate-spin" />
              <p className="text-sm text-on-surface-variant">
                Building your playlist…{" "}
                <span className="font-bold text-on-surface">
                  {fillProgress.have}/{fillProgress.target}
                </span>{" "}
                tracks — pacing between passes to respect Spotify&apos;s rate limit.
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
