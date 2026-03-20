"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useDraftsStore } from "@/stores/drafts-store";

const PLACEHOLDER_PLAYLISTS = [
  { title: "Midnight Neon", subtitle: "Synthwave & Retrowave", color: "from-cyan-500 to-blue-600" },
  { title: "Rainy Day Jazz", subtitle: "Lo-fi & Mellow", color: "from-amber-500 to-orange-600" },
  { title: "Forest Cabin", subtitle: "Acoustic & Indie Folk", color: "from-green-500 to-emerald-700" },
  { title: "Deep Space", subtitle: "Ambient & Electronic", color: "from-purple-500 to-indigo-700" },
];

export function RecentPlaylists() {
  const router = useRouter();
  const { drafts } = useDraftsStore();

  const displayItems = drafts.length > 0
    ? drafts.slice(0, 4).map((d) => ({
        id: d.id,
        title: d.title || "Untitled Draft",
        subtitle: d.prompt || `${d.tracks.length} tracks`,
        coverUrl: d.tracks[0]?.album.images[0]?.url,
      }))
    : PLACEHOLDER_PLAYLISTS.map((p, i) => ({ id: String(i), ...p }));

  return (
    <section className="mt-32 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-12">
        <div>
          <h2 className="font-headline text-3xl font-bold">Jump Back In</h2>
          <p className="text-on-surface-variant mt-2">Your recently generated atmospheres</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/library")}
          className="text-primary font-bold text-sm"
        >
          View All
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-10">
        {displayItems.map((item) => (
          <div
            key={item.id}
            className="group cursor-pointer"
            onClick={() => {
              if (drafts.length > 0) {
                router.push(`/builder/${item.id}`);
              } else {
                router.push("/generator");
              }
            }}
          >
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-surface-container-highest mb-6">
              {"coverUrl" in item && item.coverUrl ? (
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
              ) : (
                <div
                  className={`w-full h-full bg-gradient-to-br ${"color" in item ? item.color : "from-primary to-secondary"} opacity-60 group-hover:opacity-80 transition-opacity`}
                />
              )}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-all" />
              <div className="absolute bottom-4 right-4 translate-y-12 group-hover:translate-y-0 transition-transform duration-300">
                <button
                  type="button"
                  className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-2xl"
                >
                  <Icon name="play_arrow" filled />
                </button>
              </div>
            </div>
            <h5 className="font-headline text-lg font-bold">{item.title}</h5>
            <p className="text-sm text-on-surface-variant">{item.subtitle}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
