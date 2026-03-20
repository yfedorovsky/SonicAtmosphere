import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, getRefreshToken, refreshAccessToken, getCurrentUser, createPlaylist } from "@/lib/spotify";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  let accessToken = await getAccessToken();

  if (!accessToken) {
    // Try refreshing
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      const result = await refreshAccessToken(refreshToken);
      if (result) {
        accessToken = result.access_token;
        const cookieStore = await cookies();
        cookieStore.set("spotify_access_token", result.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: result.expires_in,
          path: "/",
        });
      }
    }
  }

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
    console.error("[playlist] Could not retrieve user profile — token may be expired");
    return NextResponse.json(
      { error: "Could not retrieve Spotify user profile. Try reconnecting Spotify." },
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

  if ("error" in result) {
    console.error("[playlist] Spotify API rejected playlist creation:", result.error);
    return NextResponse.json(
      { error: `Spotify error (${result.status}): ${result.error}` },
      { status: result.status }
    );
  }

  return NextResponse.json({ url: result.url, id: result.id });
}
