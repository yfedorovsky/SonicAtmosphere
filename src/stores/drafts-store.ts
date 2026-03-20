"use client";

import { create } from "zustand";
import type { PlaylistDraft } from "@/types";

const STORAGE_KEY = "sonic-atmosphere-drafts";

function loadFromStorage(): PlaylistDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveToStorage(drafts: PlaylistDraft[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // localStorage full or unavailable
  }
}

interface DraftsStore {
  drafts: PlaylistDraft[];
  recentPrompts: string[];
  isHydrated: boolean;
  hydrate: () => void;
  saveDraft: (draft: PlaylistDraft) => void;
  deleteDraft: (draftId: string) => void;
  getDraft: (draftId: string) => PlaylistDraft | undefined;
  addRecentPrompt: (prompt: string) => void;
}

export const useDraftsStore = create<DraftsStore>((set, get) => ({
  drafts: [],
  recentPrompts: [],
  isHydrated: false,

  hydrate: () => {
    const drafts = loadFromStorage();
    const promptsRaw = typeof window !== "undefined"
      ? localStorage.getItem("sonic-atmosphere-prompts")
      : null;
    const recentPrompts = promptsRaw ? JSON.parse(promptsRaw) : [];
    set({ drafts, recentPrompts, isHydrated: true });
  },

  saveDraft: (draft) => {
    const { drafts } = get();
    const existing = drafts.findIndex((d) => d.id === draft.id);
    let updated: PlaylistDraft[];
    if (existing >= 0) {
      updated = [...drafts];
      updated[existing] = { ...draft, updatedAt: new Date().toISOString() };
    } else {
      updated = [draft, ...drafts];
    }
    saveToStorage(updated);
    set({ drafts: updated });
  },

  deleteDraft: (draftId) => {
    const updated = get().drafts.filter((d) => d.id !== draftId);
    saveToStorage(updated);
    set({ drafts: updated });
  },

  getDraft: (draftId) => {
    return get().drafts.find((d) => d.id === draftId);
  },

  addRecentPrompt: (prompt) => {
    if (!prompt.trim()) return;
    const { recentPrompts } = get();
    const updated = [prompt, ...recentPrompts.filter((p) => p !== prompt)].slice(0, 20);
    if (typeof window !== "undefined") {
      localStorage.setItem("sonic-atmosphere-prompts", JSON.stringify(updated));
    }
    set({ recentPrompts: updated });
  },
}));
