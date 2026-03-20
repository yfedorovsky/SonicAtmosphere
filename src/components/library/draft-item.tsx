"use client";

import { Icon } from "@/components/ui/icon";
import type { PlaylistDraft } from "@/types";

interface DraftItemProps {
  draft: PlaylistDraft;
  onClick: () => void;
  onDelete?: () => void;
}

export function DraftItem({ draft, onClick, onDelete }: DraftItemProps) {
  const coverUrl = draft.tracks[0]?.album.images[0]?.url;
  const date = new Date(draft.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="flex items-center gap-4 group cursor-pointer"
      onClick={onClick}
    >
      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-surface-container-high relative">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={draft.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
            <Icon name="music_note" className="text-on-surface-variant/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <h5 className="font-bold text-on-surface group-hover:text-primary transition-colors truncate">
          {draft.title || "Untitled Draft"}
        </h5>
        <p className="text-xs text-on-surface-variant mt-1">
          Edited {date} &middot; {draft.tracks.length} Tracks
        </p>
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all"
        >
          <Icon name="delete" size="sm" />
        </button>
      )}
    </div>
  );
}
