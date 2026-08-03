// Unit tests for the flow sequencer (lib/sequencing.ts).
// Run: npm run test:sequencing   (Node ≥ 22 strips the TS types on import,
// so this exercises the REAL module — no mirror to drift out of sync.)
import {
  arrangeForFlow, flowCost, camelotPenalty, mixTempo,
} from "../src/lib/sequencing.ts";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("  ✗ " + msg); } };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// --- primitives ---
ok(camelotPenalty({ key: 0, mode: 1 }, { key: 0, mode: 1 }) === 0, "same key = 0");
ok(camelotPenalty({ key: 0, mode: 1 }, { key: 9, mode: 0 }) === 0.15, "relative maj/min (C maj / A min) = 0.15");
ok(camelotPenalty(undefined, { key: 0, mode: 1 }) === 0.4, "unknown key = 0.4");
ok(camelotPenalty({ key: -1, mode: 1 }, { key: 0, mode: 1 }) === 0.4, "key -1 = 0.4");
ok(mixTempo(128) >= 70 && mixTempo(128) < 140, "128 folds into band");
ok(Math.abs(mixTempo(64) - mixTempo(128)) < 1e-9, "64 and 128 fold equal (half-time)");
ok(mixTempo(0) === null && mixTempo(undefined) === null, "bad tempo = null");
ok(flowCost({ id: "a", energy: 0.5, tempo: 120, key: 0, mode: 1 },
            { id: "a", energy: 0.5, tempo: 120, key: 0, mode: 1 }) === 0, "identical tracks cost 0");

// --- test playlist ---
const rndish = (i) => ((i * 2654435761) % 1000) / 1000; // deterministic
const items = Array.from({ length: 24 }, (_, i) => ({
  id: "t" + i, energy: rndish(i), tempo: 90 + Math.floor(rndish(i + 7) * 70), key: i % 12, mode: i % 2,
}));
const byId = new Map(items.map((t) => [t.id, t]));
const totalCost = (order) => { let c = 0; for (let i = 1; i < order.length; i++) c += flowCost(byId.get(order[i - 1]), byId.get(order[i])); return c; };

// --- permutation invariant ---
for (const mode of ["smooth", "arc"]) {
  const order = arrangeForFlow(items, mode);
  ok(order.length === items.length, `${mode}: same length`);
  ok(new Set(order).size === items.length, `${mode}: no dupes`);
  ok(order.every((id) => byId.has(id)), `${mode}: no foreign ids`);
}

// --- smooth lowers total transition cost ---
const origCost = totalCost(items.map((t) => t.id));
const smoothCost = totalCost(arrangeForFlow(items, "smooth"));
ok(smoothCost < origCost, `smooth reduces cost (${smoothCost.toFixed(2)} < ${origCost.toFixed(2)})`);

// --- arc: energy rises to a peak then falls ---
const arc = arrangeForFlow(items, "arc").map((id) => byId.get(id).energy);
const n = arc.length, q = Math.floor(n / 4);
ok(mean(arc.slice(0, q)) < mean(arc.slice(q, n - q)), "arc: opening quieter than middle");
ok(mean(arc.slice(n - q)) < mean(arc.slice(q, n - q)), "arc: ending quieter than middle");
const peak = arc.indexOf(Math.max(...arc));
ok(peak > n * 0.2 && peak < n * 0.85, `arc: peak in the body (idx ${peak}/${n})`);

// --- guards ---
ok(JSON.stringify(arrangeForFlow(items.slice(0, 4), "smooth")) === JSON.stringify(items.slice(0, 4).map((t) => t.id)), "guard: <5 returns input order unchanged");
const noSignal = Array.from({ length: 10 }, (_, i) => ({ id: "n" + i }));
ok(JSON.stringify(arrangeForFlow(noSignal, "arc")) === JSON.stringify(noSignal.map((t) => t.id)), "guard: no feature signal returns input order");
const partial = items.map((t, i) => (i % 3 === 0 ? { id: t.id } : t));
ok(new Set(arrangeForFlow(partial, "arc")).size === partial.length, "partial coverage: no dupes/drops");

console.log(`\n${fail === 0 ? "✅" : "❌"} sequencing: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
