// Pairwise LLM-as-judge — an automated supplement to the human judgment set,
// for scaling A/B comparison beyond hand-labeling.
//
// Design (per Zheng et al. 2023 / Kimi critique):
//  - PAIRWISE, never absolute 1–10 (absolute scores drift and compress).
//  - ORDER-SWAPPED: each pair is judged twice with the playlists in both
//    positions; only CONSISTENT verdicts count. This cancels position bias.
//  - INDEPENDENT model: Haiku judges, a different/smaller model than the
//    claude-opus-5 neighborhood generator, to avoid self-preference bias.
//  - Answers "which is better", never "how good" — a relative signal only.
//
// It supplements, does not replace, eval-score's P@20 + CI (the primary gate).
// Validate periodically by hand-labeling ~50 pairs and checking Cohen's κ ≥ 0.6
// (see eval/README.md); if it drifts below that, fix this prompt before trusting.
//
// Usage: node --env-file=.env scripts/eval-judge.mjs eval/runs/A.json eval/runs/B.json
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) {
  console.error("usage: node --env-file=.env scripts/eval-judge.mjs A.json B.json");
  process.exit(2);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set (run with --env-file=.env)");
  process.exit(2);
}

const { prompts } = JSON.parse(readFileSync("eval/prompts.json", "utf8"));
const A = JSON.parse(readFileSync(aPath, "utf8"));
const B = JSON.parse(readFileSync(bPath, "utf8"));
const anthropic = new Anthropic();

const listText = (run, meta, promptId) =>
  (run[promptId] ?? [])
    .slice(0, 20)
    .map((id, i) => `${i + 1}. ${meta?.[id]?.name ?? id} — ${meta?.[id]?.artist ?? "unknown"}`)
    .join("\n");

// One judgment. listX/listY are labeled X and Y (position-neutral). Returns
// "X" | "Y" | null (abstain / unparseable).
async function judgeOnce(promptText, listX, listY) {
  const content = `A listener asked for this playlist:
"${promptText}"

Two candidate playlists:

=== Playlist X ===
${listX}

=== Playlist Y ===
${listY}

Which playlist better fits the request AND consists of legitimate, on-target tracks (penalize wrong-subgenre, novelty/karaoke/content-farm, and off-vibe filler)? Judge the set as a whole. Answer with exactly one character — X or Y — and nothing else.`;
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 5,
    messages: [{ role: "user", content }],
  });
  const text = (res.content.find((c) => c.type === "text")?.text ?? "").trim().toUpperCase();
  return text.startsWith("X") ? "X" : text.startsWith("Y") ? "Y" : null;
}

let aWins = 0;
let bWins = 0;
let inconsistent = 0;
let skipped = 0;

for (const p of prompts) {
  if (!A.run?.[p.id]?.length || !B.run?.[p.id]?.length) {
    skipped++;
    continue;
  }
  const la = listText(A.run, A.meta, p.id);
  const lb = listText(B.run, B.meta, p.id);

  // Round 1: X=A, Y=B.   Round 2: X=B, Y=A (order swapped).
  const [r1, r2] = await Promise.all([judgeOnce(p.text, la, lb), judgeOnce(p.text, lb, la)]);
  const pick1 = r1 === "X" ? "A" : r1 === "Y" ? "B" : null;
  const pick2 = r2 === "X" ? "B" : r2 === "Y" ? "A" : null;

  if (pick1 && pick1 === pick2) {
    if (pick1 === "A") aWins++;
    else bWins++;
    console.log(`  ${pick1.padEnd(4)} ${p.id}`);
  } else {
    inconsistent++;
    console.log(`  ??   ${p.id}  (position-biased: ${pick1 ?? "-"}/${pick2 ?? "-"})`);
  }
}

const consistent = aWins + bWins;
console.log(
  `\nConsistent verdicts: ${consistent}  (A ${aWins} · B ${bWins})  |  position-biased ${inconsistent}  |  skipped ${skipped}`
);
if (consistent === 0) {
  console.log("VERDICT: no consistent signal — inconclusive.");
} else {
  const bRate = bWins / consistent;
  console.log(
    bRate >= 0.6
      ? `VERDICT: B preferred (${bWins}/${consistent} consistent). Corroborate with eval-score P@20 + CI before shipping.`
      : bRate <= 0.4
        ? `VERDICT: A preferred (${aWins}/${consistent} consistent).`
        : `VERDICT: roughly even (${bWins}/${consistent} for B) — no clear preference.`
  );
}
console.log("Note: a qualitative signal. The P@20 paired-bootstrap gate (eval-score --compare) decides shipping.");
