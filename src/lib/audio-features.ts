import type { AudioFeatures } from "@/lib/spotify";
import { kvGet, kvSet, kvMGet } from "@/lib/kv";

// Spotify's /audio-features is 403 for this app tier. Audio features come from
// an external provider (ReccoBeats) keyed by Spotify track id, with tempo
// cross-checked against Deezer BPM by ISRC.
//
// ReccoBeats is treated as a REPLACEABLE provider, not infrastructure: its data
// closely tracks Spotify's deprecated feature dumps with unclear provenance and
// it could change or vanish. So (1) it sits behind an AudioFeatureProvider
// interface with a single swap point, and (2) every fetched feature is
// snapshotted into KV — the cache accrues value independent of the provider, so
// if ReccoBeats disappears we still serve everything we've ever seen.
//
// Three cache layers, all fail-soft: L1 in-process (per instance) → L2 KV
// (cross-instance, persistent) → provider. Features are immutable per track, so
// TTLs are long; confirmed misses are cached (shorter) so we don't re-query.

const RECCOBEATS_URL = "https://api.reccobeats.com/v1/audio-features";
const DEEZER_ISRC_URL = "https://api.deezer.com/2.0/track/isrc:";
const BATCH_SIZE = 40;
const REQUEST_TIMEOUT_MS = 5_000;

const FEATURE_KV_TTL_S = 60 * 24 * 60 * 60; // 60d — features are immutable
const MISS_KV_TTL_S = 7 * 24 * 60 * 60; // 7d — a miss might resolve later
const BPM_KV_TTL_S = 60 * 24 * 60 * 60; // 60d

// KV stores a JSON value per key. A confirmed MISS is a sentinel object (KV
// null already means "not cached", so misses need their own marker to prevent
// re-querying the provider for a track it doesn't have).
type MissSentinel = { m: 1 };
const MISS: MissSentinel = { m: 1 };
const isMiss = (v: unknown): v is MissSentinel =>
  !!v && typeof v === "object" && (v as MissSentinel).m === 1;
const isFeatures = (v: unknown): v is AudioFeatures =>
  !!v && typeof v === "object" && typeof (v as AudioFeatures).tempo === "number";

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

// --- Provider interface (ReccoBeats is the only implementation today) --------
interface RawFeature {
  spotifyId: string;
  features: AudioFeatures; // pre-reconciliation
  isrc: string | null;
}
interface AudioFeatureProvider {
  readonly name: string;
  fetchBatch(spotifyIds: string[]): Promise<RawFeature[]>;
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
  // Tempo 0 means the provider's beat detection failed; out-of-range values are
  // detector glitches. Same 40–250 sanity window as the Deezer path.
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

const reccoBeatsProvider: AudioFeatureProvider = {
  name: "reccobeats",
  async fetchBatch(ids: string[]): Promise<RawFeature[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${RECCOBEATS_URL}?ids=${ids.join(",")}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = await res.json();
      const items: unknown[] = Array.isArray(data?.content) ? data.content : [];
      const out: RawFeature[] = [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const raw = item as Record<string, unknown>;
        const spotifyId = spotifyIdFromHref(raw.href);
        if (!spotifyId) continue;
        const features = toAudioFeatures(spotifyId, raw);
        if (features) {
          out.push({ spotifyId, features, isrc: typeof raw.isrc === "string" ? raw.isrc : null });
        }
      }
      return out;
    } catch {
      return []; // network/timeout — nothing fetched, nothing cached
    } finally {
      clearTimeout(timer);
    }
  },
};

// The single swap point: replace this to change providers.
const featureProvider: AudioFeatureProvider = reccoBeatsProvider;

