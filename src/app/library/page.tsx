"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { MoodCard } from "@/components/library/mood-card";
import { DraftItem } from "@/components/library/draft-item";
import { Icon } from "@/components/ui/icon";
import { useDraftsStore } from "@/stores/drafts-store";
import { usePlaylistStore } from "@/stores/playlist-store";

export default function LibraryPage() {
  const router = useRouter();
  const { drafts, deleteDraft } = useDraftsStore();
  const { loadDraft, initDraft } = usePlaylistStore();

  const exportedDrafts = drafts.filter((d) => d.exportedUrl);
  const savedDrafts = drafts.filter((d) => !d.exportedUrl);

  function handleLoadDraft(draft: typeof drafts[0]) {
    loadDraft(draft);
    router.push(`/builder/${draft.id}`);
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto py-10 relative z-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-12 animate-fade-up">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">My Collection</p>
            <h2 className="font-headline text-5xl font-extrabold tracking-tight text-on-surface">
              Library
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex items-center gap-2 bg-surface-container hover:bg-surface-container-high px-4 py-2 rounded-full transition-colors duration-200"
            >
              <Icon name="sort" size="sm" />
              <span className="text-sm font-medium">Recent</span>
              <Icon name="expand_more" size="sm" />
            </button>
          </div>
        </div>

        {/* Recently Generated */}
        {drafts.length > 0 && (
          <section className="mb-20 animate-fade-up stagger-2">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-headline text-xl font-bold flex items-center gap-3">
                <span className="w-1 h-5 rounded-full bg-primary" />
                Recently Generated Moods
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {drafts.slice(0, 4).map((draft, i) => (
                <div key={draft.id} className="animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                  <MoodCard
                    title={draft.title || "Untitled"}
                    subtitle={`${draft.tracks.length} tracks`}
                    imageUrl={draft.tracks[0]?.album.images[0]?.url}
                    tag={draft.filters?.moods[0]}
                    tagColor="primary"
                    onClick={() => handleLoadDraft(draft)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Grid: Drafts + Exported */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16 animate-fade-up stagger-4">
          {/* Saved Drafts */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-headline text-2xl font-bold">Saved Drafts</h3>
              <span className="text-xs bg-surface-container-highest/60 px-3 py-1 rounded-full text-on-surface-variant font-bold">
                {savedDrafts.length}
              </span>
            </div>
            <div className="space-y-4">
              {savedDrafts.map((draft, i) => (
                <div key={draft.id} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                  <DraftItem
                    draft={draft}
                    onClick={() => handleLoadDraft(draft)}
                    onDelete={() => deleteDraft(draft.id)}
                  />
                </div>
              ))}

              {/* New draft CTA */}
              <div
                onClick={() => {
                  initDraft();
                  router.push("/generator");
                }}
                className="border-2 border-dashed border-outline-variant/20 rounded-xl p-6 flex flex-col items-center justify-center text-center group hover:border-primary/40 transition-all duration-300 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-surface-container-high/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-200 mb-2">
                  <Icon
                    name="add"
                    className="text-outline-variant group-hover:text-primary transition-colors duration-200"
                  />
                </div>
                <p className="text-sm font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors duration-200">
                  New Draft
                </p>
              </div>
            </div>
          </div>

          {/* Exported Playlists */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-headline text-2xl font-bold">Exported Playlists</h3>
              {exportedDrafts.length > 0 && (
                <span className="text-xs bg-[#1DB954]/10 text-[#1DB954] px-3 py-1 rounded-full font-bold">
                  {exportedDrafts.length} on Spotify
                </span>
              )}
            </div>
            {exportedDrafts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {exportedDrafts.map((draft, i) => (
                  <div
                    key={draft.id}
                    className="bg-surface-container/60 rounded-2xl p-5 group cursor-pointer hover:bg-surface-container-high/60 transition-all duration-300 border border-transparent hover:border-white/5 animate-fade-up"
                    style={{ animationDelay: `${i * 80}ms` }}
                    onClick={() => {
                      if (draft.exportedUrl) window.open(draft.exportedUrl, "_blank");
                    }}
                  >
                    {/* Collage of album arts */}
                    <div className="grid grid-cols-2 gap-1 mb-5 rounded-xl overflow-hidden aspect-video shadow-lg shadow-black/30">
                      {draft.tracks.slice(0, 4).map((track, j) => (
                        <div key={j} className="overflow-hidden">
                          {track.album.images[0]?.url ? (
                            <img
                              src={track.album.images[0].url}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full bg-surface-container-high" />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors duration-200">{draft.title || "Untitled"}</h4>
                        <p className="text-sm text-on-surface-variant">
                          {draft.tracks.length} tracks
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-[#1DB954]/10 flex items-center justify-center shrink-0">
                        <Icon name="open_in_new" size="sm" className="text-[#1DB954]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-surface-container/20 rounded-2xl border border-dashed border-outline-variant/15">
                <div className="w-16 h-16 rounded-2xl bg-surface-container-high/30 flex items-center justify-center mx-auto mb-4">
                  <Icon name="cloud_upload" className="text-on-surface-variant/30" size="xl" />
                </div>
                <p className="text-on-surface-variant/60 text-sm">
                  No exported playlists yet. Create and export your first playlist!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Empty state when no drafts at all */}
        {drafts.length === 0 && (
          <div className="text-center py-20 animate-fade-in">
            <div className="w-20 h-20 rounded-2xl bg-surface-container-high/30 flex items-center justify-center mx-auto mb-6">
              <Icon name="library_music" className="text-on-surface-variant/20" size="xl" />
            </div>
            <h3 className="font-headline text-2xl font-bold text-on-surface-variant/60 mb-4">
              Your Library is Empty
            </h3>
            <p className="text-on-surface-variant/40 mb-8 max-w-md mx-auto">
              Start by generating a playlist from a vibe prompt, or import your existing track list.
            </p>
            <button
              type="button"
              onClick={() => router.push("/generator")}
              className="px-8 py-3 bg-primary text-on-primary rounded-full font-bold active:scale-95 hover:shadow-lg hover:shadow-primary/20 transition-all duration-200 inline-flex items-center gap-2"
            >
              <Icon name="auto_awesome" size="sm" />
              Start Generating
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
