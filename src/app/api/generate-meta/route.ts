import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key not configured" },
      { status: 500 }
    );
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const { prompt, tracks } = await req.json();

    // Limit payload: just artist - track name for the first 15 tracks
    const trackString = (tracks || [])
      .slice(0, 15)
      .map((t: { artist: string; name: string }) => `${t.artist} - ${t.name}`)
      .join(", ");

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Generate 3 creative, cohesive Spotify playlist titles and one short, engaging description (max 2 sentences) based on this user prompt: "${prompt || "curated playlist"}".

Here is a sample of the tracks included for context: ${trackString || "no tracks yet"}

Respond ONLY with valid JSON in this exact format, no other text:
{"titles": ["Title 1", "Title 2", "Title 3"], "description": "A short description."}`,
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from Claude" },
        { status: 500 }
      );
    }

    // Extract JSON from response (handle potential markdown code blocks)
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const metadata = JSON.parse(jsonStr);
    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Claude API Error:", error);
    return NextResponse.json(
      { error: "Failed to generate playlist metadata" },
      { status: 500 }
    );
  }
}
