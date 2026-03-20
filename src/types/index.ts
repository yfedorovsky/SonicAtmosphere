export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  duration_ms: number;
  uri: string;
  preview_url: string | null;
  external_urls: { spotify: string };
  popularity: number;
}

export interface ParsedTrackLine {
  raw: string;
  artist: string;
  title: string;
  lineNumber: number;
}

export interface MatchedTrack {
  parsed: ParsedTrackLine;
  match: SpotifyTrack | null;
  status: "matched" | "unmatched" | "skipped" | "confirmed";
}

export interface PlaylistDraft {
  id: string;
  title: string;
  description: string;
  tracks: SpotifyTrack[];
  coverUrl?: string;
  prompt?: string;
  mode?: GeneratorMode;
  filters?: FilterValues;
  createdAt: string;
  updatedAt: string;
  exportedUrl?: string;
}

export type GeneratorMode = "vibe" | "song" | "artist" | "genre" | "import";

export interface FilterValues {
  energy: number;
  acousticness: number;
  popularity: number;
  danceability: number;
  valence: number;
  instrumentalness: number;
  moods: string[];
}

export interface SpotifyAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  user: SpotifyUser | null;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  images: { url: string }[];
  email: string;
}

export const MOOD_OPTIONS = [
  "Electronic",
  "Dreamy",
  "Melancholic",
  "Nocturnal",
  "Ambient",
  "Acoustic",
  "Shoegaze",
  "Lo-fi",
  "Cinematic",
  "Energetic",
  "Chill",
  "Dark",
  "Happy",
  "Romantic",
  "Folk",
  "Jazz",
  "Rock",
  "Pop",
  "Punk",
  "Metal",
  "Classical",
  "Synthwave",
  "Indie",
  "Party",
  "Workout",
  "Study",
  "Coffee",
  "Rainy",
  "Summer",
  "Driving",
] as const;

export type MoodOption = (typeof MOOD_OPTIONS)[number];

export const DEFAULT_FILTERS: FilterValues = {
  energy: 50,
  acousticness: 50,
  popularity: 50,
  danceability: 50,
  valence: 50,
  instrumentalness: 50,
  moods: [],
};

// Map prompt keywords to suggested vibe anchors
const PROMPT_TO_MOODS: Record<string, string[]> = {
  workout: ["Workout", "Energetic"],
  gym: ["Workout", "Energetic"],
  fitness: ["Workout", "Energetic"],
  running: ["Workout", "Energetic"],
  study: ["Study", "Chill", "Lo-fi"],
  focus: ["Study", "Ambient"],
  chill: ["Chill", "Lo-fi"],
  relax: ["Chill", "Ambient"],
  party: ["Party", "Energetic", "Electronic"],
  club: ["Party", "Electronic"],
  dance: ["Party", "Electronic", "Energetic"],
  rain: ["Rainy", "Melancholic", "Ambient"],
  night: ["Nocturnal", "Chill"],
  "late night": ["Nocturnal", "Lo-fi", "Chill"],
  morning: ["Coffee", "Acoustic"],
  coffee: ["Coffee", "Jazz", "Acoustic"],
  road: ["Driving", "Rock", "Indie"],
  drive: ["Driving", "Rock"],
  summer: ["Summer", "Pop", "Happy"],
  sad: ["Melancholic", "Dreamy"],
  melanchol: ["Melancholic", "Dreamy"],
  happy: ["Happy", "Pop", "Energetic"],
  dark: ["Dark", "Nocturnal"],
  romantic: ["Romantic", "Chill"],
  love: ["Romantic"],
  jazz: ["Jazz", "Chill"],
  rock: ["Rock", "Energetic"],
  indie: ["Indie", "Dreamy"],
  folk: ["Folk", "Acoustic"],
  electronic: ["Electronic", "Synthwave"],
  synth: ["Synthwave", "Electronic"],
  ambient: ["Ambient", "Dreamy"],
  classical: ["Classical", "Ambient"],
  punk: ["Punk", "Energetic", "Rock"],
  metal: ["Metal", "Dark", "Energetic"],
  "lo-fi": ["Lo-fi", "Chill", "Study"],
  lofi: ["Lo-fi", "Chill", "Study"],
  shoegaze: ["Shoegaze", "Dreamy"],
  cinematic: ["Cinematic", "Ambient"],
  dreamy: ["Dreamy", "Shoegaze"],
  acoustic: ["Acoustic", "Folk"],
  anthems: ["Energetic", "Pop"],
  intense: ["Energetic", "Dark"],
  upbeat: ["Happy", "Energetic", "Pop"],
};

export function suggestMoodsFromPrompt(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const suggested = new Set<string>();

  for (const [keyword, moods] of Object.entries(PROMPT_TO_MOODS)) {
    if (lower.includes(keyword)) {
      moods.forEach((m) => suggested.add(m));
    }
  }

  return [...suggested].slice(0, 5);
}
