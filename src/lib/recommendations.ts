import Anthropic from "@anthropic-ai/sdk";

import {
  searchTracks,
  searchArtists,
  searchPlaylistNames,
  getRecommendations,
  getArtistTopTracks,
  getRelatedArtists,
  type RecommendationParams,
} from "./spotify";
import type { SpotifyTrack, GeneratorMode, FilterValues } from "@/types";
import { fetchAudioFeatures } from "@/lib/audio-features";

// Map vibe keywords to Spotify genre seeds
const VIBE_TO_GENRES: Record<string, string[]> = {
  dreamy: ["dream-pop", "shoegaze", "ambient"],
  acoustic: ["acoustic", "folk", "singer-songwriter"],
  melancholy: ["sad", "indie", "folk"],
  melancholic: ["sad", "indie", "folk"],
  shoegaze: ["shoegaze", "dream-pop", "post-punk"],
  electronic: ["electronic", "electro", "synth-pop"],
  ambient: ["ambient", "new-age", "post-rock"],
  nocturnal: ["chill", "trip-hop", "downtempo"],
  "lo-fi": ["study", "chill", "jazz"],
  lofi: ["study", "chill", "jazz"],
  cinematic: ["soundtrack", "post-rock", "classical"],
  energetic: ["dance", "edm", "pop"],
  indie: ["indie", "indie-pop", "indie-rock"],
  folk: ["folk", "singer-songwriter", "acoustic"],
  jazz: ["jazz", "bossanova", "soul"],
  rock: ["rock", "alt-rock", "indie-rock"],
  pop: ["pop", "synth-pop", "electropop"],
  punk: ["punk", "punk-rock", "hardcore"],
  metal: ["metal", "heavy-metal", "death-metal"],
  classical: ["classical", "piano", "opera"],
  synthwave: ["synth-pop", "electronic", "new-wave"],
  retrowave: ["synth-pop", "electronic", "new-wave"],
  "high energy": ["dance", "edm", "electronic"],
  techno: ["techno", "minimal-techno", "detroit-techno"],
  cyberpunk: ["industrial", "electronic", "synth-pop"],
  neon: ["synth-pop", "electronic", "new-wave"],
  night: ["chill", "trip-hop", "downtempo"],
  "late night": ["chill", "trip-hop", "downtempo"],
  study: ["study", "chill", "ambient"],
  focus: ["study", "ambient", "chill"],
  chill: ["chill", "trip-hop", "downtempo"],
  relax: ["chill", "ambient", "new-age"],
  relaxing: ["chill", "ambient", "new-age"],
  rain: ["ambient", "chill", "post-rock"],
  rainy: ["ambient", "chill", "post-rock"],
  summer: ["pop", "reggaeton", "dance"],
  drive: ["indie", "rock", "alt-rock"],
  driving: ["indie", "rock", "alt-rock"],
  workout: ["dance", "edm", "hip-hop"],
  party: ["dance", "edm", "pop"],
  romantic: ["r-n-b", "soul", "jazz"],
  dark: ["industrial", "trip-hop", "post-punk"],
  happy: ["pop", "indie-pop", "dance"],
  coffee: ["jazz", "acoustic", "folk"],
  morning: ["acoustic", "folk", "indie-pop"],
};

function extractGenresFromPrompt(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const genres = new Set<string>();

  for (const [keyword, genreList] of Object.entries(VIBE_TO_GENRES)) {
    if (lower.includes(keyword)) {
      genreList.forEach((g) => genres.add(g));
    }
  }

  return [...genres].slice(0, 5); // Spotify allows max 5 seeds total
}

