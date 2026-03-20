"use client";

import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";
import { formatTotalDuration } from "@/lib/track-parser";

export function PlaylistHeader() {
  const { currentDraft, setTitle, setDescription, trackCount } = usePlaylistStore();
  const count = trackCount();
  const totalMs = currentDraft.tracks.reduce((sum, t) => sum + t.duration_ms, 0);
  const coverUrl = currentDraft.coverUrl || currentDraft.tracks[0]?.album.images[0]?.url;

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-end mb-16">
      {/* Cover art */}
      <div className="relative group shrink-0">
        <div className="absolute -inset-4 bg-primary/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <div className="w-64 h-64 lg:w-80 lg:h-80 rounded-2xl overflow-hidden relative shadow-2xl">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt="Playlist Cover"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary-container/20 flex items-center justify-center">
              <Icon name="library_music" className="text-on-surface-variant/20" size="xl" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
            <span className="text-xs uppercase tracking-widest text-primary font-bold">
              Generated Visual
            </span>
          </div>
        </div>
      </div>

      {/* Playlist info */}
      <div className="flex-1 space-y-4 w-full">
        <div className="space-y-1">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary font-bold">
            Curated Experience
          </span>
          <input
            type="text"
            value={currentDraft.title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full bg-transparent border-none p-0 text-4xl lg:text-5xl font-headline font-extrabold tracking-tight focus:ring-0 focus:outline-none text-on-surface placeholder-on-surface/20"
            placeholder="Name your playlist..."
          />
        </div>
        <textarea
          value={currentDraft.description}
          onChange={(e) => setDescription(e.target.value)}
          className="block w-full bg-transparent border-none p-0 text-on-surface-variant text-lg resize-none focus:ring-0 focus:outline-none leading-relaxed"
          placeholder="Add a description that captures the mood of this sonic journey..."
          rows={2}
        />
        <div className="flex items-center gap-6 pt-4">
          <div className="flex items-center gap-2">
            <Icon name="timer" className="text-primary" />
            <span className="text-sm font-bold text-on-surface-variant font-headline">
              {formatTotalDuration(totalMs)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="auto_awesome" className="text-primary" />
            <span className="text-sm font-bold text-on-surface-variant font-headline">
              {count} Tracks
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
