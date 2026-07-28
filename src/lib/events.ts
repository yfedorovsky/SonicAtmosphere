import { after } from "next/server";

import { getDb } from "@/db";
import { analyticsEvents } from "@/db/schema";

// Analytics must never fail or slow down a request. after() runs the write
// once the response is sent, and keeps serverless instances alive until it
// finishes (a bare floating promise would be killed with the instance).
export function trackEvent(
  userId: string | null,
  name: string,
  properties?: Record<string, unknown>,
): void {
  after(async () => {
    try {
      const db = await getDb();
      await db.insert(analyticsEvents).values({ userId, name, properties });
    } catch (err) {
      console.error("[events] failed to record", name, err);
    }
  });
}
