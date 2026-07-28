import { NextRequest, NextResponse } from "next/server";

import { trackEvent } from "@/lib/events";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

const NAME_RE = /^[a-z0-9_]{1,64}$/;

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  // Anonymous callers share one bucket: XFF is client-controlled, so an
  // IP-keyed bucket would be trivially rotated. Analytics only — a shared
  // throttle under attack is acceptable.
  const limited = rateLimit(`events:${userId ?? "anon"}`, 120, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const body = await req.json().catch(() => null);
  const name = body && typeof body.name === "string" ? body.name : "";
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: "Invalid event name" }, { status: 400 });
  }

  let properties: Record<string, unknown> | undefined;
  if (body.properties && typeof body.properties === "object") {
    const serialized = JSON.stringify(body.properties);
    if (serialized.length > 2048) {
      return NextResponse.json({ error: "Event properties too large" }, { status: 400 });
    }
    properties = body.properties;
  }

  trackEvent(userId, name, properties);
  return NextResponse.json({ ok: true });
}
