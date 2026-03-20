"use client";

import { useState, useEffect, useCallback } from "react";
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

const DRIFT_THRESHOLD = 0.35; // Flag tracks whose normalized distance exceeds this

export function useVibeDrift(tracks: SpotifyTrack[]): VibeDriftResult {
  const [features, setFeatures] = useState<Record<string, AudioFeatures>>({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchFeatures = useCallback(async (trackIds: string[]) => {
    if (trackIds.length === 0) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/spotify/audio-features?ids=${trackIds.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        const newFeatures: Record<string, AudioFeatures> = {};
        for (const f of data.audio_features || []) {
          if (f?.id) newFeatures[f.id] = f;
        }
        setFeatures((prev) => ({ ...prev, ...newFeatures }));
      }
    } catch {
      // Fail silently — drift detection is optional enhancement
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch audio features for new tracks
  useEffect(() => {
    const missingIds = tracks
      .map((t) => t.id)
      .filter((id) => !features[id]);

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
