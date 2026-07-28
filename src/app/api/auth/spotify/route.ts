import { NextResponse } from "next/server";

import { randomToken } from "@/lib/crypto";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
  "user-read-email",
].join(" ");

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000"}/api/auth/spotify/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "Spotify Client ID not configured. Set SPOTIFY_CLIENT_ID in .env" },
      { status: 500 }
    );
  }

  const state = randomToken(16);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: "true",
  });

  const response = NextResponse.redirect(`${SPOTIFY_AUTH_URL}?${params.toString()}`);
  // CSRF protection: the callback rejects any response whose state doesn't
  // match this short-lived cookie.
  response.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
