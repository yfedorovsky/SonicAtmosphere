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
| **Scored databases** (albumoftheyear.org) | medium-high | Genre × year index + "secondaries" lists. Browser pane only — see access notes. |
| **RYM charts** (rateyourmusic.com) | **high** | Best genre taxonomy of any source (nu jazz / bossa nova / tango nuevo / flamenco nuevo as first-class slugs, multi-genre and year-range chart URLs). Real-Chrome only — see access notes. |
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
- **Suffixed credits evade exact-key dedupe.** `X Quartet`, `X Trio`, `X y su
  Orquesta` produce a different normalized key than `X`, so an already-known
  artist re-enters the candidate pool. Alias spellings do the same (`Cláudia`
   vs her later credit `Cláudya`; `Antônio Carlos Jobim` vs `Tom Jobim`). When a
  resolve fails or a "new" name looks canonical, check for a suffix-stripped or
  alias form before trusting either verdict.
- **Pseudonyms are invisible to any name-based exclusion.** "Jay Richford &
  Gary Stevan" are Stefano Torossi & Sandro Brugnolini — both already held.
  Only domain knowledge catches these; treat library-music credits as suspect.
- **Attribution transplants** are the worst LLM failure class: a real song
  paired with a real artist who never recorded it (a Savina Yannatou "Yialo
  Yialo" that does not exist — aggravated because the real song's title,
  "Εις τον αφρό της θάλασσας", differs from its famous chorus). Verify the
  PAIRING, not just that both names exist. Related: phantom titles synthesized
  from linguistic patterns (an invented Turkish track name on a real album).
