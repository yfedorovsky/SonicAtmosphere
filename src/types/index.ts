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
] as const;

export type MoodOption = (typeof MOOD_OPTIONS)[number];

export const DEFAULT_FILTERS: FilterValues = {
  energy: 50,
  acousticness: 50,
  popularity: 50,
  moods: [],
};
