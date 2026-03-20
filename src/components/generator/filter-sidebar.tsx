"use client";

import { useState } from "react";
import { SonicSlider } from "@/components/ui/sonic-slider";
import { VibeChip } from "@/components/ui/vibe-chip";
import { Icon } from "@/components/ui/icon";
import { MOOD_OPTIONS, type FilterValues } from "@/types";

interface FilterSidebarProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  suggestedMoods?: string[];
}

export function FilterSidebar({ filters, onChange, suggestedMoods = [] }: FilterSidebarProps) {
  const [customInput, setCustomInput] = useState("");
  const [showAllSliders, setShowAllSliders] = useState(false);

  function toggleMood(mood: string) {
    const moods = filters.moods.includes(mood)
      ? filters.moods.filter((m) => m !== mood)
      : [...filters.moods, mood];
    onChange({ ...filters, moods });
  }

  function addCustomMood() {
    const tag = customInput.trim();
    if (!tag || filters.moods.includes(tag)) return;
    onChange({ ...filters, moods: [...filters.moods, tag] });
    setCustomInput("");
  }

  // Separate suggested (context-aware) from the rest
  const suggestedSet = new Set(suggestedMoods);
  const activeMoods = filters.moods;
  const customMoods = activeMoods.filter(
    (m) => !MOOD_OPTIONS.includes(m as typeof MOOD_OPTIONS[number]) && !suggestedSet.has(m)
  );

  // Show suggested first, then remaining preset options
  const presetOptions = MOOD_OPTIONS.filter((m) => !suggestedSet.has(m));

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

          {showAllSliders && (
            <>
              <SonicSlider
                label="Danceability"
                value={filters.danceability}
                onChange={(danceability) => onChange({ ...filters, danceability })}
                color="primary"
              />
              <SonicSlider
                label="Happiness"
                value={filters.valence}
                onChange={(valence) => onChange({ ...filters, valence })}
                color="secondary"
              />
              <SonicSlider
                label="Instrumental"
                value={filters.instrumentalness}
                onChange={(instrumentalness) => onChange({ ...filters, instrumentalness })}
                color="tertiary"
              />
            </>
          )}

          <button
            type="button"
            onClick={() => setShowAllSliders(!showAllSliders)}
            className="flex items-center gap-1.5 text-xs text-on-surface-variant/70 hover:text-on-surface transition-colors"
          >
            <Icon name={showAllSliders ? "expand_less" : "expand_more"} size="sm" />
            {showAllSliders ? "Show less" : "More parameters"}
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-headline text-lg font-bold mb-4 text-on-surface">
          Vibe Anchors
        </h3>

        {/* Suggested (context-aware) anchors */}
        {suggestedMoods.length > 0 && (
          <div className="mb-4">
            <span className="text-xs text-secondary font-semibold uppercase tracking-wider mb-2 block">
              Suggested
            </span>
            <div className="flex flex-wrap gap-2">
              {suggestedMoods.map((mood) => (
                <VibeChip
                  key={mood}
                  label={mood}
                  active={activeMoods.includes(mood)}
                  color="primary"
                  onClick={() => toggleMood(mood)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Custom tags */}
        {customMoods.length > 0 && (
          <div className="mb-4">
            <span className="text-xs text-tertiary font-semibold uppercase tracking-wider mb-2 block">
              Custom
            </span>
            <div className="flex flex-wrap gap-2">
              {customMoods.map((mood) => (
                <VibeChip
                  key={mood}
                  label={mood}
                  active
                  color="tertiary"
                  onClick={() => toggleMood(mood)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Add custom tag input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomMood();
              }
            }}
            placeholder="Add custom vibe..."
            className="flex-1 bg-surface-container/50 border border-outline-variant/20 rounded-full px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50"
          />
          <button
            type="button"
            onClick={addCustomMood}
            disabled={!customInput.trim()}
            className="p-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-30"
          >
            <Icon name="add" size="sm" />
          </button>
        </div>

        {/* Preset anchors */}
        <div className="flex flex-wrap gap-2">
          {presetOptions.map((mood) => (
            <VibeChip
              key={mood}
              label={mood}
              active={activeMoods.includes(mood)}
              color={
                mood === "Electronic" || mood === "Energetic" || mood === "Workout" || mood === "Party"
                  ? "primary"
                  : mood === "Nocturnal" || mood === "Lo-fi" || mood === "Cinematic" || mood === "Study" || mood === "Dark"
                    ? "secondary"
                    : mood === "Acoustic" || mood === "Dreamy" || mood === "Folk" || mood === "Coffee"
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
