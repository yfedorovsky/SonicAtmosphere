import { NextRequest, NextResponse } from "next/server";

import { fetchAudioFeatures } from "@/lib/audio-features";
import { arrangeForFlow, type FlowItem, type FlowMode } from "@/lib/sequencing";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getOrCreateUserId } from "@/lib/session";
import { trackEvent } from "@/lib/events";

const MAX_TRACKS = 200;

// "Arrange for flow" (DJ mode): reorder a playlist so adjacent tracks transition
// well. Pure re-ordering over audio features (energy/tempo/key from ReccoBeats +
// KV) — it never calls Spotify, so it spends no Spotify quota.
export async function POST(req: NextRequest) {
  const ipLimited = rateLimit(`sequence:ip:${clientIp(req)}`, 20, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);

  const userId = await getOrCreateUserId();
  const limited = rateLimit(`sequence:${userId}`, 12, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  try {
    const body = await req.json();
    const mode: FlowMode = body?.mode === "arc" ? "arc" : "smooth";
    const rawTracks = Array.isArray(body?.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [];
    // Client sends {id, tempo?}; tempo (when present) is the Deezer-reconciled
    // value carried on the track, preferred over the raw feature tempo.
    const tracks = rawTracks
      .map((t: { id?: unknown; tempo?: unknown }) => ({
        id: typeof t?.id === "string" ? t.id : "",
        tempo:
          typeof t?.tempo === "number" && Number.isFinite(t.tempo) ? (t.tempo as number) : undefined,
      }))
      .filter((t: { id: string }) => t.id);

    const ids: string[] = tracks.map((t: { id: string }) => t.id);
    if (ids.length < 5) {
      return NextResponse.json({ order: ids, changed: false });
    }

    const features = await fetchAudioFeatures(ids);
    const items: FlowItem[] = tracks.map((t: { id: string; tempo?: number }) => {
      const f = features.get(t.id);
      return {
        id: t.id,
        energy: f ? f.energy : null,
        tempo: t.tempo ?? (f ? f.tempo : null),
        key: f ? f.key : undefined,
        mode: f ? f.mode : undefined,
      };
    });

    const order = arrangeForFlow(items, mode);
    const changed = order.some((id, i) => id !== ids[i]);
    trackEvent(userId, "playlist_arranged", { mode, count: ids.length, changed });
    return NextResponse.json({ order, changed });
  } catch (error) {
    console.error("Sequence API error:", error);
    return NextResponse.json({ error: "Failed to arrange playlist" }, { status: 500 });
  }
}
