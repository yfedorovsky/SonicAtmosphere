// Network helper: run a prompt through the live generation route and return
// its track ids + minimal metadata. Shared by eval-pool and eval-score.
// (Needs the Spotify quota available to return real results.)

const SLIDER_DEFAULT = 50;
const SLIDERS = ["energy", "acousticness", "popularity", "danceability", "valence", "instrumentalness"];

export async function generatePlaylist(baseUrl, prompt, { sequence = true } = {}) {
  const params = new URLSearchParams({ q: prompt.text, type: prompt.mode });
  for (const s of SLIDERS) params.set(s, String(prompt.filters?.[s] ?? SLIDER_DEFAULT));
  if (prompt.moods?.length) params.set("moods", prompt.moods.join(","));
  if (!sequence) params.set("sequence", "0");

  const res = await fetch(`${baseUrl}/api/spotify/search?${params}`);
  if (!res.ok) return { promptId: prompt.id, degraded: true, error: `HTTP ${res.status}`, tracks: [] };
  const data = await res.json();
  const tracks = (data.tracks ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    artist: t.artists?.[0]?.name ?? "",
  }));
  return { promptId: prompt.id, degraded: Boolean(data.degraded), tracks };
}

/** Generate every prompt once. Returns { promptId -> trackIds[] } plus a
 *  metadata map { trackId -> {name, artist} } for judging templates. */
export async function generateAll(baseUrl, prompts, opts = {}) {
  const run = {};
  const meta = {};
  let degraded = 0;
  for (const prompt of prompts) {
    const r = await generatePlaylist(baseUrl, prompt, opts);
    if (r.degraded) degraded++;
    run[prompt.id] = r.tracks.map((t) => t.id);
    for (const t of r.tracks) meta[t.id] = { name: t.name, artist: t.artist };
  }
  return { run, meta, degraded };
}
