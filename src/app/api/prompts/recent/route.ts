import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { generationRuns } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";

// Recent-prompt history is derived from generation runs — no separate table.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ prompts: [] });
  }

  const db = await getDb();
  const rows = await db
    .select({ prompt: generationRuns.prompt })
    .from(generationRuns)
    .where(eq(generationRuns.userId, userId))
    .orderBy(desc(generationRuns.createdAt))
    .limit(100);

  const prompts: string[] = [];
  for (const row of rows) {
    if (row.prompt && !prompts.includes(row.prompt)) {
      prompts.push(row.prompt);
      if (prompts.length >= 20) break;
    }
  }
  return NextResponse.json({ prompts });
}
