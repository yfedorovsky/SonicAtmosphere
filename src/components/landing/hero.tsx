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
      <h2 className="font-headline text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]">
        Create your perfect <br />
        <span className="text-gradient-primary">playlist by vibe</span>
      </h2>

      {/* Prompt input bar */}
      <div className="relative max-w-2xl mx-auto mt-12">
        <div className="flex items-center gap-4 bg-surface-container/60 backdrop-blur-xl border border-outline-variant/15 p-2 rounded-2xl shadow-2xl focus-within:border-primary/40 transition-all group">
          <div className="flex-1 flex items-center px-4">
            <Icon name="auto_awesome" className="text-primary mr-3" />
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
            className="bg-primary hover:bg-primary-fixed text-on-primary font-bold px-8 py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            Generate
          </button>
        </div>

        {/* Example prompts */}
        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant/50 self-center mr-2">
            Try:
          </span>
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => handleExampleClick(example)}
              className="px-4 py-1.5 rounded-full bg-surface-container-high/40 border border-outline-variant/10 text-xs text-on-surface-variant hover:text-white hover:bg-surface-container-high transition-all"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
