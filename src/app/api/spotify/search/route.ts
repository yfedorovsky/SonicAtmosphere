import { after, NextRequest, NextResponse } from "next/server";
import { searchTracks } from "@/lib/spotify";
import { generateRecommendations, songRecommendations } from "@/lib/recommendations";
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

    // Build a smarter search query from prompt + moods
    const searchQuery = buildSearchQuery(query, moods);

    // Run multiple varied searches in parallel for better coverage
    const queries = [searchQuery, ...getAlternateQueries(query, moods)];
    const results = await Promise.all(
      queries.map((q) => searchTracks(q, clientToken, 10))
    );

    // Merge and deduplicate
    const seen = new Set<string>();
    const tracks = results.flat().filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    }).slice(0, limit);

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

// Extract meaningful search keywords from a long prompt
function buildSearchQuery(prompt: string, moods: string[]): string {
  // Common filler words to strip
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

  // Extract meaningful words from prompt
  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Take top keywords (first few unique meaningful words)
  const keywords = [...new Set(words)].slice(0, 4);

  // Add mood terms if they aren't already in the keywords
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

  // Mood-based genre queries
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

  // Extract vibe-specific terms from prompt
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
    next: { revalidate: 3500 },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}
