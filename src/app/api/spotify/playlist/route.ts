import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, trackUris } = body;

  if (!name || !trackUris || trackUris.length === 0) {
    return NextResponse.json(
      { error: "Playlist name and at least one track are required" },
      { status: 400 }
    );
  }

  // TODO: Wire to real Spotify API
  // 1. Get user ID from access token
  // 2. POST /v1/users/{user_id}/playlists to create playlist
  // 3. POST /v1/playlists/{playlist_id}/tracks to add tracks
  // 4. Return playlist URL

  return NextResponse.json({
    error: "Spotify not connected. Please connect your Spotify account first.",
  }, { status: 401 });
}
