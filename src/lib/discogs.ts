// Discogs grounding: a record label is a curator, so a label's roster is a
// high-signal "neighborhood" of artists — often tighter than genre tags. This
// provider turns a label name into its ranked artist roster, for grounding the
// recommendation neighborhood and for label-seeded discovery.
//
// Unlike the RED provider (private tracker, local-only), Discogs is a PUBLIC,
// sanctioned API — this module is safe to run in production. It reads only
// public catalog metadata (label -> releases -> credited artists); it never
// touches marketplace/order endpoints.
//
// Config: enabled only when DISCOGS_TOKEN is set (a free personal access token
// from discogs.com/settings/developers). With no token every function is a
// no-op returning empty, so callers fall back to their normal grounding.
//
// Etiquette baked in: Discogs REQUIRES a descriptive User-Agent (bare requests
// 403), authenticated rate limit is 60/min — we throttle well under it and
// honor Retry-After — and rosters are near-static, so we cache HARD (memory +
// best-effort disk). Fail-soft everywhere: any error returns empty.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = "https://api.discogs.com";
const USER_AGENT = "SonicAtmosphere/0.1 (+https://sonic-atmosphere.vercel.app)";
const MIN_INTERVAL_MS = 1100; // ~54 req/min, under the 60/min authenticated limit
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_DIR = ".discogs-cache"; // gitignored; disk cache is best-effort (read-only FS in prod just skips it)
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d — label rosters change slowly

