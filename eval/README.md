# Evaluation harness

A zero-traffic way to tell whether a pipeline change actually helped, instead of
guessing from one noisy run. Built on pooled relevance judgments (Cranfield/TREC
methodology), reported as **P@20 (the ship gate) plus NDCG@20 and R-precision**
— the RecSys-2018 automatic-playlist-continuation metric family — each with a
bootstrap confidence interval. P@20 is interpretable but rank-blind; NDCG@20 adds
rank-awareness (best tracks up top); R-precision normalizes for how many good
answers a prompt actually has. All three resample the same prompt set, so the
paired-bootstrap gate is unchanged.

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

**2. Label it.** Easiest path — build the offline labeling UI:

```bash
node scripts/build-label-tool.mjs
```

This bakes the pool + prompt text into a self-contained `eval/label.html` (open
in any browser, no server/network): click **Rel/Bor/Irr** or hover a row and
press **1/2/3** (auto-advances), progress autosaves to localStorage, then
**Export** downloads the finished file — save it as `eval/judgments.json`. It
skips prompts with no pooled candidates, and **Import** resumes a partial file.
Re-run it after re-pooling. (Or hand-edit the template: set each track's `label`
to `relevant`, `borderline` (counts 0.5), or `irrelevant`.) This is the one-time
human effort; it compounds — every future change is scored against it.

**3. Score the current pipeline:**

```bash
node scripts/eval-score.mjs http://localhost:3000
```

Prints per-prompt P@20 (worst-first triage list) plus the aggregate P@20,
NDCG@20 and R-precision — each with a 95% CI — and saves all three under
`eval/runs/`. `--compare` reports the paired-bootstrap delta for each metric and
gates on P@20.

**4. Gate a change.** Save a baseline run on `main`, make your change, save
another run, then:

```bash
node scripts/eval-score.mjs --compare eval/runs/<main>.json eval/runs/<change>.json
```

The verdict is **SHIP** only if the paired-bootstrap CI of (change − main) is
wholly above 0. Otherwise the difference is within noise — do not ship on it.

## Pairwise LLM judge (optional supplement)

To compare two runs *qualitatively* without hand-labeling every track:

```bash
node --env-file=.env scripts/eval-judge.mjs eval/runs/<A>.json eval/runs/<B>.json
```

An independent model (Haiku — deliberately different and smaller than the
`claude-opus-5` neighborhood generator, to avoid self-preference bias) judges
each prompt's two playlists **pairwise**, **twice with the order swapped**, and
counts only **consistent** verdicts (position-biased pairs are discarded). It
answers "which is better", never "how good on a 1–10 scale" (absolute LLM scores
drift and compress; pairwise with order-swapping tracks human preference far
better — Zheng et al. 2023).

This is a **supplement, not the gate**: `eval-score --compare` (P@20 +
paired-bootstrap CI against the human judgment set) decides shipping. Use the
judge for a fast read and to triage which prompts to hand-inspect.

**Validate it periodically**: hand-label ~50 pairs yourself, compute
judge-vs-human agreement (Cohen's κ). If κ drops below ~0.6, fix the judge
prompt in `eval-judge.mjs` before trusting its verdicts again.

## Notes

- Re-pool (step 1) after big pipeline changes so the judgment set covers newly
  surfaced tracks; label the new candidates. Old labels stay valid.
- Runs during a degraded window (AI/Spotify down) are flagged and should be
  discarded — their scores are meaningless.
- The stats live in `scripts/eval-lib.mjs` and are unit-tested
  (`node scripts/eval-lib.test.mjs`).
