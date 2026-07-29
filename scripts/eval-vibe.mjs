// Score a vibe generation against a golden dataset.
// Usage: node scripts/eval-vibe.mjs [fixturePath] [baseUrl]
//   node scripts/eval-vibe.mjs eval/nyc-jazz.json http://localhost:3000
import { readFileSync } from "node:fs";

const fixturePath = process.argv[2] ?? "eval/nyc-jazz.json";
const baseUrl = process.argv[3] ?? "http://localhost:3000";
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .split(" - ")[0]
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

const filters = {
  energy: 50, acousticness: 50, popularity: 50,
  danceability: 50, valence: 50, instrumentalness: 50,
  ...(fixture.filters ?? {}),
};
const params = new URLSearchParams({ q: fixture.prompt, type: "vibe" });
for (const [k, v] of Object.entries(filters)) params.set(k, String(v));

const res = await fetch(`${baseUrl}/api/spotify/search?${params}`);
const data = await res.json();
const tracks = data.tracks ?? [];

const matches = (track, ref) =>
  track.artists.some((a) => normalize(a.name).includes(normalize(ref.artist))) &&
  normalize(track.name).includes(normalize(ref.title));

const hits = fixture.golden.filter((ref) => tracks.some((t) => matches(t, ref)));
const misses = fixture.golden.filter((ref) => !tracks.some((t) => matches(t, ref)));
const extras = tracks.filter((t) => !fixture.golden.some((ref) => matches(t, ref)));

console.log(`fixture: ${fixture.name}  degraded: ${data.degraded ?? "n/a"}  returned: ${tracks.length}`);
console.log(`golden overlap: ${hits.length}/${fixture.golden.length}`);
console.log(`\nHIT   ${hits.map((h) => `${h.title} — ${h.artist}`).join("\nHIT   ")}`);
console.log(`\nMISS  ${misses.map((m) => `${m.title} — ${m.artist}`).join("\nMISS  ")}`);
console.log(`\nEXTRA ${extras.map((t) => `${t.name} — ${t.artists[0]?.name}${t.tempo ? ` (${t.tempo} BPM)` : ""}`).join("\nEXTRA ")}`);
