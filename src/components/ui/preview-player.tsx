"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./icon";
import { usePlaybackStore } from "@/stores/playback-store";
import { formatDuration } from "@/lib/track-parser";

export function PreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { currentTrack, isPlaying, progress, pause, resume, stop, setProgress } =
    usePlaybackStore();

  // Sync audio element with store state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack?.preview_url) {
      audio.pause();
      audio.src = "";
      return;
    }

    if (audio.src !== currentTrack.preview_url) {
      audio.src = currentTrack.preview_url;
      audio.load();
    }

    if (isPlaying) {
      audio.play().catch(() => pause());
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying, pause]);

  // Progress tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onTimeUpdate() {
      if (audio!.duration) {
        setProgress(audio!.currentTime / audio!.duration);
      }
    }

    function onEnded() {
      stop();
    }

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [setProgress, stop]);

  if (!currentTrack) return <audio ref={audioRef} />;

  const albumArt = currentTrack.album.images[0]?.url;
  const elapsed = currentTrack.preview_url ? Math.round(progress * 30) * 1000 : 0;

  return (
    <>
      <audio ref={audioRef} />
      <div className="fixed bottom-20 md:bottom-0 right-0 w-full md:w-[calc(100%-6rem)] z-[55] animate-fade-up">
        <div className="mx-4 md:mx-8 mb-4 md:mb-6 bg-surface-container/90 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-3 flex items-center gap-4">
          {/* Album art */}
          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 shadow-md">
            {albumArt ? (
              <img src={albumArt} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
                <Icon name="music_note" size="sm" className="text-on-surface-variant/40" />
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{currentTrack.name}</p>
            <p className="text-xs text-on-surface-variant truncate">
              {currentTrack.artists.map((a) => a.name).join(", ")}
            </p>
          </div>

          {/* Progress bar */}
          <div className="hidden sm:flex items-center gap-3 flex-1 max-w-xs">
            <span className="text-[10px] text-on-surface-variant tabular-nums w-8 text-right">
              {formatDuration(elapsed)}
            </span>
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-on-surface-variant tabular-nums w-8">
              0:30
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (isPlaying ? pause() : resume())}
              className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              <Icon name={isPlaying ? "pause" : "play_arrow"} filled />
            </button>
            <button
              type="button"
              onClick={stop}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/5 transition-all"
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
