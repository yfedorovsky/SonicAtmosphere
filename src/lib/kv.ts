import { Redis } from "@upstash/redis";

// Persistent L2 cache (Upstash Redis via the Vercel KV integration). Serverless
// instances are short-lived, so the in-process (L1) caches barely dent the
// Spotify daily quota across cold starts. KV persists across instances and
// cold starts, so a search/tag fetched once is reused everywhere until its TTL.
//
// Entirely fail-soft: with no KV credentials (local dev, or before the store is
// provisioned) every call no-ops and callers fall back to their L1 cache — the
// app behaves exactly as before. Every Redis call is wrapped so a KV outage can
// never fail a generation.
//
// Credentials come from the Vercel KV integration (KV_REST_API_URL /
// KV_REST_API_TOKEN) or a raw Upstash pair (UPSTASH_REDIS_REST_URL / _TOKEN).

const globalForKv = globalThis as unknown as { __saKvClient?: Redis | null };

function client(): Redis | null {
  if (globalForKv.__saKvClient !== undefined) return globalForKv.__saKvClient;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    globalForKv.__saKvClient = url && token ? new Redis({ url, token }) : null;
  } catch {
    globalForKv.__saKvClient = null;
  }
  return globalForKv.__saKvClient;
}

/** Whether a KV store is configured (used only for logging/telemetry). */
export function kvEnabled(): boolean {
  return client() !== null;
}

/** Get a JSON value, or null on miss / no-KV / any error. */
export async function kvGet<T>(key: string): Promise<T | null> {
  const redis = client();
  if (!redis) return null;
  try {
    return ((await redis.get<T>(key)) as T | null) ?? null;
  } catch {
    return null; // KV outage must never break a read path
  }
}

/** Set a JSON value with a TTL (seconds). No-ops on no-KV / any error. */
export async function kvSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = client();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    /* fail soft — a failed cache write just means a future re-fetch */
  }
}
