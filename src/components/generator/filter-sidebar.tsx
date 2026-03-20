"use client";

import { SonicSlider } from "@/components/ui/sonic-slider";
import { VibeChip } from "@/components/ui/vibe-chip";
import { Icon } from "@/components/ui/icon";
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
    <aside className="w-72 sticky top-24 space-y-10">
      <div>
        <h3 className="font-headline text-lg font-bold mb-6 text-on-surface flex items-center gap-2">
          <Icon name="tune" className="text-primary" />
          Sonic DNA
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
        <h3 className="font-headline text-lg font-bold mb-6 text-on-surface">
          Vibe Anchors
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
