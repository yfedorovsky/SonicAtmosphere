import { asc, desc, eq, inArray } from "drizzle-orm";

import type { Db } from "@/db";
import { draftTracks, playlistDrafts } from "@/db/schema";
import type { FilterValues, GeneratorMode, PlaylistDraft, SpotifyTrack } from "@/types";

// Thrown when a draft id exists but belongs to a different user.
export class DraftAccessError extends Error {
  constructor() {
    super("Draft belongs to another user");
  }
}

const MAX_TRACKS = 500;
const GENERATOR_MODES: GeneratorMode[] = ["vibe", "song", "artist", "genre", "import"];

type DraftRow = typeof playlistDrafts.$inferSelect;

function rowToDraft(row: DraftRow, tracks: SpotifyTrack[]): PlaylistDraft {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tracks,
    coverUrl: row.coverUrl ?? undefined,
    prompt: row.prompt ?? undefined,
    mode: row.mode ?? undefined,
    filters: row.filters ?? undefined,
    lockedTrackIds: row.lockedTrackIds ?? undefined,
    trackRationales: row.trackRationales ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    exportedUrl: row.exportedUrl ?? undefined,
  };
}

function cappedString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

// Rebuild the track from scratch so a malformed payload can't persist a
// snapshot that later crashes the UI (missing album.images etc.).
function sanitizeTrack(t: SpotifyTrack): SpotifyTrack {
  return {
    id: t.id,
    name: t.name,
    artists: Array.isArray(t.artists)
      ? t.artists
          .filter((a) => a && typeof a === "object")
          .map((a) => ({
            id: typeof a.id === "string" ? a.id : "",
            name: typeof a.name === "string" ? a.name : "",
          }))
      : [],
    album: {
      id: typeof t.album?.id === "string" ? t.album.id : "",
      name: typeof t.album?.name === "string" ? t.album.name : "",
      images: Array.isArray(t.album?.images)
        ? t.album.images
            .filter((img) => img && typeof img.url === "string")
            .map((img) => ({
              url: img.url,
              width: Number.isFinite(img.width) ? img.width : 0,
              height: Number.isFinite(img.height) ? img.height : 0,
            }))
        : [],
    },
    duration_ms:
      typeof t.duration_ms === "number" && Number.isFinite(t.duration_ms) ? t.duration_ms : 0,
    uri: t.uri,
    preview_url: typeof t.preview_url === "string" ? t.preview_url : null,
    external_urls: {
      spotify: typeof t.external_urls?.spotify === "string" ? t.external_urls.spotify : "",
    },
    popularity: typeof t.popularity === "number" ? t.popularity : 0,
    ...(typeof t.tempo === "number" && Number.isFinite(t.tempo) ? { tempo: t.tempo } : {}),
    ...(typeof t.isrc === "string" && t.isrc.length <= 20 ? { isrc: t.isrc } : {}),
  };
}

function sanitizeFilters(raw: unknown): FilterValues | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const f = raw as Record<string, unknown>;
  const slider = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50;
  return {
    energy: slider(f.energy),
    acousticness: slider(f.acousticness),
    popularity: slider(f.popularity),
    danceability: slider(f.danceability),
    valence: slider(f.valence),
    instrumentalness: slider(f.instrumentalness),
    moods: Array.isArray(f.moods)
      ? f.moods.filter((m): m is string => typeof m === "string").slice(0, 20)
      : [],
  };
}

// Validates and sanitizes a client-supplied draft body. Returns null when the
// shape is unusable; otherwise a bounded PlaylistDraft safe to persist.
export function parseDraftPayload(body: unknown): PlaylistDraft | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id || id.length > 100) return null;

  const rawTracks = Array.isArray(raw.tracks) ? raw.tracks.slice(0, MAX_TRACKS) : [];
  const tracks: SpotifyTrack[] = [];
  for (const t of rawTracks) {
    if (!t || typeof t !== "object") return null;
    const track = t as SpotifyTrack;
    if (typeof track.id !== "string" || typeof track.uri !== "string" || typeof track.name !== "string") {
      return null;
    }
    tracks.push(sanitizeTrack(track));
  }

  const mode = GENERATOR_MODES.includes(raw.mode as GeneratorMode)
    ? (raw.mode as GeneratorMode)
    : undefined;

  const filters = sanitizeFilters(raw.filters);

  // Only keep lock ids / rationale keys that reference tracks in the draft.
  const trackIds = new Set(tracks.map((t) => t.id));
  const lockedTrackIds = Array.isArray(raw.lockedTrackIds)
    ? raw.lockedTrackIds
        .filter((v): v is string => typeof v === "string" && trackIds.has(v))
        .slice(0, MAX_TRACKS)
    : undefined;

  let trackRationales: Record<string, string> | undefined;
  if (raw.trackRationales && typeof raw.trackRationales === "object") {
    trackRationales = {};
    for (const [key, value] of Object.entries(raw.trackRationales)) {
      if (trackIds.has(key) && typeof value === "string") {
        trackRationales[key] = value.slice(0, 300);
      }
    }
  }

  const createdAt =
    typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt))
      ? raw.createdAt
      : new Date().toISOString();

  return {
    id,
    title: cappedString(raw.title, 300),
    description: cappedString(raw.description, 2000),
    tracks,
    coverUrl: typeof raw.coverUrl === "string" ? raw.coverUrl.slice(0, 1000) : undefined,
    prompt: typeof raw.prompt === "string" ? raw.prompt.slice(0, 2000) : undefined,
    mode,
    filters,
    lockedTrackIds,
    trackRationales,
    createdAt,
    updatedAt: new Date().toISOString(),
    exportedUrl:
      typeof raw.exportedUrl === "string" ? raw.exportedUrl.slice(0, 1000) : undefined,
  };
}

