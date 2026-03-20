import {
  searchTracks,
  searchArtists,
  getRecommendations,
  getArtistTopTracks,
  getRelatedArtists,
  type RecommendationParams,
} from "./spotify";
import type { SpotifyTrack, GeneratorMode, FilterValues } from "@/types";

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

export async function generateRecommendations(
  accessToken: string,
  prompt: string,
  mode: GeneratorMode,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  switch (mode) {
    case "vibe":
      return vibeRecommendations(accessToken, prompt, filters);
    case "song":
      return songRecommendations(accessToken, prompt, filters);
    case "artist":
      return artistRecommendations(accessToken, prompt, filters);
    case "genre":
      return genreRecommendations(accessToken, prompt, filters);
    default:
      return searchTracks(prompt, accessToken, 20);
  }
}

async function vibeRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  const genres = extractGenresFromPrompt(prompt);
  const audioParams = extractAudioParams(prompt);
  const artistHints = extractArtistHints(prompt);

  // Add mood filters
  for (const mood of filters.moods) {
    const moodGenres = VIBE_TO_GENRES[mood.toLowerCase()];
    if (moodGenres) {
      moodGenres.forEach((g) => {
        if (genres.length < 5) genres.push(g);
      });
    }
  }

  // Seed mixing: try to combine artist seeds with genre seeds (max 5 total)
  let seedArtistIds: string[] = [];
  if (artistHints.length > 0) {
    const artistResults = await Promise.all(
      artistHints.map((name) => searchArtists(name, accessToken, 1))
    );
    seedArtistIds = artistResults
      .filter((r) => r.length > 0)
      .map((r) => r[0].id);
  }

  const totalSeeds = seedArtistIds.length + genres.length;
  if (totalSeeds > 0) {
    // Balance seeds: artists take priority, genres fill remaining slots
    const maxGenres = Math.max(0, 5 - seedArtistIds.length);
    const uniqueGenres = [...new Set(genres)].slice(0, maxGenres);

    const recParams: RecommendationParams = {
      target_energy: audioParams.target_energy ?? filters.energy,
      target_acousticness: audioParams.target_acousticness ?? filters.acousticness,
      target_popularity: filters.popularity,
      target_danceability: filters.danceability,
      target_valence: filters.valence,
      target_instrumentalness: filters.instrumentalness,
      // Spread negative prompting constraints
      ...filterConstraints(audioParams),
      limit: 20,
    };

    if (seedArtistIds.length > 0) {
      recParams.seed_artists = seedArtistIds.slice(0, 5).join(",");
    }
    if (uniqueGenres.length > 0) {
      recParams.seed_genres = uniqueGenres.join(",");
    }

    const tracks = await getRecommendations(accessToken, recParams);
    if (tracks.length > 0) return tracks;
  }

  // Fallback: search with prompt keywords
  return searchTracks(prompt, accessToken, 20);
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

async function songRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  const audioParams = extractAudioParams(prompt);

  // Search for the seed song
  const seedResults = await searchTracks(prompt, accessToken, 3);
  if (seedResults.length === 0) return [];

  const seedTrackIds = seedResults.map((t) => t.id).slice(0, 2);
  const seedArtistIds = seedResults
    .flatMap((t) => t.artists.map((a) => a.id))
    .slice(0, 3);

  // Get recommendations based on seed tracks with mixed seeds
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

  return tracks;
}

async function artistRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  // Search for the artist
  const artists = await searchArtists(prompt, accessToken, 1);
  if (artists.length === 0) {
    return searchTracks(prompt, accessToken, 20);
  }

  const artist = artists[0];

  // Get top tracks + related artist tracks
  const [topTracks, relatedArtists] = await Promise.all([
    getArtistTopTracks(artist.id, accessToken),
    getRelatedArtists(artist.id, accessToken),
  ]);

  // Also get recommendations seeded by this artist
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

  // Combine and deduplicate
  const allTracks = [...topTracks, ...recommended];
  const seen = new Set<string>();
  return allTracks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  }).slice(0, 25);
}

async function genreRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  // Clean up genre input
  const genres = prompt
    .toLowerCase()
    .split(/[,;\s]+/)
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (genres.length === 0) return [];

  const tracks = await getRecommendations(accessToken, {
    seed_genres: genres.join(","),
    target_energy: filters.energy,
    target_acousticness: filters.acousticness,
    target_popularity: filters.popularity,
    target_danceability: filters.danceability,
    target_valence: filters.valence,
    target_instrumentalness: filters.instrumentalness,
    limit: 20,
  });

  if (tracks.length > 0) return tracks;

  // Fallback: search by genre name
  return searchTracks(genres.join(" "), accessToken, 20);
}
