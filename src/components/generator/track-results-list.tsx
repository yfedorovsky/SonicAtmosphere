"use client";

import { useState } from "react";
import { TrackResult } from "./track-result";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-headline text-xl font-bold flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            Generating...
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-surface-container-low/60 rounded-2xl p-4 animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="aspect-square rounded-xl bg-surface-container-highest mb-4" />
              <div className="space-y-2">
                <div className="h-4 w-3/4 bg-surface-container-highest rounded" />
                <div className="h-3 w-1/2 bg-surface-container-highest rounded" />
              </div>
            </div>
          ))}
        </div>
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
    <div>
      <div className="flex justify-between items-end mb-8 animate-fade-in">
        <div>
          <h2 className="font-headline text-2xl font-extrabold tracking-tight">Generated Atmosphere</h2>
          <p className="text-on-surface-variant text-sm">{tracks.length} tracks matching your frequency</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "p-2 rounded-full transition-colors",
              viewMode === "grid"
                ? "bg-surface-container-high text-primary"
                : "bg-surface-container-high/50 text-on-surface-variant hover:text-primary"
            )}
          >
            <Icon name="grid_view" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "p-2 rounded-full transition-colors",
              viewMode === "list"
                ? "bg-surface-container-high text-primary"
                : "bg-surface-container-high/50 text-on-surface-variant hover:text-primary"
            )}
          >
            <Icon name="view_list" />
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {tracks.map((track, i) => (
            <div
              key={track.id}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <TrackResult track={track} viewMode="grid" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {tracks.map((track, i) => (
            <div
              key={track.id}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <TrackResult track={track} viewMode="list" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
