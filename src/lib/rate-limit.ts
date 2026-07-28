import { NextResponse } from "next/server";

// Fixed-window in-memory limiter. Per-instance only — good enough for
// single-node dev/small deployments; swap for a shared store (e.g. Upstash)
// before scaling to multiple serverless instances.
type Bucket = { count: number; resetAt: number };

const globalForRl = globalThis as unknown as { __sonicRateLimit?: Map<string, Bucket> };

function buckets(): Map<string, Bucket> {
  if (!globalForRl.__sonicRateLimit) globalForRl.__sonicRateLimit = new Map();
  return globalForRl.__sonicRateLimit;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const store = buckets();

  if (store.size > 5000) {
    for (const [k, b] of store) {
      if (b.resetAt <= now) store.delete(k);
    }
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

// Best-effort client IP for pre-identity throttling. The first XFF hop is
// client-controlled, so IP buckets are a coarse outer gate only — always pair
// them with a per-user bucket keyed on the signed session id.
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon"
  );
}

export function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Slow down and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
