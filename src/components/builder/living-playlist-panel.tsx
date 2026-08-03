"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";
import { cn } from "@/lib/utils";
import type { SpotifyTrack } from "@/types";

type Cadence = "off" | "daily" | "weekly";

// Sprint 3 retention controls: auto-refresh rules ("keep 60%, rotate the
// rest"), manual refresh, and saving the draft's recipe as a template.
export function LivingPlaylistPanel() {
  const { currentDraft, setTracks } = usePlaylistStore();
  const [open, setOpen] = useState(false);
  const [cadence, setCadence] = useState<Cadence>("off");
  const [keepPercent, setKeepPercent] = useState(60);
  const [varyArtists, setVaryArtists] = useState(false);
  const [ruleLoaded, setRuleLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [preview, setPreview] = useState<{
    proposedTracks: SpotifyTrack[];
    removedIds: string[];
    addedIds: string[];
    replaced: number;
  } | null>(null);
  const [templateState, setTemplateState] = useState<"idle" | "saving" | "saved">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const draftId = currentDraft.id;

  useEffect(() => {
    if (!open || ruleLoaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/refresh-rule`);
        if (!res.ok || cancelled) return;
        const { rule } = await res.json();
        if (rule && !cancelled) {
          setCadence(rule.enabled ? rule.cadence : "off");
          setKeepPercent(rule.keepPercent);
          setVaryArtists(rule.artistRepeatWindow != null);
        }
      } finally {
        if (!cancelled) setRuleLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ruleLoaded, draftId]);

  async function persistRule(next: { cadence: Cadence; keepPercent: number; varyArtists: boolean }) {
    setMessage(null);
    try {
      if (next.cadence === "off") {
        await fetch(`/api/drafts/${encodeURIComponent(draftId)}/refresh-rule`, {
          method: "DELETE",
        });
        return;
      }
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/refresh-rule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadence: next.cadence,
          keepPercent: next.keepPercent,
          artistRepeatWindow: next.varyArtists ? 4 : null,
        }),
      });
      if (!res.ok) setMessage("Couldn't save the schedule. Try again.");
    } catch {
      setMessage("Couldn't save the schedule. Try again.");
    }
  }

  function update(partial: Partial<{ cadence: Cadence; keepPercent: number; varyArtists: boolean }>) {
    const next = {
      cadence: partial.cadence ?? cadence,
      keepPercent: partial.keepPercent ?? keepPercent,
      varyArtists: partial.varyArtists ?? varyArtists,
    };
    setCadence(next.cadence);
    setKeepPercent(next.keepPercent);
    setVaryArtists(next.varyArtists);
    void persistRule(next);
  }

  // "Refresh now" is a PREVIEW: compute the change-set server-side without
  // mutating, and show it for review. Nothing changes until the user applies.
  async function handlePreviewRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setMessage(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/refresh?preview=1`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Refresh failed. Try again.");
        return;
      }
      if (Array.isArray(data?.proposedTracks) && data.replaced > 0) {
        setPreview({
          proposedTracks: data.proposedTracks,
          removedIds: data.removedIds ?? [],
          addedIds: data.addedIds ?? [],
          replaced: data.replaced,
        });
      } else {
        setMessage("Nothing to rotate right now.");
      }
    } catch {
      setMessage("Refresh failed. Try again.");
    } finally {
      setIsRefreshing(false);
    }
  }

  // Apply the proposed change-set as a single undo step — revertible, unlike
  // the old reload-and-wipe-history flow.
  function handleApplyPreview() {
    if (!preview) return;
    setTracks(preview.proposedTracks);
    setMessage(
      `Rotated ${preview.replaced} ${preview.replaced === 1 ? "track" : "tracks"} — undo to revert.`,
    );
    setPreview(null);
  }

  async function handleSaveTemplate() {
    if (templateState === "saving") return;
    setTemplateState("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentDraft.title || currentDraft.prompt || "Untitled template",
          prompt: currentDraft.prompt,
          mode: currentDraft.mode,
          filters: currentDraft.filters,
        }),
      });
      setTemplateState(res.ok ? "saved" : "idle");
      if (!res.ok) setMessage("Couldn't save template.");
    } catch {
      setTemplateState("idle");
      setMessage("Couldn't save template.");
    }
  }

  if (currentDraft.tracks.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Auto-refresh schedule and template"
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
          open || cadence !== "off"
            ? "bg-secondary/15 text-secondary"
            : "bg-surface-container/60 border border-white/10 text-on-surface-variant hover:text-secondary hover:border-secondary/30",
        )}
      >
        <Icon name="update" size="sm" />
        Living playlist
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 bg-surface-container/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50 animate-fade-in space-y-4">
          {/* Cadence */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 font-bold">
              Auto-refresh
            </span>
            <div className="flex gap-2">
              {(["off", "daily", "weekly"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update({ cadence: c })}
                  className={cn(
                    "flex-1 py-1.5 rounded-full text-xs font-semibold border capitalize transition-all",
                    cadence === c
                      ? "bg-secondary/15 text-secondary border-secondary/40"
                      : "bg-surface-container-high/40 text-on-surface-variant border-white/10 hover:border-secondary/30",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {cadence !== "off" && (
            <>
              {/* Keep percent */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-on-surface-variant">Keep</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => update({ keepPercent: Math.max(10, keepPercent - 10) })}
                    className="w-8 h-8 rounded-full bg-surface-container-high/60 flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors"
                  >
                    <Icon name="remove" size="sm" />
                  </button>
                  <span className="font-headline text-lg font-bold w-12 text-center tabular-nums">
                    {keepPercent}%
                  </span>
                  <button
                    type="button"
                    onClick={() => update({ keepPercent: Math.min(90, keepPercent + 10) })}
                    className="w-8 h-8 rounded-full bg-surface-container-high/60 flex items-center justify-center text-on-surface-variant hover:text-secondary transition-colors"
                  >
                    <Icon name="add" size="sm" />
                  </button>
                </div>
                <span className="text-sm font-semibold text-on-surface-variant">rotate rest</span>
              </div>

              {/* Artist variety */}
              <button
                type="button"
                onClick={() => update({ varyArtists: !varyArtists })}
                className="w-full flex items-center justify-between text-sm text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span>Avoid artist repeats nearby</span>
                <Icon
                  name={varyArtists ? "toggle_on" : "toggle_off"}
                  className={varyArtists ? "text-secondary" : "text-on-surface-variant/40"}
                  filled
                />
              </button>

              <p className="text-xs text-on-surface-variant/60">
                Locked tracks always survive a refresh.
              </p>
            </>
          )}

          {message && <p className="text-xs text-on-surface-variant">{message}</p>}

          {preview ? (
            <div className="space-y-2 rounded-xl border border-secondary/30 bg-secondary/5 p-3">
              <p className="text-sm font-bold text-secondary flex items-center gap-1.5">
                <Icon name="swap_horiz" size="sm" />
                {preview.addedIds.length} in · {preview.removedIds.length} out
              </p>
              {preview.addedIds.length > 0 && (
                <p className="text-xs text-on-surface-variant/80 leading-relaxed">
                  Adding:{" "}
                  {preview.proposedTracks
                    .filter((t) => preview.addedIds.includes(t.id))
                    .slice(0, 4)
                    .map((t) => t.name)
                    .join(", ")}
                  {preview.addedIds.length > 4 ? "…" : ""}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleApplyPreview}
                  className="flex-1 py-2 bg-secondary text-on-primary rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="flex-1 py-2 bg-surface-container-high/60 text-on-surface rounded-full text-sm font-bold hover:bg-surface-container-high transition-colors"
                >
                  Discard
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant/50">
                Nothing changes until you Apply — and Apply is one undo step.
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePreviewRefresh}
                disabled={isRefreshing}
                className="flex-1 py-2.5 bg-secondary/90 text-on-primary rounded-full text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Icon
                  name={isRefreshing ? "progress_activity" : "refresh"}
                  size="sm"
                  className={isRefreshing ? "animate-spin" : undefined}
                />
                {isRefreshing ? "Checking..." : "Preview refresh"}
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={templateState !== "idle"}
                title="Save this draft's prompt, mode, and filters as a reusable template"
                className="flex-1 py-2.5 bg-surface-container-high/60 text-on-surface rounded-full text-sm font-bold flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors disabled:opacity-70"
              >
                <Icon name={templateState === "saved" ? "check" : "bookmark_add"} size="sm" />
                {templateState === "saved" ? "Saved" : templateState === "saving" ? "Saving..." : "Template"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
