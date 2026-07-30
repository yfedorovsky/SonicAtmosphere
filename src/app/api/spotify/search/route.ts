import { after, NextRequest, NextResponse } from "next/server";
import { getClientCredentialsToken, searchTracks } from "@/lib/spotify";
import { generateRecommendations, keywordVibeSearch } from "@/lib/recommendations";
import { budgetAllowsGeneration } from "@/lib/budget";
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

  // Every generator mode works with an app-only token now — the grounded
  // LLM + search pipeline needs nothing user-scoped.
  const accessToken = await getValidSpotifyToken();
  const token = accessToken ?? (await getClientCredentialsToken());
  if (!token) {
    return NextResponse.json(
      { error: "Not authenticated. Connect Spotify to search." },
      { status: 401 }
    );
  }

  // Direct track search (used by import matching) — not a generation run
  if (isImportMatch) {
    const tracks = await searchTracks(query, token, limit);
    return NextResponse.json({ tracks });
  }

  const source = accessToken ? "user-token" : "client-credentials";
  // sequence=0 keeps fit-ranked order for callers that consume the list
  // prefix as best-N candidates (replace weakest).
  const { tracks, degraded } = await generateRecommendations(
    token,
    query,
    type as GeneratorMode,
    filters,
    { sequence: request.nextUrl.searchParams.get("sequence") !== "0" }
  );

  // If recommendations returned empty, fall back to keyword search — UNLESS the
  // daily budget gate is what emptied it, in which case spraying more fallback
  // searches just burns quota on synthetic 429s. Keep the degraded path clean.
  if (tracks.length === 0) {
    if (!(await budgetAllowsGeneration(8))) {
      logGenerationRun({ ...runContext, source: `${source}-budget-exhausted`, resultCount: 0 });
      return NextResponse.json({ tracks: [], degraded: true });
    }
    const searchResults = await keywordVibeSearch(token, query, moods, limit);
    logGenerationRun({ ...runContext, source: `${source}-fallback`, resultCount: searchResults.length });
    return NextResponse.json({ tracks: searchResults, degraded: true });
  }

  // The degraded flag tells the client these tracks came from a plain-search
  // fallback (e.g. the LLM was unavailable), not the grounded engine.
  logGenerationRun({
    ...runContext,
    source: degraded ? `${source}-fallback` : source,
    resultCount: tracks.length,
  });
  return NextResponse.json({ tracks, degraded });
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
