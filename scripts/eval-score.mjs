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
import { scoreRun, bootstrapMeanCI, pairedBootstrapDiff } from "./eval-lib.mjs";

const pct = (x) => (x * 100).toFixed(1) + "%";
const loadJudgments = () => JSON.parse(readFileSync("eval/judgments.json", "utf8"));

if (process.argv[2] === "--compare") {
  const [, , , aPath, bPath] = process.argv;
  if (!aPath || !bPath) {
    console.error("usage: node scripts/eval-score.mjs --compare A.json B.json");
    process.exit(2);
  }
  const judgments = loadJudgments();
  const runA = JSON.parse(readFileSync(aPath, "utf8")).run;
  const runB = JSON.parse(readFileSync(bPath, "utf8")).run;
  const sa = scoreRun(runA, judgments);
  const sb = scoreRun(runB, judgments);
  const ca = bootstrapMeanCI(sa);
  const cb = bootstrapMeanCI(sb);
  const diff = pairedBootstrapDiff(sa, sb);
  console.log(`A  P@20 ${pct(ca.mean)}  95% CI [${pct(ca.lo)}, ${pct(ca.hi)}]  (n=${ca.n})`);
  console.log(`B  P@20 ${pct(cb.mean)}  95% CI [${pct(cb.lo)}, ${pct(cb.hi)}]  (n=${cb.n})`);
  console.log(`Δ (B-A) ${pct(diff.deltaMean)}  95% CI [${pct(diff.lo)}, ${pct(diff.hi)}]  (paired n=${diff.n})`);
  console.log(
    diff.shipsForward
      ? "VERDICT: SHIP — B beats A (CI wholly above 0)."
      : diff.shipsBackward
        ? "VERDICT: REGRESSION — B is worse than A (CI wholly below 0)."
        : "VERDICT: INCONCLUSIVE — CI straddles 0; difference is within noise."
  );
  process.exit(0);
}

// Default: generate + score one run.
const baseUrl = process.argv[2] ?? "http://localhost:3000";
const { prompts } = JSON.parse(readFileSync("eval/prompts.json", "utf8"));
const judgments = loadJudgments();

const { run, degraded } = await generateAll(baseUrl, prompts);
if (degraded) console.error(`WARNING: ${degraded} prompt(s) returned degraded results — scores unreliable.`);

const scores = scoreRun(run, judgments);
const scored = Object.keys(scores).length;
for (const [pid, s] of Object.entries(scores).sort((a, b) => a[1] - b[1])) {
  console.log(`  ${pct(s).padStart(6)}  ${pid}`);
}
const ci = bootstrapMeanCI(scores);
console.log(`\nP@20 mean ${pct(ci.mean)}  95% CI [${pct(ci.lo)}, ${pct(ci.hi)}]  over ${scored} judged prompt(s)`);
if (scored < Object.keys(judgments).length) {
  console.log(`(${Object.keys(judgments).length - scored} judged prompt(s) not covered by this run)`);
}

mkdirSync("eval/runs", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = `eval/runs/run-${stamp}.json`;
writeFileSync(outPath, JSON.stringify({ run, meanPAt20: ci.mean, ci }, null, 2));
console.log(`\nSaved run -> ${outPath}  (use with --compare to gate the next change)`);
