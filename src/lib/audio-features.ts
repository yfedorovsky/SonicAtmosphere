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
};

function cache(): Map<string, AudioFeatures | null> {
  return (globalForFeatures.__saAudioFeatures ??= new Map());
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
  if (tempo === null) return null;
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
    const returned = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const spotifyId = spotifyIdFromHref(raw.href);
      if (!spotifyId) continue;
      const features = toAudioFeatures(spotifyId, raw);
      if (features) {
        cache().set(spotifyId, features);
        returned.add(spotifyId);
      }
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
