"use client";

import { Icon } from "@/components/ui/icon";
import { formatDuration } from "@/lib/track-parser";
import { usePlaylistStore } from "@/stores/playlist-store";
import type { SpotifyTrack } from "@/types";
import { cn } from "@/lib/utils";

interface TrackResultProps {
  track: SpotifyTrack;
  tags?: string[];
}

export function TrackResult({ track, tags }: TrackResultProps) {
  const { addTrack, hasTrack } = usePlaylistStore();
  const isAdded = hasTrack(track.id);
  const albumArt = track.album.images[0]?.url;

  return (
    <div className="group flex items-center gap-6 p-4 rounded-xl bg-surface-container/30 hover:bg-surface-container/60 transition-all duration-300 border border-white/0 hover:border-white/5 glass-effect">
      {/* Album art */}
      <div className="relative w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-lg overflow-hidden">
        {albumArt ? (
          <img
            src={albumArt}
            alt={track.album.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
            <Icon name="music_note" className="text-on-surface-variant" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Icon name="play_circle" className="text-white" size="xl" />
        </div>
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-headline font-bold text-lg leading-tight truncate">
          {track.name}
        </h4>
        <p className="text-on-surface-variant text-sm font-medium">
          {track.artists.map((a) => a.name).join(", ")}
        </p>
        {tags && tags.length > 0 && (
          <div className="flex gap-3 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-bold tracking-widest uppercase text-primary/80"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Duration + Add button */}
      <div className="flex items-center gap-4 md:gap-6 shrink-0">
        <span className="text-sm text-on-surface-variant/60 tabular-nums hidden sm:block">
          {formatDuration(track.duration_ms)}
        </span>
        <button
          type="button"
          onClick={() => addTrack(track)}
          disabled={isAdded}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90",
            isAdded
              ? "bg-primary/20 text-primary cursor-default"
              : "bg-white/5 text-on-surface-variant hover:bg-primary hover:text-on-primary"
          )}
        >
          <Icon name={isAdded ? "check" : "add"} />
        </button>
      </div>
    </div>
  );
}
