// Score the pipeline against the frozen judgment set, with bootstrap CIs.
//
//   node scripts/eval-score.mjs [baseUrl]
//       Generate a fresh run, score P@20 vs eval/judgments.json, save the run
//       under eval/runs/, print per-prompt scores + aggregate mean with 95% CI.
//
//   node scripts/eval-score.mjs --compare eval/runs/A.json eval/runs/B.json
//       Paired-bootstrap A vs B and report whether B ships (CI excludes 0).
//
// Change-gating rule: a pipeline change ships only if --compare shows
// shipsForward (CI wholly > 0) against the current main run on the frozen set.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { generateAll } from "./eval-generate.mjs";
import {
  scoreRun,
  scoreRunBy,
  precisionAtK,
  ndcgAtK,
  rPrecision,
  bootstrapMeanCI,
  pairedBootstrapDiff,
} from "./eval-lib.mjs";

const pct = (x) => (x * 100).toFixed(1) + "%";
const loadJudgments = () => JSON.parse(readFileSync("eval/judgments.json", "utf8"));

// P@20 stays the ship gate (interpretable, stable). NDCG@20 adds rank-awareness
// (rewards the best tracks up top); R-precision normalizes for how many good
// answers a prompt actually has. Report all three; gate on the first.
const METRICS = [
  { name: "P@20", primary: true, fn: (t, j) => precisionAtK(t, j, 20) },
  { name: "NDCG@20", primary: false, fn: (t, j) => ndcgAtK(t, j, 20) },
  { name: "R-prec", primary: false, fn: (t, j) => rPrecision(t, j) },
];

if (process.argv[2] === "--compare") {
  const [, , , aPath, bPath] = process.argv;
  if (!aPath || !bPath) {
    console.error("usage: node scripts/eval-score.mjs --compare A.json B.json");
    process.exit(2);
  }
  const judgments = loadJudgments();
  const runA = JSON.parse(readFileSync(aPath, "utf8")).run;
  const runB = JSON.parse(readFileSync(bPath, "utf8")).run;
  console.log(`Comparing  A=${aPath}\n           B=${bPath}\n`);
  let primaryVerdict = "INCONCLUSIVE";
  for (const m of METRICS) {
    const diff = pairedBootstrapDiff(
      scoreRunBy(runA, judgments, m.fn),
      scoreRunBy(runB, judgments, m.fn)
    );
    const verdict = diff.shipsForward ? "SHIP" : diff.shipsBackward ? "REGRESSION" : "INCONCLUSIVE";
    if (m.primary) primaryVerdict = verdict;
    console.log(
      `${m.name.padEnd(8)} Δ(B-A) ${pct(diff.deltaMean).padStart(6)}  95% CI [${pct(diff.lo)}, ${pct(diff.hi)}]  (paired n=${diff.n})  ${verdict}${m.primary ? "  ← ship gate" : ""}`
    );
  }
  console.log(
    `\nVERDICT (P@20 gate): ${
      primaryVerdict === "SHIP"
        ? "SHIP — B beats A (CI wholly above 0)."
        : primaryVerdict === "REGRESSION"
          ? "REGRESSION — B is worse (CI wholly below 0)."
          : "INCONCLUSIVE — CI straddles 0; difference is within noise."
    }`
  );
  console.log("(NDCG@20 = rank-aware; R-prec = normalized for #relevant. Use them to sanity-check the gate — a P@20 tie with an NDCG win means B ordered the same hits better.)");
  process.exit(0);
}

// Default: generate + score one run.
const baseUrl = process.argv[2] ?? "http://localhost:3000";
const { prompts } = JSON.parse(readFileSync("eval/prompts.json", "utf8"));
const judgments = loadJudgments();

const { run, meta, degraded } = await generateAll(baseUrl, prompts);
if (degraded) console.error(`WARNING: ${degraded} prompt(s) returned degraded results — scores unreliable.`);

const scores = scoreRun(run, judgments);
const scored = Object.keys(scores).length;
// Per-prompt P@20 (the interpretable primary), worst first — the triage list.
for (const [pid, s] of Object.entries(scores).sort((a, b) => a[1] - b[1])) {
  console.log(`  ${pct(s).padStart(6)}  ${pid}`);
}

const metricCIs = {};
console.log("");
for (const m of METRICS) {
  const ci = bootstrapMeanCI(scoreRunBy(run, judgments, m.fn));
  metricCIs[m.name] = ci;
  console.log(`${m.name.padEnd(8)} mean ${pct(ci.mean)}  95% CI [${pct(ci.lo)}, ${pct(ci.hi)}]  over ${scored} judged prompt(s)`);
}
if (scored < Object.keys(judgments).length) {
  console.log(`(${Object.keys(judgments).length - scored} judged prompt(s) not covered by this run)`);
}

mkdirSync("eval/runs", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = `eval/runs/run-${stamp}.json`;
// Save `meta` (track name/artist) too so the pairwise LLM judge can read the
// playlists without regenerating. `metrics` holds all three CIs; meanPAt20/ci
// stay for backward-compat with anything reading the older shape.
writeFileSync(
  outPath,
  JSON.stringify({ run, meta, metrics: metricCIs, meanPAt20: metricCIs["P@20"].mean, ci: metricCIs["P@20"] }, null, 2)
);
console.log(`\nSaved run -> ${outPath}  (use with --compare to gate the next change)`);
