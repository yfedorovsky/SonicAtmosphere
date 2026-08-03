// ---------------------------------------------------------------------------
// Flow sequencing ("DJ mode")
//
// Order a set of tracks so adjacent tracks transition well — the ordering that
// makes a listener-side crossfade actually land instead of clash. Two shapes:
//
//   • smooth — a greedy minimum-transition-cost path refined by 2-opt. Every
//     hand-off is as seamless as possible; energy wanders where the music does.
//   • arc    — a party curve: mellow open, build to a mid/late peak, cool-down
//     finish. The macro shape comes from energy; local key/tempo hand-offs are
//     smoothed within a small window so the arc survives.
//
// Transition cost blends energy, tempo (half/double-time aware), and Camelot-
// wheel harmonic compatibility with the SAME weights the generation-time
// sequencer uses (recommendations.sequenceForFlow shares these primitives).
// Key detection is only ~70-85% accurate, so harmonic is a light tie-breaker
// (0.05) — energy and tempo carry the flow.
//
// This module is intentionally dependency-free (pure functions, no imports) so
// it is trivially unit-testable and safe to share across the server.
// ---------------------------------------------------------------------------

// Camelot wheel numbers indexed by Spotify pitch class (0=C..11=B).
export const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
export const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

export interface KeyMode {
  key: number;
  mode: number;
}

/**
 * Harmonic transition penalty between two keys on the Camelot wheel.
 * 0 = same key; 0.15 = relative major/minor swap; 0.2 = adjacent (±1) energy
 * shift; 1 = clash. Unknown key (key < 0 or missing) is a mild 0.4 — we neither
 * reward nor heavily punish what we can't read.
 */
export function camelotPenalty(a: KeyMode | undefined, b: KeyMode | undefined): number {
  if (!a || !b || a.key < 0 || b.key < 0) return 0.4;
  const numA = (a.mode === 1 ? CAMELOT_MAJOR : CAMELOT_MINOR)[a.key];
  const numB = (b.mode === 1 ? CAMELOT_MAJOR : CAMELOT_MINOR)[b.key];
  if (numA == null || numB == null) return 0.4; // out-of-range key index
  if (numA === numB) return a.mode === b.mode ? 0 : 0.15; // perfect / mood swap
  const step = Math.min(Math.abs(numA - numB), 12 - Math.abs(numA - numB));
  if (step === 1 && a.mode === b.mode) return 0.2; // energy shift ±1
  return 1;
}

/**
 * Fold BPM into a comparable "mix tempo" band so 128 and 64 (half-time) read as
 * neighbours. Non-positive/non-finite tempo returns null (failed beat
 * detection) — feeding 0 into the fold would spin forever.
 */
export function mixTempo(bpm: number | undefined | null): number | null {
  if (bpm == null || bpm <= 0 || !Number.isFinite(bpm)) return null;
  let t = bpm;
  while (t >= 140) t /= 2;
  while (t < 70) t *= 2;
  return t;
}

export interface FlowItem {
  id: string;
  energy?: number | null; // 0..1
  tempo?: number | null; // BPM
  key?: number; // 0..11, -1/undefined = unknown
  mode?: number; // 1 major, 0 minor
}

const keyModeOf = (t: FlowItem): KeyMode | undefined =>
  t.key == null ? undefined : { key: t.key, mode: t.mode ?? 0 };

/**
 * Transition cost between two tracks. Same weighting as the generation-time
 * sequencer: 0.6 energy + 0.35 tempo + 0.05 harmonic. Missing signal falls back
 * to neutral-ish constants so partial feature coverage still orders sensibly.
 */
export function flowCost(a: FlowItem, b: FlowItem): number {
  const energyDelta =
    a.energy != null && b.energy != null ? Math.abs(a.energy - b.energy) : 0.3;
  const ta = mixTempo(a.tempo);
  const tb = mixTempo(b.tempo);
  // Circular fold: 139 vs 141 BPM land at opposite band edges, so take the best
  // of direct/half/double readings.
  const tempoDelta =
    ta !== null && tb !== null
      ? Math.min(
          1,
          Math.min(Math.abs(ta - tb), Math.abs(ta * 2 - tb), Math.abs(ta - tb * 2)) / 40
        )
      : 0.3;
  return 0.6 * energyDelta + 0.35 * tempoDelta + 0.05 * camelotPenalty(keyModeOf(a), keyModeOf(b));
}

