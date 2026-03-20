"use client";

import { create } from "zustand";
import type { SpotifyUser } from "@/types";

interface AuthStore {
  isConnected: boolean;
  user: SpotifyUser | null;
  isLoading: boolean;
  setConnected: (user: SpotifyUser) => void;
  setDisconnected: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isConnected: false,
  user: null,
  isLoading: false,

  setConnected: (user) => {
    set({ isConnected: true, user, isLoading: false });
  },

  setDisconnected: () => {
    set({ isConnected: false, user: null, isLoading: false });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },
}));