export function discogsEnabled(): boolean {
  return !!process.env.DISCOGS_TOKEN;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");

function keyHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

const mem = new Map<string, unknown>();
function readCache(key: string): unknown {
  if (mem.has(key)) return mem.get(key);
  try {
    const f = `${CACHE_DIR}/${keyHash(key)}.json`;
    if (existsSync(f)) {
      const { t, v } = JSON.parse(readFileSync(f, "utf8"));
      if (Date.now() - t < CACHE_TTL_MS) {
        mem.set(key, v);
        return v;
      }
    }
  } catch {
    /* cache miss is not an error */
  }
  return undefined;
}
function writeCache(key: string, v: unknown): void {
  mem.set(key, v);
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(`${CACHE_DIR}/${keyHash(key)}.json`, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* read-only FS (prod) — memory cache still applies within the instance */
  }
}

// Serialize + space out requests so we stay under the courtesy rate limit even
// across concurrent calls.
let gate: Promise<void> = Promise.resolve();
let lastAt = 0;
function throttle(): Promise<void> {
  gate = gate.then(async () => {
    const wait = Math.max(0, lastAt + MIN_INTERVAL_MS - Date.now());
    if (wait) await sleep(wait);
    lastAt = Date.now();
  });
  return gate;
}

async function dGet(path: string, params: Record<string, string>, retry = true): Promise<unknown> {
  if (!discogsEnabled()) return null;
  const qs = new URLSearchParams(params).toString();
  const cacheKey = `${path}?${qs}`;
  const cached = readCache(cacheKey);
  if (cached !== undefined) return cached;

  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: { "User-Agent": USER_AGENT, Authorization: `Discogs token=${process.env.DISCOGS_TOKEN as string}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429 && retry) {
      const after = Number(res.headers.get("retry-after")) || 60;
      await sleep((after + 1) * 1000);
      return dGet(path, params, false);
    }
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (json != null) writeCache(cacheKey, json);
    return json;
  } catch {
    return null; // network/timeout — fall back to normal grounding
  } finally {
    clearTimeout(timer);
  }
}

// Discogs credits carry noise: a trailing "(2)" disambiguates same-named
// artists, a trailing "*" marks a name variation (ANV), and one release can
// credit several artists. Expand a raw credit string into clean primary names.
function cleanArtists(raw: string): string[] {
  const s = (raw || "").trim();
  if (!s || /^various(\s+artists)?$/i.test(s) || /^unknown artist$/i.test(s)) return [];
  // split hard multi-artist joins
  const parts = s.split(/\s+\/\s+/).flatMap((p) =>
    // drop "featuring/feat./presents/apresenta/meets/with" tails -> keep the lead credit
    [p.split(/\s+(?:featuring|feat\.?|presents|apresenta|meets|with|vs\.?)\s+/i)[0]]
  );
  return parts
    .map((p) =>
      p
        .replace(/\*(?=\s|$)/g, "") // Discogs ANV marker (a "*" ending a name token), mid-string or trailing
        .replace(/\s*\(\d+\)\s*/g, " ") // "(2)" disambiguation, anywhere
        .replace(/\s+(?:and|&)\s+/gi, " & ") // canonicalize the connective so "X And Y" == "X & Y"
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((p) => p && !/^various(\s+artists)?$/i.test(p));
}

/** Resolve a label name to its Discogs label id (best match). null if unknown. */
export async function discogsLabelId(name: string): Promise<number | null> {
  if (!name.trim()) return null;
  const data = (await dGet("/database/search", { q: name, type: "label", per_page: "8" })) as
    | { results?: { id?: number; title?: string }[] }
    | null;
  const results = data?.results ?? [];
  if (results.length === 0) return null;
  const want = norm(name);
  // prefer an exact/near-exact title match over the first (most-followed) hit
  const exact = results.find((r) => norm(r.title ?? "") === want);
  const starts = results.find((r) => norm(r.title ?? "").startsWith(want));
  const pick = exact ?? starts ?? results[0];
  return typeof pick.id === "number" ? pick.id : null;
}

interface RosterEntry {
  name: string;
  releases: number;
}

/**
 * A label's artist roster, ranked by how many releases each artist has on the
 * label (a proxy for how central they are to the label's identity). Accepts a
 * label id or name. Pages are bounded so a lookup stays well under the rate
 * limit; a big label is sampled from its most-relevant pages, not exhaustively.
 * Returns [] when Discogs is disabled or the label is unknown.
 */
export async function discogsLabelRoster(
  label: number | string,
  { maxPages = 4, cap = 200 }: { maxPages?: number; cap?: number } = {}
): Promise<RosterEntry[]> {
  if (!discogsEnabled()) return [];
  const id = typeof label === "number" ? label : await discogsLabelId(label);
  if (id == null) return [];

  const freq = new Map<string, number>();
  const display = new Map<string, string>();
  let pages = 1;
  for (let page = 1; page <= maxPages && page <= pages; page++) {
    const data = (await dGet(`/labels/${id}/releases`, { per_page: "100", page: String(page) })) as
      | { releases?: { artist?: string }[]; pagination?: { pages?: number } }
      | null;
    if (!data) break;
    pages = data.pagination?.pages ?? 1;
    for (const r of data.releases ?? []) {
      for (const name of cleanArtists(r.artist ?? "")) {
        const k = norm(name);
        if (!k) continue;
        freq.set(k, (freq.get(k) ?? 0) + 1);
        if (!display.has(k)) display.set(k, name);
      }
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || display.get(a[0])!.localeCompare(display.get(b[0])!))
    .slice(0, cap)
    .map(([k, n]) => ({ name: display.get(k) as string, releases: n }));
}

/** Just the roster artist names (ranked), for feeding a grounding neighborhood. */
export async function discogsLabelArtists(label: number | string, opts?: { maxPages?: number; cap?: number }): Promise<string[]> {
  return (await discogsLabelRoster(label, opts)).map((e) => e.name);
}

export interface DiscogsRelease {
  id: number;
  title: string;
  year: number | null;
  label: string | null;
  catno: string | null;
  artists: string[];
  genres: string[];
  styles: string[];
}

/**
 * Details for a specific release — the release -> (label, catno, styles)
 * direction, for identifying a record spotted in the wild (e.g. a Discogs link
 * in an Instagram vinyl post). Accepts a numeric id or a Discogs release URL
 * (…/release/12345-Title). The label it resolves is the seed you can then feed
 * to discogsLabelRoster to expand into discoveries. Returns null on any failure.
 *
 * API-only by design: Discogs' website Cloudflare-challenges non-browser
 * clients, so the token API is the reliable path (no HTML-scrape fallback).
 */
export async function discogsRelease(idOrUrl: number | string): Promise<DiscogsRelease | null> {
  const id = typeof idOrUrl === "number" ? idOrUrl : Number(String(idOrUrl).match(/\/release\/(\d+)/)?.[1] ?? idOrUrl);
  if (!Number.isFinite(id) || id <= 0) return null;
  const data = (await dGet(`/releases/${id}`, {})) as
    | {
        id?: number;
        title?: string;
        year?: number;
        labels?: { name?: string; catno?: string }[];
        artists?: { name?: string }[];
        genres?: string[];
        styles?: string[];
      }
    | null;
  if (!data || typeof data.id !== "number") return null;
  const primaryLabel = data.labels?.[0];
  return {
    id: data.id,
    title: data.title ?? "",
    year: typeof data.year === "number" && data.year > 0 ? data.year : null,
    label: primaryLabel?.name ?? null,
    catno: primaryLabel?.catno ?? null,
    artists: (data.artists ?? []).flatMap((a) => cleanArtists(a.name ?? "")),
    genres: Array.isArray(data.genres) ? data.genres : [],
    styles: Array.isArray(data.styles) ? data.styles : [],
  };
}
