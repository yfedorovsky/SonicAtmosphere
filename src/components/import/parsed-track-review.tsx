"use client";

import { useState, useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";
import type { ParsedTrackLine, SpotifyTrack, MatchedTrack } from "@/types";
import { cn } from "@/lib/utils";

interface ParsedTrackReviewProps {
  tracks: ParsedTrackLine[];
  onBack: () => void;
  onComplete: () => void;
}

export function ParsedTrackReview({
  tracks,
  onBack,
  onComplete,
}: ParsedTrackReviewProps) {
  const [matchedTracks, setMatchedTracks] = useState<MatchedTrack[]>(
    tracks.map((t) => ({ parsed: t, match: null, status: "unmatched" }))
  );
  const [isMatching, setIsMatching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [matchProgress, setMatchProgress] = useState(0);
  const { addTrack } = usePlaylistStore();

  const handleMatch = useCallback(async () => {
    setIsMatching(true);
    const updated = [...matchedTracks];

    for (let i = 0; i < updated.length; i++) {
      const { parsed } = updated[i];
      const query = parsed.artist
        ? `${parsed.artist} ${parsed.title}`
        : parsed.title;

      try {
        const res = await fetch(
          `/api/spotify/search?q=${encodeURIComponent(query)}&type=track&limit=1`
        );
        if (res.ok) {
          const data = await res.json();
          const match = data.tracks?.[0] || null;
          updated[i] = { ...updated[i], match, status: match ? "matched" : "unmatched" };
        }
      } catch {
        // Keep as unmatched
      }

      setMatchProgress(((i + 1) / updated.length) * 100);
      setMatchedTracks([...updated]);
    }

    setIsMatching(false);
    setHasSearched(true);
  }, [matchedTracks]);

  function handleConfirmAll() {
    let added = 0;
    for (const mt of matchedTracks) {
      if (mt.match && mt.status !== "skipped") {
        const success = addTrack(mt.match);
        if (success) added++;
      }
    }
    onComplete();
  }

  function toggleSkip(index: number) {
    const updated = [...matchedTracks];
    updated[index] = {
      ...updated[index],
      status: updated[index].status === "skipped" ? "matched" : "skipped",
    };
    setMatchedTracks(updated);
  }

  const matchedCount = matchedTracks.filter(
    (t) => t.match && t.status !== "skipped"
  ).length;

  return (
    <div className="space-y-6">
      {/* Parsed tracks table */}
      <div className="max-h-[350px] overflow-y-auto custom-scrollbar space-y-2">
        {matchedTracks.map((mt, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg transition-colors",
              mt.status === "skipped"
                ? "bg-surface-container/20 opacity-50"
                : mt.match
                  ? "bg-primary/5"
                  : "bg-surface-container/40"
            )}
          >
            <span className="text-xs text-on-surface-variant w-6 text-right shrink-0">
              {mt.parsed.lineNumber}
            </span>

            {mt.match ? (
              <>
                <div className="w-8 h-8 rounded shrink-0 overflow-hidden">
                  {mt.match.album.images[0]?.url ? (
                    <img
                      src={mt.match.album.images[0].url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-surface-container-highest" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{mt.match.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {mt.match.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>
                <Icon name="check_circle" className="text-primary shrink-0" size="sm" />
              </>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  {mt.parsed.artist && (
                    <span className="font-bold">{mt.parsed.artist}</span>
                  )}
                  {mt.parsed.artist && " — "}
                  {mt.parsed.title}
                </p>
                {!isMatching && hasSearched && (
                  <p className="text-xs text-error/70">No match found</p>
                )}
              </div>
            )}

            {mt.match && (
              <button
                type="button"
                onClick={() => toggleSkip(i)}
                className="text-xs text-on-surface-variant hover:text-error transition-colors shrink-0"
              >
                {mt.status === "skipped" ? "Include" : "Skip"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Progress bar during matching */}
      {isMatching && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-on-surface-variant">
            <span>Matching tracks...</span>
            <span>{Math.round(matchProgress)}%</span>
          </div>
          <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${matchProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 rounded-full bg-surface-container-high text-on-surface-variant font-bold text-sm hover:bg-surface-container-highest transition-colors"
        >
          Back
        </button>

        {!matchedTracks.some((t) => t.match) ? (
          <button
            type="button"
            onClick={handleMatch}
            disabled={isMatching}
            className="flex-1 py-3 bg-primary text-on-primary rounded-full font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          >
            {isMatching ? "Matching..." : "Search Spotify Matches"}
            <Icon name="search" size="sm" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConfirmAll}
            className="flex-1 py-3 bg-primary text-on-primary rounded-full font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            Add {matchedCount} Tracks to Playlist
            <Icon name="add" size="sm" />
          </button>
        )}
      </div>
    </div>
  );
}
