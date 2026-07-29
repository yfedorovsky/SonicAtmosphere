import type { AudioFeatures } from "@/lib/spotify";

// Spotify's /audio-features is 403 for this app tier. ReccoBeats serves the
// same feature set keyed by Spotify track id, no auth required — this module
// is the drop-in replacement. Features are immutable per track, so results
// (including confirmed misses) are cached for the life of the process.
const RECCOBEATS_URL = "https://api.reccobeats.com/v1/audio-features";
const BATCH_SIZE = 40;
const REQUEST_TIMEOUT_MS = 5_000;

const globalForFeatures = globalThis as unknown as {
  __saAudioFeatures?: Map<string, AudioFeatures | null>;
  __saDeezerBpm?: Map<string, number | null>;
};

function cache(): Map<string, AudioFeatures | null> {
  return (globalForFeatures.__saAudioFeatures ??= new Map());
}

function deezerCache(): Map<string, number | null> {
  return (globalForFeatures.__saDeezerBpm ??= new Map());
}

// Beat detectors mis-read swing and mellow material by octave or 1.5x (a ~89
// BPM Charlie Parker ballad came back as 132.6 on one release and ~89 on two
// others of the SAME recording). Deezer exposes its own perceptual BPM keyed
// by ISRC — when the two providers disagree beyond tolerance, Deezer wins.
export async function fetchDeezerBpm(isrc: string): Promise<number | null> {
  const cached = deezerCache().get(isrc);
  if (cached !== undefined) return cached;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.deezer.com/2.0/track/isrc:${isrc}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null; // transient — leave uncached for retry
    const data = await res.json();
    const bpm = typeof data?.bpm === "number" && data.bpm >= 40 && data.bpm <= 250 ? data.bpm : null;
    deezerCache().set(isrc, bpm);
    return bpm;
  } catch {
    return null; // network/timeout — leave uncached
  } finally {
    clearTimeout(timer);
  }
}

function reconcileTempo(reccoTempo: number, deezerBpm: number | null): number {
  if (deezerBpm === null) return reccoTempo;
  const tolerance = Math.max(8, deezerBpm * 0.08);
  return Math.abs(reccoTempo - deezerBpm) > tolerance ? deezerBpm : reccoTempo;
}

// ReccoBeats items use their own UUID as `id`; the Spotify id lives in `href`.
function spotifyIdFromHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const match = href.match(/track\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

function toAudioFeatures(spotifyId: string, raw: Record<string, unknown>): AudioFeatures | null {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const tempo = num(raw.tempo);
  // Tempo 0 means the provider's beat detection failed; out-of-range values
  // are detector glitches. Same 40–250 sanity window as the Deezer path.
  if (tempo === null || tempo < 40 || tempo > 250) return null;
  return {
    id: spotifyId,
    energy: num(raw.energy) ?? 0,
    acousticness: num(raw.acousticness) ?? 0,
    danceability: num(raw.danceability) ?? 0,
    valence: num(raw.valence) ?? 0,
    tempo,
    key: num(raw.key) ?? -1,
    mode: num(raw.mode) ?? 0,
    loudness: num(raw.loudness) ?? 0,
    speechiness: num(raw.speechiness) ?? 0,
    instrumentalness: num(raw.instrumentalness) ?? 0,
    liveness: num(raw.liveness) ?? 0,
  };
}

async function fetchBatch(ids: string[]): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${RECCOBEATS_URL}?ids=${ids.join(",")}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    const items: unknown[] = Array.isArray(data?.content) ? data.content : [];
    const parsed: { features: AudioFeatures; isrc: string | null }[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const spotifyId = spotifyIdFromHref(raw.href);
      if (!spotifyId) continue;
      const features = toAudioFeatures(spotifyId, raw);
      if (features) {
        parsed.push({ features, isrc: typeof raw.isrc === "string" ? raw.isrc : null });
      }
    }

    // Tempo cross-check (deduped by ISRC — re-releases share a recording).
    const uniqueIsrcs = [...new Set(parsed.map((p) => p.isrc).filter((i): i is string => !!i))];
    const bpmEntries = await Promise.all(
      uniqueIsrcs.map(async (isrc) => [isrc, await fetchDeezerBpm(isrc)] as const)
    );
    const bpmByIsrc = new Map(bpmEntries);

    const returned = new Set<string>();
    for (const { features, isrc } of parsed) {
      const deezerBpm = isrc ? bpmByIsrc.get(isrc) ?? null : null;
      cache().set(features.id, { ...features, tempo: reconcileTempo(features.tempo, deezerBpm) });
      returned.add(features.id);
    }
    // A successful response that omits a requested id is a confirmed miss —
    // cache it so we never re-ask. Failed requests cache nothing.
    for (const id of ids) {
      if (!returned.has(id) && !cache().has(id)) cache().set(id, null);
    }
  } catch {
    // Network failure or timeout: leave ids uncached for a later retry.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch audio features (tempo/energy/etc.) for Spotify track ids.
 * Returns a map containing only the tracks features are known for; callers
 * must treat absence as "unknown", never as an error.
 */
export async function fetchAudioFeatures(
  trackIds: string[]
): Promise<Map<string, AudioFeatures>> {
  const unique = [...new Set(trackIds.filter(Boolean))];
  const uncached = unique.filter((id) => !cache().has(id));

  const batches: string[][] = [];
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    batches.push(uncached.slice(i, i + BATCH_SIZE));
  }
  await Promise.all(batches.map(fetchBatch));

  const result = new Map<string, AudioFeatures>();
  for (const id of unique) {
    const features = cache().get(id);
    if (features) result.set(id, features);
  }
  return result;
}
