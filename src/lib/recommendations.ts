import {
  searchTracks,
  searchArtists,
  getRecommendations,
  getArtistTopTracks,
  getRelatedArtists,
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

function extractEnergyFromPrompt(prompt: string): Partial<{
  target_energy: number;
  target_acousticness: number;
}> {
  const lower = prompt.toLowerCase();
  const params: Partial<{ target_energy: number; target_acousticness: number }> = {};

  if (lower.includes("calm") || lower.includes("quiet") || lower.includes("soft") || lower.includes("gentle")) {
    params.target_energy = 20;
  } else if (lower.includes("high energy") || lower.includes("intense") || lower.includes("energetic")) {
    params.target_energy = 85;
  } else if (lower.includes("melanchol") || lower.includes("sad") || lower.includes("dreamy")) {
    params.target_energy = 30;
  }

  if (lower.includes("acoustic") || lower.includes("unplugged")) {
    params.target_acousticness = 80;
  } else if (lower.includes("electronic") || lower.includes("synth") || lower.includes("techno")) {
    params.target_acousticness = 10;
  }

  return params;
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
  const vibeParams = extractEnergyFromPrompt(prompt);

  // Add mood filters
  for (const mood of filters.moods) {
    const moodGenres = VIBE_TO_GENRES[mood.toLowerCase()];
    if (moodGenres) {
      moodGenres.forEach((g) => {
        if (genres.length < 5) genres.push(g);
      });
    }
  }

  if (genres.length > 0) {
    // Use recommendations API with genre seeds
    const tracks = await getRecommendations(accessToken, {
      seed_genres: [...new Set(genres)].slice(0, 5).join(","),
      target_energy: vibeParams.target_energy ?? filters.energy,
      target_acousticness: vibeParams.target_acousticness ?? filters.acousticness,
      target_popularity: filters.popularity,
      limit: 20,
    });
    if (tracks.length > 0) return tracks;
  }

  // Fallback: search with prompt keywords
  return searchTracks(prompt, accessToken, 20);
}

async function songRecommendations(
  accessToken: string,
  prompt: string,
  filters: FilterValues
): Promise<SpotifyTrack[]> {
  // Search for the seed song
  const seedResults = await searchTracks(prompt, accessToken, 3);
  if (seedResults.length === 0) return [];

  const seedTrackIds = seedResults.map((t) => t.id).slice(0, 2);
  const seedArtistIds = seedResults
    .flatMap((t) => t.artists.map((a) => a.id))
    .slice(0, 3);

  // Get recommendations based on seed tracks
  const tracks = await getRecommendations(accessToken, {
    seed_tracks: seedTrackIds.join(","),
    seed_artists: seedArtistIds.slice(0, 5 - seedTrackIds.length).join(","),
    target_energy: filters.energy,
    target_acousticness: filters.acousticness,
    target_popularity: filters.popularity,
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
    limit: 20,
  });

  if (tracks.length > 0) return tracks;

  // Fallback: search by genre name
  return searchTracks(genres.join(" "), accessToken, 20);
}