// 2-opt refinement. `fixedFirst` pins index 0 (the chosen opener). `window`, if
// set, only reverses segments up to that length — used by the arc so local
// key/tempo edges improve without dismantling the macro energy shape. flowCost
// is symmetric, so reversing a segment only changes its two boundary edges.
function twoOpt(path: FlowItem[], fixedFirst: boolean, maxPasses: number, window?: number): void {
  const start = fixedFirst ? 1 : 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = Math.max(1, start); i < path.length - 1; i++) {
      const jMax = window ? Math.min(path.length - 1, i + window) : path.length - 1;
      for (let j = i + 1; j <= jMax; j++) {
        const a = path[i - 1];
        const b = path[i];
        const c = path[j];
        const d = path[j + 1]; // undefined when reversing the suffix
        const before = flowCost(a, b) + (d ? flowCost(c, d) : 0);
        const after = flowCost(a, c) + (d ? flowCost(b, d) : 0);
        if (after < before - 1e-9) {
          let lo = i;
          let hi = j;
          while (lo < hi) {
            const tmp = path[lo];
            path[lo] = path[hi];
            path[hi] = tmp;
            lo++;
            hi--;
          }
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
}

/** Greedy nearest-neighbour path anchored on items[0], refined by full 2-opt. */
export function smoothOrder(items: FlowItem[]): FlowItem[] {
  if (items.length < 3) return items.slice();
  const remaining = items.slice(1);
  const path = [items[0]];
  while (remaining.length > 0) {
    const last = path[path.length - 1];
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = flowCost(last, remaining[i]);
      if (c < bestCost) {
        bestCost = c;
        bestIdx = i;
      }
    }
    path.push(remaining.splice(bestIdx, 1)[0]);
  }
  twoOpt(path, true, 6);
  return path;
}

// Insert `item` at the position that adds the least transition cost.
function insertCheapest(path: FlowItem[], item: FlowItem): void {
  if (path.length === 0) {
    path.push(item);
    return;
  }
  let bestPos = path.length;
  let best = Infinity;
  for (let pos = 0; pos <= path.length; pos++) {
    const prev = path[pos - 1];
    const next = path[pos];
    const add =
      (prev ? flowCost(prev, item) : 0) +
      (next ? flowCost(item, next) : 0) -
      (prev && next ? flowCost(prev, next) : 0);
    if (add < best) {
      best = add;
      bestPos = pos;
    }
  }
  path.splice(bestPos, 0, item);
}

/**
 * Party energy arc: mellow open → mid/late peak → cool-down. Build a bell from
 * energy (lowest tracks bookend, highest in the centre) by dealing the
 * energy-sorted list alternately to the front and the reversed back, then
 * windowed-2-opt to smooth local key/tempo hand-offs without flattening the
 * arc. Tracks with no energy signal are cheap-inserted afterwards.
 */
export function arcOrder(items: FlowItem[]): FlowItem[] {
  const known = items.filter((t) => t.energy != null);
  const unknown = items.filter((t) => t.energy == null);
  if (known.length < 4) return smoothOrder(items);

  const sorted = known.slice().sort((a, b) => (a.energy as number) - (b.energy as number));
  const front: FlowItem[] = [];
  const back: FlowItem[] = [];
  sorted.forEach((it, i) => (i % 2 === 0 ? front : back).push(it));
  const bell = [...front, ...back.reverse()];

  twoOpt(bell, false, 4, 5);
  for (const u of unknown) insertCheapest(bell, u);
  return bell;
}

export type FlowMode = "smooth" | "arc";

/**
 * Order tracks for listening flow and return the ordered ids. Returns the input
 * order unchanged when there are too few tracks (<5) or too little audio-feature
 * signal (<half of tracks have energy/tempo) to sequence responsibly.
 */
export function arrangeForFlow(items: FlowItem[], mode: FlowMode = "smooth"): string[] {
  if (items.length < 5) return items.map((t) => t.id);
  const known = items.filter((t) => t.energy != null || t.tempo != null).length;
  if (known < items.length / 2) return items.map((t) => t.id);
  const ordered = mode === "arc" ? arcOrder(items) : smoothOrder(items);
  return ordered.map((t) => t.id);
}
