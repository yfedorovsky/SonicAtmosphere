"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";

export function CurrentDraftPanel() {
  const router = useRouter();
  const { currentDraft, removeTrack, totalDuration, trackCount } = usePlaylistStore();
  const count = trackCount();

  if (count === 0) return null;

  return (
    <aside className="w-64 sticky top-28 space-y-4 animate-slide-in-right">
      <div className="flex items-center justify-between">
        <h3 className="font-headline text-sm font-bold uppercase tracking-wider text-on-surface-variant">
          Current Draft
        </h3>
        <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">
          {count} tracks
        </span>
      </div>

      <div className="space-y-1.5 max-h-[400px] overflow-y-auto custom-scrollbar">
        {currentDraft.tracks.map((track, i) => (
          <div
            key={track.id}
            className="flex items-center gap-3 p-2 rounded-lg bg-surface-container/40 hover:bg-surface-container/60 group transition-colors duration-200 animate-fade-up"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="w-10 h-10 rounded shrink-0 overflow-hidden shadow-sm shadow-black/30">
              {track.album.images[0]?.url ? (
                <img
                  src={track.album.images[0].url}
                  alt={track.album.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
                  <Icon name="music_note" size="sm" className="text-on-surface-variant/40" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{track.name}</p>
              <p className="text-[10px] text-on-surface-variant truncate">
                {track.artists[0]?.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeTrack(track.id)}
              className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all duration-200"
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-white/5 space-y-3">
        <div className="flex justify-between text-xs text-on-surface-variant">
          <span>Total Duration</span>
          <span className="font-bold text-primary tabular-nums">{totalDuration()}</span>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/builder/${currentDraft.id}`)}
          className="w-full py-3 bg-primary text-on-primary rounded-full font-bold text-sm flex items-center justify-center gap-2 active:scale-95 hover:shadow-lg hover:shadow-primary/20 transition-all duration-200"
        >
          <Icon name="bolt" size="sm" />
          <span>Generate Playlist</span>
        </button>
      </div>
    </aside>
  );
}
