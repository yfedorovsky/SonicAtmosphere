"use client";

import { create } from "zustand";
import type { PlaylistDraft } from "@/types";

// Legacy localStorage keys from before server persistence. Local data is
// migrated to the server once, then left in place as a backup.
const LEGACY_DRAFTS_KEY = "sonic-atmosphere-drafts";
const LEGACY_PROMPTS_KEY = "sonic-atmosphere-prompts";
const MIGRATED_KEY = "sonic-atmosphere-migrated";

function readLegacy<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
}

async function migrateLegacyDrafts(): Promise<void> {
  if (typeof window === "undefined" || localStorage.getItem(MIGRATED_KEY)) return;
  const legacy = readLegacy<PlaylistDraft[]>(LEGACY_DRAFTS_KEY);
  if (legacy && legacy.length > 0) {
    for (const draft of legacy) {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draft.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) continue;
      // Permanent rejections (invalid legacy payload, id owned by another
      // user) will never succeed — skip them. Anything else (rate limit,
      // server error) aborts; the next load retries, and already-migrated
      // drafts just re-upsert harmlessly.
      if ([400, 403, 404, 409].includes(res.status)) continue;
      throw new Error(`Migration failed with ${res.status}`);
    }
  }
  try {
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // localStorage unavailable — migration will re-run and upsert harmlessly
  }
}

// Serialize PUTs per draft so a slow earlier save can't overwrite a newer one.
const putQueues = new Map<string, Promise<void>>();

function queueDraftPut(draft: PlaylistDraft): void {
  const prev = putQueues.get(draft.id) ?? Promise.resolve();
  const next = prev.then(() =>
    fetch(`/api/drafts/${encodeURIComponent(draft.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).then(
      (res) => {
        if (!res.ok) console.error(`Failed to save draft (${res.status})`);
      },
      (err) => console.error("Failed to save draft:", err),
    ),
  );
  putQueues.set(draft.id, next);
  void next.finally(() => {
    if (putQueues.get(draft.id) === next) putQueues.delete(draft.id);
  });
}

interface DraftsStore {
  drafts: PlaylistDraft[];
  recentPrompts: string[];
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  saveDraft: (draft: PlaylistDraft) => void;
  deleteDraft: (draftId: string) => void;
  getDraft: (draftId: string) => PlaylistDraft | undefined;
  fetchDraft: (draftId: string) => Promise<PlaylistDraft | null>;
  addRecentPrompt: (prompt: string) => void;
}

let hydrating: Promise<void> | null = null;

export const useDraftsStore = create<DraftsStore>((set, get) => ({
  drafts: [],
  recentPrompts: [],
  isHydrated: false,

  hydrate: () => {
    if (get().isHydrated) return Promise.resolve();
    if (hydrating) return hydrating;
    hydrating = (async () => {
      try {
        await migrateLegacyDrafts().catch((err) =>
          console.error("Draft migration failed, will retry next load:", err),
        );

        const [draftsRes, promptsRes] = await Promise.all([
          fetch("/api/drafts"),
          fetch("/api/prompts/recent"),
        ]);
        // A failing drafts endpoint is an outage, not an empty library —
        // fall through to the legacy-data path below.
        if (!draftsRes.ok) throw new Error(`Drafts fetch failed (${draftsRes.status})`);
        const draftsData = await draftsRes.json();
        const promptsData = promptsRes.ok ? await promptsRes.json() : { prompts: [] };

        // Server history first, topped up with any pre-migration local prompts.
        const legacyPrompts = readLegacy<string[]>(LEGACY_PROMPTS_KEY) ?? [];
        const recentPrompts = [...new Set([...promptsData.prompts, ...legacyPrompts])].slice(0, 20);

        set({ drafts: draftsData.drafts, recentPrompts, isHydrated: true });
      } catch (err) {
        console.error("Failed to load drafts from server:", err);
        // Offline fallback: show legacy local data rather than nothing.
        set({
          drafts: readLegacy<PlaylistDraft[]>(LEGACY_DRAFTS_KEY) ?? [],
          recentPrompts: readLegacy<string[]>(LEGACY_PROMPTS_KEY) ?? [],
          isHydrated: true,
        });
      } finally {
        hydrating = null;
      }
    })();
    return hydrating;
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
    set({ drafts: updated });
    queueDraftPut(draft);
  },

  deleteDraft: (draftId) => {
    set({ drafts: get().drafts.filter((d) => d.id !== draftId) });
    void fetch(`/api/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" }).then(
      (res) => {
        if (!res.ok && res.status !== 404) console.error(`Failed to delete draft (${res.status})`);
      },
      (err) => console.error("Failed to delete draft:", err),
    );
  },

  getDraft: (draftId) => {
    return get().drafts.find((d) => d.id === draftId);
  },

  // Server fetch for drafts not in the local list (direct link, fresh tab
  // racing hydration). Merges the result into the list.
  fetchDraft: async (draftId) => {
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}`);
      if (!res.ok) return null;
      const { draft } = (await res.json()) as { draft: PlaylistDraft };
      const { drafts } = get();
      set({
        drafts: drafts.some((d) => d.id === draft.id)
          ? drafts.map((d) => (d.id === draft.id ? draft : d))
          : [draft, ...drafts],
      });
      return draft;
    } catch {
      return null;
    }
  },

  addRecentPrompt: (prompt) => {
    if (!prompt.trim()) return;
    const { recentPrompts } = get();
    // Optimistic only — the server derives prompt history from generation runs.
    const updated = [prompt, ...recentPrompts.filter((p) => p !== prompt)].slice(0, 20);
    set({ recentPrompts: updated });
  },
}));
