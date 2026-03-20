"use client";

import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { formatTotalDuration } from "@/lib/track-parser";

export function PlaylistHeader() {
  const { currentDraft, setTitle, setDescription, trackCount } = usePlaylistStore();
  const { toggle } = usePlaybackStore();
  const count = trackCount();
  const totalMs = currentDraft.tracks.reduce((sum, t) => sum + t.duration_ms, 0);
  const coverUrl = currentDraft.coverUrl || currentDraft.tracks[0]?.album.images[0]?.url;
  const firstTrack = currentDraft.tracks[0];

  return (
    <section className="relative -mx-6 md:-mx-10 -mt-20 pt-20 overflow-hidden">
      {/* Blurred background */}
      <div className="absolute inset-0 z-0">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="w-full h-full object-cover scale-110 blur-3xl opacity-40"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-primary/10 to-transparent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      {/* Hero content */}
      <div className="relative z-10 flex flex-col md:flex-row items-end gap-10 px-6 md:px-12 pb-16 pt-24 min-h-[420px]">
        {/* Large artwork */}
        <div className="relative group shrink-0">
          <div className="w-56 h-56 lg:w-64 lg:h-64 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 transition-transform duration-700 group-hover:scale-105">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Playlist Artwork"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/15 to-secondary-container/15 flex items-center justify-center">
                <Icon name="library_music" className="text-on-surface-variant/15" size="xl" />
              </div>
            )}
          </div>
          {firstTrack && (
            <button
              type="button"
              onClick={() => toggle(firstTrack)}
              className="absolute -bottom-4 -right-4 bg-primary text-on-primary p-4 rounded-full shadow-xl hover:scale-110 active:scale-95 transition-all duration-200"
            >
              <Icon name="play_arrow" filled className="text-2xl" />
            </button>
          )}
        </div>

        {/* Glass info panel */}
        <div className="flex-1 max-w-2xl bg-surface-container/40 backdrop-blur-xl p-8 rounded-2xl border border-outline-variant/10 shadow-[0_0_64px_rgba(0,0,0,0.5)]">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-secondary mb-2 block">
            Curation In Progress
          </span>
          <input
            type="text"
            value={currentDraft.title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full bg-transparent border-none p-0 text-3xl lg:text-5xl font-headline font-extrabold tracking-tight focus:ring-0 focus:outline-none text-on-surface placeholder-on-surface/20 leading-tight"
            placeholder="Name your playlist..."
          />
          <textarea
            value={currentDraft.description}
            onChange={(e) => setDescription(e.target.value)}
            className="block w-full bg-transparent border-none p-0 mt-4 text-on-surface-variant text-base resize-none focus:ring-0 focus:outline-none leading-relaxed placeholder:text-on-surface-variant/40"
            placeholder="Add a description that captures the mood of this sonic journey..."
            rows={2}
          />
          <div className="flex items-center gap-4 mt-6 flex-wrap">
            {currentDraft.filters?.moods && currentDraft.filters.moods.length > 0 && (
              <>
                {currentDraft.filters.moods.slice(0, 3).map((mood) => (
                  <span
                    key={mood}
                    className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                  >
                    {mood}
                  </span>
                ))}
              </>
            )}
            <span className="text-on-surface-variant text-sm ml-auto">
              {count} tracks &bull; {formatTotalDuration(totalMs)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
