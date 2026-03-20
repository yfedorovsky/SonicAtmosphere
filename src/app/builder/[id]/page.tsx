"use client";

import { useState, useEffect } from "react";
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
  const { getDraft, saveDraft } = useDraftsStore();

  // Load draft from storage if navigating to an existing one
  useEffect(() => {
    if (id && id !== currentDraft.id) {
      const saved = getDraft(id);
      if (saved) {
        loadDraft(saved);
      }
    }
  }, [id, currentDraft.id, getDraft, loadDraft]);

  // Auto-save draft periodically
  useEffect(() => {
    if (currentDraft.tracks.length === 0) return;

    const timer = setTimeout(() => {
      saveDraft(currentDraft);
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentDraft, saveDraft]);

  return (
    <AppShell showExport onExport={() => setShowExport(true)}>
      <div className="max-w-7xl mx-auto py-12">
        <PlaylistHeader />
        <TrackTable />
      </div>
      <ExportModal open={showExport} onClose={() => setShowExport(false)} />
    </AppShell>
  );
}
