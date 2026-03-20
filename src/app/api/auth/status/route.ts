import { NextResponse } from "next/server";
import { getAccessToken, getCurrentUser, getRefreshToken, refreshAccessToken } from "@/lib/spotify";
import { cookies } from "next/headers";

export async function GET() {
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
    return NextResponse.json({ connected: false });
  }

  const user = await getCurrentUser(accessToken);
  if (!user) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    user: {
      id: user.id,
      display_name: user.display_name,
      images: user.images,
      email: user.email,
    },
  });
}
