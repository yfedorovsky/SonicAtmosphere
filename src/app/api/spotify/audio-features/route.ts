import { NextRequest, NextResponse } from "next/server";
import { fetchAudioFeatures } from "@/lib/audio-features";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

// Served from ReccoBeats (keyed by Spotify id) because Spotify's own
// /audio-features endpoint is 403 for this app tier. No Spotify auth needed.
export async function GET(request: NextRequest) {
  const ipLimited = rateLimit(`features:ip:${clientIp(request)}`, 30, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "Missing track IDs" }, { status: 400 });
  }

  const trackIds = ids.split(",").filter(Boolean).slice(0, 100);
  const features = await fetchAudioFeatures(trackIds);

  return NextResponse.json({ audio_features: [...features.values()] });
}
