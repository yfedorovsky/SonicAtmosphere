import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key not configured" },
      { status: 500 }
    );
  }

  try {
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

Here is a sample of the tracks included for context: ${trackString || "no tracks yet"}`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema" as const,
          schema: {
            type: "object" as const,
            properties: {
              titles: {
                type: "array" as const,
                items: { type: "string" as const },
                description: "Array of 3 playlist title options",
              },
              description: {
                type: "string" as const,
                description: "A short, engaging playlist description",
              },
            },
            required: ["titles", "description"],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from Claude" },
        { status: 500 }
      );
    }

    const metadata = JSON.parse(textBlock.text);
    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Claude API Error:", error);
    return NextResponse.json(
      { error: "Failed to generate playlist metadata" },
      { status: 500 }
    );
  }
}