function extractAudioParams(prompt: string): Partial<RecommendationParams> {
  const lower = prompt.toLowerCase();
  const params: Partial<RecommendationParams> = {};

  // Target energy from keywords
  if (lower.includes("calm") || lower.includes("quiet") || lower.includes("soft") || lower.includes("gentle")) {
    params.target_energy = 20;
  } else if (lower.includes("high energy") || lower.includes("intense") || lower.includes("energetic")) {
    params.target_energy = 85;
  } else if (lower.includes("melanchol") || lower.includes("sad") || lower.includes("dreamy")) {
    params.target_energy = 30;
  }

  // Target acousticness from keywords
  if (lower.includes("acoustic") || lower.includes("unplugged")) {
    params.target_acousticness = 80;
  } else if (lower.includes("electronic") || lower.includes("synth") || lower.includes("techno")) {
    params.target_acousticness = 10;
  }

  // Negative prompting: detect "no X" / "not X" / "without X" patterns
  if (lower.includes("no acoustic") || lower.includes("not acoustic") || lower.includes("without acoustic")) {
    params.max_acousticness = 20;
  }
  if (lower.includes("no electronic") || lower.includes("not electronic")) {
    params.min_acousticness = 60;
  }
  if (lower.includes("no slow") || lower.includes("not slow") || lower.includes("no ballad")) {
    params.min_energy = 50;
  }
  if (lower.includes("no loud") || lower.includes("not loud") || lower.includes("no heavy")) {
    params.max_energy = 40;
  }
  if (lower.includes("no sad") || lower.includes("not sad") || lower.includes("no depressing")) {
    params.min_valence = 50;
  }
  if (lower.includes("no happy") || lower.includes("not happy") || lower.includes("no cheerful")) {
    params.max_valence = 40;
  }
  if (lower.includes("no mainstream") || lower.includes("no popular") || lower.includes("underground")) {
    params.max_popularity = 40;
  }

  return params;
}

// Extract artist names from "by [artist]" or "like [artist]" patterns
function extractArtistHints(prompt: string): string[] {
  const patterns = [
    /(?:by|like|similar to|à la)\s+([A-Z][a-zA-Z\s&]+?)(?:\s+(?:and|with|but|no|not|,)|$)/gi,
  ];
  const artists: string[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(prompt)) !== null) {
      const name = match[1].trim();
      if (name.length > 1 && name.length < 50) {
        artists.push(name);
      }
    }
  }
  return artists.slice(0, 2);
}

// Keyword fallback for vibe generation: several varied searches run in
// parallel and merged for coverage. Last resort when the LLM is unavailable.
export async function keywordVibeSearch(
  accessToken: string,
  prompt: string,
  moods: string[],
  limit: number
): Promise<SpotifyTrack[]> {
  const queries = [buildSearchQuery(prompt, moods), ...getAlternateQueries(prompt, moods)];
  const results = await Promise.all(queries.map((q) => searchTracks(q, accessToken, 10)));
  const seen = new Set<string>();
  return results
    .flat()
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .slice(0, limit);
}

// Extract meaningful search keywords from a long prompt
function buildSearchQuery(prompt: string, moods: string[]): string {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "that", "this", "are", "was",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "your", "you", "my", "our", "their",
    "its", "every", "each", "designed", "elevate", "fuel", "builds",
    "reimagined", "pumped", "momentum", "maximum", "impact", "track",
    "tracks", "music", "songs", "playlist", "curated", "perfect",
    "featuring", "inspired", "styled", "based", "like", "feel", "feeling",
    "vibes", "vibe", "mood", "atmosphere", "sonic", "sound", "sounds",
  ]);

  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const keywords = [...new Set(words)].slice(0, 4);

  for (const mood of moods.slice(0, 2)) {
    const m = mood.toLowerCase();
    if (!keywords.includes(m)) keywords.push(m);
  }

  return keywords.slice(0, 5).join(" ");
}

// Generate alternate search queries for broader results
function getAlternateQueries(prompt: string, moods: string[]): string[] {
  const lower = prompt.toLowerCase();
  const queries: string[] = [];

  const moodSearchTerms: Record<string, string> = {
    electronic: "electronic synth",
    dreamy: "dream pop ethereal",
    melancholic: "melancholy sad indie",
    nocturnal: "late night chill",
    ambient: "ambient atmospheric",
    acoustic: "acoustic unplugged",
    shoegaze: "shoegaze reverb",
    "lo-fi": "lofi beats",
    cinematic: "cinematic soundtrack",
    energetic: "high energy upbeat",
  };

  for (const mood of moods.slice(0, 2)) {
    const terms = moodSearchTerms[mood.toLowerCase()];
    if (terms) queries.push(terms);
  }

  const vibeKeywords = [
    "workout", "gym", "running", "fitness",
    "study", "focus", "chill", "relax",
    "party", "dance", "club",
    "road trip", "driving", "cruise",
    "romantic", "love", "date night",
    "morning", "sunrise", "coffee",
    "rain", "night", "midnight",
    "sad", "happy", "dark", "upbeat",
    "hip-hop", "rap", "r&b", "jazz", "rock", "pop", "indie",
    "lo-fi", "lofi", "classical", "metal", "punk", "folk",
    "anthems", "classics", "hits", "remix", "remixes",
  ];

  const foundVibes = vibeKeywords.filter((v) => lower.includes(v));
  if (foundVibes.length > 0) {
    queries.push(foundVibes.slice(0, 3).join(" "));
  }

  return queries.slice(0, 2);
}

