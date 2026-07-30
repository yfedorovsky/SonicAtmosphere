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

// A Deezer track resolved by ISRC: its perceptual BPM plus the recording
// identity (title + credited artists) used to reject colliding ISRC joins
// before trusting that BPM.
interface DeezerRecord {
  bpm: number | null;
  title: string;
  titleShort: string;
  artists: string[]; // primary + contributors, for the identity match
  durationSec: number | null; // for the duration cross-check
}

const globalForFeatures = globalThis as unknown as {
  __saAudioFeatures?: Map<string, AudioFeatures | null>;
  __saDeezerTrack?: Map<string, DeezerRecord | null>;
};
function cache(): Map<string, AudioFeatures | null> {
  return (globalForFeatures.__saAudioFeatures ??= new Map());
}
function deezerCache(): Map<string, DeezerRecord | null> {
  return (globalForFeatures.__saDeezerTrack ??= new Map());
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

// --- Deezer recording lookup (KV-backed) -------------------------------------
// Beat detectors mis-read swing/mellow material by octave or 1.5x. Deezer's
// perceptual BPM (keyed by ISRC) breaks the tie — but ONLY when the ISRC join
// resolves to the SAME recording. ISRCs get reused and mis-assigned across
// compilations and re-issues, so we fetch Deezer's title + credited artists
// alongside the BPM and refuse to attach a BPM whose recording identity does
// not match the Spotify track being annotated (a colliding join must read as
// "unknown tempo", never as a confident wrong number).
async function fetchDeezerRecord(isrc: string): Promise<DeezerRecord | null> {
  const l1 = deezerCache().get(isrc);
  if (l1 !== undefined) return l1;

  const kvKey = `sa:dz:${isrc}`;
  const l2 = await kvGet<DeezerRecord | MissSentinel>(kvKey);
  if (l2 !== null) {
    const rec = isMiss(l2) ? null : (l2 as DeezerRecord);
    deezerCache().set(isrc, rec);
    return rec;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${DEEZER_ISRC_URL}${isrc}`, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null; // transient — leave uncached for retry
    const data = await res.json();
    // Deezer answers an unknown ISRC with {error:{...}} at HTTP 200 — a
    // confirmed miss: cache it so we never re-ask.
    if (!data || typeof data !== "object" || data.error || typeof data.title !== "string") {
      deezerCache().set(isrc, null);
      await kvSet(kvKey, MISS, BPM_KV_TTL_S);
      return null;
    }
    const bpm =
      typeof data.bpm === "number" && data.bpm >= 40 && data.bpm <= 250 ? data.bpm : null;
    const contributors: string[] = Array.isArray(data.contributors)
      ? data.contributors
          .map((c: unknown) =>
            c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string"
              ? (c as { name: string }).name
              : null
          )
          .filter((n: string | null): n is string => !!n)
      : [];
    const primary =
      data.artist && typeof data.artist === "object" && typeof data.artist.name === "string"
        ? (data.artist.name as string)
        : null;
    const rec: DeezerRecord = {
      bpm,
      title: data.title,
      titleShort: typeof data.title_short === "string" ? data.title_short : data.title,
      artists: [...new Set([primary, ...contributors].filter((n): n is string => !!n))],
      durationSec: typeof data.duration === "number" ? data.duration : null,
    };
    deezerCache().set(isrc, rec);
    await kvSet(kvKey, rec, BPM_KV_TTL_S);
    return rec;
  } catch {
    return null; // network/timeout — leave uncached
  } finally {
    clearTimeout(timer);
  }
}

// Normalizers mirror songKey in recommendations.ts: strip version suffixes and
// punctuation so "Song (2011 Remaster)" / "Song - Live" reduce to "song".
const normArtist = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const normTitle = (s: string) =>
  normArtist(s.replace(/\s*[([].*?[)\]]\s*/g, " ").split(" - ")[0]);

/**
 * Recording-identity match, tightened per adversarial review. A binary
 * accept/reject over crowd data is inherently fuzzy, so we (a) demand a
 * duration cross-check when both sides expose it (a strong, cheap
 * discriminator), and (b) require STRONG title+artist evidence — the loose
 * both-sides-contains rule false-accepted collisions on short shared tokens
 * ("love", "run") and the ambiguous middle. Now: exact/near-exact (prefix)
 * beats loose containment; loose containment needs a real length floor; and
 * loose-title + loose-artist together (the ambiguous middle) is rejected.
 * A genuine ISRC collision differs on duration and/or both fields, so it fails;
 * a legit remaster/re-release of the same recording still passes. Unverifiable
 * expectations (empty title/artist) accept — the guard only removes KNOWN-bad
 * joins, never injects signal on non-tempo prompts.
 */
export function deezerIdentityMatches(
  rec: { title: string; titleShort: string; artists: string[]; durationSec?: number | null },
  expected: { title: string; artist: string; durationSec?: number | null }
): boolean {
  const eT = normTitle(expected.title);
  const eA = normArtist(expected.artist);
  if (!eT || !eA) return true; // can't verify → don't discard (conservative)

  // Duration cross-check first: a >8s gap is almost never the same recording.
  if (
    expected.durationSec != null &&
    rec.durationSec != null &&
    Math.abs(expected.durationSec - rec.durationSec) > 8
  ) {
    return false;
  }

  const dTitles = [normTitle(rec.title), normTitle(rec.titleShort)].filter(Boolean);
  const dArtists = rec.artists.map(normArtist).filter(Boolean);

  const titleExact = dTitles.some((d) => d === eT || d.startsWith(eT) || eT.startsWith(d));
  const titleLoose = dTitles.some(
    (d) => d.length >= 6 && eT.length >= 6 && (d.includes(eT) || eT.includes(d))
  );
  const artistExact = dArtists.some((d) => d === eA);
  const artistLoose = dArtists.some(
    (d) => d.length >= 5 && eA.length >= 5 && (d.includes(eA) || eA.includes(d))
  );

  // Require strong evidence on at least one axis; reject the loose+loose middle.
  if (titleExact && artistExact) return true;
  if (titleExact && artistLoose) return true;
  if (titleLoose && artistExact) return true;
  return false;
}

function reconcileTempo(reccoTempo: number, deezerBpm: number | null): number {
  if (deezerBpm === null) return reccoTempo;
  const tolerance = Math.max(8, deezerBpm * 0.08);
  return Math.abs(reccoTempo - deezerBpm) > tolerance ? deezerBpm : reccoTempo;
}

/**
 * Final tempo for a track: the provider's feature tempo reconciled against
 * Deezer's perceptual BPM, trusting Deezer only when the ISRC join resolves to
 * the same recording (deezerIdentityMatches). Returns null when neither source
 * knows. This is the single identity-guarded entry point for track tempo —
 * both the reconciliation (feature + Deezer) and the gap-fill (Deezer only,
 * no feature) cases flow through it, so a colliding ISRC can never silently
 * reorder a tempo-sorted playlist.
 */
export async function resolveTempo(
  featureTempo: number | null,
  isrc: string | undefined,
  expected: { title: string; artist: string; durationSec?: number | null }
): Promise<number | null> {
  let deezerBpm: number | null = null;
  if (isrc) {
    const rec = await fetchDeezerRecord(isrc);
    if (rec && rec.bpm !== null) {
      if (deezerIdentityMatches(rec, expected)) {
        deezerBpm = rec.bpm;
      } else {
        // Auditable: a discarded BPM means either a rejected collision (good) or
        // a false-reject of a legit variant (bad). Log so both are reviewable.
        console.log(
          `[deezer] reject bpm=${rec.bpm} isrc=${isrc} want "${expected.title}"/"${expected.artist}"` +
            ` got "${rec.titleShort}"/"${rec.artists[0] ?? "?"}" durΔ=${
              expected.durationSec != null && rec.durationSec != null
                ? Math.abs(expected.durationSec - rec.durationSec)
                : "?"
            }`
        );
      }
    }
  }
  if (featureTempo !== null) return reconcileTempo(featureTempo, deezerBpm);
  return deezerBpm; // gap-fill, or null when neither source knows
}

// v2: features are cached RAW (unreconciled). Tempo reconciliation against
// Deezer needs the track's recording identity to reject colliding ISRC joins,
// and that identity only exists at the ranking call site — so tempo is resolved
// there (resolveTempo), not here. The bump abandons v1's reconciled-without-
// guard values (re-fetched free from ReccoBeats).
const featKey = (id: string) => `sa:feat:v2:${id}`;

// Fetch misses from the provider and populate L1 + KV (including confirmed
// misses so we never re-query for them). Features are stored exactly as the
// provider returns them; tempo is reconciled with Deezer at the call site.
async function fetchFromProvider(ids: string[]): Promise<void> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));

  await Promise.all(
    batches.map(async (batch) => {
      const raw = await featureProvider.fetchBatch(batch);
      if (raw.length === 0) return; // failed/empty batch — cache nothing, retry later

      const returned = new Set<string>();
      const writes: Promise<void>[] = [];
      for (const { spotifyId, features } of raw) {
        cache().set(spotifyId, features);
        returned.add(spotifyId);
        writes.push(kvSet(featKey(spotifyId), features, FEATURE_KV_TTL_S));
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
