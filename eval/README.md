# Evaluation harness

A zero-traffic way to tell whether a pipeline change actually helped, instead of
guessing from one noisy run. Built on pooled relevance judgments (Cranfield/TREC
methodology), precision@20, and bootstrap confidence intervals.

## Why

A single "golden-overlap" number swings 4–7/20 across stochastic generations. If
you decide from one run you will revert good changes and keep bad ones on noise.
This harness reports **P@20 with a 95% CI** and gates changes with a **paired
bootstrap** so only differences that survive the noise ship.

## Files

- `prompts.json` — the frozen prompt set (all four modes, three difficulty
  tiers). **Never edit or delete existing prompts** — that invalidates prior
  judgments. Add new ones with new ids.
- `judgments.json` — your relevance labels (the ground-truth asset). Not
  committed until you create it (see below).
- `nyc-jazz.json` — the original single-prompt golden set. **Demoted to a smoke
  test**: `node scripts/eval-vibe.mjs` catches catastrophic regressions, not
  quality deltas.
- `runs/` — saved generation runs, used for `--compare`.

## Workflow

All commands run from the repo root, against a server that can reach Spotify
(local dev or prod). The Spotify quota must be available.

**1. Build the judgment pool** (once, then top up as the pipeline changes):

```bash
node scripts/eval-pool.mjs http://localhost:3000 3
```

Generates each prompt 3× (pooling keeps the set fair to future variants), unions
the candidates, and writes `eval/judgments.template.json`.

**2. Label it.** Copy the template to `eval/judgments.json` and set each track's
`label` to `relevant`, `borderline` (counts 0.5), or `irrelevant`. This is the
one-time human effort; it compounds — every future change is scored against it.

**3. Score the current pipeline:**

```bash
node scripts/eval-score.mjs http://localhost:3000
```

Prints per-prompt P@20 and the aggregate mean with a 95% CI, and saves the run
under `eval/runs/`.

**4. Gate a change.** Save a baseline run on `main`, make your change, save
another run, then:

```bash
node scripts/eval-score.mjs --compare eval/runs/<main>.json eval/runs/<change>.json
```

The verdict is **SHIP** only if the paired-bootstrap CI of (change − main) is
wholly above 0. Otherwise the difference is within noise — do not ship on it.

## Notes

- Re-pool (step 1) after big pipeline changes so the judgment set covers newly
  surfaced tracks; label the new candidates. Old labels stay valid.
- Runs during a degraded window (AI/Spotify down) are flagged and should be
  discarded — their scores are meaningless.
- The stats live in `scripts/eval-lib.mjs` and are unit-tested
  (`node scripts/eval-lib.test.mjs`).
