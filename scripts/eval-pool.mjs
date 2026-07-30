// Build the pooled judgment template (Cranfield/TREC pooling): generate each
// prompt several times (and, when you have variants, from each variant), union
// the candidate tracks, and emit a template for a human to label. Pooling from
// multiple runs/variants keeps the judgment set fair to future variants that
// surface tracks the current pipeline doesn't.
//
// Usage: node scripts/eval-pool.mjs [baseUrl] [runsPerPrompt]
//   node scripts/eval-pool.mjs http://localhost:3000 3
// Writes eval/judgments.template.json — copy to eval/judgments.json and fill
// each track's "label" with: relevant | borderline | irrelevant.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { generatePlaylist } from "./eval-generate.mjs";

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const runs = Number(process.argv[3] ?? 3);
const { prompts } = JSON.parse(readFileSync("eval/prompts.json", "utf8"));

const template = {};
let degradedPrompts = 0;
for (const prompt of prompts) {
  const pool = new Map(); // trackId -> {name, artist}
  let anyDegraded = false;
  for (let i = 0; i < runs; i++) {
    const r = await generatePlaylist(baseUrl, prompt);
    if (r.degraded) anyDegraded = true;
    for (const t of r.tracks) if (!pool.has(t.id)) pool.set(t.id, { name: t.name, artist: t.artist });
  }
  if (anyDegraded) degradedPrompts++;
  template[prompt.id] = {};
  for (const [id, m] of pool) template[prompt.id][id] = { ...m, label: "" };
  console.error(`${prompt.id}: ${pool.size} unique candidates${anyDegraded ? " (SOME RUNS DEGRADED)" : ""}`);
}

mkdirSync("eval", { recursive: true });
writeFileSync("eval/judgments.template.json", JSON.stringify(template, null, 2));
const total = Object.values(template).reduce((n, p) => n + Object.keys(p).length, 0);
console.error(
  `\nWrote eval/judgments.template.json — ${total} candidates across ${prompts.length} prompts.` +
    (degradedPrompts ? ` WARNING: ${degradedPrompts} prompt(s) had degraded runs (quota/AI down) — re-pool later.` : "") +
    `\nCopy to eval/judgments.json and label each: relevant | borderline | irrelevant.`
);
