// last.fm crowd tags — a SECOND, orthogonal selection axis to acoustic texture.
//
// The subgenre-filler problem (a "smooth jazz" or content-farm "lounge" track
// surviving a hard-bop request) is not a signal problem: those tracks sit
// acoustically central (hubness), so audio features can't reject them. Human
// curation labels can — a track tagged "smooth jazz" is *wrong* for hard bop
// regardless of how it sounds. This module fetches an artist's top tags so the
// pipeline can veto candidates carrying a prompt's contrast-class tags.
//
// Fail-soft: with no LASTFM_API_KEY (or any error) it returns [] and the veto
// simply doesn't fire — the pipeline behaves exactly as before.

import { kvGet, kvSet } from "@/lib/kv";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
const TTL_MS = 24 * 60 * 60 * 1000; // L1: artists' tags are stable — cache a day
const KV_TTL_S = 7 * 24 * 60 * 60; // L2: 7d — tags change even less than search
const CACHE_MAX = 2000;
const REQUEST_TIMEOUT_MS = 4_000;
const MIN_TAG_COUNT = 10; // last.fm tag "count" is 0..100 normalized popularity

const globalForLastfm = globalThis as unknown as {
  __saLastfmTags?: Map<string, { tags: string[]; expiresAt: number }>;
};
function cache(): Map<string, { tags: string[]; expiresAt: number }> {
  return (globalForLastfm.__saLastfmTags ??= new Map());
}

/**
 * Top crowd tags for an artist, lowercased, filtered to reasonably-endorsed
 * ones. Returns [] when the API key is absent or anything fails.
 */
export async function getArtistTags(artist: string): Promise<string[]> {
  const key = process.env.LASTFM_API_KEY;
  if (!key || !artist.trim()) return [];

  const cacheKey = artist.trim().toLowerCase();
  const hit = cache().get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.tags;

  // L2 (persistent KV): artist tags fetched by any instance are reused across
  // cold starts, sparing last.fm rate limits. No-ops without a KV store.
  const l2 = await kvGet<string[]>(`sa:lfm:${cacheKey}`);
  if (l2 !== null) {
    cache().set(cacheKey, { tags: l2, expiresAt: Date.now() + TTL_MS });
    return l2;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      method: "artist.gettoptags",
      artist,
      api_key: key,
      autocorrect: "1",
      format: "json",
    });
    const res = await fetch(`${LASTFM_API}?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return []; // transient — leave uncached for retry
    const data = await res.json();
    const raw: unknown[] = Array.isArray(data?.toptags?.tag) ? data.toptags.tag : [];
    const tags = raw
      .filter(
        (t): t is { name: string; count?: number } =>
          !!t && typeof (t as { name?: unknown }).name === "string"
      )
      .filter((t) => (typeof t.count === "number" ? t.count >= MIN_TAG_COUNT : true))
      .map((t) => t.name.toLowerCase().trim())
      .slice(0, 12);

    if (cache().size >= CACHE_MAX) {
      const oldest = cache().keys().next().value;
      if (oldest !== undefined) cache().delete(oldest);
    }
    cache().set(cacheKey, { tags, expiresAt: Date.now() + TTL_MS });
    await kvSet(`sa:lfm:${cacheKey}`, tags, KV_TTL_S);
    return tags;
  } catch {
    return []; // network/timeout/parse — fail soft
  } finally {
    clearTimeout(timer);
  }
}

const stripTag = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * True if any of the artist's tags is IN the veto set. Match is one-directional
 * — a tag is vetoed only if it CONTAINS a veto term (after stripping separators)
 * — so a veto of "smooth jazz" hits tags "smooth jazz" / "smooth-jazz" /
 * "smooth jazz fusion" but NOT the broad, legitimate tag "jazz". (The reverse,
 * tag ⊆ veto, would wrongly veto every jazz artist against a "smooth jazz"
 * contrast class.)
 */
export function tagsHitVeto(tags: string[], veto: string[]): boolean {
  if (tags.length === 0 || veto.length === 0) return false;
  const vetoNorm = veto.map(stripTag).filter((v) => v.length >= 3);
  const tagNorm = tags.map(stripTag).filter(Boolean);
  return tagNorm.some((t) => vetoNorm.some((v) => t.includes(v)));
}
