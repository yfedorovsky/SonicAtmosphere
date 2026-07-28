import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { FilterValues, GeneratorMode, SpotifyTrack } from "@/types";

// Anonymous-first: a user row is created lazily from the signed session
// cookie; Spotify OAuth links (or adopts) an account afterwards.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
});

export const spotifyAccounts = pgTable(
  "spotify_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    spotifyUserId: text("spotify_user_id").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    imageUrl: text("image_url"),
    // AES-256-GCM ciphertext (see src/lib/crypto.ts) — never plaintext.
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("spotify_accounts_spotify_user_id_idx").on(t.spotifyUserId),
    uniqueIndex("spotify_accounts_user_id_idx").on(t.userId),
  ],
);

// Draft ids are client-generated (crypto.randomUUID today, legacy short ids
// from the localStorage era) so the generator can navigate to /builder/{id}
// before the first autosave — hence text, not uuid.
export const playlistDrafts = pgTable(
  "playlist_drafts",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    coverUrl: text("cover_url"),
    prompt: text("prompt"),
    mode: text("mode").$type<GeneratorMode>(),
    filters: jsonb("filters").$type<FilterValues>(),
    lockedTrackIds: jsonb("locked_track_ids").$type<string[]>(),
    trackRationales: jsonb("track_rationales").$type<Record<string, string>>(),
    exportedUrl: text("exported_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("playlist_drafts_user_id_idx").on(t.userId, t.createdAt)],
);

export const draftTracks = pgTable(
  "draft_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: text("draft_id")
      .notNull()
      .references(() => playlistDrafts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    spotifyTrackId: text("spotify_track_id").notNull(),
    // Full SpotifyTrack snapshot — album art URLs and preview_url rot over
    // time, but a stale snapshot beats a broken draft; refresh is Sprint 4.
    data: jsonb("data").$type<SpotifyTrack>().notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // Unique: concurrent full-replace writes for the same draft fail cleanly
  // instead of interleaving duplicate track rows.
  (t) => [uniqueIndex("draft_tracks_draft_id_idx").on(t.draftId, t.position)],
);

// One row per generate call; recent-prompt history is derived from this.
export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    draftId: text("draft_id"),
    prompt: text("prompt").notNull(),
    mode: text("mode").$type<GeneratorMode>(),
    filters: jsonb("filters").$type<FilterValues>(),
    resultCount: integer("result_count"),
    source: text("source"),
    isRegenerate: boolean("is_regenerate").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("generation_runs_user_id_idx").on(t.userId, t.createdAt)],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("analytics_events_name_idx").on(t.name, t.createdAt)],
);
