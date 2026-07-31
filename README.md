# Sonic Atmosphere

AI-assisted playlist curation. Describe a vibe, seed it with a song you love, or import a track list — then shape the result with a real editing loop: lock the keepers, replace the weak spots, and let the playlist refresh itself on a schedule. Export to Spotify when it's right.

**Core thesis:** get from a rough playlist idea to a finished, editable, savable playlist faster than Spotify does.

## Features

- **Generator** — four modes, all powered by a grounded AI similarity engine (Claude proposes the musical neighborhood from real Spotify signals; search resolves it): *Vibe* (free-text description — references to songs/artists become anchors, sensory language reads as mood), *Song* (similar-vibes radio from one seed track), *Artist* (artist radio), and *Genre* (canon + current acts). Filter changes surface an explicit **Update results** button rather than burning API calls on every toggle. A **Length** control (~1 / 2 / 3 hrs) builds longer playlists by running several *paced* passes, each excluding the artists already added so it explores fresh territory; results stream in as each pass lands.
- **BPM-aware workout targeting** — prompts that mention running, cycling/spin, HIIT/bootcamp classes, or an explicit tempo ("at 128 BPM", "170–180 BPM") set a tempo target: the AI is steered toward artists who live in that range, results are ranked by cadence fit (half/double-time counts), and every track shows a BPM badge when tempo data is available.
- **Builder (the editing loop)** — drag-to-reorder, undo/redo, 30-second previews, and:
  - **Lock track** — freeze keepers; locked tracks can't be removed and always survive replacements and refreshes.
  - **Replace weakest N** — swap the worst-fitting unlocked tracks for fresh suggestions, with modifiers (*less mainstream, more energy, calmer, more acoustic*). One undo step.
  - **Explain picks** — a short AI "why this track is here" note under each track.
  - **Auto-title** — AI playlist titles and description.
- **Living playlists** — per-draft refresh rules: daily/weekly cadence, keep-percent (e.g. keep 60%, rotate 40%), avoid-artist-repeats. Runs on a platform cron; manual **Refresh now** any time.
- **Templates** — save a draft's recipe (prompt/mode/filters) and generate fresh drafts from it in one click.
- **Import** — paste or upload a track list; lines are matched against Spotify search.
- **Persistence** — anonymous-first accounts (no signup): drafts, prompt history, generation runs, and analytics survive reloads and follow your Spotify identity across devices once connected.
- **Export** — creates a private Spotify playlist (requires connecting Spotify).

## Quick start

