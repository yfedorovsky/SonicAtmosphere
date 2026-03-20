import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, getRecommendations } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Connect Spotify first." },
      { status: 401 }
    );
  }

  const params = {
    seed_tracks: searchParams.get("seed_tracks") || undefined,
    seed_artists: searchParams.get("seed_artists") || undefined,
    seed_genres: searchParams.get("seed_genres") || undefined,
    target_energy: searchParams.has("energy")
      ? parseInt(searchParams.get("energy")!)
      : undefined,
    target_acousticness: searchParams.has("acousticness")
      ? parseInt(searchParams.get("acousticness")!)
      : undefined,
    target_popularity: searchParams.has("popularity")
      ? parseInt(searchParams.get("popularity")!)
      : undefined,
    limit: parseInt(searchParams.get("limit") || "20"),
  };

  const tracks = await getRecommendations(accessToken, params);
  return NextResponse.json({ tracks });
}
