"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SpotifyTrack } from "@/types";
import type { AudioFeatures } from "@/lib/spotify";

interface VibeDriftResult {
  /** Map of trackId -> drift score (0 = perfect match, 1 = extreme outlier) */
  driftScores: Record<string, number>;
  /** Track IDs that are flagged as outliers (drift > threshold) */
  outlierIds: Set<string>;
  /** Average audio signature of the playlist */
  playlistSignature: {
    energy: number;
    acousticness: number;
    valence: number;
    danceability: number;
    tempo: number;
  } | null;
  isLoading: boolean;
}

// Flag tracks whose normalized distance exceeds this. Kept deliberately high:
// a genre-spanning "surprise me" playlist is legitimately broad, and flagging
// a good-fit track (e.g. a correct-tempo mid-energy song among upbeat ones) as
// a "vibe breaker" is worse than missing a true outlier.
const DRIFT_THRESHOLD = 0.55;

// The route caps a single request at this many ids.
const FETCH_CHUNK = 100;

export function useVibeDrift(tracks: SpotifyTrack[]): VibeDriftResult {
  const [features, setFeatures] = useState<Record<string, AudioFeatures>>({});
  const [isLoading, setIsLoading] = useState(false);
  // Ids already asked for this session. The provider legitimately has no data
  // for some tracks and omits them from a 200 response — without this marker
  // every partial response would re-trigger the effect and loop the fetch.
  const requestedIds = useRef<Set<string>>(new Set());

  const fetchFeatures = useCallback(async (trackIds: string[]) => {
    if (trackIds.length === 0) return;
    for (const id of trackIds) requestedIds.current.add(id);
    setIsLoading(true);
    try {
      for (let i = 0; i < trackIds.length; i += FETCH_CHUNK) {
        const chunk = trackIds.slice(i, i + FETCH_CHUNK);
        const res = await fetch(`/api/spotify/audio-features?ids=${chunk.join(",")}`);
        if (!res.ok) {
          // Rate limited or transient failure — allow a later retry, but only
          // when something else (e.g. the track list) changes; a failed fetch
          // never re-triggers the effect by itself.
          for (const id of chunk) requestedIds.current.delete(id);
          continue;
        }
        const data = await res.json();
        const newFeatures: Record<string, AudioFeatures> = {};
        for (const f of data.audio_features || []) {
          if (f?.id) newFeatures[f.id] = f;
        }
        if (Object.keys(newFeatures).length > 0) {
          setFeatures((prev) => ({ ...prev, ...newFeatures }));
        }
      }
    } catch {
      // Fail silently — drift detection is optional enhancement
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch audio features for tracks we haven't asked about yet
  useEffect(() => {
    const missingIds = tracks
      .map((t) => t.id)
      .filter((id) => !features[id] && !requestedIds.current.has(id));

    if (missingIds.length > 0) {
      fetchFeatures(missingIds);
    }
  }, [tracks, features, fetchFeatures]);

  // Compute drift scores
  const trackIds = tracks.map((t) => t.id);
  const availableFeatures = trackIds
    .map((id) => features[id])
    .filter(Boolean);

  if (availableFeatures.length < 3) {
    return {
      driftScores: {},
      outlierIds: new Set(),
      playlistSignature: null,
      isLoading,
    };
  }

  // Calculate playlist average signature
  const avg = {
    energy: mean(availableFeatures.map((f) => f.energy)),
    acousticness: mean(availableFeatures.map((f) => f.acousticness)),
    valence: mean(availableFeatures.map((f) => f.valence)),
    danceability: mean(availableFeatures.map((f) => f.danceability)),
    tempo: mean(availableFeatures.map((f) => f.tempo)),
  };

  // Calculate standard deviations for normalization
  const stdDevs = {
    energy: stdDev(availableFeatures.map((f) => f.energy)),
    acousticness: stdDev(availableFeatures.map((f) => f.acousticness)),
    valence: stdDev(availableFeatures.map((f) => f.valence)),
    danceability: stdDev(availableFeatures.map((f) => f.danceability)),
    tempo: stdDev(availableFeatures.map((f) => f.tempo)),
  };

  // Score each track
  const driftScores: Record<string, number> = {};
  const outlierIds = new Set<string>();

  for (const id of trackIds) {
    const f = features[id];
    if (!f) continue;

    // Normalized Euclidean distance across key audio dimensions
    const dims = [
      safeDivide(Math.abs(f.energy - avg.energy), stdDevs.energy),
      safeDivide(Math.abs(f.acousticness - avg.acousticness), stdDevs.acousticness),
      safeDivide(Math.abs(f.valence - avg.valence), stdDevs.valence),
      safeDivide(Math.abs(f.danceability - avg.danceability), stdDevs.danceability),
    ];

    // Average z-score normalized to 0-1
    const score = Math.min(1, mean(dims) / 3);
    driftScores[id] = score;

    if (score > DRIFT_THRESHOLD) {
      outlierIds.add(id);
    }
  }

  return {
    driftScores,
    outlierIds,
    playlistSignature: avg,
    isLoading,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 1;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1; // avoid 0
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}
