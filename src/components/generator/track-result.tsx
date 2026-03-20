"use client";

import { Icon } from "@/components/ui/icon";
import { formatDuration } from "@/lib/track-parser";
import { usePlaylistStore } from "@/stores/playlist-store";
import { usePlaybackStore } from "@/stores/playback-store";
import type { SpotifyTrack } from "@/types";
import { cn } from "@/lib/utils";

interface TrackResultProps {
  track: SpotifyTrack;
  tags?: string[];
  viewMode?: "grid" | "list";
}

export function TrackResult({ track, tags, viewMode = "grid" }: TrackResultProps) {
  const { addTrack, hasTrack } = usePlaylistStore();
  const { currentTrack, isPlaying, toggle } = usePlaybackStore();
  const isAdded = hasTrack(track.id);
  const albumArt = track.album.images[0]?.url;
  const isCurrentlyPlaying = currentTrack?.id === track.id && isPlaying;
  const hasPreview = !!track.preview_url;

  if (viewMode === "grid") {
    return (
      <div className={cn(
        "group relative bg-surface-container-low/60 rounded-2xl p-4 transition-all duration-500 overflow-hidden",
        isCurrentlyPlaying
          ? "bg-primary/5 ring-1 ring-primary/20"
          : "hover:bg-surface-container-high/80"
      )}>
        {/* Album art */}
        <div className="relative aspect-square overflow-hidden rounded-xl mb-4">
          {albumArt ? (
            <img
              src={albumArt}
              alt={track.album.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
              <Icon name="music_note" className="text-on-surface-variant/40" size="xl" />
            </div>
          )}
          <div className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity duration-300",
            isCurrentlyPlaying ? "bg-black/50 opacity-100" : "bg-black/40 opacity-0 group-hover:opacity-100"
          )}>
            {hasPreview ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(track); }}
                className="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-500 shadow-xl"
              >
                <Icon
                  name={isCurrentlyPlaying ? "pause" : "play_arrow"}
                  className="text-3xl"
                  filled
                />
              </button>
            ) : (
              <Icon name="play_circle" className="text-white/50 drop-shadow-lg text-4xl" />
            )}
          </div>
        </div>

        {/* Track info */}
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0 pr-3">
            <h4 className={cn(
              "font-headline font-bold text-sm leading-tight truncate transition-colors duration-200",
              isCurrentlyPlaying ? "text-primary" : "text-on-surface group-hover:text-primary"
            )}>
              {track.name}
            </h4>
            <p className="text-xs text-on-surface-variant truncate mt-0.5">
              {track.artists.map((a) => a.name).join(", ")}
            </p>
            {tags && tags.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-primary/20 text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => addTrack(track)}
            disabled={isAdded}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 active:scale-90",
              isAdded
                ? "bg-primary/20 text-primary cursor-default"
                : "bg-surface-container-highest/60 text-on-surface-variant hover:bg-primary hover:text-on-primary"
            )}
          >
            <Icon name={isAdded ? "check" : "add"} />
          </button>
        </div>
      </div>
    );
  }

  // List view (original layout)
  return (
    <div className={cn(
      "group flex items-center gap-6 p-4 rounded-xl transition-all duration-300 border border-transparent",
      isCurrentlyPlaying
        ? "bg-primary/5 border-primary/15"
        : "bg-surface-container/30 hover:bg-surface-container/60 hover:border-white/5"
    )}>
      {/* Album art */}
      <div className="relative w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-lg overflow-hidden shadow-md shadow-black/30">
        {albumArt ? (
          <img
            src={albumArt}
            alt={track.album.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
            <Icon name="music_note" className="text-on-surface-variant/40" />
          </div>
        )}
        {hasPreview && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(track); }}
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
              isCurrentlyPlaying ? "bg-black/50 opacity-100" : "bg-black/40 opacity-0 group-hover:opacity-100"
            )}
          >
            <Icon
              name={isCurrentlyPlaying ? "pause" : "play_arrow"}
              className="text-white drop-shadow-lg"
              size="lg"
              filled
            />
          </button>
        )}
        {!hasPreview && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Icon name="play_circle" className="text-white/50 drop-shadow-lg" size="lg" />
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <h4 className={cn(
          "font-headline font-bold text-base leading-tight truncate transition-colors duration-200",
          isCurrentlyPlaying ? "text-primary" : "group-hover:text-primary"
        )}>
          {track.name}
        </h4>
        <p className="text-on-surface-variant text-sm">
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
            "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90",
            isAdded
              ? "bg-primary/20 text-primary cursor-default"
              : "bg-white/5 text-on-surface-variant hover:bg-primary hover:text-on-primary hover:shadow-lg hover:shadow-primary/20"
          )}
        >
          <Icon name={isAdded ? "check" : "add"} />
        </button>
      </div>
    </div>
  );
}