export async function generateRecommendations(
  accessToken: string,
  prompt: string,
  mode: GeneratorMode,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  // Only free-text modes can express a workout/tempo intent. Song and artist
  // prompts are titles/names — "Born to Run" is not a running request.
  const tempoTarget =
    mode === "vibe" || mode === "genre" ? extractTempoTarget(prompt) : null;
  let tracks: SpotifyTrack[];
  switch (mode) {
    case "vibe":
      tracks = await vibeRecommendations(accessToken, prompt, filters, tempoTarget);
      break;
    case "song":
      tracks = await songRecommendations(accessToken, prompt, filters);
      break;
    case "artist":
      tracks = await artistRecommendations(accessToken, prompt, filters);
      break;
    case "genre":
      tracks = await genreRecommendations(accessToken, prompt, filters, tempoTarget);
      break;
    default:
      tracks = await searchTracks(prompt, accessToken, 20);
  }
  // Song mode leads with the seed itself — keep it in front regardless of tempo.
  return annotateAndRankByTempo(tracks, tempoTarget, mode === "song");
}

// ---------------------------------------------------------------------------
// Tempo targeting
//
// Spotify's /audio-features (tempo) is 403 for this app tier; BPM comes from
// an external provider (lib/audio-features). Workout prompts imply a cadence:
// an explicit "175 BPM" always wins, otherwise activity keywords map to the
// tempo windows those workouts are actually programmed around.
// ---------------------------------------------------------------------------

interface TempoTarget {
  min: number;
  max: number;
  label: string;
}

const TEMPO_PRESETS: { pattern: RegExp; target: TempoTarget }[] = [
  {
    pattern: /\brun(?:ning|s)?\b|\bjog(?:ging)?\b|\bmarathon\b|\btreadmill\b|\b5k\b|\b10k\b/,
    target: { min: 150, max: 180, label: "running" },
  },
  {
    pattern: /\bcycling\b|\bspin(?:ning)? class\b|\bpeloton\b|\bsoulcycle\b|\bindoor cycling\b/,
    target: { min: 118, max: 136, label: "cycling" },
  },
  {
    pattern: /\bhiit\b|\bbootcamp\b|\borange\s?theory\b|\botf\b|\bbarry'?s\b|\bcrossfit\b|\bcircuit training\b|\binterval training\b/,
    target: { min: 128, max: 152, label: "HIIT" },
  },
  {
    pattern: /\bpower walk(?:ing)?\b|\bbrisk walk(?:ing)?\b/,
    target: { min: 115, max: 135, label: "walking" },
  },
];

function extractTempoTarget(prompt: string): TempoTarget | null {
  const p = prompt.toLowerCase();
  const clamp = (n: number) => Math.min(220, Math.max(40, n));

  const range = p.match(/(\d{2,3})\s*(?:-|–|—|to)\s*(\d{2,3})\s*bpm\b/);
  if (range) {
    const lo = clamp(Number(range[1]));
    const hi = clamp(Number(range[2]));
    if (lo <= hi) return { min: lo, max: hi, label: `${lo}–${hi} BPM` };
  }
  const single = p.match(/(\d{2,3})\s*bpm\b/);
  if (single) {
    const bpm = clamp(Number(single[1]));
    return { min: bpm - 6, max: bpm + 6, label: `~${bpm} BPM` };
  }
  for (const { pattern, target } of TEMPO_PRESETS) {
    if (pattern.test(p)) return target;
  }
  return null;
}

