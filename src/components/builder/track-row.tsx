"use client";

import { Icon } from "@/components/ui/icon";
import { formatDuration } from "@/lib/track-parser";
import { usePlaybackStore } from "@/stores/playback-store";
import { cn } from "@/lib/utils";
import type { SpotifyTrack } from "@/types";

interface TrackRowProps {
  track: SpotifyTrack;
  index: number;
  onRemove: () => void;
  isOutlier?: boolean;
  driftScore?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: any;
}

export function TrackRow({ track, index, onRemove, isOutlier, driftScore, dragHandleProps }: TrackRowProps) {
  const albumArt = track.album.images[track.album.images.length - 1]?.url;
  const { currentTrack, isPlaying, toggle } = usePlaybackStore();
  const isCurrentlyPlaying = currentTrack?.id === track.id && isPlaying;
  const hasPreview = !!track.preview_url;

  return (
    <div className={cn(
      "grid grid-cols-[3rem_3fr_2fr_1fr_3rem] gap-4 items-center px-6 py-3 rounded-xl transition-all duration-200 group cursor-grab active:cursor-grabbing",
      isCurrentlyPlaying ? "bg-primary/5" : isOutlier ? "bg-tertiary/5 border border-tertiary/15" : "hover:bg-white/5"
    )}>
      {/* Index / play / drag handle */}
      <div className="text-center" {...dragHandleProps}>
        {hasPreview ? (
          <>
            <span className={cn(
              "group-hover:hidden",
              isCurrentlyPlaying ? "hidden" : "block"
            )}>
              <span className="text-on-surface-variant">{index + 1}</span>
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(track); }}
              className={cn(
                "text-primary group-hover:block",
                isCurrentlyPlaying ? "block" : "hidden"
              )}
            >
              <Icon name={isCurrentlyPlaying ? "pause" : "play_arrow"} size="sm" filled />
            </button>
          </>
        ) : (
          <>
            <span className="text-on-surface-variant group-hover:hidden">{index + 1}</span>
            <span className="text-primary hidden group-hover:block">
              <Icon name="drag_indicator" size="sm" />
            </span>
          </>
        )}
      </div>

      {/* Track info */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 shadow-sm shadow-black/20">
          {albumArt ? (
            <img src={albumArt} alt={track.album.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
              <Icon name="music_note" size="sm" className="text-on-surface-variant/40" />
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className={cn(
            "font-bold truncate transition-colors duration-200",
            isCurrentlyPlaying ? "text-primary" : "text-on-surface"
          )}>
            {track.name}
          </span>
          <span className="text-sm text-on-surface-variant truncate">
            {track.artists.map((a) => a.name).join(", ")}
          </span>
          {isOutlier && (
            <span className="text-[10px] text-tertiary flex items-center gap-1 mt-0.5" title={`Vibe drift: ${Math.round((driftScore || 0) * 100)}%`}>
              <Icon name="warning" size="sm" className="text-tertiary" />
              Vibe breaker
            </span>
          )}
        </div>
      </div>

      {/* Album */}
      <span className="text-on-surface-variant text-sm truncate hidden md:block">
        {track.album.name}
      </span>

      {/* Duration */}
      <span className="text-right text-on-surface-variant text-sm font-headline hidden sm:block tabular-nums">
        {formatDuration(track.duration_ms)}
      </span>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="flex justify-center text-on-surface-variant/40 hover:text-error transition-colors duration-200"
      >
        <Icon name="close" size="sm" />
      </button>
    </div>
  );
}
