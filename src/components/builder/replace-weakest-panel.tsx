"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";
import { cn } from "@/lib/utils";
import type { FilterValues, SpotifyTrack } from "@/types";
import { DEFAULT_FILTERS } from "@/types";

interface ReplaceWeakestPanelProps {
  driftScores: Record<string, number>;
}

type ModifierKey = "lessMainstream" | "moreEnergy" | "calmer" | "moreAcoustic";

const MODIFIERS: { key: ModifierKey; label: string }[] = [
  { key: "lessMainstream", label: "Less mainstream" },
  { key: "moreEnergy", label: "More energy" },
  { key: "calmer", label: "Calmer" },
  { key: "moreAcoustic", label: "More acoustic" },
];

const clamp = (v: number) => Math.min(100, Math.max(0, v));

function applyModifiers(filters: FilterValues, modifiers: Set<ModifierKey>): FilterValues {
  const next = { ...filters };
  if (modifiers.has("lessMainstream")) next.popularity = clamp(next.popularity - 25);
  if (modifiers.has("moreEnergy")) next.energy = clamp(next.energy + 25);
  if (modifiers.has("calmer")) next.energy = clamp(next.energy - 25);
  if (modifiers.has("moreAcoustic")) next.acousticness = clamp(next.acousticness + 25);
  return next;
}

// The editing-loop core: pick the N unlocked tracks that fit the playlist
// worst and swap them for fresh suggestions, keeping locked tracks intact.
export function ReplaceWeakestPanel({ driftScores }: ReplaceWeakestPanelProps) {
  const { currentDraft, replaceTracks } = usePlaylistStore();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(3);
  const [modifiers, setModifiers] = useState<Set<ModifierKey>>(new Set());
  const [isReplacing, setIsReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedIds = new Set(currentDraft.lockedTrackIds ?? []);
  const unlocked = currentDraft.tracks.filter((t) => !lockedIds.has(t.id));
  const maxCount = Math.min(unlocked.length, 10);
  const effectiveCount = Math.min(count, maxCount);

  if (currentDraft.tracks.length === 0) return null;

  function toggleModifier(key: ModifierKey) {
    setModifiers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Energy modifiers are opposites — selecting one clears the other.
        if (key === "moreEnergy") next.delete("calmer");
        if (key === "calmer") next.delete("moreEnergy");
        next.add(key);
      }
      return next;
    });
  }

  // Weakest = highest vibe drift; tracks without audio features fall back to
  // how far their popularity sits from the playlist's average.
  function weakestIds(n: number): string[] {
    const meanPopularity =
      unlocked.reduce((sum, t) => sum + t.popularity, 0) / (unlocked.length || 1);
    return unlocked
      .map((t) => ({
        id: t.id,
        score: driftScores[t.id] ?? Math.abs(t.popularity - meanPopularity) / 100,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((t) => t.id);
  }

  async function handleReplace() {
    if (effectiveCount === 0 || isReplacing) return;
    setIsReplacing(true);
    setError(null);

    try {
      const filters = applyModifiers(currentDraft.filters ?? DEFAULT_FILTERS, modifiers);
      const query =
        currentDraft.prompt ||
        currentDraft.title ||
        unlocked[0]?.artists.map((a) => a.name).join(" ") ||
        "playlist";
      const mode = currentDraft.mode && currentDraft.mode !== "import" ? currentDraft.mode : "vibe";

      const params = new URLSearchParams({
        q: query,
        type: mode,
        energy: String(filters.energy),
        acousticness: String(filters.acousticness),
        popularity: String(filters.popularity),
        danceability: String(filters.danceability),
        valence: String(filters.valence),
        instrumentalness: String(filters.instrumentalness),
        limit: "30",
        draftId: currentDraft.id,
        regen: "1",
      });
      if (filters.moods.length > 0) params.set("moods", filters.moods.join(","));

      const res = await fetch(`/api/spotify/search?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Search failed (${res.status})`);
      }
      const data = await res.json();
      // Degraded = plain-search fallback (AI engine down). Never swap curated
      // tracks for those — keep the draft as-is and tell the user.
      if (data.degraded) {
        throw new Error("AI engine unavailable — kept your tracks. Try again in a minute.");
      }
      const existingIds = new Set(currentDraft.tracks.map((t) => t.id));
      const candidates: SpotifyTrack[] = (data.tracks || []).filter(
        (t: SpotifyTrack) => !existingIds.has(t.id),
      );

      if (candidates.length === 0) {
        throw new Error("No fresh suggestions found — try different modifiers.");
      }

      const replacements = candidates.slice(0, effectiveCount);
      replaceTracks(weakestIds(replacements.length), replacements);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replacement failed. Try again.");
    } finally {
      setIsReplacing(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={unlocked.length === 0}
        title={
          unlocked.length === 0
            ? "All tracks are locked"
            : "Replace the tracks that fit the vibe worst"
        }
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
          open
            ? "bg-primary/15 text-primary"
            : "bg-surface-container/60 border border-white/10 text-on-surface-variant hover:text-primary hover:border-primary/30",
          unlocked.length === 0 && "opacity-40 cursor-not-allowed",
        )}
      >
        <Icon name="autorenew" size="sm" />
        Replace weakest
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 bg-surface-container/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50 animate-fade-in space-y-4">
          {/* Count stepper */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-on-surface-variant">Replace</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCount(Math.max(1, effectiveCount - 1))}
                className="w-8 h-8 rounded-full bg-surface-container-high/60 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
              >
                <Icon name="remove" size="sm" />
              </button>
              <span className="font-headline text-lg font-bold w-6 text-center tabular-nums">
                {effectiveCount}
              </span>
              <button
                type="button"
                onClick={() => setCount(Math.min(maxCount, effectiveCount + 1))}
                className="w-8 h-8 rounded-full bg-surface-container-high/60 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
              >
                <Icon name="add" size="sm" />
              </button>
            </div>
            <span className="text-sm font-semibold text-on-surface-variant">weakest</span>
          </div>

          {/* Modifier chips */}
          <div className="flex flex-wrap gap-2">
            {MODIFIERS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleModifier(m.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  modifiers.has(m.key)
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-surface-container-high/40 text-on-surface-variant border-white/10 hover:border-primary/30",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {lockedIds.size > 0 && (
            <p className="text-xs text-on-surface-variant/70 flex items-center gap-1.5">
              <Icon name="lock" size="sm" className="text-secondary" filled />
              {lockedIds.size} locked {lockedIds.size === 1 ? "track is" : "tracks are"} kept
            </p>
          )}

          {error && <p className="text-xs text-error">{error}</p>}

          <button
            type="button"
            onClick={handleReplace}
            disabled={isReplacing || effectiveCount === 0}
            className="w-full py-2.5 bg-primary text-on-primary rounded-full text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isReplacing ? (
              <>
                <Icon name="progress_activity" size="sm" className="animate-spin" />
                Finding replacements...
              </>
            ) : (
              <>
                <Icon name="autorenew" size="sm" />
                Replace {effectiveCount} {effectiveCount === 1 ? "track" : "tracks"}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
