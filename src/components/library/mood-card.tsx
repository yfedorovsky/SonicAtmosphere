"use client";

import { Icon } from "@/components/ui/icon";

interface MoodCardProps {
  title: string;
  subtitle: string;
  tag?: string;
  tagColor?: "primary" | "secondary" | "tertiary" | "neutral";
  imageUrl?: string;
  onClick?: () => void;
}

const tagColors = {
  primary: "bg-primary/20 text-primary",
  secondary: "bg-secondary/20 text-secondary",
  tertiary: "bg-tertiary/20 text-tertiary",
  neutral: "bg-outline-variant/40 text-on-surface",
};

export function MoodCard({
  title,
  subtitle,
  tag,
  tagColor = "primary",
  imageUrl,
  onClick,
}: MoodCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl bg-surface-container p-4 transition-all duration-500 hover:bg-surface-container-high shadow-2xl cursor-pointer"
    >
      <div className="aspect-square mb-4 rounded-xl overflow-hidden relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            type="button"
            className="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform"
          >
            <Icon name="play_arrow" filled size="xl" />
          </button>
        </div>
      </div>

      {tag && (
        <span
          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tagColors[tagColor]} mb-2`}
        >
          {tag}
        </span>
      )}
      <h4 className="font-bold text-lg leading-tight mb-1">{title}</h4>
      <p className="text-on-surface-variant text-sm">{subtitle}</p>

      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-primary/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
