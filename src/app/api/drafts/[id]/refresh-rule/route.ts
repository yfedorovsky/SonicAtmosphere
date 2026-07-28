import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { refreshRules } from "@/db/schema";
import { DraftAccessError, getDraftById } from "@/lib/drafts";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";
import { nextRunTime } from "@/lib/refresh";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/drafts/[id]/refresh-rule">) {
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ rule: null });

  const db = await getDb();
  const [rule] = await db
    .select()
    .from(refreshRules)
    .where(eq(refreshRules.draftId, id))
    .limit(1);
  return NextResponse.json({ rule: rule && rule.userId === userId ? rule : null });
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/drafts/[id]/refresh-rule">) {
  const { id } = await ctx.params;
  const ipLimited = rateLimit(`refresh-rule:ip:${clientIp(req)}`, 60, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const cadence = body?.cadence === "daily" || body?.cadence === "weekly" ? body.cadence : null;
  if (!cadence) {
    return NextResponse.json({ error: "cadence must be daily or weekly" }, { status: 400 });
  }
  const keepPercent =
    typeof body.keepPercent === "number" && Number.isFinite(body.keepPercent)
      ? Math.min(90, Math.max(10, Math.round(body.keepPercent)))
      : 60;
  const artistRepeatWindow =
    typeof body.artistRepeatWindow === "number" && body.artistRepeatWindow > 0
      ? Math.min(10, Math.round(body.artistRepeatWindow))
      : null;
  const enabled = body.enabled !== false;

  try {
    const db = await getDb();
    // Ownership check: only the draft's owner can attach a rule.
    const draft = await getDraftById(db, userId, id);
    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const values = {
      userId,
      draftId: id,
      cadence,
      keepPercent,
      artistRepeatWindow,
      enabled,
      nextRunAt: nextRunTime(cadence),
      updatedAt: new Date(),
    };
    const [rule] = await db
      .insert(refreshRules)
      .values(values)
      .onConflictDoUpdate({
        target: refreshRules.draftId,
        set: values,
        setWhere: eq(refreshRules.userId, userId),
      })
      .returning();
    if (!rule) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof DraftAccessError) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("[refresh-rule] save failed:", error);
    return NextResponse.json({ error: "Failed to save refresh rule" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/drafts/[id]/refresh-rule">) {
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const db = await getDb();
  const [rule] = await db
    .select({ id: refreshRules.id, userId: refreshRules.userId })
    .from(refreshRules)
    .where(eq(refreshRules.draftId, id))
    .limit(1);
  if (!rule || rule.userId !== userId) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }
  await db.delete(refreshRules).where(eq(refreshRules.id, rule.id));
  return NextResponse.json({ ok: true });
}