// Distance from the target window, taking the best of direct, half-time, and
// double-time readings — an 87 BPM groove phase-locks to a 174 steps-per-minute
// stride just as well. Unknown tempo prices as a moderate fixed distance so a
// confirmed near-miss still outranks a mystery, but a far miss doesn't.
const UNKNOWN_TEMPO_DISTANCE = 15;

function tempoDistance(bpm: number | undefined, target: TempoTarget): number {
  if (bpm == null) return UNKNOWN_TEMPO_DISTANCE;
  const dist = (v: number) =>
    v < target.min ? target.min - v : v > target.max ? v - target.max : 0;
  return Math.min(dist(bpm), dist(bpm * 2), dist(bpm / 2));
}

function tempoHint(target: TempoTarget | null): string {
  if (!target) return "";
  return `\nTarget tempo: ${target.min}–${target.max} BPM (${target.label}). Strongly prefer artists and subgenres whose music actually lives in or near that range — half-time/double-time equivalents count.`;
}

// Annotate every track with BPM when known; with an active target, stable-sort
// matches first, unknowns in the middle, misses last. Nothing is dropped —
// tempo data has gaps and a shorter playlist is worse than an imperfect tail.
async function annotateAndRankByTempo(
  tracks: SpotifyTrack[],
  target: TempoTarget | null,
  pinFirst: boolean
): Promise<SpotifyTrack[]> {
  if (tracks.length === 0) return tracks;
  const features = await fetchAudioFeatures(tracks.map((t) => t.id));
  const annotated = tracks.map((t) => {
    const f = features.get(t.id);
    return f ? { ...t, tempo: Math.round(f.tempo) } : t;
  });
  if (!target) return annotated;

  const head = pinFirst ? annotated.slice(0, 1) : [];
  const rest = pinFirst ? annotated.slice(1) : annotated;
  const ranked = rest
    .map((t, i) => ({ t, dist: tempoDistance(t.tempo, target), i }))
    .sort((a, b) => a.dist - b.dist || a.i - b.i)
    .map((x) => x.t);
  return [...head, ...ranked];
}

// ---------------------------------------------------------------------------
// Grounded neighborhood machinery
//
// This Spotify app tier gets 403s from /recommendations, /audio-features,
// top-tracks, and playlist items, and artist objects carry no genres — the
// only reliable tool is search. So for every generator mode: Claude proposes
// a musical neighborhood (real artists + genre terms) grounded in signals we
// CAN read (artist catalogs, playlist names), and Spotify search resolves it
// to real tracks with strict hygiene filters.
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const cleanQuery = (s: string) => s.replace(/"/g, "").trim();
// Same song re-released on another album carries a different Spotify id —
// key on normalized artist|title with version suffixes stripped.
const songKey = (t: SpotifyTrack) =>
  `${normalize(t.artists[0]?.name ?? "")}|${normalize(
    t.name.replace(/\s*[([].*?[)\]]\s*/g, " ").split(" - ")[0]
  )}`;

interface Neighborhood {
  artists: string[];
  genres: string[];
  keywords: string[];
}

// One JSON round trip to Claude. Opus-tier knowledge matters: obscure artists
// misidentified by a smaller model produce a completely wrong playlist.
async function askNeighborhood(content: string): Promise<Neighborhood | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") return null;
    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(jsonStr);
    const strings = (v: unknown, max: number) =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string").slice(0, max)
        : [];
    return {
      artists: strings(parsed.artists, 8),
      genres: strings(parsed.genres, 3),
      keywords: strings(parsed.keywords, 2),
    };
  } catch (err) {
    console.error("[recommendations] neighborhood expansion failed:", err);
    return null;
  }
}

interface ResolveOptions {
  // Pre-fetched on-vibe tracks (e.g. the seed artist's own catalog), ranked
  // in the top tier alongside named-artist results.
  tierZeroTracks?: SpotifyTrack[];
  anchorPopularity: number;
  exclude?: SpotifyTrack[];
  // Cap on generic genre/keyword-search results — broad tags pull in filler.
  tierOneCap?: number;
  limit: number;
}

