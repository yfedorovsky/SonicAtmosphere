import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { playlistTemplates } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/templates/[id]">) {
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const db = await getDb();
  const [template] = await db
    .select()
    .from(playlistTemplates)
    .where(and(eq(playlistTemplates.id, id), eq(playlistTemplates.userId, userId)))
    .limit(1);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/templates/[id]">) {
  const { id } = await ctx.params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const db = await getDb();
  const deleted = await db
    .delete(playlistTemplates)
    .where(and(eq(playlistTemplates.id, id), eq(playlistTemplates.userId, userId)))
    .returning({ id: playlistTemplates.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
