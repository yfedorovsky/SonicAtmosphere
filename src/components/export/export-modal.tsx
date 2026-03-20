"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { usePlaylistStore } from "@/stores/playlist-store";
import { useAuthStore } from "@/stores/auth-store";
import { useDraftsStore } from "@/stores/drafts-store";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

export function ExportModal({ open, onClose }: ExportModalProps) {
  const { currentDraft, setDescription } = usePlaylistStore();
  const { isConnected, user } = useAuthStore();
  const { saveDraft } = useDraftsStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const coverUrl = currentDraft.coverUrl || currentDraft.tracks[0]?.album.images[0]?.url;
  const moods = currentDraft.filters?.moods || [];

  async function handleExport() {
    if (!isConnected) return;
    if (currentDraft.tracks.length === 0) return;

    setIsExporting(true);
    setError(null);

    try {
      const res = await fetch("/api/spotify/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentDraft.title || "Sonic Atmosphere Playlist",
          description: currentDraft.description,
          trackUris: currentDraft.tracks.map((t) => t.uri),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setExportedUrl(data.url);
        saveDraft({ ...currentDraft, exportedUrl: data.url });
      } else {
        const data = await res.json();
        setError(data.error || "Export failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-background/50 backdrop-blur-md animate-fade-in">
      <div className="glass-modal w-full max-w-2xl rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative border border-outline-variant/15 animate-scale-in">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-on-surface-variant hover:text-white transition-colors duration-200 p-2 rounded-full hover:bg-white/5 z-10"
        >
          <Icon name="close" />
        </button>

        {/* Header */}
        <div className="p-8 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <Icon name="auto_awesome" filled className="text-primary" />
            <span className="text-xs uppercase tracking-[0.1em] text-primary font-semibold">
              Ready for Export
            </span>
          </div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-white">
            Sync with Spotify
          </h1>
        </div>

        <div className="px-8 py-2 space-y-6 flex-grow overflow-y-auto max-h-[60vh] custom-scrollbar">
          {exportedUrl ? (
            /* Success state */
            <div className="text-center py-8 animate-scale-in">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Icon name="check_circle" filled className="text-primary text-5xl" />
              </div>
              <h2 className="font-headline text-2xl font-bold mb-2">Playlist Created!</h2>
              <p className="text-on-surface-variant mb-8">
                Your playlist has been exported to Spotify.
              </p>
              <a
                href={exportedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3 bg-[#1DB954] text-white rounded-full font-bold hover:opacity-90 transition-opacity"
              >
                Open in Spotify
                <Icon name="open_in_new" size="sm" />
              </a>
            </div>
          ) : (
            <>
              {/* Playlist preview */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="md:col-span-2 relative group">
                  <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt="Playlist Art"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                        <Icon name="library_music" className="text-on-surface-variant/20" size="xl" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="md:col-span-3 flex flex-col justify-center space-y-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 mb-1.5 block font-bold">
                      Playlist Name
                    </label>
                    <p className="font-headline text-2xl font-bold text-white tracking-tight">
                      {currentDraft.title || "Untitled Playlist"}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 mb-1.5 block font-bold">
                      Tracks
                    </label>
                    <p className="text-sm text-on-surface-variant">
                      {currentDraft.tracks.length} tracks
                    </p>
                  </div>
                  {moods.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {moods.map((mood) => (
                        <span
                          key={mood}
                          className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full border border-primary/20"
                        >
                          {mood}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label
                  className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 block font-bold"
                  htmlFor="export-description"
                >
                  Description (Optional)
                </label>
                <textarea
                  id="export-description"
                  value={currentDraft.description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-surface-container-lowest/50 border-none ring-1 ring-outline-variant/20 focus:ring-primary/50 rounded-xl text-on-surface placeholder:text-outline/40 p-4 transition-all duration-200 resize-none focus:outline-none text-sm"
                  placeholder="Deep atmospheric textures curated via Sonic Atmosphere..."
                  rows={2}
                />
              </div>

              {/* Permissions */}
              <div className="bg-surface-container-low/40 rounded-xl p-5 border border-outline-variant/10">
                <div className="flex gap-4">
                  <Icon name="security" className="text-secondary shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <h3 className="font-headline text-sm font-bold text-white">
                      Permissions & Privacy
                    </h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      <span className="text-white font-medium">Sonic Atmosphere</span> will
                      create a new playlist in your Spotify library. We only add tracks — we never
                      delete or modify your existing content.
                    </p>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-error-container/20 text-error rounded-xl p-4 text-sm flex items-center gap-3 animate-fade-in">
                  <Icon name="error" size="sm" />
                  {error}
                </div>
              )}

              {/* Not connected warning */}
              {!isConnected && (
                <div className="bg-surface-container-low/50 rounded-xl p-6 text-center animate-fade-in">
                  <p className="text-on-surface-variant mb-4">
                    Connect your Spotify account to export playlists.
                  </p>
                  <a
                    href="/api/auth/spotify"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-full font-bold"
                  >
                    <Icon name="link" size="sm" />
                    Connect Spotify
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!exportedUrl && isConnected && (
          <div className="p-8 pt-4">
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || currentDraft.tracks.length === 0}
              className="w-full py-4 bg-primary text-on-primary font-headline text-lg font-extrabold rounded-full flex items-center justify-center gap-3 glow-shadow-strong hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group disabled:opacity-50 disabled:hover:scale-100"
            >
              {isExporting ? (
                <>
                  <Icon name="progress_activity" className="animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <span>Confirm & Export</span>
                  <Icon
                    name="arrow_forward"
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </>
              )}
            </button>
            {user && (
              <p className="text-center mt-4 text-[10px] text-on-surface-variant/60 uppercase tracking-widest">
                Connected as <span className="text-white">@{user.display_name}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
