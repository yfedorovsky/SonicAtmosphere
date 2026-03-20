import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?auth_error=${error}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?auth_error=no_code`
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/spotify/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?auth_error=config`
    );
  }

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

    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?auth_error=token_exchange`
      );
    }

    const tokens = await tokenResponse.json();

    // Get user profile
    const profileResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const profile = profileResponse.ok ? await profileResponse.json() : null;

    // TODO: Store tokens securely (httpOnly cookie or encrypted session)
    // For MVP, we'll pass them via URL fragment to the client
    // In production, use a proper session/cookie approach

    const redirectUrl = new URL(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/library`
    );
    redirectUrl.searchParams.set("auth_success", "true");
    if (profile) {
      redirectUrl.searchParams.set("user_name", profile.display_name || "");
      redirectUrl.searchParams.set("user_id", profile.id || "");
    }

    const response = NextResponse.redirect(redirectUrl);

    // Store tokens in httpOnly cookies
    response.cookies.set("spotify_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in,
      path: "/",
    });

    if (tokens.refresh_token) {
      response.cookies.set("spotify_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      });
    }

    return response;
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}?auth_error=unknown`
    );
  }
}
