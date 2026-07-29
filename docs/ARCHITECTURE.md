# Architecture

How Sonic Atmosphere is put together: identity, data model, the generation pipeline, the editing loop, living playlists, and the constraints that shaped all of it.

## Design principles

- **Spotify is an identity provider, catalog source, and export target — not the data model.** All app state (users, drafts, tracks, rules, templates, analytics) lives in the app's own Postgres.
- **Anonymous-first.** Nobody signs up. A signed cookie mints a user on first meaningful action; connecting Spotify upgrades that identity and makes it portable across devices.
- **The editing loop is the product.** Generation gets you a rough cut; locks, targeted replacement, and scheduled refresh make it a playlist worth keeping.
- **Claude fills the gaps Spotify closed.** Newer Spotify app tiers lost every similarity endpoint; LLM-proposed neighborhoods resolved through plain search replace them.

## Identity & sessions

`src/lib/session.ts`, `src/lib/crypto.ts`

- The session cookie `sa_uid` holds `<uuid>.<HMAC-SHA256(uuid)>`, signed with `SESSION_SECRET`. Tampering invalidates it; no session table is needed.
- `getSessionUserId()` verifies without touching the DB. `getOrCreateUserId()` lazily inserts the `users` row (and re-creates it if a dev DB was wiped, so stale cookies keep working).
- **Spotify linking** (`src/lib/spotify-auth.ts`): the OAuth callback validates a signed `state` cookie (CSRF), exchanges the code, then either links the Spotify account to the current session user or — if that Spotify account is already linked to another user row — **adopts** that user, so drafts follow the Spotify identity across browsers/devices. Re-connecting a *different* Spotify account replaces the link (one account per user, enforced by a unique index).
- **Token storage**: Spotify access/refresh tokens are AES-256-GCM-encrypted (key derived from `SESSION_SECRET`) in `spotify_accounts`. Refresh happens server-side with a 60s early-refresh buffer; rotated refresh tokens are persisted. `getSpotifyTokenForUser(userId)` is the cookie-free variant used by background jobs. Legacy pre-database cookie tokens still work as a read-only fallback.

## Data model

`src/db/schema.ts` — Drizzle ORM, Postgres dialect.

| Table | Notes |
|---|---|
| `users` | Anonymous-first identity; uuid PK |
| `spotify_accounts` | 1:1 with users (unique `user_id`), unique `spotify_user_id`, encrypted tokens, profile snapshot |
| `playlist_drafts` | **Text PK — ids are client-generated** (`crypto.randomUUID()`, legacy short ids) so the generator can navigate to `/builder/{id}` before the first autosave. Holds title/description, generation context (`prompt`, `mode`, `filters`), `locked_track_ids`, `track_rationales`, `exported_url` |
| `draft_tracks` | Position-ordered full `SpotifyTrack` JSON snapshots; unique `(draft_id, position)` so concurrent full-replace writes fail cleanly instead of interleaving |
| `generation_runs` | One row per generate call: prompt, mode, filters, source, `is_regenerate`, result count. Prompt history is derived from this — no separate table |
| `playlist_templates` | Saved generation recipes (name + prompt/mode/filters) |
| `refresh_rules` | One per draft (unique `draft_id`): cadence, keep-percent, artist-repeat window, `next_run_at` |
| `analytics_events` | Fire-and-forget product events (`export_success`, `auto_title_generated`, `rationale_generated`, `refresh_run`) |

**Drivers** (`src/db/index.ts`): `DATABASE_URL` set → postgres-js; unset → embedded PGlite in `.pglite/` (real Postgres compiled to WASM — same SQL, zero local setup). Migrations from `drizzle/` run automatically on first connection; the client is a promise cached on `globalThis` (HMR-safe), and a failed init is *not* cached so transient errors don't poison the process. Production on Vercel without `DATABASE_URL` fails loudly at startup.

**Draft persistence semantics**: `PUT /api/drafts/[id]` is a full-replace upsert inside a transaction — draft row upserted (ownership enforced both by a pre-check and a `setWhere` on the conflict update, closing the TOCTOU race), tracks deleted and reinserted in order. Payloads are deeply sanitized (`parseDraftPayload`) so malformed input can't persist snapshots that crash the UI; lock ids and rationale keys are pruned to tracks actually present.