async function resolveAndRank(
  accessToken: string,
  neighborhood: Neighborhood,
  opts: ResolveOptions
): Promise<SpotifyTrack[]> {
  const artistQueries = neighborhood.artists.map(cleanQuery).filter(Boolean).slice(0, 8);
  const genreQueries = neighborhood.genres.map(cleanQuery).filter(Boolean).slice(0, 3);
  const keywordQueries = neighborhood.keywords.map(cleanQuery).filter(Boolean).slice(0, 2);

  // Spotify's artist: filter fuzzy-matches (querying "L'Eclair" also returns
  // the composer "Leclair") and matches featured credits (querying "Ludacris"
  // returns Justin Bieber's "Baby") — keep only tracks where the named artist
  // is the PRIMARY artist.
  const [artistResults, genreResults, keywordResults] = await Promise.all([
    Promise.all(
      artistQueries.map(async (name) => {
        const tracks = await searchTracks(`artist:"${name}"`, accessToken, 10);
        return tracks.filter((t) => normalize(t.artists[0]?.name ?? "") === normalize(name));
      })
    ),
    Promise.all(genreQueries.map((g) => searchTracks(`genre:"${g}"`, accessToken, 8))),
    Promise.all(keywordQueries.map((q) => searchTracks(q, accessToken, 8))),
  ]);

  // Tiered ranking: named artists (and any pre-supplied catalog) are safer
  // bets than generic genre/keyword hits; within a tier, prefer popularity
  // near the anchor.
  const tiers: [SpotifyTrack[], number][] = [
    [opts.tierZeroTracks ?? [], 0],
    [artistResults.flat(), 0],
    [genreResults.flat(), 1],
    [keywordResults.flat(), 1],
  ];
  const seen = new Set<string>((opts.exclude ?? []).map((t) => t.id));
  const seenSongs = new Set<string>((opts.exclude ?? []).map(songKey));
  const unique: { t: SpotifyTrack; tier: number }[] = [];
  for (const [tracks, tier] of tiers) {
    for (const t of tracks) {
      if (seen.has(t.id) || seenSongs.has(songKey(t))) continue;
      // Skits, interludes, and interstitial fragments are never on-vibe.
      if (t.duration_ms > 0 && t.duration_ms < 61_000) continue;
      seen.add(t.id);
      seenSongs.add(songKey(t));
      unique.push({ t, tier });
    }
  }
  unique.sort(
    (a, b) =>
      a.tier - b.tier ||
      Math.abs(a.t.popularity - opts.anchorPopularity) -
        Math.abs(b.t.popularity - opts.anchorPopularity)
  );

  // Count every credited artist so features can't flood the list either.
  const perArtist = new Map<string, number>();
  const candidates: SpotifyTrack[] = [];
  const tierOneCap = opts.tierOneCap ?? 4;
  let tierOneSlots = 0;
  for (const { t, tier } of unique) {
    if (tier === 1 && tierOneSlots >= tierOneCap) continue;
    const keys = t.artists.length > 0 ? t.artists.map((a) => a.id) : [t.id];
    if (keys.some((k) => (perArtist.get(k) ?? 0) >= 2)) continue;
    for (const k of keys) perArtist.set(k, (perArtist.get(k) ?? 0) + 1);
    if (tier === 1) tierOneSlots += 1;
    candidates.push(t);
  }
  return candidates.slice(0, opts.limit);
}

// ---------------------------------------------------------------------------
// Vibe mode
// ---------------------------------------------------------------------------

