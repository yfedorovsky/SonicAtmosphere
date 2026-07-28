import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { playlistDrafts } from "@/db/schema";
import { trackEvent } from "@/lib/events";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";
import { createPlaylist, getCurrentUser } from "@/lib/spotify";
import { getValidSpotifyToken } from "@/lib/spotify-auth";

export async function POST(request: NextRequest) {
  const accessToken = await getValidSpotifyToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Not authenticated. Connect Spotify first." },
      { status: 401 }
    );
  }

  const userId = await getSessionUserId();
  const limited = rateLimit(`playlist:${userId ?? "legacy"}`, 10, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const body = await request.json();
  const { name, description, trackUris, draftId } = body;

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

  // Record the export server-side so the flag survives even if the client's
  // next autosave races this response.
  if (userId && typeof draftId === "string" && draftId) {
    try {
      const db = await getDb();
      await db
        .update(playlistDrafts)
        .set({ exportedUrl: result.url, updatedAt: new Date() })
        .where(and(eq(playlistDrafts.id, draftId), eq(playlistDrafts.userId, userId)));
    } catch (err) {
      console.error("[playlist] failed to record exportedUrl on draft:", err);
    }
  }
  trackEvent(userId, "export_success", { trackCount: trackUris.length });

  return NextResponse.json({ url: result.url, id: result.id });
}
