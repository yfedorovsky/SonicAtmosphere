import { eq } from "drizzle-orm";

import type { Db } from "@/db";
import { refreshRules } from "@/db/schema";
import { getDraftById, upsertDraft } from "@/lib/drafts";
import { trackEvent } from "@/lib/events";
import { generateRecommendations } from "@/lib/recommendations";
import { getClientCredentialsToken } from "@/lib/spotify";
import { getSpotifyTokenForUser } from "@/lib/spotify-auth";
import type { SpotifyTrack } from "@/types";
import { DEFAULT_FILTERS } from "@/types";

export type RefreshRule = typeof refreshRules.$inferSelect;

// Rule-shaped input for manual "Refresh now" on drafts without a saved rule.
export interface RefreshSpec {
  id?: string;
  userId: string;
  draftId: string;
  cadence: "daily" | "weekly";
  keepPercent: number;
  artistRepeatWindow: number | null;
}

export interface RefreshResult {
  ok: boolean;
  replaced: number;
  reason?: string;
}

export function nextRunTime(cadence: "daily" | "weekly", from = new Date()): Date {
  const ms = cadence === "daily" ? 24 * 3_600_000 : 7 * 24 * 3_600_000;
  return new Date(from.getTime() + ms);
}

// The living-playlist core: keep the best-fitting keepPercent (locked tracks
// always survive), rotate the rest with fresh suggestions from the draft's
// own generation context.
export async function runRefresh(db: Db, spec: RefreshSpec): Promise<RefreshResult> {
  const draft = await getDraftById(db, spec.userId, spec.draftId);
  if (!draft || draft.tracks.length === 0) {
    return { ok: false, replaced: 0, reason: "Draft is empty or missing" };
  }

  const total = draft.tracks.length;
  const keepCount = Math.min(
    total,
    Math.max(0, Math.round((spec.keepPercent / 100) * total)),
  );
  const lockedIds = new Set(draft.lockedTrackIds ?? []);

  // Keepers: locked tracks first (locks always win over the percentage),
  // then the tracks closest to the draft's average popularity — a proxy for
  // "most representative" while audio features are unavailable to this app.
  const meanPopularity = draft.tracks.reduce((s, t) => s + t.popularity, 0) / total;
  const keepers = new Set<string>(lockedIds);
  const unlockedRanked = draft.tracks
    .filter((t) => !lockedIds.has(t.id))
    .sort(
      (a, b) =>
        Math.abs(a.popularity - meanPopularity) - Math.abs(b.popularity - meanPopularity),
    );
  for (const t of unlockedRanked) {
    if (keepers.size >= keepCount) break;
    keepers.add(t.id);
  }
  if (keepers.size >= total) {
    return { ok: true, replaced: 0, reason: "All tracks kept" };
  }

  // Fresh candidates from the draft's own generation context.
  const prompt = draft.prompt || draft.title || "playlist";
  const filters = draft.filters ?? DEFAULT_FILTERS;
  const mode = draft.mode && draft.mode !== "import" ? draft.mode : "vibe";

  const userToken = await getSpotifyTokenForUser(spec.userId);
  const token = userToken ?? (await getClientCredentialsToken());
  if (!token) return { ok: false, replaced: 0, reason: "No Spotify access" };

  // sequence: false — rotation picks the first passing candidates, so the
  // list must stay fit-ranked, not flow-ordered.
  const recommended = await generateRecommendations(token, prompt, mode, filters, {
    sequence: false,
  });
  // Degraded candidates are plain keyword-search output (e.g. the LLM was
  // unavailable). Rotating them into a living playlist trades curated tracks
  // for junk — keep the current tracks and let the next run rotate them.
  if (recommended.degraded) {
    console.warn(`[refresh] draft ${spec.draftId}: AI engine unavailable — skipping rotation`);
    return { ok: false, replaced: 0, reason: "AI engine unavailable — kept existing tracks" };
  }
  const candidates = recommended.tracks;

  const existing = new Set(draft.tracks.map((t) => t.id));
  const pool = candidates.filter((t) => !existing.has(t.id));
  console.log(
    `[refresh] draft ${spec.draftId}: ${candidates.length} candidates, ${pool.length} fresh, keeping ${keepers.size}/${total}, token=${userToken ? "user" : "app"}`,
  );
  if (pool.length === 0) {
    return { ok: false, replaced: 0, reason: "No fresh suggestions found" };
  }

  // Rebuild the list in order: keepers stay in place, rotated slots take the
  // first candidate that doesn't repeat an artist within the window.
  const window = spec.artistRepeatWindow ?? 0;
  const newTracks: SpotifyTrack[] = [];
  let replaced = 0;
  for (const t of draft.tracks) {
    if (keepers.has(t.id)) {
      newTracks.push(t);
      continue;
    }
    const idx = pool.findIndex((c) => !violatesArtistWindow(newTracks, c, window));
    if (idx >= 0) {
      newTracks.push(pool.splice(idx, 1)[0]);
      replaced += 1;
    }
    // No fitting candidate: the slot is dropped rather than repeating an artist.
  }
  if (replaced === 0) {
    return { ok: false, replaced: 0, reason: "No fresh suggestions found" };
  }

  const rationales = { ...draft.trackRationales };
  for (const t of draft.tracks) {
    if (!keepers.has(t.id)) delete rationales[t.id];
  }

  await upsertDraft(db, spec.userId, {
    ...draft,
    tracks: newTracks,
    trackRationales: rationales,
    updatedAt: new Date().toISOString(),
  });

  if (spec.id) {
    await db
      .update(refreshRules)
      .set({ lastRunAt: new Date(), nextRunAt: nextRunTime(spec.cadence), updatedAt: new Date() })
      .where(eq(refreshRules.id, spec.id));
  }
  trackEvent(spec.userId, "refresh_run", { draftId: spec.draftId, replaced });
  return { ok: true, replaced };
}

function violatesArtistWindow(
  placed: SpotifyTrack[],
  candidate: SpotifyTrack,
  window: number,
): boolean {
  if (window <= 0) return false;
  const candidateArtists = new Set(candidate.artists.map((a) => a.id));
  const recent = placed.slice(Math.max(0, placed.length - (window - 1)));
  return recent.some((t) => t.artists.some((a) => candidateArtists.has(a.id)));
}