export async function listDrafts(db: Db, userId: string): Promise<PlaylistDraft[]> {
  const rows = await db
    .select()
    .from(playlistDrafts)
    .where(eq(playlistDrafts.userId, userId))
    .orderBy(desc(playlistDrafts.createdAt));
  if (rows.length === 0) return [];

  const trackRows = await db
    .select()
    .from(draftTracks)
    .where(
      inArray(
        draftTracks.draftId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(draftTracks.position));

  const byDraft = new Map<string, SpotifyTrack[]>();
  for (const t of trackRows) {
    let arr = byDraft.get(t.draftId);
    if (!arr) {
      arr = [];
      byDraft.set(t.draftId, arr);
    }
    arr.push(t.data);
  }
  return rows.map((r) => rowToDraft(r, byDraft.get(r.id) ?? []));
}

export async function getDraftById(
  db: Db,
  userId: string,
  id: string,
): Promise<PlaylistDraft | null> {
  const [row] = await db
    .select()
    .from(playlistDrafts)
    .where(eq(playlistDrafts.id, id))
    .limit(1);
  if (!row) return null;
  if (row.userId !== userId) throw new DraftAccessError();

  const trackRows = await db
    .select()
    .from(draftTracks)
    .where(eq(draftTracks.draftId, id))
    .orderBy(asc(draftTracks.position));
  return rowToDraft(
    row,
    trackRows.map((t) => t.data),
  );
}

// Full-replacement upsert, mirroring the localStorage-era save semantics:
// the client sends the whole draft, tracks are rewritten in order.
export async function upsertDraft(
  db: Db,
  userId: string,
  draft: PlaylistDraft,
): Promise<PlaylistDraft> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ userId: playlistDrafts.userId, createdAt: playlistDrafts.createdAt })
      .from(playlistDrafts)
      .where(eq(playlistDrafts.id, draft.id))
      .limit(1);
    if (existing && existing.userId !== userId) throw new DraftAccessError();

    const now = new Date();
    const values = {
      id: draft.id,
      userId,
      title: draft.title,
      description: draft.description,
      coverUrl: draft.coverUrl ?? null,
      prompt: draft.prompt ?? null,
      mode: draft.mode ?? null,
      filters: draft.filters ?? null,
      lockedTrackIds: draft.lockedTrackIds ?? null,
      trackRationales: draft.trackRationales ?? null,
      exportedUrl: draft.exportedUrl ?? null,
      createdAt: existing ? existing.createdAt : new Date(draft.createdAt),
      updatedAt: now,
    };

    const [row] = await tx
      .insert(playlistDrafts)
      .values(values)
      .onConflictDoUpdate({
        target: playlistDrafts.id,
        set: {
          title: values.title,
          description: values.description,
          coverUrl: values.coverUrl,
          prompt: values.prompt,
          mode: values.mode,
          filters: values.filters,
          lockedTrackIds: values.lockedTrackIds,
          trackRationales: values.trackRationales,
          exportedUrl: values.exportedUrl,
          updatedAt: now,
        },
        // Guards the race the SELECT above can miss: if the conflicting row
        // belongs to another user, update nothing and bail below.
        setWhere: eq(playlistDrafts.userId, userId),
      })
      .returning();
    if (!row) throw new DraftAccessError();

    await tx.delete(draftTracks).where(eq(draftTracks.draftId, draft.id));
    if (draft.tracks.length > 0) {
      await tx.insert(draftTracks).values(
        draft.tracks.map((t, i) => ({
          draftId: draft.id,
          position: i,
          spotifyTrackId: t.id,
          data: t,
        })),
      );
    }

    return rowToDraft(row, draft.tracks);
  });
}

export async function deleteDraftById(db: Db, userId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: playlistDrafts.userId })
    .from(playlistDrafts)
    .where(eq(playlistDrafts.id, id))
    .limit(1);
  if (!row) return false;
  if (row.userId !== userId) throw new DraftAccessError();
  await db.delete(playlistDrafts).where(eq(playlistDrafts.id, id));
  return true;
}
