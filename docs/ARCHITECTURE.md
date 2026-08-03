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

**Search caching** (two-tier): search is ~90% of the app's Spotify calls (one generation fires ~25, and the same `artist:"…"`/`genre:"…"`/playlist queries recur across regenerations), so `searchTracks`/`searchPlaylistNames` cache successful responses. **L1** is in-process (`__saSearchCache`, 1h TTL, LRU-capped) with in-flight coalescing so concurrent identical searches make one call. **L2** is persistent KV (Upstash Redis via the Vercel KV integration, `src/lib/kv.ts`, 24h TTL) so a query fetched by *any* instance is reused across serverless cold starts — the in-process cache alone barely dented the daily quota because instances recycle. A dev-mode app has a fixed daily Spotify quota (429 `QUOTA_EXCEEDED`); the two-tier cache sharply cuts burn. **Only 2xx responses are cached** — a 429/403 (even on a later page of a paginated search) must never poison either tier. Both `kv.ts` and the whole path are **fail-soft**: with no KV store configured, L2 no-ops and the app runs on L1 exactly as before. last.fm artist tags are cached the same way (L1 24h + L2 7d).

**Daily budget cap** (`src/lib/budget.ts`): the cache cuts burn but can't bound it — a runaway loop (a heavy eval run, a traffic spike, a cron storm) can still exhaust the daily quota and trip Spotify's ~12h hard `QUOTA_EXCEEDED` lockout, which takes the whole app down. So `spotifyFetch` — the single choke point every Spotify HTTP call passes through — counts each call against a self-imposed daily ceiling via an atomic KV counter keyed by UTC date (`sa:budget:YYYY-MM-DD`, `kvIncr`). Once the cap is spent it **synthesizes a 429 instead of calling Spotify**, so the app slides to plain-search/degraded mode for the rest of the UTC day rather than hitting Spotify's hard wall. No caller changes: every caller already treats a non-ok response as a rate-limit. It is also **generation-aware**: `generateRecommendations` calls `budgetAllowsGeneration()` up front and, if today's remaining budget can't cover a whole generation (~40 calls), fails the whole thing cleanly rather than starting one that dies mid-flight and returns a half-resolved neighborhood marked non-degraded (the route's keyword fallback is gated the same way). Two properties make this graceful rather than blunt: **cache hits never reach `spotifyFetch`**, so an exhausted budget still serves cached and repeat prompts in full — only *new* quota burn is throttled; and it's **fail-soft** — without a shared KV counter (local dev, the eval harness) neither the per-call cap nor the pre-check applies. The ceiling is env-tunable via `SPOTIFY_DAILY_CALL_BUDGET` (default 2000 calls/day ≈ 80 uncached generations — calibrated *below* the observed dev-mode ceiling of ~2.5–3k calls/day, since a run that crosses it triggers a ~24h hard lockout; raise only after observing a clean full-day quota).

**All four modes run one grounded LLM→search pipeline** (`askNeighborhood` + `resolveAndRank`). Each mode first attempts the native `/recommendations` path (works only for grandfathered apps; typically 403), then:

1. **Grounding** — gather signals this app tier can still read: the relevant artist's own catalog (`artist:"…"` search) and the *names* of public playlists matching the song/artist/vibe (playlist metadata is searchable even though playlist items are 403). These describe the actual style so the model never guesses blind.
2. **Neighborhood** — one `claude-opus-5` JSON call proposes up to 8 real artists + 3 Spotify genre terms (+ optional keyword phrases for vibe mode), instructed to anchor on any referenced song/artist, infer unknown artists strictly from the grounding clues, and read sensory language ("coffee aroma") as mood, never literally. Refusals and failures degrade gracefully to catalog/keyword fallbacks.
3. **Resolution & hygiene** (`resolveAndRank`) — Spotify search resolves the neighborhood with strict filters: artist-search results must have the queried artist as the **primary** artist (kills fuzzy matches and featured-credit pollution); dedupe by id *and* normalized artist+title (re-releases carry different ids); tracks under 61s dropped (skits/interludes); genre/keyword results ride a lower tier capped at a few slots; a per-credited-artist cap of 2 stops floods; results sort by tier then popularity-proximity to an anchor (the seed track's popularity, or the UI's popularity slider — making that slider meaningful).

