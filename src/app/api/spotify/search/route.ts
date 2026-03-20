import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, searchTracks } from "@/lib/spotify";
import { generateRecommendations } from "@/lib/recommendations";
import { DEFAULT_FILTERS, type GeneratorMode } from "@/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || "vibe";
  const limit = parseInt(searchParams.get("limit") || "20");

  if (!query) {
    return NextResponse.json({ tracks: [] });
  }

  const accessToken = await getAccessToken();

  if (!accessToken) {
    // Fallback: use client credentials flow for search-only access
    const clientToken = await getClientCredentialsToken();
    if (!clientToken) {
      return NextResponse.json(
        { error: "Not authenticated. Connect Spotify to search." },
        { status: 401 }
      );
    }

    // Simple search with client credentials (no user-specific features)
    const tracks = await searchTracks(query, clientToken, limit);
    return NextResponse.json({ tracks });
  }

  // Direct track search (used by import matching)
  if (type === "track") {
    const tracks = await searchTracks(query, accessToken, limit);
    return NextResponse.json({ tracks });
  }

  // Full recommendations with user token
  const filters = {
    energy: parseInt(searchParams.get("energy") || "50"),
    acousticness: parseInt(searchParams.get("acousticness") || "50"),
    popularity: parseInt(searchParams.get("popularity") || "50"),
    moods: searchParams.get("moods")?.split(",").filter(Boolean) || [],
  };

  const tracks = await generateRecommendations(accessToken, query, type as GeneratorMode, filters);
  return NextResponse.json({ tracks });
}

async function getClientCredentialsToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    next: { revalidate: 3500 }, // Cache for ~1 hour (token lasts 3600s)
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}
