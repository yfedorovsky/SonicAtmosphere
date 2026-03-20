import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function FeatureBento() {
  return (
    <section className="mt-32 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Main Feature Card — Science of Sound */}
        <div className="md:col-span-8 bg-surface-container-low/40 rounded-2xl p-10 relative overflow-hidden group hover:bg-surface-container-low/60 transition-all border border-outline-variant/5">
          <div className="relative z-10">
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold tracking-widest uppercase mb-6 inline-block">
              AI Refinement
            </span>
            <h3 className="font-headline text-3xl font-bold mb-4">The Science of Sound</h3>
            <p className="text-on-surface-variant max-w-md leading-relaxed">
              Our engine goes beyond genres. Dial in the exact texture of your session with
              precision sonic parameters.
            </p>
            <div className="mt-12 space-y-8 max-w-sm">
              <SliderPreview label="Acousticness" value={82} color="primary" />
              <SliderPreview label="Energy" value={34} color="secondary" />
              <SliderPreview label="Popularity" value={15} color="tertiary" />
            </div>
          </div>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all" />
        </div>

        {/* Secondary Card */}
        <div className="md:col-span-4 space-y-6">
          <div className="bg-surface-container-low/40 rounded-2xl p-8 h-full border border-outline-variant/5 hover:bg-surface-container-low/60 transition-all flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary mb-6">
                <Icon name="auto_videocam" filled />
              </div>
              <h4 className="text-xl font-bold mb-2">Cinematic Visualizer</h4>
              <p className="text-sm text-on-surface-variant">
                Real-time background generation that adapts to the mood of your music.
              </p>
            </div>
            <button
              type="button"
              className="mt-8 text-secondary text-sm font-bold flex items-center gap-2 hover:gap-3 transition-all"
            >
              Learn more <Icon name="arrow_forward" size="sm" />
            </button>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="md:col-span-4 bg-surface-container-low/40 rounded-2xl p-8 border border-outline-variant/5 hover:bg-surface-container-low/60 transition-all">
          <h4 className="text-xl font-bold mb-4">Mood Accents</h4>
          <div className="flex flex-wrap gap-2">
            <span className="px-4 py-1.5 rounded-lg bg-tertiary/10 text-tertiary text-xs font-bold">
              Dreamy
            </span>
            <span className="px-4 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">
              Electronic
            </span>
            <span className="px-4 py-1.5 rounded-lg bg-[#ffd9df]/10 text-[#ffd9df] text-xs font-bold">
              Acoustic
            </span>
            <span className="px-4 py-1.5 rounded-lg bg-secondary/10 text-secondary text-xs font-bold">
              Noir
            </span>
          </div>
        </div>

        <div className="md:col-span-8 bg-gradient-to-br from-primary-container/20 to-surface-container-low/40 rounded-2xl p-8 border border-outline-variant/5 flex items-center justify-between group">
          <div className="max-w-md">
            <h4 className="text-2xl font-bold mb-2">Connect Spotify to Start Curating</h4>
            <p className="text-on-surface-variant text-sm">
              Sync your listening history to get even more personalized vibe recommendations.
            </p>
          </div>
          <Link href="/api/auth/spotify">
            <button
              type="button"
              className="bg-primary text-on-primary h-14 w-14 rounded-full flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform"
            >
              <Icon name="link" />
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function SliderPreview({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "primary" | "secondary" | "tertiary";
}) {
  const colorClasses = {
    primary: "text-primary bg-primary",
    secondary: "text-secondary bg-secondary",
    tertiary: "text-tertiary bg-tertiary",
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-bold uppercase tracking-tighter text-on-surface-variant">
        <span>{label}</span>
        <span className={colorClasses[color].split(" ")[0]}>{value}%</span>
      </div>
      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color].split(" ")[1]} rounded-full`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