async function vibeRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues,
  tempoTarget: TempoTarget | null = null
): Promise<SpotifyTrack[]> {
  // Native recommendations first — best quality where the app still has access
  const nativeTracks = await nativeVibeRecommendations(accessToken, prompt, filters);
  if (nativeTracks.length > 0) return nativeTracks;

  // Grounding: names of public playlists matching the vibe keywords describe
  // how real curators label this mood.
  const playlistMeta = await searchPlaylistNames(
    buildSearchQuery(prompt, filters.moods),
    accessToken,
    8
  );
  const playlistNames = playlistMeta
    .map((p) => (p.description ? `${p.name} (${p.description})` : p.name))
    .slice(0, 8);

  const neighborhood = await askNeighborhood(
    `A listener described the playlist they want:
"${prompt}"
${filters.moods.length ? `Selected mood tags: ${filters.moods.join(", ")}` : ""}
${playlistNames.length ? `Names of real public playlists matching these keywords: ${playlistNames.join("; ")}` : ""}

Name real artists whose actual music delivers this vibe. Rules:
- If the description references a specific song or artist, anchor on that artist and their closest peers.
- Interpret sensory or scene-setting words ("coffee aroma", "rainy night") as a MOOD, never literally — do not pick novelty, background-music, or coffee-shop-compilation acts.
- Prefer credible artists a music critic would name; never content-farm, tribute, karaoke, or "study beats" channel acts.${tempoHint(tempoTarget)}

Respond ONLY with valid JSON in this exact format, no other text:
{"artists": ["...8 artists..."], "genres": ["...3 short genre terms as used on Spotify..."], "keywords": ["...up to 2 short track-search phrases, only if genuinely useful..."]}`
  );

  if (neighborhood && (neighborhood.artists.length > 0 || neighborhood.genres.length > 0)) {
    const tracks = await resolveAndRank(accessToken, neighborhood, {
      anchorPopularity: filters.popularity,
      tierOneCap: 6,
      limit: 20,
    });
    if (tracks.length > 0) return tracks;
  }

  // Last resort: plain keyword search
  return keywordVibeSearch(accessToken, prompt, filters.moods, 20);
}

async function nativeVibeRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  const genres = extractGenresFromPrompt(prompt);
  const audioParams = extractAudioParams(prompt);
  const artistHints = extractArtistHints(prompt);

  for (const mood of filters.moods) {
    const moodGenres = VIBE_TO_GENRES[mood.toLowerCase()];
    if (moodGenres) {
      moodGenres.forEach((g) => {
        if (genres.length < 5) genres.push(g);
      });
    }
  }

  let seedArtistIds: string[] = [];
  if (artistHints.length > 0) {
    const artistResults = await Promise.all(
      artistHints.map((name) => searchArtists(name, accessToken, 1))
    );
    seedArtistIds = artistResults.filter((r) => r.length > 0).map((r) => r[0].id);
  }

  if (seedArtistIds.length + genres.length === 0) return [];

  const maxGenres = Math.max(0, 5 - seedArtistIds.length);
  const uniqueGenres = [...new Set(genres)].slice(0, maxGenres);

  const recParams: RecommendationParams = {
    target_energy: audioParams.target_energy ?? filters.energy,
    target_acousticness: audioParams.target_acousticness ?? filters.acousticness,
    target_popularity: filters.popularity,
    target_danceability: filters.danceability,
    target_valence: filters.valence,
    target_instrumentalness: filters.instrumentalness,
    ...filterConstraints(audioParams),
    limit: 20,
  };
  if (seedArtistIds.length > 0) recParams.seed_artists = seedArtistIds.slice(0, 5).join(",");
  if (uniqueGenres.length > 0) recParams.seed_genres = uniqueGenres.join(",");

  return getRecommendations(accessToken, recParams);
}

// Extract only constraint params (max_*, min_*) for spreading
function filterConstraints(params: Partial<RecommendationParams>): Partial<RecommendationParams> {
  const constraints: Partial<RecommendationParams> = {};
  if (params.max_energy !== undefined) constraints.max_energy = params.max_energy;
  if (params.min_energy !== undefined) constraints.min_energy = params.min_energy;
  if (params.max_acousticness !== undefined) constraints.max_acousticness = params.max_acousticness;
  if (params.min_acousticness !== undefined) constraints.min_acousticness = params.min_acousticness;
  if (params.max_popularity !== undefined) constraints.max_popularity = params.max_popularity;
  if (params.min_popularity !== undefined) constraints.min_popularity = params.min_popularity;
  if (params.max_valence !== undefined) constraints.max_valence = params.max_valence;
  if (params.min_valence !== undefined) constraints.min_valence = params.min_valence;
  return constraints;
}

// ---------------------------------------------------------------------------
// Song mode
// ---------------------------------------------------------------------------

