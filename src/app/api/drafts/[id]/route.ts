import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  DraftAccessError,
  deleteDraftById,
  getDraftById,
  parseDraftPayload,
  upsertDraft,
} from "@/lib/drafts";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getOrCreateUserId, getSessionUserId } from "@/lib/session";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/drafts/[id]">) {
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  try {
    const db = await getDb();
    const draft = await getDraftById(db, userId, id);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof DraftAccessError) {
      // Same response as not-found: don't confirm another user's draft exists.
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("[drafts] fetch failed:", error);
    return NextResponse.json({ error: "Failed to load draft" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/drafts/[id]">) {
  const { id } = await ctx.params;
  const ipLimited = rateLimit(`drafts:ip:${clientIp(req)}`, 240, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);

  const userId = await getOrCreateUserId();
  // Generous enough for the one-time localStorage migration to finish in one pass.
  const limited = rateLimit(`drafts:${userId}`, 120, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const body = await req.json().catch(() => null);
  const draft = parseDraftPayload(body);
  if (!draft || draft.id !== id) {
    return NextResponse.json({ error: "Invalid draft payload" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const saved = await upsertDraft(db, userId, draft);
    return NextResponse.json({ draft: saved });
  } catch (error) {
    if (error instanceof DraftAccessError) {
      return NextResponse.json({ error: "Draft id unavailable" }, { status: 409 });
    }
    console.error("[drafts] save failed:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/drafts/[id]">) {
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  try {
    const db = await getDb();
    const deleted = await deleteDraftById(db, userId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DraftAccessError) {
      // Same response as not-found: don't confirm another user's draft exists.
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("[drafts] delete failed:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
