"use client";

interface PasteInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function PasteInput({ value, onChange }: PasteInputProps) {
  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-widest text-on-surface-variant/70 px-1">
        Paste Track List
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-48 bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5 text-sm focus:ring-0 focus:border-primary/40 focus:outline-none placeholder:text-on-surface-variant/30 resize-none transition-all"
        placeholder={`Paste tracks in "Artist - Title" format, one per line:\n\nRadiohead - Everything In Its Right Place\nJosé González - Heartbeats\nBeach House - Space Song`}
      />
      <p className="text-[10px] text-on-surface-variant/50">
        Supports hyphens (-), en-dashes (&ndash;), and em-dashes (&mdash;) as separators
      </p>
    </div>
  );
}
