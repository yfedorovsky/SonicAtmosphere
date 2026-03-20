import { cn } from "@/lib/utils";

interface IconProps {
  name: string;
  filled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
};

export function Icon({ name, filled = false, className, size = "md" }: IconProps) {
  return (
    <span
      className={cn("material-symbols-outlined", sizeMap[size], className)}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
}
