import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seedTracks = searchParams.get("seed_tracks") || "";
  const seedArtists = searchParams.get("seed_artists") || "";

  // TODO: Wire to real Spotify Recommendations API
  // This endpoint will use:
  // - seed_tracks, seed_artists, seed_genres
  // - target_energy, target_acousticness, target_popularity
  // to get personalized recommendations

  return NextResponse.json({
    tracks: [],
    message: "Recommendations endpoint stub. Connect Spotify to enable.",
  });
}
