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
    <footer className="fixed bottom-0 right-0 w-full md:w-[calc(100%-16rem)] h-24 z-50 bg-[#131315]/80 backdrop-blur-3xl flex items-center justify-between px-6 md:px-12 font-headline font-semibold shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
      {/* Draft info */}
      <div className="flex items-center gap-4 min-w-[200px]">
        {count > 0 ? (
          <>
            <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center">
              <Icon name="queue_music" className="text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-on-surface text-sm">{count} Tracks</span>
              <span className="text-xs text-primary">
                Total Duration: {totalDuration()}
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col">
            <span className="text-on-surface-variant text-sm">No tracks yet</span>
            <span className="text-xs text-on-surface-variant/60">Start generating</span>
          </div>
        )}
      </div>

      {/* Center nav */}
      <div className="hidden md:flex items-center gap-8">
        <button
          type="button"
          onClick={() => router.push("/generator")}
          className="flex flex-col items-center gap-1 text-on-surface-variant opacity-60 hover:opacity-100 transition-all hover:scale-105"
        >
          <Icon name="auto_awesome" />
          <span className="text-[10px] uppercase tracking-widest">Generate</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/library")}
          className="flex flex-col items-center gap-1 text-on-surface-variant opacity-60 hover:opacity-100 transition-all hover:scale-105"
        >
          <Icon name="library_music" />
          <span className="text-[10px] uppercase tracking-widest">Library</span>
        </button>
      </div>

      {/* Export button */}
      <div className="flex items-center gap-4">
        {showExport && count > 0 && (
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-3 px-8 py-3 bg-primary text-on-primary rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <Icon name="bolt" filled />
            <span className="font-bold tracking-tight">Export to Spotify</span>
          </button>
        )}
        {!showExport && count > 0 && (
          <button
            type="button"
            onClick={() => {
              const draft = usePlaylistStore.getState().currentDraft;
              router.push(`/builder/${draft.id}`);
            }}
            className="flex items-center gap-2 px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm font-bold hover:bg-primary/20 transition-all"
          >
            <span>View Playlist</span>
            <Icon name="arrow_forward" size="sm" />
          </button>
        )}
      </div>
    </footer>
  );
}
