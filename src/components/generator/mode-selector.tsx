"use client";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import type { GeneratorMode } from "@/types";

interface ModeSelectorProps {
  mode: GeneratorMode;
  onChange: (mode: GeneratorMode) => void;
}

const modes: { value: GeneratorMode; label: string; icon: string }[] = [
  { value: "vibe", label: "Vibe", icon: "auto_awesome" },
  { value: "song", label: "Song", icon: "music_note" },
  { value: "artist", label: "Artist", icon: "person" },
  { value: "genre", label: "Genre", icon: "category" },
  { value: "import", label: "Import", icon: "upload_file" },
];

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          className={cn(
            "px-5 py-2 rounded-full text-sm font-semibold tracking-tight transition-all duration-200 active:scale-95 flex items-center gap-2",
            mode === m.value
              ? "bg-primary text-on-primary font-bold shadow-lg shadow-primary/20"
              : "bg-white/5 text-on-surface-variant hover:text-white hover:bg-white/10"
          )}
        >
          <Icon name={m.icon} size="sm" />
          {m.label}
        </button>
      ))}
    </div>
  );
}
