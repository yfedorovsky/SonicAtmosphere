import type { ParsedTrackLine } from "@/types";

const SEPARATORS = /\s*[-–—]\s*/;

export function parseTrackList(input: string): ParsedTrackLine[] {
  const lines = input.split(/\r?\n/);
  const results: ParsedTrackLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    // Try to split by separator (hyphen, en-dash, em-dash)
    const parts = raw.split(SEPARATORS);

    if (parts.length >= 2) {
      const artist = parts[0].trim();
      const title = parts.slice(1).join(" - ").trim();
      if (artist && title) {
        results.push({ raw, artist, title, lineNumber: i + 1 });
        continue;
      }
    }

    // Best-effort: treat entire line as title with empty artist
    results.push({ raw, artist: "", title: raw, lineNumber: i + 1 });
  }

  return results;
}

export function parseTrackFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        resolve(text);
      } else {
        reject(new Error("Could not read file as text"));
      }
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsText(file);
  });
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTotalDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
