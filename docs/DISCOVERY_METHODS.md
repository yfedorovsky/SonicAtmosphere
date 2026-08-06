# Discovery Methods

Field notes from building large, taste-filtered playlists with this stack. These
are *empirical* findings — every claim here was verified against the live APIs,
usually after something broke. Written for whoever (human or agent) runs the
next discovery pass.

## The pipeline

Every source, regardless of type, flows through the same stages:

```
source → extract candidates → dedupe vs known-set → taste filter (LLM)
       → resolve on Spotify → verify → annotate features → curate → push
```

The **known-set** is the load-bearing part. Build it once per run from every
prior artifact (the target's own library export + every batch already pushed),
normalize keys, and subtract before spending any resolve calls. A pass that
"finds" 40 artists the listener already owns has found nothing.

## Grounding sources, ranked by yield

| Source | Yield | Notes |
|---|---|---|
| **Label rosters** (Discogs) | high | A label *is* a curator. `src/lib/discogs.ts` — `discogsLabelRoster()` ranks by release count = centrality to the label's identity. |
| **`label:"X" year:YYYY-YYYY`** (Spotify search) | **highest for new music** | See below. Returns music released *after* any LLM's training cutoff. |
| **Curated list IDs** (collections, collages) | high | Human-curated groupings; the ID is the unit, not a search term. |
| **Album series** (e.g. a numbered collab series) | high | Pull the series, then the album endpoint per entry. |
| **Multi-LLM research passes** | medium | Good breadth, needs hard verification. Diff each pass against the previous one — repeat rates of 60%+ are common. |
| **Scored databases** (albumoftheyear.org) | medium-high | Genre × year index. Browser pane only — see access notes. |
| **DJ set / playlist exports** | medium | Exportify CSVs carry real audio features; zero API cost. |

### `label: + year:` is the best recency tool

```
label:"Far Out Recordings" year:2025-2026   → real, current, on-aesthetic
genre:"nu jazz" year:2025-2026             → 0 results (genre: is dead on this tier)
downtempo lounge year:2026                 → AI-lounge content-farm filler
```

Sweep ~30 on-aesthetic labels, one search each. Search returns full track
objects, so **no separate resolve step is needed**. Rerun with a bumped year
range every few months for permanently fresh results.

## Verification: four tiers

A source naming a thing is not evidence the thing exists. Escalate:

1. **Track search** — `artist:"X" track:"Y"`.
2. **Album search** — when a source says *"album cut"* / *"from X"*, that string
   is an **album**, not a track. Searching it as a track produces false
   "doesn't exist" verdicts. This was the single biggest verification bug.
3. **Discogs existence** — `/database/search`. Separates *"not on Spotify"*
   from *"not real"*. Roughly 2/3 of things that fail Spotify still exist.
4. **Discogs genre** — catches name collisions that pass every other check.
   Caveat: genre data is sometimes absent; inspect the album title too.

## Name collisions are the #1 correctness risk

Four separate incidents in one project. All the same shape: a search matched a
*different act with a similar name*, and downstream stages then rationalized the
wrong result.

- **`&` stripping.** A normalizer that removes punctuation maps `Bart & Baker`
  and `Bart Baker` to the same key. Fix: compare a **second key that preserves
  the connective** (`&` → `and`), and require both to agree.
- **Label names collide too.** `label:"ESL Music"` matched a rap label, not the
  intended lounge one. Prefer the label's full, unambiguous name.
- **Generic band names** (`Acacia`, `Bau`, `Stone`) resolve to whatever is most
  popular. Always genre-check these.
- **An LLM curator will invent a rationale for a wrong result** — it read the
  colliding label name and wrote "downtempo lounge, cool poise" about a rap
  track. Never treat the curator's confidence as verification.

**Rule: verify the *resolved credit*, not just that the search returned a hit.**

## Audio features

`fetchAudioFeatures()` (ReccoBeats-backed) covers ~75-80%. Use features as
**annotation and sanity-check, not as a gate** — beat detectors routinely
double-time (a 101 BPM swing track reads as 202) and misjudge energy. Fold
tempo halve-only (`while (t > 150) t /= 2`) and treat anything it flags as a
question, not a verdict.

For playlists exported via Exportify, the CSV already contains real Spotify
features (danceability/energy/key/mode/tempo/valence) — free and more reliable.

## Spotify API — what actually works on a dev-tier app

Verified by probing, not by reading docs. This tier is **append-only**:

| Endpoint | Status |
|---|---|
| `GET /search` | ✅ — **`limit` max is 10**, not 50 |
| `POST /me/playlists` | ✅ create |
| `POST /playlists/{id}/items` | ✅ append (≤100/call) |
| `GET /playlists/{id}` (metadata) | ✅ |
| `GET /playlists/{id}/tracks` | ❌ 403 — **even for your own playlists** |
| `DELETE /playlists/{id}/tracks` | ❌ 403 |
| `PUT /playlists/{id}/tracks` | ❌ 403 |
| `GET /tracks?ids=` | ❌ 403 |
| `genre:` search filter | ❌ returns 0 |

Consequences:
- **API-side dedupe is impossible.** Dedupe against local batch files instead,
  and always check `res.ok` on reads — a silent `page.items || []` on a 403
  masks the failure and reports "0 existing tracks".
- **Removals and reordering must be manual**, or via a third-party tool the user
  authorizes themselves.
- Quotas: a rolling burst limit plus an undisclosed daily cap. Pace ~1.1s
  between searches; abort on `Retry-After > 600`.

## Access notes

Blocked entirely: reddit.com (crawler blocked, JSON API 403s generic clients,
browser policy-blocked), rateyourmusic.com (403).

Reachable: most editorial/blog sites via WebFetch; **albumoftheyear.org via the
browser pane only** (403s WebFetch). AOTY exposes a genre × year index and a
"secondary genre" list that surfaces smoother, more song-based material than the
primary genre list.

## Sequencing

`src/lib/sequencing.ts` — `arrangeForFlow(items, "smooth" | "arc")`. Needs
`{id, energy, tempo, key, mode}`; returns ordered ids. Camelot-wheel harmonic
matching + half/double-time-aware tempo cost + energy. Use `arc` for a set that
should build and settle, `smooth` for continuous listening.

Large crates (400+) are for shuffling. Sequencing pays off at sittable
length — split by mood into 100-200-track lanes, or distill a ~75-track set.