export async function songRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  const audioParams = extractAudioParams(prompt);

  // Search for the seed song. Among the top text matches, prefer the most
  // popular — canonical recordings beat cover-farm uploads of the same title.
  const seedResults = await searchTracks(prompt, accessToken, 3);
  if (seedResults.length === 0) return [];
  const seed = [...seedResults].sort((a, b) => b.popularity - a.popularity)[0];

  const seedTrackIds = seedResults.map((t) => t.id).slice(0, 2);
  const seedArtistIds = seedResults.flatMap((t) => t.artists.map((a) => a.id)).slice(0, 3);

  // Native recommendations first — best quality where the app still has access
  const tracks = await getRecommendations(accessToken, {
    seed_tracks: seedTrackIds.join(","),
    seed_artists: seedArtistIds.slice(0, 5 - seedTrackIds.length).join(","),
    target_energy: filters.energy,
    target_acousticness: filters.acousticness,
    target_popularity: filters.popularity,
    target_danceability: filters.danceability,
    target_valence: filters.valence,
    target_instrumentalness: filters.instrumentalness,
    ...filterConstraints(audioParams),
    limit: 20,
  });
  if (tracks.length > 0) return tracks;

  return similarBySeedTrack(accessToken, seed);
}

async function similarBySeedTrack(
  accessToken: string,
  seed: SpotifyTrack
): Promise<SpotifyTrack[]> {
  const primaryArtist = cleanQuery(seed.artists[0]?.name ?? "");

  // Grounding signals: the artist's own catalog and the names of playlists
  // featuring the song describe its actual style — so the LLM isn't guessing
  // blind on artists it doesn't know.
  const [artistTracks, playlistMeta] = await Promise.all([
    primaryArtist
      ? searchTracks(`artist:"${primaryArtist}"`, accessToken, 10)
      : Promise.resolve([]),
    searchPlaylistNames(`${seed.name} ${primaryArtist}`, accessToken, 8),
  ]);

  const artistNames = seed.artists.map((a) => a.name).join(", ");
  const otherTitles = artistTracks
    .filter((t) => t.id !== seed.id)
    .map((t) => t.name)
    .slice(0, 8);
  const playlistNames = playlistMeta
    .map((p) => (p.description ? `${p.name} (${p.description})` : p.name))
    .slice(0, 8);
  const clues = [
    otherTitles.length ? `- Other tracks by this artist: ${otherTitles.join("; ")}` : "",
    playlistNames.length
      ? `- Public playlists featuring this song: ${playlistNames.join("; ")}`
      : "",
    seed.album.name ? `- Album: "${seed.album.name}"` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const neighborhood = await askNeighborhood(
    `I want to find more music with the same vibe as the song "${seed.name}" by ${artistNames}.

Context clues about this song's actual style, gathered from Spotify:
${clues || "- (none available)"}

If you know this artist, use your knowledge of their sound. If you do NOT recognize them, derive the style strictly from the context clues above — never fall back to generic popular artists.

Respond ONLY with valid JSON in this exact format, no other text:
{"artists": ["...8 similar-sounding artists, not ${artistNames}..."], "genres": ["...3 short genre terms as used on Spotify, e.g. dream pop, psychedelic funk..."], "keywords": []}`
  );

  if (!neighborhood) {
    return [seed, ...artistTracks.filter((t) => t.id !== seed.id)].slice(0, 21);
  }

  const candidates = await resolveAndRank(accessToken, neighborhood, {
    tierZeroTracks: artistTracks,
    anchorPopularity: seed.popularity,
    exclude: [seed],
    tierOneCap: 4,
    limit: 20,
  });

  // Lead with the liked song itself so the playlist starts from it.
  return [seed, ...candidates].slice(0, 21);
}

// ---------------------------------------------------------------------------
// Artist mode
// ---------------------------------------------------------------------------

async function artistRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  const artists = await searchArtists(prompt, accessToken, 1);
  if (artists.length === 0) {
    return searchTracks(prompt, accessToken, 20);
  }
  const artist = artists[0];

  // Native path first — works where the app still has catalog access
  const [topTracks, relatedArtists] = await Promise.all([
    getArtistTopTracks(artist.id, accessToken),
    getRelatedArtists(artist.id, accessToken),
  ]);
  if (topTracks.length > 0 || relatedArtists.length > 0) {
    const recommended = await getRecommendations(accessToken, {
      seed_artists: [artist.id, ...relatedArtists.slice(0, 2).map((a) => a.id)].join(","),
      target_energy: filters.energy,
      target_acousticness: filters.acousticness,
      target_popularity: filters.popularity,
      target_danceability: filters.danceability,
      target_valence: filters.valence,
      target_instrumentalness: filters.instrumentalness,
      limit: 15,
    });
    const allTracks = [...topTracks, ...recommended];
    if (allTracks.length > 5) {
      const seen = new Set<string>();
      return allTracks
        .filter((t) => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        })
        .slice(0, 25);
    }
  }

  // Grounded LLM path: the artist's catalog + playlist names anchor the
  // neighborhood, exactly as in song mode.
  const [catalog, playlistMeta] = await Promise.all([
    searchTracks(`artist:"${cleanQuery(artist.name)}"`, accessToken, 10),
    searchPlaylistNames(artist.name, accessToken, 8),
  ]);
  const ownTracks = catalog.filter(
    (t) => normalize(t.artists[0]?.name ?? "") === normalize(artist.name)
  );

  const titles = ownTracks.map((t) => t.name).slice(0, 8);
  const playlistNames = playlistMeta
    .map((p) => (p.description ? `${p.name} (${p.description})` : p.name))
    .slice(0, 8);

  const neighborhood = await askNeighborhood(
    `I want an "artist radio" playlist for ${artist.name}: some of their tracks plus similar-sounding artists.

Context clues gathered from Spotify:
${titles.length ? `- Tracks by this artist: ${titles.join("; ")}` : ""}
${playlistNames.length ? `- Public playlists featuring them: ${playlistNames.join("; ")}` : ""}

If you know this artist, use your knowledge of their sound. If you do NOT recognize them, derive the style strictly from the context clues above — never fall back to generic popular artists.

Respond ONLY with valid JSON in this exact format, no other text:
{"artists": ["...8 similar-sounding artists, not ${artist.name}..."], "genres": ["...3 short genre terms as used on Spotify..."], "keywords": []}`
  );

  const anchor = ownTracks[0]?.popularity ?? filters.popularity;
  if (!neighborhood) return ownTracks.slice(0, 21);

  const candidates = await resolveAndRank(accessToken, neighborhood, {
    tierZeroTracks: ownTracks,
    anchorPopularity: anchor,
    tierOneCap: 4,
    limit: 21,
  });
  return candidates.length > 0 ? candidates : ownTracks.slice(0, 21);
}

