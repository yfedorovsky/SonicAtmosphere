"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";

interface BottomBarProps {
  showExport?: boolean;
  onExport?: () => void;
}

export function BottomBar({ showExport = false, onExport }: BottomBarProps) {
  const router = useRouter();
  const { trackCount, totalDuration } = usePlaylistStore();
  const count = trackCount();

  return (
    <footer className="fixed bottom-0 right-0 w-full md:w-[calc(100%-6rem)] h-20 z-50 bg-[#131315]/80 backdrop-blur-3xl border-t border-white/5 flex items-center justify-between px-4 md:px-12 font-headline font-semibold">
      {/* Draft info */}
      <div className="flex items-center gap-3 min-w-0">
        {count > 0 ? (
          <>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon name="queue_music" className="text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-on-surface text-sm font-bold">{count} Tracks</span>
              <span className="text-xs text-primary tabular-nums">
                {totalDuration()}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <Icon name="queue_music" className="text-on-surface-variant/40" />
            </div>
            <div className="flex flex-col">
              <span className="text-on-surface-variant/60 text-sm">No tracks yet</span>
              <span className="text-xs text-on-surface-variant/30">Start generating</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {showExport && count > 0 && (
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-2 px-5 py-2.5 md:px-8 md:py-3 bg-primary text-on-primary rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <Icon name="bolt" filled size="sm" />
            <span className="font-bold tracking-tight text-sm">Export to Spotify</span>
          </button>
        )}
        {!showExport && count > 0 && (
          <button
            type="button"
            onClick={() => {
              const draft = usePlaylistStore.getState().currentDraft;
              router.push(`/builder/${draft.id}`);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm font-bold hover:bg-primary/20 transition-all duration-200"
          >
            <span>View Playlist</span>
            <Icon name="arrow_forward" size="sm" />
          </button>
        )}
      </div>
    </footer>
  );
}
