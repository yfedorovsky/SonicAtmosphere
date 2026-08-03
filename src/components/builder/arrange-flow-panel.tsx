"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";
import { cn } from "@/lib/utils";

type FlowMode = "smooth" | "arc";

const MODES: { key: FlowMode; label: string; blurb: string; icon: string }[] = [
  {
    key: "smooth",
    label: "Smooth",
    blurb: "Every hand-off as seamless as possible — key, tempo and energy glide.",
    icon: "graphic_eq",
  },
  {
    key: "arc",
    label: "Party arc",
    blurb: "Mellow open → build to a peak → cool-down finish. Best for parties.",
    icon: "trending_up",
  },
];

const MIN_TRACKS = 5;

// "Arrange for flow" (DJ mode): reorder the playlist so adjacent tracks
// transition well. Backed by /api/sequence (harmonic + tempo + energy), which
// spends no Spotify quota. Pairs with the listener turning on Spotify crossfade.
export function ArrangeFlowPanel() {
  const { currentDraft, setTrackOrder } = usePlaylistStore();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FlowMode>("smooth");
  const [isArranging, setIsArranging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const count = currentDraft.tracks.length;
  const canArrange = count >= MIN_TRACKS;

  if (count === 0) return null;

  async function handleArrange() {
    if (isArranging || !canArrange) return;
    setIsArranging(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          tracks: currentDraft.tracks.map((t) => ({ id: t.id, tempo: t.tempo })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Arrange failed (${res.status})`);
      }
      const data = await res.json();
      const order: string[] = Array.isArray(data.order) ? data.order : [];
      if (order.length === 0) throw new Error("Couldn't arrange — not enough track data.");
      if (data.changed === false) {
        setNote("Already flowing well — no change needed.");
      } else {
        setTrackOrder(order);
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arrange failed. Try again.");
    } finally {
      setIsArranging(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={!canArrange}
        title={
          canArrange
            ? "Reorder the playlist so tracks flow into each other"
            : `Add at least ${MIN_TRACKS} tracks to arrange`
        }
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
          open
            ? "bg-primary/15 text-primary"
            : "bg-surface-container/60 border border-white/10 text-on-surface-variant hover:text-primary hover:border-primary/30",
          !canArrange && "opacity-40 cursor-not-allowed",
        )}
      >
        <Icon name="graphic_eq" size="sm" />
        Arrange for flow
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 bg-surface-container/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50 animate-fade-in space-y-4">
          {/* Mode picker */}
          <div className="space-y-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all flex gap-3 items-start",
                  mode === m.key
                    ? "bg-primary/10 border-primary/40"
                    : "bg-surface-container-high/40 border-white/10 hover:border-primary/30",
                )}
              >
                <Icon
                  name={m.icon}
                  size="sm"
                  className={cn("mt-0.5", mode === m.key ? "text-primary" : "text-on-surface-variant")}
                />
                <span>
                  <span
                    className={cn(
                      "block text-sm font-bold",
                      mode === m.key ? "text-primary" : "text-on-surface",
                    )}
                  >
                    {m.label}
                  </span>
                  <span className="block text-xs text-on-surface-variant/70 mt-0.5">{m.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Crossfade tip — the actual fade is a listener-side Spotify setting */}
          <p className="text-xs text-on-surface-variant/70 flex items-start gap-1.5 leading-relaxed">
            <Icon name="tips_and_updates" size="sm" className="text-secondary mt-0.5 shrink-0" filled />
            <span>
              For real fades, turn on <span className="font-semibold">Crossfade</span> in Spotify →
              Settings → Playback.
            </span>
          </p>

          {error && <p className="text-xs text-error">{error}</p>}
          {note && <p className="text-xs text-on-surface-variant">{note}</p>}

          <button
            type="button"
            onClick={handleArrange}
            disabled={isArranging}
            className="w-full py-2.5 bg-primary text-on-primary rounded-full text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isArranging ? (
              <>
                <Icon name="progress_activity" size="sm" className="animate-spin" />
                Arranging...
              </>
            ) : (
              <>
                <Icon name="graphic_eq" size="sm" />
                Arrange {count} {count === 1 ? "track" : "tracks"}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
