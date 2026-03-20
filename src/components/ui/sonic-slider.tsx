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
      <div className="relative h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div
          className={cn("absolute h-full rounded-full transition-all", colorClasses[color])}
          style={{ width: `${value}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        style={{ position: "relative", marginTop: "-20px", height: "20px" }}
      />
    </div>
  );
}
