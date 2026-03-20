"use client";

import { TrackResult } from "./track-result";
import { Icon } from "@/components/ui/icon";
import type { SpotifyTrack } from "@/types";

interface TrackResultsListProps {
  tracks: SpotifyTrack[];
  isLoading?: boolean;
  hasSearched?: boolean;
}

export function TrackResultsList({
  tracks,
  isLoading = false,
  hasSearched = false,
}: TrackResultsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-headline text-xl font-bold">Generating...</h3>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-6 p-4 rounded-xl bg-surface-container/30 animate-pulse"
          >
            <div className="w-20 h-20 rounded-lg bg-surface-container-highest" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-48 bg-surface-container-highest rounded" />
              <div className="h-4 w-32 bg-surface-container-highest rounded" />
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-highest" />
          </div>
        ))}
      </div>
    );
  }

  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Icon name="auto_awesome" className="text-primary/30 mb-4" size="xl" />
        <h3 className="font-headline text-xl font-bold text-on-surface-variant/60 mb-2">
          Ready to Generate
        </h3>
        <p className="text-on-surface-variant/40 max-w-sm">
          Enter a vibe, song, or artist above to discover your next favorite tracks.
        </p>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Icon name="search_off" className="text-on-surface-variant/30 mb-4" size="xl" />
        <h3 className="font-headline text-xl font-bold text-on-surface-variant/60 mb-2">
          No Results Found
        </h3>
        <p className="text-on-surface-variant/40 max-w-sm">
          Try adjusting your prompt or filters for different results.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-headline text-xl font-bold">Tailored Suggestions</h3>
        <span className="text-xs uppercase tracking-wider text-on-surface-variant">
          {tracks.length} Tracks Found
        </span>
      </div>
      {tracks.map((track) => (
        <TrackResult key={track.id} track={track} />
      ))}
    </div>
  );
}