Per mode: **Song** leads with the seed itself (seed resolution prefers the most popular of the top text matches — cover-farm defense); **Vibe** is grounded by playlist names matching the vibe keywords; **Artist** is a grounded artist radio (own catalog at tier 0 + similar artists); **Genre** has Claude name the genre's canon and blends it with `genre:"…"` field search.

**Exemplar tracks**: artist-level selection can't express within-catalog mood — a jazz giant's most-streamed tracks are their mellowest, so "chaotic hard bop" used to return ballads. The vibe-mode neighborhood call also names up to 6 specific songs ("Title | Artist") that epitomize the requested mood; they resolve with primary-artist + title matching (a misremembered exemplar degrades to nothing, not a cover) and lead the playlist at tier zero. Vivid descriptors ("chaotic", "gentle") are instructed to outrank genre-canon defaults, and the energy dial reaches the model as context. When the dial is moved off center it also reorders final results by measured energy distance.

**Texture ranking & flow sequencing** (research-driven, 2026-07): candidates rank by **z-scored k-NN distance to the resolved exemplars** — the "popularity bypass" recommended by the MIR literature, done with provider features (energy/danceability/valence/acousticness/instrumentalness) instead of audio embeddings. Design details, each earned from a design critique: (a) the five dimensions are **standardized against the candidate pool** (poor-man's Mahalanobis) so distances are comparable across dims and the ranking transfers across prompts rather than being tuned to raw 0–1 magnitudes; (b) distance is to the **nearest exemplar (min), not a centroid mean** — vibe classes are multimodal ("chaotic hard bop" = frenetic bop *and* one cool ballad), and a mean lands in the empty midpoint matching nothing, whereas min rewards fitting *any* anchor; (c) **valence is down-weighted** (0.3) as the least reliable Spotify-derived feature; (d) texture is a **soft penalty in the ranking, not a hard gate** — a rich pool naturally sinks acoustically-alien filler below the top 20 while a thin pool keeps a far track rather than under-filling (no cliff, no silent bypass); (e) if a vibe intended exemplars but <2 resolve, texture ranking falls back to **pseudo-exemplars** (top tier-0 candidates) and logs it, instead of silently disabling. Vibe playlists enforce **one track per primary artist** over a widened ~16-artist neighborhood. When no tempo target dictates cadence-first order, the final list is sequenced as a minimum-transition-cost path (energy delta + octave-folded tempo delta + Camelot key adjacency) built greedily then refined with a **2-opt pass** (greedy alone cascades one bad early pick through the tail). Sequencing is presentation-only: living-playlist refresh and Replace-weakest consume the list prefix as best-N candidates and pass `sequence: false`.

**On-demand flow arrangement** (`POST /api/sequence`, Builder → *Arrange for flow*): the energy/tempo/Camelot primitives live in `lib/sequencing.ts` (a pure, dependency-free module the generation-time sequencer now shares), exposed as a one-click reorder over **any** playlist — generated, edited, or imported. Two shapes: *smooth* (the greedy + full 2-opt minimum-cost path, anchored on the current opener) and *arc* (a party curve — the energy-sorted set is dealt alternately into front/reversed-back to form a low→peak→low bell, then a **windowed** 2-opt smooths local key/tempo hand-offs without flattening the arc; feature-less tracks are cheap-inserted where they add least cost). It reads audio features only (ReccoBeats + KV), **never Spotify**, so it spends no Spotify quota; the new order returns as track ids and applies client-side as one undo step. Guards mirror the generation path (return the input order unchanged below 5 tracks or below 50% feature coverage). The actual fade is Spotify's listener-side **Crossfade** setting — surfaced as an in-panel tip, since the app never touches playback endpoints.

**BPM display**: tempo is annotated internally for ranking and sequencing, but the per-track BPM badge is shown to the user **only when the prompt carried a tempo/workout intent**. Both feature providers report machine-detected double-time on many grooves (a folk ballad reads as 180), so a BPM badge on a general playlist erodes trust; it's surfaced only where cadence is the point.

**Tempo targeting** (`extractTempoTarget` → `annotateAndRank`): an explicit BPM in the prompt ("at 128 BPM", "170–180 BPM") or a workout keyword (running, cycling/spin, HIIT/bootcamp, power walking) sets a target window. The window is passed as a hint into the neighborhood prompt, and after resolution every track is annotated with its BPM (from ReccoBeats — see below) and stable-sorted by distance to the window, where half- and double-time readings count as equivalent (an 87 BPM groove locks to a 174 SPM stride) and unknown tempo prices as a moderate fixed distance. Nothing is dropped — tempo data has gaps, and a shorter playlist is worse than an imperfect tail. Song mode keeps its seed pinned first.

Quality was validated by an adversarial judge panel across five genres (psych-funk, IDM, americana, hip-hop, classical) and cross-checked against last.fm similar-artist data. The neighborhood is obtained via **forced tool-use** (`tool_choice` on an `emit_neighborhood` schema) so the model cannot return prose or malformed/truncated JSON — a truncated tool call is a detectable `stop_reason` we retry, not a silent partial. Cost: one Opus call per generation, ~$0.02–0.04 (opus-5's output is dominated by tokens, and forcing the tool call also suppresses the free-form reasoning that a plain-JSON prompt spent budget on), bounded by the search rate limits and the daily budget cap.

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

Consequences: all similarity features route through search + Claude, and audio features come from outside Spotify entirely — `src/lib/audio-features.ts` fetches them keyed by Spotify track id (cached **raw**), serving `/api/spotify/audio-features` (IP rate-limited, no Spotify auth) and the client vibe-drift hook. Tempo is finalized in the generation pipeline by `resolveTempo`, which cross-checks the provider tempo against Deezer's per-recording BPM (joined on ISRC): beat detectors mis-read swing/mellow material by octave or 1.5× — one release of an ~89 BPM Charlie Parker ballad came back as 132.6 — so when the two disagree beyond ~8%, Deezer's perceptual value wins. **But ISRCs get reused and mis-assigned across compilations and re-issues, so the Deezer BPM is trusted only when the resolved recording's title _and_ a credited artist match the Spotify track (`deezerIdentityMatches`) AND their durations are within 8s; a colliding join reads as unknown tempo, never as a confident wrong number that could reorder a tempo-sorted playlist.** The match demands strong evidence (exact/near-exact on one axis) and rejects the loose-both-sides ambiguous middle, so short shared tokens can't false-accept a collision. The identity guard runs at the ranking call site because the recording identity to check against only exists there — which is why features are cached unreconciled and tempo is resolved per track downstream.

**Provider independence**: the feature source (ReccoBeats) is treated as replaceable, not infrastructure — its data tracks Spotify's deprecated dumps with unclear provenance and could vanish. It sits behind an `AudioFeatureProvider` interface (one swap point), and every fetched feature is snapshotted into KV, so the cache accrues value independent of the provider: if ReccoBeats disappears we still serve everything ever seen. Three fail-soft tiers — L1 in-process → L2 KV (60d for features under `sa:feat:v2:`, 60d for Deezer records under `sa:dz:`, 7d for confirmed misses) → provider — with confirmed misses cached (a sentinel) so a track the provider lacks isn't re-queried. If the app passes Spotify's extended-quota review the native endpoints may light up again — the code already prefers them when they respond.

## Security notes

- Secrets never reach the client bundle; the only `NEXT_PUBLIC_` var is the app URL.
- Spotify tokens: encrypted at rest, httpOnly-cookie session, OAuth `state` validated, legacy plaintext token cookies actively deleted on next login.
- Draft access: every query is scoped to the session user; not-found and not-owned are indistinguishable (404) on reads/deletes to avoid an existence oracle.
- Background writes (`analytics`, `generation_runs`) ride `next/server after()` so they survive serverless response termination but can never fail a request.
