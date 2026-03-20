"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";
import { cn } from "@/lib/utils";

export function CurrentDraftPanel() {
  const router = useRouter();
  const { currentDraft, removeTrack, totalDuration, trackCount } = usePlaylistStore();
  const count = trackCount();
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-24 right-6 md:right-10 z-[45] animate-fade-up">
      {/* Expanded track list */}
      {expanded && (
        <div className="mb-3 w-80 bg-surface-container/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden animate-scale-in">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider text-on-surface-variant">
              Current Draft
            </h3>
            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">
              {count} tracks
            </span>
          </div>
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2 space-y-1">
            {currentDraft.tracks.map((track, i) => (
              <div
                key={track.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 group transition-colors duration-200"
              >
                <div className="w-9 h-9 rounded shrink-0 overflow-hidden shadow-sm shadow-black/30">
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
          <div className="p-4 border-t border-white/5 space-y-3">
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
        </div>
      )}

      {/* Floating pill button */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-3 px-5 py-3 rounded-full shadow-xl shadow-black/40 transition-all duration-300 hover:scale-105 active:scale-95",
          "bg-primary text-on-primary font-headline font-bold text-sm"
        )}
      >
        <Icon name="queue_music" size="sm" />
        <span>{count} tracks</span>
        <Icon
          name={expanded ? "expand_more" : "expand_less"}
          size="sm"
          className="transition-transform"
        />
      </button>
    </div>
  );
}
