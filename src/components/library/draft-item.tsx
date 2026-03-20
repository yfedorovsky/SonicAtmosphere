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
      className="flex items-center gap-4 group cursor-pointer p-2 -mx-2 rounded-xl hover:bg-white/5 transition-colors duration-200"
      onClick={onClick}
    >
      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-high relative shadow-sm shadow-black/20">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={draft.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
            <Icon name="music_note" className="text-on-surface-variant/30" size="sm" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h5 className="font-bold text-on-surface group-hover:text-primary transition-colors duration-200 truncate text-sm">
          {draft.title || "Untitled Draft"}
        </h5>
        <p className="text-xs text-on-surface-variant/60 mt-0.5">
          {date} &middot; {draft.tracks.length} tracks
        </p>
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant/40 hover:text-error hover:bg-error/10 transition-all duration-200"
        >
          <Icon name="delete" size="sm" />
        </button>
      )}
    </div>
  );
}
