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
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">My Collection</p>
            <h2 className="font-headline text-5xl font-extrabold tracking-tight text-on-surface">
              Library
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex items-center gap-2 bg-surface-container hover:bg-surface-container-high px-4 py-2 rounded-full transition-colors"
            >
              <Icon name="sort" size="sm" />
              <span className="text-sm font-medium">Recent</span>
              <Icon name="expand_more" size="sm" />
            </button>
          </div>
        </div>

        {/* Recently Generated */}
        {drafts.length > 0 && (
          <section className="mb-20">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline text-xl font-bold">Recently Generated Moods</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {drafts.slice(0, 4).map((draft) => (
                <MoodCard
                  key={draft.id}
                  title={draft.title || "Untitled"}
                  subtitle={`${draft.tracks.length} tracks`}
                  imageUrl={draft.tracks[0]?.album.images[0]?.url}
                  tag={draft.filters?.moods[0]}
                  tagColor="primary"
                  onClick={() => handleLoadDraft(draft)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Grid: Drafts + Exported */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
          {/* Saved Drafts */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-headline text-2xl font-bold">Saved Drafts</h3>
              <span className="text-xs bg-surface-container-highest px-2 py-1 rounded-md text-on-surface-variant">
                {savedDrafts.length} Items
              </span>
            </div>
            <div className="space-y-6">
              {savedDrafts.map((draft) => (
                <DraftItem
                  key={draft.id}
                  draft={draft}
                  onClick={() => handleLoadDraft(draft)}
                  onDelete={() => deleteDraft(draft.id)}
                />
              ))}

              {/* New draft CTA */}
              <div
                onClick={() => {
                  initDraft();
                  router.push("/generator");
                }}
                className="border-2 border-dashed border-outline-variant/30 rounded-xl p-6 flex flex-col items-center justify-center text-center group hover:border-primary/50 transition-colors cursor-pointer"
              >
                <Icon
                  name="add_circle"
                  className="text-outline-variant group-hover:text-primary mb-2"
                />
                <p className="text-sm font-semibold text-on-surface-variant group-hover:text-on-surface">
                  New Draft
                </p>
              </div>
            </div>
          </div>

          {/* Exported Playlists */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-headline text-2xl font-bold">Exported Playlists</h3>
            </div>
            {exportedDrafts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {exportedDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="bg-surface-container rounded-2xl p-6 group cursor-pointer hover:bg-surface-container-high transition-all"
                    onClick={() => {
                      if (draft.exportedUrl) window.open(draft.exportedUrl, "_blank");
                    }}
                  >
                    {/* Collage of album arts */}
                    <div className="grid grid-cols-2 gap-1 mb-6 rounded-xl overflow-hidden aspect-video">
                      {draft.tracks.slice(0, 4).map((track, i) => (
                        <div key={i} className="overflow-hidden">
                          {track.album.images[0]?.url ? (
                            <img
                              src={track.album.images[0].url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-surface-container-high" />
                          )}
                        </div>
                      ))}
                    </div>
                    <h4 className="font-bold text-lg mb-1">{draft.title || "Untitled"}</h4>
                    <p className="text-sm text-on-surface-variant">
                      {draft.tracks.length} tracks &middot; Exported
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <Icon name="cloud_upload" className="text-on-surface-variant/20 mb-4" size="xl" />
                <p className="text-on-surface-variant/60">
                  No exported playlists yet. Create and export your first playlist!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Empty state when no drafts at all */}
        {drafts.length === 0 && (
          <div className="text-center py-20">
            <Icon name="library_music" className="text-on-surface-variant/20 mb-6" size="xl" />
            <h3 className="font-headline text-2xl font-bold text-on-surface-variant/60 mb-4">
              Your Library is Empty
            </h3>
            <p className="text-on-surface-variant/40 mb-8 max-w-md mx-auto">
              Start by generating a playlist from a vibe prompt, or import your existing track list.
            </p>
            <button
              type="button"
              onClick={() => router.push("/generator")}
              className="px-8 py-3 bg-primary text-on-primary rounded-full font-bold active:scale-95 transition-transform"
            >
              Start Generating
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
