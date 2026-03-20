"use client";

import { cn } from "@/lib/utils";
import type { GeneratorMode } from "@/types";

interface ModeSelectorProps {
  mode: GeneratorMode;
  onChange: (mode: GeneratorMode) => void;
}

const modes: { value: GeneratorMode; label: string }[] = [
  { value: "vibe", label: "Vibe" },
  { value: "song", label: "Song" },
  { value: "artist", label: "Artist" },
  { value: "genre", label: "Genre" },
  { value: "import", label: "Import" },
];

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {modes.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          className={cn(
            "px-6 py-2 rounded-full text-sm font-semibold tracking-tight transition-all active:scale-95",
            mode === m.value
              ? "bg-primary text-on-primary font-bold"
              : "bg-white/5 text-on-surface-variant hover:text-white"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
