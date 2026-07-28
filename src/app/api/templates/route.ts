import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { playlistTemplates } from "@/db/schema";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getOrCreateUserId, getSessionUserId } from "@/lib/session";
import type { FilterValues, GeneratorMode } from "@/types";

const GENERATOR_MODES: GeneratorMode[] = ["vibe", "song", "artist", "genre", "import"];

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ templates: [] });

  const db = await getDb();
  const templates = await db
    .select()
    .from(playlistTemplates)
    .where(eq(playlistTemplates.userId, userId))
    .orderBy(desc(playlistTemplates.createdAt));
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const ipLimited = rateLimit(`templates:ip:${clientIp(req)}`, 60, 60_000);
  if (!ipLimited.ok) return tooManyRequests(ipLimited.retryAfterSec);

  const userId = await getOrCreateUserId();
  const limited = rateLimit(`templates:${userId}`, 30, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) {
    return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  }

  const mode = GENERATOR_MODES.includes(body.mode) ? (body.mode as GeneratorMode) : null;
  const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 2000) : null;
  const filters =
    body.filters && typeof body.filters === "object" ? (body.filters as FilterValues) : null;

  const db = await getDb();
  const [template] = await db
    .insert(playlistTemplates)
    .values({ userId, name, prompt, mode, filters })
    .returning();
  return NextResponse.json({ template });
}
