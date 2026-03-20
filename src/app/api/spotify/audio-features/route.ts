import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, getAudioFeatures } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");

  if (!ids) {
    return NextResponse.json({ error: "Missing track IDs" }, { status: 400 });
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const trackIds = ids.split(",").filter(Boolean).slice(0, 100);
  const features = await getAudioFeatures(accessToken, trackIds);

  return NextResponse.json({ audio_features: features });
}
