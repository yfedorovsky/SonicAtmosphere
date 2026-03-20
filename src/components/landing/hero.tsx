"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";

const EXAMPLE_PROMPTS = [
  "dreamy acoustic melancholy",
  "late night indie folk",
  "cyberpunk high energy techno",
  "songs like José González - Heartbeats",
];

export function Hero() {
  const [prompt, setPrompt] = useState("");
  const router = useRouter();

  function handleGenerate() {
    if (!prompt.trim()) return;
    router.push(`/generator?prompt=${encodeURIComponent(prompt.trim())}`);
  }

  function handleExampleClick(example: string) {
    setPrompt(example);
    router.push(`/generator?prompt=${encodeURIComponent(example)}`);
  }

  return (
    <section className="mt-16 md:mt-24 text-center max-w-4xl mx-auto relative">
      {/* Subtle glow behind the heading */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <p className="animate-fade-up text-xs uppercase tracking-[0.3em] text-primary/70 font-bold mb-6">
        AI-Powered Playlist Curation
      </p>

      <h2 className="animate-fade-up stagger-2 font-headline text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]">
        Create your perfect <br />
        <span className="text-gradient-primary">playlist by vibe</span>
      </h2>

      <p className="animate-fade-up stagger-3 text-on-surface-variant/60 max-w-lg mx-auto text-lg leading-relaxed mb-12">
        Describe a mood, drop a song, or import a playlist — our engine finds the tracks that fit.
      </p>

      {/* Prompt input bar */}
      <div className="animate-fade-up stagger-4 relative max-w-2xl mx-auto">
        <div className="flex items-center gap-4 bg-surface-container/60 backdrop-blur-xl border border-outline-variant/15 p-2 rounded-2xl shadow-2xl focus-within:border-primary/40 focus-within:shadow-primary/10 transition-all duration-300 group">
          <div className="flex-1 flex items-center px-4">
            <Icon name="auto_awesome" className="text-primary mr-3 group-focus-within:scale-110 transition-transform" />
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-on-surface text-lg placeholder:text-on-surface-variant/30 py-3"
              placeholder="Describe your mood..."
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="bg-primary hover:bg-primary-fixed text-on-primary font-bold px-8 py-3 rounded-xl transition-all duration-200 active:scale-95 shadow-lg shadow-primary/20 hover:shadow-primary/30"
          >
            Generate
          </button>
        </div>

        {/* Example prompts */}
        <div className="animate-fade-up stagger-5 flex flex-wrap justify-center gap-3 mt-6">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant/50 self-center mr-2">
            Try:
          </span>
          {EXAMPLE_PROMPTS.map((example, i) => (
            <button
              key={example}
              type="button"
              onClick={() => handleExampleClick(example)}
              className={`px-4 py-1.5 rounded-full bg-surface-container-high/40 border border-outline-variant/10 text-xs text-on-surface-variant hover:text-white hover:bg-surface-container-high hover:border-primary/20 transition-all duration-200 animate-fade-in stagger-${i + 5}`}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
