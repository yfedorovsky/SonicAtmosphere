import { NextRequest, NextResponse } from "next/server";

// Stub: Will be wired to real Spotify API after auth is implemented
// For now, returns mock data so the UI is functional

const MOCK_TRACKS = [
  {
    id: "1",
    name: "Midnight Protocol",
    artists: [{ id: "a1", name: "Lumina Wave" }],
    album: {
      id: "al1",
      name: "Neon Dreams",
      images: [{ url: "https://picsum.photos/seed/track1/300/300", width: 300, height: 300 }],
    },
    duration_ms: 222000,
    uri: "spotify:track:mock1",
    preview_url: null,
    external_urls: { spotify: "#" },
    popularity: 65,
  },
  {
    id: "2",
    name: "Echoes of Silica",
    artists: [{ id: "a2", name: "Orbital Drift" }],
    album: {
      id: "al2",
      name: "Fragments",
      images: [{ url: "https://picsum.photos/seed/track2/300/300", width: 300, height: 300 }],
    },
    duration_ms: 318000,
    uri: "spotify:track:mock2",
    preview_url: null,
    external_urls: { spotify: "#" },
    popularity: 42,
  },
  {
    id: "3",
    name: "Glass Reflections",
    artists: [{ id: "a3", name: "The Static Duo" }],
    album: {
      id: "al3",
      name: "Prismatic",
      images: [{ url: "https://picsum.photos/seed/track3/300/300", width: 300, height: 300 }],
    },
    duration_ms: 179000,
    uri: "spotify:track:mock3",
    preview_url: null,
    external_urls: { spotify: "#" },
    popularity: 78,
  },
  {
    id: "4",
    name: "Submarine Sunset",
    artists: [{ id: "a4", name: "Deep Current" }],
    album: {
      id: "al4",
      name: "Below Surface",
      images: [{ url: "https://picsum.photos/seed/track4/300/300", width: 300, height: 300 }],
    },
    duration_ms: 256000,
    uri: "spotify:track:mock4",
    preview_url: null,
    external_urls: { spotify: "#" },
    popularity: 55,
  },
  {
    id: "5",
    name: "Static Dreams",
    artists: [{ id: "a5", name: "Lunar Bloom" }],
    album: {
      id: "al5",
      name: "Nightfall Theory",
      images: [{ url: "https://picsum.photos/seed/track5/300/300", width: 300, height: 300 }],
    },
    duration_ms: 238000,
    uri: "spotify:track:mock5",
    preview_url: null,
    external_urls: { spotify: "#" },
    popularity: 38,
  },
  {
    id: "6",
    name: "Wall of Glass",
    artists: [{ id: "a6", name: "Fracture" }],
    album: {
      id: "al6",
      name: "Shattered Light",
      images: [{ url: "https://picsum.photos/seed/track6/300/300", width: 300, height: 300 }],
    },
    duration_ms: 241000,
    uri: "spotify:track:mock6",
    preview_url: null,
    external_urls: { spotify: "#" },
    popularity: 71,
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const limit = parseInt(searchParams.get("limit") || "20");

  // TODO: Replace with real Spotify API call
  // const accessToken = getAccessToken(request);
  // const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=${limit}`, {
  //   headers: { Authorization: `Bearer ${accessToken}` },
  // });

  // For now, return mock data filtered by query
  const filtered = query
    ? MOCK_TRACKS.filter(
        (t) =>
          t.name.toLowerCase().includes(query.toLowerCase()) ||
          t.artists[0].name.toLowerCase().includes(query.toLowerCase()) ||
          true // Return all mocks for any query
      )
    : MOCK_TRACKS;

  return NextResponse.json({ tracks: filtered.slice(0, limit) });
}
