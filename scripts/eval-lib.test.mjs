// Unit tests for the eval statistics. Run: node scripts/eval-lib.test.mjs
import {
  precisionAtK,
  scoreRun,
  ndcgAtK,
  rPrecision,
  scoreRunBy,
  bootstrapMeanCI,
  pairedBootstrapDiff,
} from "./eval-lib.mjs";

let failures = 0;
const assert = (c, m) => {
  console.log((c ? "PASS" : "FAIL") + " — " + m);
  if (!c) failures++;
};
const approx = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// --- precisionAtK ---
const J = { t1: "relevant", t2: "relevant", t3: "borderline", t4: "irrelevant" };
assert(approx(precisionAtK(["t1", "t2"], J, 2), 1.0), "all relevant in k -> 1.0");
assert(approx(precisionAtK(["t1", "t3"], J, 2), 0.75), "relevant + borderline over k=2 -> 0.75");
assert(approx(precisionAtK(["t1", "t4"], J, 2), 0.5), "relevant + irrelevant -> 0.5");
assert(approx(precisionAtK(["t1", "unknown"], J, 2), 0.5), "unlabeled track counts as 0");
assert(approx(precisionAtK(["t1"], J, 20), 1 / 20), "short playlist penalized (divide by k, not length)");

// --- scoreRun skips unjudged prompts ---
const run = { p1: ["t1", "t2"], p2: ["x", "y"] };
const judg = { p1: J, p2: {} };
const scores = scoreRun(run, judg, 2);
assert(!("p2" in scores) && "p1" in scores, "scoreRun skips prompts with no judgments");

// --- ndcgAtK (rank-aware) ---
assert(approx(ndcgAtK(["t1", "t2", "t3", "t4"], J, 4), 1.0), "ideal order (best first) -> NDCG 1.0");
const ndcgReversed = ndcgAtK(["t4", "t3", "t2", "t1"], J, 4);
assert(ndcgReversed > 0 && ndcgReversed < 1.0, "worst-first order -> NDCG below 1 (rank matters)");
assert(ndcgAtK(["t1", "t4"], J, 20) > ndcgAtK(["t4", "t1"], J, 20), "relevant-first beats irrelevant-first at same k");
assert(approx(ndcgAtK(["z"], { z: "irrelevant" }, 20), 0), "no positive weight -> NDCG 0 (IDCG 0)");

// --- rPrecision (precision at R = #relevant) ---
assert(approx(rPrecision(["t1", "t2", "t3", "t4"], J), 1.0), "both relevant in top R=2 -> 1.0");
assert(approx(rPrecision(["t1", "t4"], J), 0.5), "one relevant one irrelevant in top R=2 -> 0.5");
assert(approx(rPrecision(["t3", "t4"], J), 0.25), "borderline + irrelevant in top R=2 -> 0.25");
assert(approx(rPrecision([], J), 0), "empty run -> 0");
assert(approx(rPrecision(["a", "b"], { a: "borderline" }), 0), "R=0 (no 'relevant' judged) -> 0");

// --- scoreRunBy works for any metric and skips unjudged prompts ---
const ndcgScores = scoreRunBy(run, judg, (t, j) => ndcgAtK(t, j, 2));
assert(!("p2" in ndcgScores) && "p1" in ndcgScores, "scoreRunBy skips prompts with no judgments");
assert(approx(ndcgScores.p1, ndcgAtK(["t1", "t2"], J, 2)), "scoreRunBy applies the given per-prompt metric");

// --- bootstrapMeanCI ---
const identical = { a: 0.6, b: 0.6, c: 0.6 };
const ciFlat = bootstrapMeanCI(identical, { draws: 500, seed: 7 });
assert(approx(ciFlat.mean, 0.6) && approx(ciFlat.lo, 0.6) && approx(ciFlat.hi, 0.6),
  "zero-variance scores -> CI collapses to the mean");

const spread = { a: 0.2, b: 0.5, c: 0.8, d: 0.4, e: 0.6 };
const ci1 = bootstrapMeanCI(spread, { draws: 1000, seed: 42 });
const ci2 = bootstrapMeanCI(spread, { draws: 1000, seed: 42 });
assert(ci1.lo === ci2.lo && ci1.hi === ci2.hi, "same seed -> reproducible CI");
assert(ci1.lo <= ci1.mean && ci1.mean <= ci1.hi, "CI brackets the mean");
assert(ci1.lo < ci1.hi, "spread scores -> non-degenerate CI");

// --- pairedBootstrapDiff ---
const A = { p1: 0.3, p2: 0.4, p3: 0.5, p4: 0.35, p5: 0.45 };
const better = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v + 0.15])); // uniformly +0.15
const worse = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v - 0.15]));

const dBetter = pairedBootstrapDiff(A, better, { draws: 1000, seed: 3 });
assert(dBetter.shipsForward && dBetter.lo > 0 && approx(dBetter.deltaMean, 0.15, 1e-9),
  "uniformly-better B -> shipsForward, CI wholly > 0");

const dSame = pairedBootstrapDiff(A, { ...A }, { draws: 1000, seed: 3 });
assert(!dSame.shipsForward && !dSame.shipsBackward && approx(dSame.deltaMean, 0),
  "identical runs -> no ship either way (delta 0)");

const dWorse = pairedBootstrapDiff(A, worse, { draws: 1000, seed: 3 });
assert(dWorse.shipsBackward && dWorse.hi < 0, "uniformly-worse B -> shipsBackward, CI wholly < 0");

// Noisy-but-zero-mean difference should NOT ship (guards against noise-driven decisions).
const noisy = { p1: A.p1 + 0.3, p2: A.p2 - 0.3, p3: A.p3 + 0.25, p4: A.p4 - 0.25, p5: A.p5 };
const dNoisy = pairedBootstrapDiff(A, noisy, { draws: 1000, seed: 5 });
assert(!dNoisy.shipsForward, "high-variance zero-mean change does NOT ship (the whole point)");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
