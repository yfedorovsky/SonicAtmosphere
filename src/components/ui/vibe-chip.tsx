import { cn } from "@/lib/utils";

interface VibeChipProps {
  label: string;
  active?: boolean;
  color?: "primary" | "secondary" | "tertiary" | "neutral";
  onClick?: () => void;
  className?: string;
}

const colorMap = {
  primary: {
    active: "border-primary bg-primary/25 text-primary ring-1 ring-primary/40 shadow-[0_0_16px_rgba(0,223,193,0.25)]",
    inactive: "border-white/8 bg-white/5 text-on-surface-variant/70 hover:border-primary/30 hover:text-primary/80 hover:bg-primary/5",
  },
  secondary: {
    active: "border-secondary bg-secondary/25 text-secondary ring-1 ring-secondary/40 shadow-[0_0_16px_rgba(205,189,255,0.25)]",
    inactive: "border-white/8 bg-white/5 text-on-surface-variant/70 hover:border-secondary/30 hover:text-secondary/80 hover:bg-secondary/5",
  },
  tertiary: {
    active: "border-tertiary bg-tertiary/25 text-tertiary ring-1 ring-tertiary/40 shadow-[0_0_16px_rgba(255,177,193,0.25)]",
    inactive: "border-white/8 bg-white/5 text-on-surface-variant/70 hover:border-tertiary/30 hover:text-tertiary/80 hover:bg-tertiary/5",
  },
  neutral: {
    active: "border-white/40 bg-white/20 text-on-surface ring-1 ring-white/20",
    inactive: "border-white/8 bg-white/5 text-on-surface-variant/70 hover:border-white/20 hover:bg-white/10",
  },
};

export function VibeChip({
  label,
  active = false,
  color = "primary",
  onClick,
  className,
}: VibeChipProps) {
  const colors = colorMap[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all duration-200",
        "active:scale-95",
        active ? colors.active : colors.inactive,
        onClick && "cursor-pointer",
        className
      )}
    >
      {active && (
        <span className={cn(
          "inline-block w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse",
          color === "primary" && "bg-primary",
          color === "secondary" && "bg-secondary",
          color === "tertiary" && "bg-tertiary",
          color === "neutral" && "bg-white",
        )} />
      )}
      {label}
    </button>
  );
}
