import { NextResponse } from "next/server";

import { getConnectedSpotifyUser } from "@/lib/spotify-auth";

export async function GET() {
  const user = await getConnectedSpotifyUser();
  if (!user) {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({ connected: true, user });
}