Prerequisites: Node.js ≥ 20.9, a [Spotify developer app](https://developer.spotify.com/dashboard), an [Anthropic API key](https://console.anthropic.com/).

```bash
git clone https://github.com/yfedorovsky/SonicAtmosphere.git
cd SonicAtmosphere
npm install
cp .env.example .env   # then fill it in (see below)
npm run dev
```

Open http://127.0.0.1:3000. **No database setup is needed for local dev** — an embedded Postgres ([PGlite](https://pglite.dev/)) is created in `.pglite/` automatically and migrations run on first connection.

In the Spotify app dashboard, add this redirect URI: `http://127.0.0.1:3000/api/auth/spotify/callback`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | yes | Spotify app credentials (search, OAuth, export) |
| `ANTHROPIC_API_KEY` | yes | Grounded neighborhood generation (all modes, via forced tool-use), auto-titling, per-track rationale |
| `SESSION_SECRET` | yes | Signs the anonymous session cookie and encrypts Spotify tokens at rest (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | yes | Public origin, used for the OAuth redirect (local: `http://127.0.0.1:3000`) |
| `DATABASE_URL` | prod only | Postgres connection string. Unset locally → embedded PGlite |
| `CRON_SECRET` | prod only | Protects `/api/cron/refresh`; Vercel sends it automatically for cron invocations |
| `LASTFM_API_KEY` | optional | last.fm crowd-tag contrast-class veto. Fail-soft: absent → veto simply off (free key at last.fm/api) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | optional | Upstash Redis (Vercel KV): L2 search/tag cache + the daily budget counter. Fail-soft: absent → in-process caches only, no daily cap (`UPSTASH_REDIS_REST_*` also accepted) |
| `SPOTIFY_DAILY_CALL_BUDGET` | optional | Self-imposed daily Spotify-call ceiling before degrading to keyword fallback (default 2000; requires KV). Lower while load-testing/evaluating |

## Database

Drizzle ORM over Postgres. Schema lives in [`src/db/schema.ts`](src/db/schema.ts); SQL migrations in [`drizzle/`](drizzle/) are applied automatically at first connection (dev and prod).

After changing the schema:

```bash
npx drizzle-kit generate --name my_change
```

Commit the generated files under `drizzle/`.

## API surface

All routes are session-scoped (signed anonymous cookie) and rate-limited. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for details.

| Route | Purpose |
|---|---|
| `GET/POST /api/drafts`, `GET/PUT/DELETE /api/drafts/[id]` | Draft CRUD (full-replace upsert) |
| `GET/PUT/DELETE /api/drafts/[id]/refresh-rule` | Living-playlist schedule for a draft |
| `POST /api/drafts/[id]/refresh` | Manual refresh now |
| `GET/POST /api/templates`, `GET/DELETE /api/templates/[id]` | Saved generation recipes |
| `GET /api/spotify/search` | Generation endpoint (all modes) + import matching |
| `POST /api/spotify/playlist` | Export to Spotify |
| `POST /api/generate-meta` | AI titles + description |
| `POST /api/rationale` | AI per-track "why this track is here" |
| `GET /api/prompts/recent` | Prompt history (derived from generation runs) |
| `POST /api/events` | Client analytics events |
| `GET /api/auth/spotify` → `/callback`, `GET /api/auth/status` | Spotify OAuth |
| `GET /api/cron/refresh` | Scheduled refresh runner (Bearer `CRON_SECRET`) |

## Deployment (Vercel)

1. **Database** — provision any Postgres (Neon, Vercel Postgres, Supabase, RDS). Copy the connection string.
2. **Import the repo** into Vercel (or `npx vercel` from the repo root).
3. **Environment variables** — set all of the table above in the Vercel project, with:
   - `DATABASE_URL` = your Postgres connection string
   - `NEXT_PUBLIC_APP_URL` = `https://your-domain.vercel.app` (no trailing slash)
   - fresh values for `SESSION_SECRET` and `CRON_SECRET`
4. **Spotify redirect URI** — add `https://your-domain.vercel.app/api/auth/spotify/callback` in the Spotify developer dashboard.
5. **Cron** — [`vercel.json`](vercel.json) already schedules `/api/cron/refresh` daily at 06:00 UTC; Vercel authenticates it with `CRON_SECRET` automatically.
6. Deploy. Migrations run automatically on the first request.

Notes for other hosts: the app is a standard Next.js 16 app — anything that runs it works. You'll need to trigger `GET /api/cron/refresh` with `Authorization: Bearer $CRON_SECRET` on your own schedule, and note the in-memory rate limiter is per-instance (front it with a shared limiter if you scale horizontally).

## Spotify API constraints (important)

Newer Spotify apps are heavily restricted. Confirmed against this app tier: `/recommendations`, `/audio-features`, `/artists/{id}/top-tracks`, and `/playlists/{id}/tracks` all return **403**, and artist objects carry **no genres**. The app is built around what still works — track/artist/playlist **search** (including `artist:` and `genre:` field filters) — with Claude filling the similarity gap across **all four generator modes** plus auto-titling and per-track rationale. Audio features (tempo/energy/danceability) come from the free [ReccoBeats](https://reccobeats.com) API keyed by Spotify track id, which powers BPM badges, tempo targeting, and vibe-drift outlier scoring. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Policy notes (as of Feb 2026): Development Mode is explicitly non-commercial, capped at 5 authorized users, and requires a Premium account; commercial use requires extended-quota approval, which Spotify only grants to legally registered organizations. Non-streaming apps (like this one — it never touches playback-control endpoints) may charge subscriptions once approved; streaming apps may not.

## Development

```bash
npm run dev     # dev server (embedded Postgres, auto-migrations)
npm run build   # production build + typecheck
npm run lint    # eslint
```

The stack: Next.js 16 (App Router, route handlers), React 19, Tailwind 4, Zustand + zundo (client state + undo), Drizzle ORM, PGlite/postgres-js, Anthropic SDK (Claude Haiku for all AI features).
