import { NextRequest, NextResponse } from "next/server";
import { and, eq, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { refreshRules } from "@/db/schema";
import { runRefresh } from "@/lib/refresh";

// Scheduled regeneration entry point — wired to a platform cron (see
// vercel.json). Auth: Vercel sends Authorization: Bearer ${CRON_SECRET}.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const due = await db
    .select()
    .from(refreshRules)
    .where(and(eq(refreshRules.enabled, true), lte(refreshRules.nextRunAt, new Date())))
    .limit(25);

  const results: { draftId: string; ok: boolean; replaced: number; reason?: string }[] = [];
  for (const rule of due) {
    try {
      const result = await runRefresh(db, rule);
      results.push({ draftId: rule.draftId, ...result });
    } catch (error) {
      console.error(`[cron/refresh] rule ${rule.id} failed:`, error);
      results.push({ draftId: rule.draftId, ok: false, replaced: 0, reason: "error" });
    }
  }
  return NextResponse.json({ due: due.length, results });
}
