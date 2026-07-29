"use client";

import { cn } from "@/lib/utils";

interface SonicSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  color?: "primary" | "secondary" | "tertiary";
  className?: string;
}

const colorClasses = {
  primary: "bg-primary shadow-[0_0_12px_rgba(0,223,193,0.5)]",
  secondary: "bg-secondary shadow-[0_0_12px_rgba(205,189,255,0.5)]",
  tertiary: "bg-tertiary shadow-[0_0_12px_rgba(255,177,193,0.5)]",
};

const textColorClasses = {
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
};

export function SonicSlider({
  label,
  value,
  onChange,
  color = "primary",
  className,
}: SonicSliderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex justify-between items-end">
        <label className="text-sm font-semibold text-on-surface">{label}</label>
        <span className={cn("text-xs font-bold font-headline", textColorClasses[color])}>
          {value}%
        </span>
      </div>
      {/* The native range input fills a tall-enough hit area directly over the
          styled track — no offset hacks, so pointer and touch input always land. */}
      <div className="relative h-6 flex items-center">
        <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-[width] duration-75", colorClasses[color])}
            style={{ width: `${value}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
