"use client";

import { useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { TrackRow } from "./track-row";
import { AddTrackButton } from "./add-track-button";
import { ReplaceWeakestPanel } from "./replace-weakest-panel";
import { ArrangeFlowPanel } from "./arrange-flow-panel";
import { LivingPlaylistPanel } from "./living-playlist-panel";
import { usePlaylistStore, useTemporalStore } from "@/stores/playlist-store";
import { useVibeDrift } from "@/hooks/use-vibe-drift";
import { Icon } from "@/components/ui/icon";

export function TrackTable() {
  const { currentDraft, removeTrack, reorderTracks, toggleTrackLock, setTrackRationales } =
    usePlaylistStore();
  const { undo, redo, pastStates, futureStates } = useTemporalStore((state) => state);
  const { driftScores, outlierIds } = useVibeDrift(currentDraft.tracks);
  const lockedIds = new Set(currentDraft.lockedTrackIds ?? []);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isTraits, setIsTraits] = useState(false);
  const rationales = currentDraft.trackRationales ?? {};
  const unexplained = currentDraft.tracks.filter((t) => !rationales[t.id]);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    reorderTracks(result.source.index, result.destination.index);
  }

  async function handleExplainPicks() {
    if (isExplaining || unexplained.length === 0) return;
    setIsExplaining(true);
    try {
      const res = await fetch("/api/rationale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentDraft.prompt || currentDraft.title,
          tracks: unexplained.map((t) => ({
            id: t.id,
            artist: t.artists.map((a) => a.name).join(", "),
            name: t.name,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rationales) setTrackRationales(data.rationales);
      }
    } catch {
      // Rationales are an enhancement — fail quietly.
    } finally {
      setIsExplaining(false);
    }
  }

  // Deterministic alternative to "Explain picks": each track's measured audio
  // character (no LLM, no Spotify quota). Faithful evidence, not a post-hoc note.
  async function handleTraits() {
    if (isTraits || unexplained.length === 0) return;
    setIsTraits(true);
    try {
      const res = await fetch("/api/rationale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "traits", tracks: unexplained.map((t) => ({ id: t.id })) }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rationales) setTrackRationales(data.rationales);
      }
    } catch {
      // Traits are an enhancement — fail quietly.
    } finally {
      setIsTraits(false);
    }
  }

  if (currentDraft.tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-surface-container-high/30 flex items-center justify-center mb-6">
          <Icon name="queue_music" className="text-on-surface-variant/20" size="xl" />
        </div>
        <h3 className="font-headline text-xl font-bold text-on-surface-variant/60 mb-2">
          No Tracks Yet
        </h3>
        <p className="text-on-surface-variant/40 max-w-sm mb-8">
          Head to the Generator to discover tracks, or import a track list.
        </p>
        <AddTrackButton />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Tracklist header with undo/redo — wraps on narrow screens so the
          action buttons can never force horizontal page scroll */}
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4">
        <h2 className="font-headline text-2xl font-bold">Tracklist</h2>
        <div className="flex flex-wrap items-center gap-2">
          {unexplained.length > 0 && (
            <button
              type="button"
              onClick={handleTraits}
              disabled={isTraits}
              title="Show each track's measured audio traits (energy, acoustic, danceable…) — no AI, just the data"
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-surface-container/60 border border-white/10 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all disabled:opacity-50"
            >
              <Icon
                name={isTraits ? "progress_activity" : "insights"}
                size="sm"
                className={isTraits ? "animate-spin" : undefined}
              />
              {isTraits ? "Reading..." : "Traits"}
            </button>
          )}
          {unexplained.length > 0 && (
            <button
              type="button"
              onClick={handleExplainPicks}
              disabled={isExplaining}
              title="Generate a short 'why this track is here' note for each track"
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-surface-container/60 border border-white/10 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all disabled:opacity-50"
            >
              <Icon
                name={isExplaining ? "progress_activity" : "psychology"}
                size="sm"
                className={isExplaining ? "animate-spin" : undefined}
              />
              {isExplaining ? "Explaining..." : "Explain picks"}
            </button>
          )}
          <ArrangeFlowPanel />
          <ReplaceWeakestPanel driftScores={driftScores} />
          <LivingPlaylistPanel />
          <button
            type="button"
            onClick={() => undo()}
            disabled={pastStates.length === 0}
            className="p-2 rounded-full text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all disabled:opacity-30 disabled:hover:text-on-surface-variant disabled:hover:bg-transparent"
            title="Undo"
          >
            <Icon name="undo" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => redo()}
            disabled={futureStates.length === 0}
            className="p-2 rounded-full text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all disabled:opacity-30 disabled:hover:text-on-surface-variant disabled:hover:bg-transparent"
            title="Redo"
          >
            <Icon name="redo" size="sm" />
          </button>
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_4rem] sm:grid-cols-[3rem_3fr_1fr_5rem] md:grid-cols-[3rem_3fr_2fr_1fr_5rem] gap-2 sm:gap-4 px-3 sm:px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-on-surface-variant/60 font-bold border-b border-white/5">
        <span className="text-center">#</span>
        <span>Title</span>
        <span className="hidden md:block">Album</span>
        <span className="text-right hidden sm:block">
          <Icon name="timer" size="sm" className="inline-block -mt-0.5" />
        </span>
        <span />
      </div>

      {/* Draggable tracks */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="tracks">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-0.5"
            >
              {currentDraft.tracks.map((track, index) => (
                <Draggable key={track.id} draggableId={track.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                    >
                      <TrackRow
                        track={track}
                        index={index}
                        onRemove={() => removeTrack(track.id)}
                        isLocked={lockedIds.has(track.id)}
                        onToggleLock={() => toggleTrackLock(track.id)}
                        rationale={rationales[track.id]}
                        isOutlier={outlierIds.has(track.id)}
                        driftScore={driftScores[track.id]}
                        dragHandleProps={provided.dragHandleProps ?? undefined}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add track CTA */}
      <div className="pt-4">
        <AddTrackButton />
      </div>
    </div>
  );
}