// ---------------------------------------------------------------------------
// Genre mode
// ---------------------------------------------------------------------------

async function genreRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues,
  tempoTarget: TempoTarget | null = null
): Promise<SpotifyTrack[]> {
  const genres = prompt
    .toLowerCase()
    .split(/[,;]+/)
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (genres.length === 0) return [];

  // Native recommendations first — works where the app still has access
  const tracks = await getRecommendations(accessToken, {
    seed_genres: genres.map((g) => g.replace(/\s+/g, "-")).join(","),
    target_energy: filters.energy,
    target_acousticness: filters.acousticness,
    target_popularity: filters.popularity,
    target_danceability: filters.danceability,
    target_valence: filters.valence,
    target_instrumentalness: filters.instrumentalness,
    limit: 20,
  });
  if (tracks.length > 0) return tracks;

  // genre:"..." field search alone surfaces obscure text matches — have
  // Claude name the genre's defining artists and blend both.
  const neighborhood = await askNeighborhood(
    `Name the artists that define ${genres.join(" + ")} as a genre — a mix of the canonical acts and strong current ones.${tempoHint(tempoTarget)}

Respond ONLY with valid JSON in this exact format, no other text:
{"artists": ["...8 artists..."], "genres": ${JSON.stringify(genres)}, "keywords": []}`
  );

  const resolved = await resolveAndRank(
    accessToken,
    neighborhood ?? { artists: [], genres, keywords: [] },
    { anchorPopularity: filters.popularity, tierOneCap: 6, limit: 20 }
  );
  if (resolved.length > 0) return resolved;

  return searchTracks(genres.join(" "), accessToken, 20);
}
