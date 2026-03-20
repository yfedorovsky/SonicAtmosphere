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
    <div className="flex flex-col lg:flex-row gap-10 items-end mb-14">
      {/* Cover art */}
      <div className="relative group shrink-0">
        <div className="absolute -inset-4 bg-primary/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-full" />
        <div className="w-56 h-56 lg:w-72 lg:h-72 rounded-2xl overflow-hidden relative shadow-2xl shadow-black/40">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt="Playlist Cover"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/15 to-secondary-container/15 flex items-center justify-center">
              <Icon name="library_music" className="text-on-surface-variant/15" size="xl" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-5">
            <span className="text-[10px] uppercase tracking-widest text-primary font-bold bg-black/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
              Generated Visual
            </span>
          </div>
        </div>
      </div>

      {/* Playlist info */}
      <div className="flex-1 space-y-3 w-full">
        <div className="space-y-1">
          <span className="text-xs uppercase tracking-[0.2em] text-secondary font-bold">
            Curated Experience
          </span>
          <input
            type="text"
            value={currentDraft.title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full bg-transparent border-none p-0 text-3xl lg:text-5xl font-headline font-extrabold tracking-tight focus:ring-0 focus:outline-none text-on-surface placeholder-on-surface/20"
            placeholder="Name your playlist..."
          />
        </div>
        <textarea
          value={currentDraft.description}
          onChange={(e) => setDescription(e.target.value)}
          className="block w-full bg-transparent border-none p-0 text-on-surface-variant text-base resize-none focus:ring-0 focus:outline-none leading-relaxed"
          placeholder="Add a description that captures the mood of this sonic journey..."
          rows={2}
        />
        <div className="flex items-center gap-6 pt-3">
          <div className="flex items-center gap-2 text-sm">
            <Icon name="timer" className="text-primary" size="sm" />
            <span className="font-bold text-on-surface-variant font-headline tabular-nums">
              {formatTotalDuration(totalMs)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Icon name="queue_music" className="text-primary" size="sm" />
            <span className="font-bold text-on-surface-variant font-headline">
              {count} Tracks
            </span>
          </div>
          {currentDraft.filters?.moods && currentDraft.filters.moods.length > 0 && (
            <div className="flex gap-2">
              {currentDraft.filters.moods.slice(0, 3).map((mood) => (
                <span
                  key={mood}
                  className="px-2.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full"
                >
                  {mood}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
