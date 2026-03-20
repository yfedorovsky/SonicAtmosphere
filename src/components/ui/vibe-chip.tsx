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
    active: "border-primary/20 bg-primary/5 text-primary",
    inactive: "border-white/5 bg-white/5 text-on-surface-variant",
  },
  secondary: {
    active: "border-secondary/20 bg-secondary/5 text-secondary",
    inactive: "border-white/5 bg-white/5 text-on-surface-variant",
  },
  tertiary: {
    active: "border-tertiary/20 bg-tertiary/5 text-tertiary",
    inactive: "border-white/5 bg-white/5 text-on-surface-variant",
  },
  neutral: {
    active: "border-white/10 bg-white/10 text-on-surface",
    inactive: "border-white/5 bg-white/5 text-on-surface-variant",
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
        "px-4 py-1.5 rounded-full border text-xs font-bold transition-all",
        "hover:bg-white/10 active:scale-95",
        active ? colors.active : colors.inactive,
        onClick && "cursor-pointer",
        className
      )}
    >
      {active && color === "primary" && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse mr-2" />
      )}
      {label}
    </button>
  );
}
