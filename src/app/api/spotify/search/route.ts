import { after, NextRequest, NextResponse } from "next/server";
import { getClientCredentialsToken, searchTracks } from "@/lib/spotify";
import {
  generateRecommendations,
  keywordVibeSearch,
  songRecommendations,
} from "@/lib/recommendations";
import { type FilterValues, type GeneratorMode } from "@/types";

import { getDb } from "@/db";
import { generationRuns } from "@/db/schema";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getOrCreateUserId } from "@/lib/session";
import { getValidSpotifyToken } from "@/lib/spotify-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || "vibe";
  const limit = parseInt(searchParams.get("limit") || "20");

  if (!query) {
    return NextResponse.json({ tracks: [] });
  }

  // Import matching fires one small search per pasted line, so it gets a
  // looser bucket than full generation runs. IP gate comes first: cookieless
  // callers mint a fresh userId per request, so the per-user bucket alone is
  // trivially rotated.
  const isImportMatch = type === "track";
  const ip = clientIp(request);
  const ipLimited = isImportMatch
    ? rateLimit(`search-import:ip:${ip}`, 200, 60_000)
    : rateLimit(`search:ip:${ip}`, 60, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);

  const userId = await getOrCreateUserId();
  const limited = isImportMatch
    ? rateLimit(`search-import:${userId}`, 120, 60_000)
    : rateLimit(`search:${userId}`, 30, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const moods = searchParams.get("moods")?.split(",").filter(Boolean) || [];
  const filters: FilterValues = {
    energy: parseInt(searchParams.get("energy") || "50"),
    acousticness: parseInt(searchParams.get("acousticness") || "50"),
    popularity: parseInt(searchParams.get("popularity") || "50"),
    danceability: parseInt(searchParams.get("danceability") || "50"),
    valence: parseInt(searchParams.get("valence") || "50"),
    instrumentalness: parseInt(searchParams.get("instrumentalness") || "50"),
    moods,
  };
  const runContext = {
    userId,
    draftId: searchParams.get("draftId"),
    prompt: query.slice(0, 2000),
    mode: type as GeneratorMode,
    filters,
    isRegenerate: searchParams.get("regen") === "1",
  };

  const accessToken = await getValidSpotifyToken();

  if (!accessToken) {
    // Fallback: use client credentials flow for search-only access
    const clientToken = await getClientCredentialsToken();
    if (!clientToken) {
      return NextResponse.json(
        { error: "Not authenticated. Connect Spotify to search." },
        { status: 401 }
      );
    }

    // Song mode's similarity logic only needs endpoints client-credentials
    // tokens can reach — use it even without a connected Spotify account.
    if (type === "song") {
      const tracks = await songRecommendations(clientToken, query, filters);
      logGenerationRun({ ...runContext, source: "client-credentials", resultCount: tracks.length });
      return NextResponse.json({ tracks });
    }

    const tracks = await keywordVibeSearch(clientToken, query, moods, limit);

    if (!isImportMatch) {
      logGenerationRun({ ...runContext, source: "client-credentials", resultCount: tracks.length });
    }
    return NextResponse.json({ tracks });
  }

  // Direct track search (used by import matching) — not a generation run
  if (isImportMatch) {
    const tracks = await searchTracks(query, accessToken, limit);
    return NextResponse.json({ tracks });
  }

  const tracks = await generateRecommendations(accessToken, query, type as GeneratorMode, filters);

  // If recommendations returned empty, fall back to search
  if (tracks.length === 0) {
    const searchResults = await searchTracks(query, accessToken, limit);
    logGenerationRun({ ...runContext, source: "fallback-search", resultCount: searchResults.length });
    return NextResponse.json({ tracks: searchResults });
  }

  logGenerationRun({ ...runContext, source: "recommendations", resultCount: tracks.length });
  return NextResponse.json({ tracks });
}

// A failed log line must never fail the search; after() defers the write to
// post-response and keeps serverless instances alive until it lands.
function logGenerationRun(run: {
  userId: string;
  draftId: string | null;
  prompt: string;
  mode: GeneratorMode;
  filters: FilterValues;
  isRegenerate: boolean;
  source: string;
  resultCount: number;
}): void {
  after(async () => {
    try {
      const db = await getDb();
      await db.insert(generationRuns).values(run);
    } catch (err) {
      console.error("[search] failed to log generation run", err);
    }
  });
}
