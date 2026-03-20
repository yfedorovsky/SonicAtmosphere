import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, getCurrentUser, createPlaylist } from "@/lib/spotify";

export async function POST(request: NextRequest) {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Connect Spotify first." },
      { status: 401 }
    );
  }

  const body = await request.json();
  const { name, description, trackUris } = body;

  if (!name || !trackUris || trackUris.length === 0) {
    return NextResponse.json(
      { error: "Playlist name and at least one track are required." },
      { status: 400 }
    );
  }

  const user = await getCurrentUser(accessToken);
  if (!user) {
    return NextResponse.json(
      { error: "Could not retrieve Spotify user profile." },
      { status: 500 }
    );
  }

  const result = await createPlaylist(
    accessToken,
    user.id,
    name,
    description || "Created with Sonic Atmosphere",
    trackUris
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to create playlist. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: result.url, id: result.id });
}
