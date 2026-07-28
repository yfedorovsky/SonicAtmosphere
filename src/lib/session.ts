import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { sign, verifySigned } from "@/lib/crypto";

export const SESSION_COOKIE = "sa_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function sessionCookieValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR,
} as const;

// Returns the verified user id from the session cookie, without touching the
// database. Null when absent or tampered with.
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const uid = raw.slice(0, dot);
  return verifySigned(uid, raw.slice(dot + 1)) ? uid : null;
}

// Only callable where cookie writes are allowed (route handlers, actions).
export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionCookieValue(userId), sessionCookieOptions);
}

// Anonymous-first identity: every visitor gets a user row lazily on their
// first persisting request. Re-creates the row if the dev DB was wiped so a
// stale-but-valid cookie keeps working.
export async function getOrCreateUserId(): Promise<string> {
  const db = await getDb();
  const existing = await getSessionUserId();
  if (existing) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, existing))
      .limit(1);
    if (rows.length === 0) {
      await db.insert(users).values({ id: existing }).onConflictDoNothing();
    }
    return existing;
  }
  const [row] = await db.insert(users).values({}).returning({ id: users.id });
  await setSessionCookie(row.id);
  return row.id;
}
