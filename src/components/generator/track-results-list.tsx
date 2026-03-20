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
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-headline text-xl font-bold flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            Generating...
          </h3>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-6 p-4 rounded-xl bg-surface-container/30 animate-pulse stagger-${i}`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-surface-container-highest" />
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
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-primary/5 flex items-center justify-center mb-6">
          <Icon name="auto_awesome" className="text-primary/40" size="xl" />
        </div>
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
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-surface-container-high/50 flex items-center justify-center mb-6">
          <Icon name="search_off" className="text-on-surface-variant/30" size="xl" />
        </div>
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
      <div className="flex items-center justify-between mb-6 animate-fade-in">
        <h3 className="font-headline text-xl font-bold">Tailored Suggestions</h3>
        <span className="text-xs uppercase tracking-wider text-on-surface-variant bg-surface-container-high/50 px-3 py-1 rounded-full">
          {tracks.length} Tracks
        </span>
      </div>
      {tracks.map((track, i) => (
        <div
          key={track.id}
          className="animate-fade-up"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <TrackResult track={track} />
        </div>
      ))}
    </div>
  );
}
