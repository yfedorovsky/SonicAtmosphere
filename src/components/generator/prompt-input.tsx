"use client";

import { Icon } from "@/components/ui/icon";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  placeholder?: string;
  isLoading?: boolean;
}

export function PromptInput({
  value,
  onChange,
  onGenerate,
  placeholder = "e.g., 'A late night drive through a neon-lit city with melancholic synths and a steady bassline'",
  isLoading = false,
}: PromptInputProps) {
  return (
    <div className="bg-surface-container/60 glass-effect p-8 rounded-xl shadow-2xl shadow-black/40">
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onGenerate();
            }
          }}
          className="w-full bg-surface-container-lowest/50 border border-white/5 rounded-xl p-6 text-lg placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary/40 focus:border-primary/40 focus:outline-none transition-all resize-none"
          placeholder={placeholder}
          rows={2}
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={isLoading || !value.trim()}
          className="absolute bottom-4 right-4 bg-primary text-on-primary p-3 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Icon name="hourglass_empty" className="animate-spin" />
          ) : (
            <Icon name="auto_awesome" />
          )}
        </button>
      </div>
    </div>
  );
}
