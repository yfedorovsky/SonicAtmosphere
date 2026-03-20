"use client";

import { Icon } from "@/components/ui/icon";
import { formatDuration } from "@/lib/track-parser";
import type { SpotifyTrack } from "@/types";

interface TrackRowProps {
  track: SpotifyTrack;
  index: number;
  onRemove: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: any;
}

export function TrackRow({ track, index, onRemove, dragHandleProps }: TrackRowProps) {
  const albumArt = track.album.images[track.album.images.length - 1]?.url;

  return (
    <div className="grid grid-cols-[3rem_3fr_2fr_1fr_3rem] gap-4 items-center px-6 py-3 rounded-xl hover:bg-white/5 transition-all group cursor-grab active:cursor-grabbing">
      {/* Index / drag handle */}
      <div className="text-center" {...dragHandleProps}>
        <span className="text-on-surface-variant group-hover:hidden">{index + 1}</span>
        <span className="text-primary hidden group-hover:block">
          <Icon name="drag_indicator" size="sm" />
        </span>
      </div>

      {/* Track info */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded-md overflow-hidden shrink-0">
          {albumArt ? (
            <img src={albumArt} alt={track.album.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
              <Icon name="music_note" size="sm" className="text-on-surface-variant/40" />
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-on-surface truncate">{track.name}</span>
          <span className="text-sm text-on-surface-variant truncate">
            {track.artists.map((a) => a.name).join(", ")}
          </span>
        </div>
      </div>

      {/* Album */}
      <span className="text-on-surface-variant text-sm truncate hidden md:block">
        {track.album.name}
      </span>

      {/* Duration */}
      <span className="text-right text-on-surface-variant text-sm font-headline hidden sm:block">
        {formatDuration(track.duration_ms)}
      </span>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="flex justify-center text-on-surface-variant hover:text-error transition-colors"
      >
        <Icon name="close" size="sm" />
      </button>
    </div>
  );
}
