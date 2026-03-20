"use client";

import { create } from "zustand";
import { temporal, type TemporalState } from "zundo";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { SpotifyTrack, PlaylistDraft } from "@/types";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface PlaylistState {
  currentDraft: PlaylistDraft;
}

interface PlaylistActions {
  initDraft: (prompt?: string) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setCoverUrl: (url: string) => void;
  addTrack: (track: SpotifyTrack) => boolean;
  removeTrack: (trackId: string) => void;
  reorderTracks: (startIndex: number, endIndex: number) => void;
  clearTracks: () => void;
  totalDuration: () => string;
  trackCount: () => number;
  hasTrack: (trackId: string) => boolean;
  loadDraft: (draft: PlaylistDraft) => void;
}

type PlaylistStore = PlaylistState & PlaylistActions;

const createEmptyDraft = (prompt?: string): PlaylistDraft => ({
  id: generateId(),
  title: "",
  description: "",
  tracks: [],
  prompt,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const usePlaylistStore = create<PlaylistStore>()(
  temporal(
    (set, get) => ({
      currentDraft: createEmptyDraft(),

      initDraft: (prompt?: string) => {
        set({ currentDraft: createEmptyDraft(prompt) });
      },

      setTitle: (title) => {
        set((state) => ({
          currentDraft: { ...state.currentDraft, title, updatedAt: new Date().toISOString() },
        }));
      },

      setDescription: (description) => {
        set((state) => ({
          currentDraft: { ...state.currentDraft, description, updatedAt: new Date().toISOString() },
        }));
      },

      setCoverUrl: (coverUrl) => {
        set((state) => ({
          currentDraft: { ...state.currentDraft, coverUrl, updatedAt: new Date().toISOString() },
        }));
      },

      addTrack: (track) => {
        const { currentDraft } = get();
        if (currentDraft.tracks.some((t) => t.id === track.id)) return false;
        set({
          currentDraft: {
            ...currentDraft,
            tracks: [...currentDraft.tracks, track],
            updatedAt: new Date().toISOString(),
          },
        });
        return true;
      },

      removeTrack: (trackId) => {
        set((state) => ({
          currentDraft: {
            ...state.currentDraft,
            tracks: state.currentDraft.tracks.filter((t) => t.id !== trackId),
            updatedAt: new Date().toISOString(),
          },
        }));
      },

      reorderTracks: (startIndex, endIndex) => {
        set((state) => {
          const tracks = [...state.currentDraft.tracks];
          const [removed] = tracks.splice(startIndex, 1);
          tracks.splice(endIndex, 0, removed);
          return {
            currentDraft: { ...state.currentDraft, tracks, updatedAt: new Date().toISOString() },
          };
        });
      },

      clearTracks: () => {
        set((state) => ({
          currentDraft: { ...state.currentDraft, tracks: [], updatedAt: new Date().toISOString() },
        }));
      },

      totalDuration: () => {
        const total = get().currentDraft.tracks.reduce((sum, t) => sum + t.duration_ms, 0);
        return formatDuration(total);
      },

      trackCount: () => get().currentDraft.tracks.length,

      hasTrack: (trackId) => get().currentDraft.tracks.some((t) => t.id === trackId),

      loadDraft: (draft) => {
        set({ currentDraft: draft });
      },
    }),
    {
      // Only track changes to the tracks array for undo/redo (not title/description keystrokes)
      equality: (pastState, currentState) =>
        pastState.currentDraft.tracks === currentState.currentDraft.tracks,
      limit: 50,
    }
  )
);

// Hook for reactive access to undo/redo state
export function useTemporalStore<T>(
  selector: (state: TemporalState<PlaylistState>) => T,
  equality?: (a: T, b: T) => boolean,
) {
  return useStoreWithEqualityFn(usePlaylistStore.temporal, selector, equality);
}
