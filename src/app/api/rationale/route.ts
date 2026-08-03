import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { trackEvent } from "@/lib/events";
import { fetchAudioFeatures } from "@/lib/audio-features";
import type { AudioFeatures } from "@/lib/spotify";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getOrCreateUserId } from "@/lib/session";

const MAX_TRACKS = 50;

// Deterministic per-track evidence from measured audio features — no LLM. An AI
// "why this track is here" note is post-hoc and can be unfaithful to the actual
// ranking (adversarial review C); this describes the track's real character
// (energy/danceability/acousticness/etc.) so the note is auditable, not
// invented. BPM is deliberately omitted — both providers mis-read double-time on
// many grooves, so a tempo claim on a general playlist erodes trust (see
// docs/ARCHITECTURE BPM display note).
function traitsFor(f?: AudioFeatures): string {
  if (!f) return "";
  const chips: string[] = [];
  if (f.energy >= 0.66) chips.push("high energy");
  else if (f.energy <= 0.33) chips.push("mellow");
  if (f.danceability >= 0.7) chips.push("danceable");
  if (f.acousticness >= 0.5) chips.push("acoustic");
  if (f.instrumentalness >= 0.5) chips.push("mostly instrumental");
  if (f.valence >= 0.66) chips.push("upbeat");
  else if (f.valence <= 0.3) chips.push("moody");
  const picked = chips.slice(0, 4);
  return picked.length ? picked.join(" · ") : "balanced, mid-tempo feel";
}

// "Why this track is here": a short per-track note for the builder. Two modes —
// mode:"traits" is deterministic (measured features, no Anthropic, no Spotify);
// the default is an AI prose note.
export async function POST(req: NextRequest) {
  // Both modes are cheap but hit an upstream (Anthropic or ReccoBeats), so gate.
  const ipLimited = rateLimit(`rationale:ip:${clientIp(req)}`, 12, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);
  const userId = await getOrCreateUserId();
  const limited = rateLimit(`rationale:${userId}`, 6, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const body = await req.json().catch(() => null);
  const mode = body?.mode === "traits" ? "traits" : "ai";
  const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 500) : "";
  const rawTracks = Array.isArray(body?.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [];
  const tracks = rawTracks
    .map((t: { id?: unknown; artist?: unknown; name?: unknown }) => ({
      id: typeof t?.id === "string" ? t.id : "",
      artist: typeof t?.artist === "string" ? t.artist.slice(0, 200) : "",
      name: typeof t?.name === "string" ? t.name.slice(0, 200) : "",
    }))
    .filter((t: { id: string }) => t.id);

  if (tracks.length === 0) {
    return NextResponse.json({ error: "No tracks provided" }, { status: 400 });
  }

  // --- Deterministic traits mode (no Anthropic key needed) ---
  if (mode === "traits") {
    try {
      const feats = await fetchAudioFeatures(tracks.map((t: { id: string }) => t.id));
      const rationales: Record<string, string> = {};
      for (const t of tracks) {
        const s = traitsFor(feats.get(t.id));
        if (s) rationales[t.id] = s;
      }
      trackEvent(userId, "traits_generated", { trackCount: tracks.length });
      return NextResponse.json({ rationales });
    } catch (error) {
      console.error("Traits generation error:", error);
      return NextResponse.json({ error: "Failed to compute track traits" }, { status: 500 });
    }
  }

  // --- AI prose mode (existing) ---
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  try {
    const trackList = tracks
      .map((t: { artist: string; name: string }, i: number) => `${i + 1}. ${t.artist} - ${t.name}`)
      .join("\n");

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are annotating a playlist whose vibe is: "${prompt || "a cohesive curated playlist"}".

Tracks:
${trackList}

For each track, in order, give one short reason (max 12 words) why it fits this playlist's vibe. Be specific to the track or artist when you can.

Respond ONLY with valid JSON in this exact format, no other text:
{"reasons": ["reason for track 1", "reason for track 2", ...]}`,
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No text response from Claude" }, { status: 500 });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(jsonStr);
    const reasons: unknown[] = Array.isArray(parsed.reasons) ? parsed.reasons : [];

    const rationales: Record<string, string> = {};
    tracks.forEach((t: { id: string }, i: number) => {
      const reason = reasons[i];
      if (typeof reason === "string" && reason.trim()) {
        rationales[t.id] = reason.trim().slice(0, 300);
      }
    });

    trackEvent(userId, "rationale_generated", { trackCount: tracks.length });
    return NextResponse.json({ rationales });
  } catch (error) {
    console.error("Claude API Error (rationale):", error);
    return NextResponse.json(
      { error: "Failed to generate track rationales" },
      { status: 500 }
    );
  }
}