// --- Deezer BPM (KV-backed) --------------------------------------------------
// Beat detectors mis-read swing/mellow material by octave or 1.5x. Deezer's
// perceptual BPM (keyed by ISRC) breaks the tie when the two disagree.
export async function fetchDeezerBpm(isrc: string): Promise<number | null> {
  const l1 = deezerCache().get(isrc);
  if (l1 !== undefined) return l1;

  const kvKey = `sa:bpm:${isrc}`;
  const l2 = await kvGet<number | MissSentinel>(kvKey);
  if (l2 !== null) {
    const bpm = isMiss(l2) ? null : (l2 as number);
    deezerCache().set(isrc, bpm);
    return bpm;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${DEEZER_ISRC_URL}${isrc}`, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null; // transient — leave uncached for retry
    const data = await res.json();
    const bpm = typeof data?.bpm === "number" && data.bpm >= 40 && data.bpm <= 250 ? data.bpm : null;
    deezerCache().set(isrc, bpm);
    await kvSet(kvKey, bpm ?? MISS, BPM_KV_TTL_S);
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

const featKey = (id: string) => `sa:feat:${id}`;

// Fetch misses from the provider, reconcile tempo, and populate L1 + KV
// (including confirmed misses so we never re-query for them).
async function fetchFromProvider(ids: string[]): Promise<void> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));

  await Promise.all(
    batches.map(async (batch) => {
      const raw = await featureProvider.fetchBatch(batch);
      if (raw.length === 0) return; // failed/empty batch — cache nothing, retry later

      // Tempo cross-check (deduped by ISRC — re-releases share a recording).
      const uniqueIsrcs = [...new Set(raw.map((r) => r.isrc).filter((i): i is string => !!i))];
      const bpmByIsrc = new Map(
        await Promise.all(uniqueIsrcs.map(async (isrc) => [isrc, await fetchDeezerBpm(isrc)] as const))
      );

      const returned = new Set<string>();
      const writes: Promise<void>[] = [];
      for (const { spotifyId, features, isrc } of raw) {
        const bpm = isrc ? bpmByIsrc.get(isrc) ?? null : null;
        const reconciled = { ...features, tempo: reconcileTempo(features.tempo, bpm) };
        cache().set(spotifyId, reconciled);
        returned.add(spotifyId);
        writes.push(kvSet(featKey(spotifyId), reconciled, FEATURE_KV_TTL_S));
      }
      // Requested-but-not-returned = confirmed miss: cache so we never re-ask.
      for (const id of batch) {
        if (!returned.has(id)) {
          if (!cache().has(id)) cache().set(id, null);
          writes.push(kvSet(featKey(id), MISS, MISS_KV_TTL_S));
        }
      }
      await Promise.all(writes);
    })
  );
}

/**
 * Fetch audio features (tempo/energy/etc.) for Spotify track ids.
 * Returns a map containing only tracks features are known for; callers must
 * treat absence as "unknown", never as an error.
 */
export async function fetchAudioFeatures(
  trackIds: string[]
): Promise<Map<string, AudioFeatures>> {
  const unique = [...new Set(trackIds.filter(Boolean))];
  const result = new Map<string, AudioFeatures>();
  const l1 = cache();

  // L1
  const needKv: string[] = [];
  for (const id of unique) {
    if (l1.has(id)) {
      const f = l1.get(id);
      if (f) result.set(id, f);
    } else {
      needKv.push(id);
    }
  }

  // L2 (KV) for L1 misses
  let needProvider = needKv;
  if (needKv.length > 0) {
    const values = await kvMGet<AudioFeatures | MissSentinel>(needKv.map(featKey));
    needProvider = [];
    needKv.forEach((id, i) => {
      const v = values[i];
      if (isFeatures(v)) {
        l1.set(id, v);
        result.set(id, v);
      } else if (isMiss(v)) {
        l1.set(id, null); // known miss — don't hit the provider
      } else {
        needProvider.push(id);
      }
    });
  }

  // Provider for whatever's still missing
  if (needProvider.length > 0) {
    await fetchFromProvider(needProvider);
    for (const id of needProvider) {
      const f = l1.get(id);
      if (f) result.set(id, f);
    }
  }

  return result;
}
