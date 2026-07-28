import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { DraftAccessError, listDrafts, parseDraftPayload, upsertDraft } from "@/lib/drafts";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getOrCreateUserId, getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ drafts: [] });
  }
  const db = await getDb();
  const drafts = await listDrafts(db, userId);
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  const ipLimited = rateLimit(`drafts:ip:${clientIp(req)}`, 240, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);

  const userId = await getOrCreateUserId();
  // Generous enough for the one-time localStorage migration to finish in one pass.
  const limited = rateLimit(`drafts:${userId}`, 120, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const body = await req.json().catch(() => null);
  const draft = parseDraftPayload(body);
  if (!draft) {
    return NextResponse.json({ error: "Invalid draft payload" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const saved = await upsertDraft(db, userId, draft);
    return NextResponse.json({ draft: saved });
  } catch (error) {
    if (error instanceof DraftAccessError) {
      return NextResponse.json({ error: "Draft belongs to another user" }, { status: 403 });
    }
    console.error("[drafts] save failed:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
}
