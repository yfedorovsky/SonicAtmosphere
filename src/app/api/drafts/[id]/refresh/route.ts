import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { refreshRules } from "@/db/schema";
import { DraftAccessError } from "@/lib/drafts";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { runRefresh } from "@/lib/refresh";
import { getSessionUserId } from "@/lib/session";

// Manual "Refresh now": uses the draft's saved rule, or sensible defaults
// when no rule exists yet.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/drafts/[id]/refresh">) {
  const { id } = await ctx.params;
  const ipLimited = rateLimit(`refresh:ip:${clientIp(req)}`, 20, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  const limited = rateLimit(`refresh:${userId}`, 6, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  try {
    const db = await getDb();
    const [rule] = await db
      .select()
      .from(refreshRules)
      .where(eq(refreshRules.draftId, id))
      .limit(1);

    const spec =
      rule && rule.userId === userId
        ? rule
        : {
            userId,
            draftId: id,
            cadence: "weekly" as const,
            keepPercent: 60,
            artistRepeatWindow: null,
          };

    // ?preview=1 computes the change-set without mutating the draft, so the
    // client can show it for review before the user applies it.
    const preview = req.nextUrl.searchParams.get("preview") === "1";
    const result = await runRefresh(db, spec, { apply: !preview });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason ?? "Refresh failed" }, { status: 422 });
    }
    return NextResponse.json(
      preview
        ? {
            ok: true,
            replaced: result.replaced,
            proposedTracks: result.proposedTracks,
            removedIds: result.removedIds,
            addedIds: result.addedIds,
          }
        : { ok: true, replaced: result.replaced },
    );
  } catch (error) {
    if (error instanceof DraftAccessError) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    console.error("[refresh] manual refresh failed:", error);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
