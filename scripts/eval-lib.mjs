// Pure scoring + statistics for the eval harness. No I/O, no network — unit
// testable in isolation. The point of this module is to make pipeline changes
// MEASURABLE: a single golden-overlap number swings 4–7/20 on stochastic runs,
// so decisions made on one run revert good changes and keep bad ones. Precision
// against a pooled judgment set, reported with bootstrap confidence intervals
// and a paired A-vs-B test, is what stops noise-driven decisions.

const LABEL_WEIGHT = { relevant: 1, borderline: 0.5, irrelevant: 0 };

/** Deterministic PRNG (mulberry32) so eval runs are reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Precision@k for one prompt: mean label weight over the first k tracks.
 * Unlabeled tracks count as 0 (irrelevant) — an unjudged track is not a win.
 * Divides by k (not by the number returned) so a short playlist is penalized,
 * matching how a user experiences a thin result.
 */
export function precisionAtK(trackIds, judgmentsForPrompt, k = 20) {
  const top = trackIds.slice(0, k);
  let sum = 0;
  for (const id of top) {
    const label = judgmentsForPrompt?.[id];
    sum += LABEL_WEIGHT[label] ?? 0;
  }
  return sum / k;
}

/**
 * Per-prompt P@k for a whole run.
 * run: { promptId -> trackIds[] }; judgments: { promptId -> { trackId -> label } }
 * Only prompts that HAVE judgments are scored (an unjudged prompt is skipped,
 * not counted as 0).
 * Returns { promptId -> score } for prompts with judgments.
 */
export function scoreRun(run, judgments, k = 20) {
  const scores = {};
  for (const [promptId, trackIds] of Object.entries(run)) {
    const j = judgments[promptId];
    if (!j || Object.keys(j).length === 0) continue;
    scores[promptId] = precisionAtK(trackIds, j, k);
  }
  return scores;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

/**
 * Bootstrap CI for the mean P@k across prompts, resampling PROMPTS with
 * replacement (the prompt set is the sample; that's where the variance lives).
 * Returns { mean, lo, hi } at the given confidence (default 95%).
 */
export function bootstrapMeanCI(perPromptScores, { draws = 1000, confidence = 0.95, seed = 1 } = {}) {
  const vals = Object.values(perPromptScores);
  if (vals.length === 0) return { mean: 0, lo: 0, hi: 0, n: 0 };
  const rand = rng(seed);
  const means = [];
  for (let d = 0; d < draws; d++) {
    let s = 0;
    for (let i = 0; i < vals.length; i++) s += vals[Math.floor(rand() * vals.length)];
    means.push(s / vals.length);
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  return {
    mean: mean(vals),
    lo: percentile(means, alpha),
    hi: percentile(means, 1 - alpha),
    n: vals.length,
  };
}

/**
 * Paired bootstrap of the difference B - A over the PROMPTS both runs cover.
 * Pairing (resampling the same prompt index for both) cancels per-prompt
 * difficulty, which is the correct test for "did this change help".
 * Returns { deltaMean, lo, hi, shipsForward, shipsBackward }.
 * shipsForward: CI wholly > 0 (B beats A) — the change-gating green light.
 * shipsBackward: CI wholly < 0 (B is worse) — a regression.
 */
export function pairedBootstrapDiff(scoresA, scoresB, { draws = 1000, confidence = 0.95, seed = 1 } = {}) {
  const ids = Object.keys(scoresA).filter((id) => id in scoresB);
  if (ids.length === 0) return { deltaMean: 0, lo: 0, hi: 0, n: 0, shipsForward: false, shipsBackward: false };
  const diffs = ids.map((id) => scoresB[id] - scoresA[id]);
  const rand = rng(seed);
  const boot = [];
  for (let d = 0; d < draws; d++) {
    let s = 0;
    for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rand() * diffs.length)];
    boot.push(s / diffs.length);
  }
  boot.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  const lo = percentile(boot, alpha);
  const hi = percentile(boot, 1 - alpha);
  return {
    deltaMean: mean(diffs),
    lo,
    hi,
    n: ids.length,
    shipsForward: lo > 0,
    shipsBackward: hi < 0,
  };
}
