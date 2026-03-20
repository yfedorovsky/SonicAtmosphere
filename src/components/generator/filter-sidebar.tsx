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

  const activeCount = activeMoods.length;

  return (
    <aside className="w-72 sticky top-24 space-y-8">
      {/* Sonic DNA */}
      <div className="bg-surface-container/30 rounded-2xl p-6 border border-white/5">
        <h3 className="font-headline text-sm font-bold mb-5 text-on-surface flex items-center gap-2 uppercase tracking-wider">
          <Icon name="tune" className="text-primary" size="sm" />
          Sonic DNA
        </h3>
        <div className="space-y-6">
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
            className="flex items-center gap-1.5 text-xs text-on-surface-variant/60 hover:text-primary transition-colors"
          >
            <Icon name={showAllSliders ? "expand_less" : "expand_more"} size="sm" />
            {showAllSliders ? "Show less" : "More parameters"}
          </button>
        </div>
      </div>

      {/* Vibe Anchors */}
      <div className="bg-surface-container/30 rounded-2xl p-6 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline text-sm font-bold text-on-surface uppercase tracking-wider">
            Vibe Anchors
          </h3>
          {activeCount > 0 && (
            <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-bold tabular-nums">
              {activeCount} active
            </span>
          )}
        </div>

        {/* Suggested (context-aware) anchors */}
        {suggestedMoods.length > 0 && (
          <div className="mb-4">
            <span className="text-[10px] text-secondary font-bold uppercase tracking-wider mb-2 block flex items-center gap-1">
              <Icon name="auto_awesome" size="sm" className="text-secondary" />
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
            <span className="text-[10px] text-tertiary font-bold uppercase tracking-wider mb-2 block">
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
            className="flex-1 bg-surface-container-highest/30 border border-outline-variant/15 rounded-full px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:bg-surface-container-highest/50 transition-all"
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
