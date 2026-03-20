import { cookies } from "next/headers";
import type { SpotifyTrack } from "@/types";

const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("spotify_access_token")?.value || null;
}

export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("spotify_refresh_token")?.value || null;
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
} | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) return null;
  return res.json();
}

async function spotifyFetch(
  path: string,
  accessToken: string,
  options?: RequestInit
): Promise<Response> {
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  return res;
}

export async function searchTracks(
  query: string,
  accessToken: string,
  limit = 20
): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(limit),
  });

  const res = await spotifyFetch(`/search?${params}`, accessToken);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.tracks?.items || []).map(mapSpotifyTrack);
}

export async function searchArtists(
  query: string,
  accessToken: string,
  limit = 5
): Promise<{ id: string; name: string; genres: string[] }[]> {
  const params = new URLSearchParams({
    q: query,
    type: "artist",
    limit: String(limit),
  });

  const res = await spotifyFetch(`/search?${params}`, accessToken);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.artists?.items || []).map((a: { id: string; name: string; genres: string[] }) => ({
    id: a.id,
    name: a.name,
    genres: a.genres || [],
  }));
}

export async function getRecommendations(
  accessToken: string,
  params: {
    seed_tracks?: string;
    seed_artists?: string;
    seed_genres?: string;
    target_energy?: number;
    target_acousticness?: number;
    target_popularity?: number;
    limit?: number;
  }
): Promise<SpotifyTrack[]> {
  const searchParams = new URLSearchParams();

  if (params.seed_tracks) searchParams.set("seed_tracks", params.seed_tracks);
  if (params.seed_artists) searchParams.set("seed_artists", params.seed_artists);
  if (params.seed_genres) searchParams.set("seed_genres", params.seed_genres);
  if (params.target_energy !== undefined)
    searchParams.set("target_energy", String(params.target_energy / 100));
  if (params.target_acousticness !== undefined)
    searchParams.set("target_acousticness", String(params.target_acousticness / 100));
  if (params.target_popularity !== undefined)
    searchParams.set("target_popularity", String(params.target_popularity));
  searchParams.set("limit", String(params.limit || 20));

  const res = await spotifyFetch(`/recommendations?${searchParams}`, accessToken);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.tracks || []).map(mapSpotifyTrack);
}

export async function getArtistTopTracks(
  artistId: string,
  accessToken: string
): Promise<SpotifyTrack[]> {
  const res = await spotifyFetch(`/artists/${artistId}/top-tracks`, accessToken);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.tracks || []).map(mapSpotifyTrack);
}

export async function getRelatedArtists(
  artistId: string,
  accessToken: string
): Promise<{ id: string; name: string; genres: string[] }[]> {
  const res = await spotifyFetch(`/artists/${artistId}/related-artists`, accessToken);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.artists || []).slice(0, 5).map((a: { id: string; name: string; genres: string[] }) => ({
    id: a.id,
    name: a.name,
    genres: a.genres || [],
  }));
}

export async function createPlaylist(
  accessToken: string,
  userId: string,
  name: string,
  description: string,
  trackUris: string[]
): Promise<{ url: string; id: string } | { error: string; status: number; step: string }> {
  // Create the playlist
  const createRes = await spotifyFetch("/me/playlists", accessToken, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      public: false,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    return { error: err, status: createRes.status, step: "create" };
  }
  const playlist = await createRes.json();

  // Add tracks (Spotify allows max 100 per request)
  for (let i = 0; i < trackUris.length; i += 100) {
    const batch = trackUris.slice(i, i + 100);
    const addRes = await spotifyFetch(`/playlists/${playlist.id}/items`, accessToken, {
      method: "POST",
      body: JSON.stringify({ uris: batch }),
    });
    if (!addRes.ok) {
      const err = await addRes.text();
      return { error: err, status: addRes.status, step: "add_tracks" };
    }
  }

  return {
    url: playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`,
    id: playlist.id,
  };
}

export async function getCurrentUser(
  accessToken: string
): Promise<{ id: string; display_name: string; images: { url: string }[]; email: string } | null> {
  const res = await spotifyFetch("/me", accessToken);
  if (!res.ok) return null;
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSpotifyTrack(t: any): SpotifyTrack {
  return {
    id: t.id,
    name: t.name,
    artists: (t.artists || []).map((a: { id: string; name: string }) => ({
      id: a.id,
      name: a.name,
    })),
    album: {
      id: t.album?.id || "",
      name: t.album?.name || "",
      images: t.album?.images || [],
    },
    duration_ms: t.duration_ms || 0,
    uri: t.uri,
    preview_url: t.preview_url || null,
    external_urls: t.external_urls || { spotify: "" },
    popularity: t.popularity || 0,
  };
}
