import { cn } from "@/lib/utils";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "default" | "modal" | "subtle";
}

export function GlassPanel({
  children,
  className,
  variant = "default",
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-outline-variant/15",
        variant === "default" && "glass-panel shadow-2xl shadow-black/40",
        variant === "modal" && "glass-modal shadow-[0_0_64px_rgba(0,0,0,0.5)]",
        variant === "subtle" && "bg-surface-container/60 glass-effect",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
