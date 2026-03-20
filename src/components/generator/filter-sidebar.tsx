"use client";

import { SonicSlider } from "@/components/ui/sonic-slider";
import { VibeChip } from "@/components/ui/vibe-chip";
import { MOOD_OPTIONS, type FilterValues } from "@/types";

interface FilterSidebarProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
}

export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  function toggleMood(mood: string) {
    const moods = filters.moods.includes(mood)
      ? filters.moods.filter((m) => m !== mood)
      : [...filters.moods, mood];
    onChange({ ...filters, moods });
  }

  return (
    <aside className="w-72 sticky top-28 space-y-10">
      <div>
        <h3 className="font-headline text-xs font-bold tracking-[0.15em] uppercase text-on-surface-variant mb-6">
          Atmospheric Filters
        </h3>
        <div className="space-y-8">
          <SonicSlider
            label="Energy"
            value={filters.energy}
            onChange={(energy) => onChange({ ...filters, energy })}
            color="primary"
          />
          <SonicSlider
            label="Acousticness"
            value={filters.acousticness}
            onChange={(acousticness) => onChange({ ...filters, acousticness })}
            color="secondary"
          />
          <SonicSlider
            label="Popularity"
            value={filters.popularity}
            onChange={(popularity) => onChange({ ...filters, popularity })}
            color="tertiary"
          />
        </div>
      </div>

      <div>
        <h3 className="font-headline text-xs font-bold tracking-[0.15em] uppercase text-on-surface-variant mb-6">
          Mood Palettes
        </h3>
        <div className="flex flex-wrap gap-2">
          {MOOD_OPTIONS.map((mood) => (
            <VibeChip
              key={mood}
              label={mood}
              active={filters.moods.includes(mood)}
              color={
                mood === "Electronic" || mood === "Energetic"
                  ? "primary"
                  : mood === "Nocturnal" || mood === "Lo-fi" || mood === "Cinematic"
                    ? "secondary"
                    : mood === "Acoustic" || mood === "Dreamy"
                      ? "tertiary"
                      : "neutral"
              }
              onClick={() => toggleMood(mood)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
