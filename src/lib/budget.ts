import { kvGet, kvIncr } from "@/lib/kv";

// Self-imposed daily ceiling on Spotify API calls, enforced globally through a
// KV counter keyed by UTC date.
//
// Why: Spotify's dev-mode tier has an opaque daily quota, and blowing past it
// trips a ~12h hard QUOTA_EXCEEDED lockout that takes the WHOLE app down for
// everyone (this has happened — a heavy eval run exhausted the quota). This
// soft cap stops us BEFORE Spotify's hard wall: once the day's budget is spent,
// spotifyFetch synthesizes a 429 instead of calling Spotify, so a runaway loop,
// a traffic spike, or a cron storm degrades to plain-search fallback for the
// rest of the UTC day rather than bricking the app.
//
// Because cache hits never reach spotifyFetch, an exhausted budget still serves
// cached and repeat prompts in full — only NEW quota burn is throttled.
//
// Fail-soft: without a KV store the counter can't be shared across serverless
// instances, so the cap simply does not apply (behaves exactly as before —
// local dev and the eval harness, which have no KV, are unaffected). The cap is
// env-tunable via SPOTIFY_DAILY_CALL_BUDGET; lower it while load-testing.

// ~80 fully-uncached generations/day. Calibrated 2026-07-30: a ~2.8k-call eval
// run tripped Spotify's dev-mode HARD daily lockout (~23h), so the real ceiling
// is ≈2.5–3k search calls/day. The cap must sit BELOW that to degrade at OUR
// soft wall instead of Spotify's hard one — 6000 was above the ceiling and
// never fired. Raise this only after observing a clean full-day quota.
const DEFAULT_BUDGET = 2000;
const COUNTER_TTL_S = 36 * 60 * 60; // 36h — comfortably outlives a UTC day.

function dailyBudget(): number {
  const raw = process.env.SPOTIFY_DAILY_CALL_BUDGET;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET;
}

// UTC date key (YYYY-MM-DD). Vercel runs UTC; keying by UTC keeps the window
// stable regardless of instance locale and rolls the counter at UTC midnight.
function todayKey(): string {
  return `sa:budget:${new Date().toISOString().slice(0, 10)}`;
}

// Warn at most once per instance as we approach the cap, for observability.
const flags = globalThis as unknown as { __saBudgetWarned?: boolean };

export interface BudgetState {
  count: number; // calls counted so far today (0 when the counter is unavailable)
  budget: number; // the active daily cap
  allowed: boolean; // whether THIS call is within budget
}

/**
 * Count one Spotify call against today's budget and report whether it is within
 * the cap. Returns `allowed: true` whenever the shared counter is unavailable
 * (no KV) so the cap can never block a call it cannot actually meter.
 */
export async function noteSpotifyCall(): Promise<BudgetState> {
  const budget = dailyBudget();
  const count = await kvIncr(todayKey(), COUNTER_TTL_S);
  if (count === null) return { count: 0, budget, allowed: true }; // no shared counter → no cap

  const allowed = count <= budget;
  if (!flags.__saBudgetWarned && count >= budget * 0.8) {
    flags.__saBudgetWarned = true;
    console.warn(`[budget] Spotify daily calls at ${count}/${budget} (${todayKey()})`);
  }
  if (count === budget + 1) {
    console.error(
      `[budget] Spotify daily budget ${budget} reached — degrading to plain search until UTC midnight`
    );
  }
  return { count, budget, allowed };
}

/**
 * Whether today's remaining budget can cover a WHOLE generation (~`reserve`
 * Spotify calls). Checked once at the start of a generation so we fail the
 * whole thing cleanly up front rather than starting it and dying mid-flight —
 * a half-resolved neighborhood marked non-degraded is worse than a clean
 * degrade. Read-only (no increment). Returns true when the counter is
 * unavailable (no KV → no cap), matching noteSpotifyCall's fail-soft. Not a
 * true reservation: concurrent generations can both pass, but that leaves at
 * most a small overshoot, not a partial playlist.
 */
export async function budgetAllowsGeneration(reserve: number): Promise<boolean> {
  const raw = await kvGet<number>(todayKey());
  if (raw === null) return true; // no shared counter → no cap
  const count = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(count)) return true;
  return count + reserve <= dailyBudget();
}

/** Seconds until the UTC counter rolls over — a truthful Retry-After. */
export function secondsUntilUtcReset(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}