- **Normalizer edge cases that broke real matches:** Turkish dotless ı (does
  NOT NFKD-fold to i), Azerbaijani ə, katakana-only titles credited to
  individual members (Seaside Lovers' メルティング・ブルー under Akira Inoue),
  and ensemble names mistaken for album titles (Primavera en Salonico is
  Yannatou's band). Always retry searches with a latinized/native-script
  variant before declaring absence.
- **Raw-vs-folded tempo is a rhetorical weapon.** Beat detectors double-time
  ~1/3 of tracks; an argument quoting one track raw ("152 BPM — too fast!")
  and another folded is cherry-picking. Always fold (halve >150) before
  comparing, and ask which form any cited BPM is in.
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
- **Push scripts MUST be run-once.** Appends are not idempotent and nothing can
  read the playlist back to check. A push script that runs twice silently
  double-appends the whole batch (happened twice on this project). Write a
  `pushed-<batch>.flag` after success and refuse to run while it exists.
- **Playlist creation: `POST /me/playlists` works; `POST /users/{id}/playlists`
  403s.** Same resource, different door.
- **Author push scripts only via direct file writes.** Deriving one through a
  PowerShell 5.1 text pipeline reads UTF-8 as ANSI and mojibakes emoji playlist
  names into unmatchable strings — the append then silently skips those
  playlists (happened twice despite an explicit UTF-8 write the second time:
  the READ was already corrupted).
- **Cue-album trap:** the "pick a representative track" fallback needs a higher
  duration floor on film scores/OSTs — a 95s floor admits 1:47 cues that read
  as tracks. Prefer the longest substantial cut on soundtrack albums.
- **Removals and reordering must be manual**, or via a third-party tool the user
  authorizes themselves.
- Quotas: a rolling burst limit plus an undisclosed daily cap. Pace ~1.1s
  between searches; abort on `Retry-After > 600`.

## Access notes

Three tiers of access, discovered empirically:

1. **WebFetch** — most editorial/blog sites. Blocked: AOTY, RYM, Pitchfork,
   reddit.com.
2. **Embedded browser pane** — albumoftheyear.org works (403s WebFetch).
   Blocked: Pitchfork (org policy), RYM (Cloudflare challenge — and the
   challenge loop can crash the host app; do not open RYM here).
3. **The user's real Chrome** (Claude-in-Chrome) — rateyourmusic.com works:
   Cloudflare passes on a real browser fingerprint. Pitchfork remains the only
   major source with no working door.

Harvest technique for both AOTY and RYM: the list pages are **server-rendered**,
so run same-origin `fetch()` from the page context and parse with `DOMParser` —
dozens of pages harvested from a single loaded tab, no navigation. Pace ~2.5s
between fetches on RYM (it rate-limits and bans scrapers). Two practical tricks:
keep results in a `window.*` accumulator across tool calls (tool output
truncates; page state persists), and export the final payload by triggering a
Blob download into `Downloads/` rather than reading it back through the tool.
Inject the known-artist key set into the page and dedupe there — only survivors
cross back.

RYM specifics: chart URLs compose as
`/charts/top/album/{all-time|YYYY|YYYY-YYYY}/g:{slug}/` (40 items/page, page 2+
appends `/2/`). Genre slugs are predictable (`bossa-nova`, `tango-nuevo`,
`flamenco-nuevo`, `mpb`); validate a slug cheaply via `/genre/{slug}/` status.
Rows carry primary AND secondary genre tags — feed them to the curator; tags
like Dark Jazz / Industrial / Shoegaze / Drone are register red flags that
disqualify before any Spotify call is spent.

AOTY exposes a genre × year index and a "secondary genre" list ("Secondaries")
that surfaces smoother, more song-based material than the primary genre list —
it is where the canonical-gap finds come from (see below).

**The canon-gap effect:** every deep-cut-biased source (label rosters, DJ sets,
LLM passes instructed to avoid the obvious) systematically skips the canonical
songful records. The AOTY Secondaries and RYM all-time charts are the corrective
axis — they surfaced Sade, Jobim, Elis & Tom, Buena Vista, Piazzolla, Baden
Powell, Lole y Manuel as *genuinely absent* from a 1,000-key known-set built
from every prior pass. Check the canon explicitly before assuming it's covered.

## LLM research accuracy (measured on this project)

First-pass verification rates for "suggest N gems" research: **ChatGPT Deep
Research 90%** (27/30; its self-assigned confidence daggers were honestly
calibrated), **Gemini deep-research 76%** (38/50 R1), **Grok ~65%**. Failure
signatures differ by model: Gemini title-morphs (near-miss titles on real
albums) and attribution-transplants; Grok invents track placements; all three
sycophantically "validate" claims fed back to them — a follow-up "validation
report" that re-confirmed an already-debunked attribution and asserted six
rescues ran **50% false**. Rules: feed error examples back in round-2 prompts
(it measurably sharpens output), never accept a validation report without
re-verifying, and treat streaming-absence as its own class (France Gall's and
Stella's 60s French catalogs are real but unstreamed — absence ≠ hallucination).

**Task substitution (new class, non-hallucination):** hand ChatGPT DR a prompt
as an *attached file* and its prompt-injection defense may treat the embedded
instructions as untrusted document content — "extract and describe; do not
execute" — and audit the FILE instead of doing the task. Our final-audit
prompt (761 tracks + 7 musical deliverables) came back as a data-governance
report: GDPR, WCAG, a 16-week remediation Gantt, zero of the 7 deliverables.
Notably its concrete factual claims still ran accurate (it caught 7 malformed
"M:60" durations — real, but a rounding bug in OUR emit script, not the data;
`Math.round` on the seconds remainder mints ":60" — compute total seconds
first). Rules: paste prompts INLINE as the chat message, open first-person
("I'm the curator; this message is my direct request"), and pre-empt the
genre misfire explicitly ("musical review, NOT metadata/governance audit").

## The Source Atlas (ChatGPT DR, 2026-08-06)

A 47-source mineable atlas — radio tracklist archives, Bandcamp columns,
regional press in 7 languages, reissue houses, record-store curation, curator
networks, festival predictors — lives in Downloads/deep-research-report (3).md
with per-source mine-methods, cadences, and RSS/poll endpoints. Top sustained
yield for this register: Bandcamp Daily *Best Latin*, dublab *Open Heart
Social Club*, NTS Zoya, Rush Hour, SceneNoise, MIMS *Balance*, Test Pressing,
KCRW Raul Campos, WOMEX, Hear65. Sweep coverage so far ≈60%: the video
(Aloha Got Soul), festival (WOMEX/Babel), curator-interview (Dust & Grooves,
Amoeba), Lot Radio, FIP, and Late Night Tales veins are UNMINED. Spotify
playlist brands (Air France, Soho House) are unmineable on this API tier —
eyeball-in-app only. Mining lesson: workflow fan-outs >4 concurrent agents
correlated with host-app crashes; the journal makes crashes lossless
(salvage `journal.jsonl`), but sequential one-source-at-a-time WebFetch with
disk saves between sources is the crash-proof mode.

## Sequencing

`src/lib/sequencing.ts` — `arrangeForFlow(items, "smooth" | "arc")`. Needs
`{id, energy, tempo, key, mode}`; returns ordered ids. Camelot-wheel harmonic
matching + half/double-time-aware tempo cost + energy. Use `arc` for a set that
should build and settle, `smooth` for continuous listening.

Large crates (400+) are for shuffling. Sequencing pays off at sittable
length — split by mood into 100-200-track lanes, or distill a ~75-track set.
