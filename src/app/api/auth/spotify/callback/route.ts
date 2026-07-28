import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, SESSION_COOKIE, sessionCookieOptions, sessionCookieValue } from "@/lib/session";
import { linkSpotifyAccount } from "@/lib/spotify-auth";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";

function errorRedirect(code: string): NextResponse {
  const response = NextResponse.redirect(`${APP_URL}?auth_error=${code}`);
  response.cookies.delete("spotify_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error) return errorRedirect(error);
  if (!code) return errorRedirect("no_code");

  const expectedState = request.cookies.get("spotify_oauth_state")?.value;
  if (!expectedState || state !== expectedState) {
    return errorRedirect("state_mismatch");
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = `${APP_URL}/api/auth/spotify/callback`;

  if (!clientId || !clientSecret) return errorRedirect("config");

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) return errorRedirect("token_exchange");

    const tokens = await tokenResponse.json();

    const profileResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) return errorRedirect("profile");
    const profile = await profileResponse.json();

    // Tokens now live encrypted in the database, keyed by the app user.
    const sessionUserId = await getSessionUserId();
    const userId = await linkSpotifyAccount(profile, tokens, sessionUserId);

    const response = NextResponse.redirect(`${APP_URL}/library`);
    response.cookies.set(SESSION_COOKIE, sessionCookieValue(userId), sessionCookieOptions);
    response.cookies.delete("spotify_oauth_state");
    // Retire the legacy plaintext token cookies.
    response.cookies.delete("spotify_access_token");
    response.cookies.delete("spotify_refresh_token");
    return response;
  } catch (err) {
    console.error("[auth] Spotify callback failed:", err);
    return errorRedirect("unknown");
  }
}
