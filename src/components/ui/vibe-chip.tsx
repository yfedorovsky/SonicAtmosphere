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
    active: "border-primary bg-primary/20 text-primary shadow-[0_0_12px_rgba(var(--md-primary-rgb,0,255,200),0.3)]",
    inactive: "border-white/5 bg-white/5 text-on-surface-variant hover:border-white/15",
  },
  secondary: {
    active: "border-secondary bg-secondary/20 text-secondary shadow-[0_0_12px_rgba(var(--md-secondary-rgb,100,200,255),0.3)]",
    inactive: "border-white/5 bg-white/5 text-on-surface-variant hover:border-white/15",
  },
  tertiary: {
    active: "border-tertiary bg-tertiary/20 text-tertiary shadow-[0_0_12px_rgba(var(--md-tertiary-rgb,255,180,100),0.3)]",
    inactive: "border-white/5 bg-white/5 text-on-surface-variant hover:border-white/15",
  },
  neutral: {
    active: "border-white/40 bg-white/15 text-on-surface",
    inactive: "border-white/5 bg-white/5 text-on-surface-variant hover:border-white/15",
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
      {active && (
        <span className={cn(
          "inline-block w-1.5 h-1.5 rounded-full mr-2",
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