## Generation pipeline

`GET /api/spotify/search` → `src/lib/recommendations.ts`

Token resolution first: connected user token (DB, auto-refresh) → else app-only client-credentials token (cached in-process with explicit expiry — Next's fetch cache serves stale entries while revalidating, which handed out expired tokens). **Every mode works with the app-only token**; generation quality does not depend on a Spotify login.

**All four modes run one grounded LLM→search pipeline** (`askNeighborhood` + `resolveAndRank`). Each mode first attempts the native `/recommendations` path (works only for grandfathered apps; typically 403), then:

1. **Grounding** — gather signals this app tier can still read: the relevant artist's own catalog (`artist:"…"` search) and the *names* of public playlists matching the song/artist/vibe (playlist metadata is searchable even though playlist items are 403). These describe the actual style so the model never guesses blind.
2. **Neighborhood** — one `claude-opus-5` JSON call proposes up to 8 real artists + 3 Spotify genre terms (+ optional keyword phrases for vibe mode), instructed to anchor on any referenced song/artist, infer unknown artists strictly from the grounding clues, and read sensory language ("coffee aroma") as mood, never literally. Refusals and failures degrade gracefully to catalog/keyword fallbacks.
3. **Resolution & hygiene** (`resolveAndRank`) — Spotify search resolves the neighborhood with strict filters: artist-search results must have the queried artist as the **primary** artist (kills fuzzy matches and featured-credit pollution); dedupe by id *and* normalized artist+title (re-releases carry different ids); tracks under 61s dropped (skits/interludes); genre/keyword results ride a lower tier capped at a few slots; a per-credited-artist cap of 2 stops floods; results sort by tier then popularity-proximity to an anchor (the seed track's popularity, or the UI's popularity slider — making that slider meaningful).

Per mode: **Song** leads with the seed itself (seed resolution prefers the most popular of the top text matches — cover-farm defense); **Vibe** is grounded by playlist names matching the vibe keywords; **Artist** is a grounded artist radio (own catalog at tier 0 + similar artists); **Genre** has Claude name the genre's canon and blends it with `genre:"…"` field search.

**Tempo targeting** (`extractTempoTarget` → `annotateAndRankByTempo`): an explicit BPM in the prompt ("at 128 BPM", "170–180 BPM") or a workout keyword (running, cycling/spin, HIIT/bootcamp, power walking) sets a target window. The window is passed as a hint into the neighborhood prompt, and after resolution every track is annotated with its BPM (from ReccoBeats — see below) and stable-sorted by distance to the window, where half- and double-time readings count as equivalent (an 87 BPM groove locks to a 174 SPM stride) and unknown tempo prices as a moderate fixed distance. Nothing is dropped — tempo data has gaps, and a shorter playlist is worse than an imperfect tail. Song mode keeps its seed pinned first.

Quality was validated by an adversarial judge panel across five genres (psych-funk, IDM, americana, hip-hop, classical) and cross-checked against last.fm similar-artist data. Cost: one Opus call per generation (fraction of a cent), bounded by the search rate limits.

Every generator call logs a `generation_runs` row (fire-and-forget via `next/server after()`); import matching (`type=track`) is exempt so pasted lists don't pollute prompt history.

## The editing loop

Client state: `usePlaylistStore` (zustand + zundo) holds the working draft; `useDraftsStore` is the server-synced library.

- **Locks** — `lockedTrackIds` on the draft. UI blocks removal; replace/refresh operations treat locked tracks as untouchable. Removing a track prunes its lock and rationale entries.
- **Replace weakest N** (`replace-weakest-panel.tsx`) — scores unlocked tracks by vibe-drift (audio-feature z-distance when available, popularity-distance from the draft mean otherwise), fetches fresh candidates through the normal search route with modifier-adjusted filters, and swaps in place via `replaceTracks` — a single store update, hence a **single undo step**.
- **Rationale** (`POST /api/rationale`) — one Haiku call for all unexplained tracks, answers keyed by input order, stored in `track_rationales`, rendered under the artist line.
- **Autosave** — the builder debounces 2s and **only writes when the draft diverged from its last loaded/saved serialization**, so opening a draft never overwrites newer server state. PUTs are serialized per draft (ordered queue) so a slow save can't clobber a newer one. Undo history is cleared when switching drafts.
- **Hydration** — the app shell hydrates the library once (including a one-time localStorage → server migration of pre-database drafts); the builder waits for hydration before concluding a draft doesn't exist, then falls back to a server fetch for direct links.

## Living playlists

`src/lib/refresh.ts`

`runRefresh` implements *keep X%, rotate the rest*:

1. Keepers = all locked tracks (locks beat the percentage) + the unlocked tracks closest to the draft's mean popularity, up to `keepPercent`.
2. Candidates come from the draft's own generation context (mode-appropriate pipeline, user token if the owner connected Spotify, app token otherwise), excluding tracks already present.
3. Rotated slots are filled in place; with an artist-repeat window N, a candidate is skipped if its artist appears within the previous N−1 placed tracks. Unfillable slots drop rather than repeat.
4. Rationales of rotated-out tracks are pruned; the draft is upserted; the rule's `next_run_at` advances; a `refresh_run` event is logged.

Triggers: **manual** (`POST /api/drafts/[id]/refresh`, session owner, works with rule defaults if none saved) and **scheduled** (`GET /api/cron/refresh`, `Authorization: Bearer CRON_SECRET`, wired to a daily Vercel cron in `vercel.json`; processes up to 25 due rules per invocation).

## Rate limiting

`src/lib/rate-limit.ts` — fixed-window, in-memory (per instance; swap for a shared store before scaling horizontally).

Every cost-bearing route has **two gates**: an IP-keyed outer limit **before identity minting** (a cookieless caller gets a fresh userId per request, so per-user buckets alone are trivially rotated) and a tighter per-user bucket keyed on the signed session id. Anthropic-backed routes (`generate-meta`, `rationale`) are the tightest; the events endpoint collapses anonymous traffic into one shared bucket because `X-Forwarded-For` is client-controlled.

## Spotify API constraints (empirical)

Probed 2026-07 with this app's credentials:

| Endpoint | Status |
|---|---|
| `GET /search` (track/artist/playlist, incl. `artist:` / `genre:` filters) | ✅ works |
| `GET /playlists/{id}` search results | ✅ listed, ❌ items unreadable (403) |
| `GET /recommendations` | ❌ 403 |
| `GET /audio-features` | ❌ 403 |
| `GET /artists/{id}/top-tracks` | ❌ 403 |
| Artist `genres` field | ❌ always absent |

Consequences: all similarity features route through search + Claude, and audio features come from outside Spotify entirely — `src/lib/audio-features.ts` fetches them from the free ReccoBeats API keyed by Spotify track id (in-process cache, batched, fail-soft), serving `/api/spotify/audio-features` (IP rate-limited, no Spotify auth), tempo annotation in the generation pipeline, and the client vibe-drift hook unchanged. Tempo is cross-checked against Deezer's per-recording BPM (joined on the ISRC ReccoBeats returns, deduped so re-releases cost one lookup): beat detectors mis-read swing/mellow material by octave or 1.5× — one release of an ~89 BPM Charlie Parker ballad came back as 132.6 — so when the providers disagree beyond ~8%, Deezer's perceptual value wins. If the app passes Spotify's extended-quota review the native endpoints may light up again — the code already prefers them when they respond.

## Security notes

- Secrets never reach the client bundle; the only `NEXT_PUBLIC_` var is the app URL.
- Spotify tokens: encrypted at rest, httpOnly-cookie session, OAuth `state` validated, legacy plaintext token cookies actively deleted on next login.
- Draft access: every query is scoped to the session user; not-found and not-owned are indistinguishable (404) on reads/deletes to avoid an existence oracle.
- Background writes (`analytics`, `generation_runs`) ride `next/server after()` so they survive serverless response termination but can never fail a request.
