"use client";

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { TrackRow } from "./track-row";
import { AddTrackButton } from "./add-track-button";
import { usePlaylistStore } from "@/stores/playlist-store";
import { Icon } from "@/components/ui/icon";

export function TrackTable() {
  const { currentDraft, removeTrack, reorderTracks } = usePlaylistStore();

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    reorderTracks(result.source.index, result.destination.index);
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
      {/* Table header */}
      <div className="grid grid-cols-[3rem_3fr_2fr_1fr_3rem] gap-4 px-6 py-3 text-[11px] uppercase tracking-[0.15em] text-on-surface-variant/60 font-bold border-b border-white/5">
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
