"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PlaylistHeader } from "@/components/builder/playlist-header";
import { TrackTable } from "@/components/builder/track-table";
import { ExportModal } from "@/components/export/export-modal";
import { usePlaylistStore } from "@/stores/playlist-store";
import { useDraftsStore } from "@/stores/drafts-store";

export default function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [showExport, setShowExport] = useState(false);
  const { currentDraft, loadDraft } = usePlaylistStore();
  const { getDraft, fetchDraft, saveDraft, isHydrated } = useDraftsStore();
  // Serialized form of the draft as last loaded/saved — autosave only fires
  // when the draft actually diverged from it, so merely opening a draft
  // doesn't PUT a possibly stale copy over newer server state.
  const lastSyncedRef = useRef<string | null>(null);

  // Load draft when navigating to an existing one: local list first, then
  // the server (direct link). Waits for hydration so the legacy-draft
  // migration has finished before we conclude a draft doesn't exist.
  useEffect(() => {
    if (!id || id === currentDraft.id || !isHydrated) return;
    const applyLoaded = (draft: typeof currentDraft) => {
      lastSyncedRef.current = JSON.stringify(draft);
      loadDraft(draft);
      // A loaded draft starts its own undo history — stepping "back" into
      // the previously open draft's tracks would corrupt this one.
      usePlaylistStore.temporal.getState().clear();
    };
    const saved = getDraft(id);
    if (saved) {
      applyLoaded(saved);
      return;
    }
    let cancelled = false;
    void fetchDraft(id).then((draft) => {
      if (draft && !cancelled) applyLoaded(draft);
    });
    return () => {
      cancelled = true;
    };
  }, [id, currentDraft.id, isHydrated, getDraft, fetchDraft, loadDraft]);

  // Auto-save when the draft diverges from its last synced state
  useEffect(() => {
    if (currentDraft.tracks.length === 0) return;
    const serialized = JSON.stringify(currentDraft);
    if (serialized === lastSyncedRef.current) return;

    const timer = setTimeout(() => {
      lastSyncedRef.current = serialized;
      saveDraft(currentDraft);
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentDraft, saveDraft]);

  return (
    <AppShell showExport onExport={() => setShowExport(true)}>
      <div className="max-w-7xl mx-auto py-8">
        <div className="animate-fade-up">
          <PlaylistHeader />
        </div>
        <div className="animate-fade-up stagger-3">
          <TrackTable />
        </div>
      </div>
      <ExportModal open={showExport} onClose={() => setShowExport(false)} />
    </AppShell>
  );
}
