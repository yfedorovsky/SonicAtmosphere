"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";

export function AddTrackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push("/generator")}
      className="group flex items-center gap-4 px-6 py-3 rounded-xl border border-dashed border-outline-variant/20 hover:border-primary/40 transition-all duration-300 w-full text-on-surface-variant hover:text-primary"
    >
      <span className="bg-surface-container-high/50 p-2 rounded-full group-hover:bg-primary group-hover:text-on-primary transition-all duration-200">
        <Icon name="add" />
      </span>
      <span className="font-bold text-sm">Add a song or vibe suggestion...</span>
    </button>
  );
}
