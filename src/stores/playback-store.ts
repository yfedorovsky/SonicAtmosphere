import { create } from "zustand";
import type { SpotifyTrack } from "@/types";

interface PlaybackState {
  currentTrack: SpotifyTrack | null;
  isPlaying: boolean;
  progress: number; // 0-1

  play: (track: SpotifyTrack) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setProgress: (progress: number) => void;
  toggle: (track: SpotifyTrack) => void;
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  progress: 0,

  play: (track) => set({ currentTrack: track, isPlaying: true, progress: 0 }),

  pause: () => set({ isPlaying: false }),

  resume: () => set({ isPlaying: true }),

  stop: () => set({ currentTrack: null, isPlaying: false, progress: 0 }),

  setProgress: (progress) => set({ progress }),

  toggle: (track) => {
    const state = get();
    if (state.currentTrack?.id === track.id) {
      if (state.isPlaying) {
        set({ isPlaying: false });
      } else {
        set({ isPlaying: true });
      }
    } else {
      set({ currentTrack: track, isPlaying: true, progress: 0 });
    }
  },
}));
