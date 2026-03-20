"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { PasteInput } from "./paste-input";
import { FileUpload } from "./file-upload";
import { ParsedTrackReview } from "./parsed-track-review";
import { parseTrackList, parseTrackFile } from "@/lib/track-parser";
import type { ParsedTrackLine } from "@/types";
import { cn } from "@/lib/utils";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
}

type ImportTab = "paste" | "file";

export function ImportModal({ open, onClose }: ImportModalProps) {
  const [tab, setTab] = useState<ImportTab>("paste");
  const [rawText, setRawText] = useState("");
  const [parsedTracks, setParsedTracks] = useState<ParsedTrackLine[]>([]);
  const [showReview, setShowReview] = useState(false);

  if (!open) return null;

  function handleParse() {
    const parsed = parseTrackList(rawText);
    setParsedTracks(parsed);
    setShowReview(true);
  }

  async function handleFileUpload(file: File) {
    const text = await parseTrackFile(file);
    setRawText(text);
    const parsed = parseTrackList(text);
    setParsedTracks(parsed);
    setShowReview(true);
  }

  function handleBack() {
    setShowReview(false);
    setParsedTracks([]);
  }

  function handleComplete() {
    setParsedTracks([]);
    setShowReview(false);
    setRawText("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-surface-container rounded-2xl glow-shadow overflow-hidden border border-outline-variant/15">
        <div className="flex flex-col md:flex-row">
          {/* Left visual panel */}
          <div className="hidden md:flex w-1/3 bg-primary-container relative overflow-hidden flex-col justify-end p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-primary-container opacity-80" />
            <div className="relative z-10">
              <Icon name="bolt" className="text-4xl mb-4 text-on-primary-container" />
              <h3 className="font-headline text-2xl font-extrabold tracking-tight text-white">
                Import Vibe
              </h3>
              <p className="text-on-primary-container/80 text-sm mt-2">
                Transform your existing sounds into a new atmosphere.
              </p>
            </div>
          </div>

          {/* Right action panel */}
          <div className="flex-1 p-8 md:p-10 flex flex-col">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-3xl font-headline font-extrabold tracking-tight">
                  {showReview ? "Review Tracks" : "Create New Session"}
                </h2>
                <p className="text-on-surface-variant mt-1 text-sm">
                  {showReview
                    ? "Confirm parsed tracks before matching"
                    : "Paste track list or upload a .txt file"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-on-surface-variant hover:text-white transition-colors"
              >
                <Icon name="close" />
              </button>
            </div>

            {showReview ? (
              <ParsedTrackReview
                tracks={parsedTracks}
                onBack={handleBack}
                onComplete={handleComplete}
              />
            ) : (
              <>
                {/* Tabs */}
                <div className="flex gap-4 mb-6">
                  <button
                    type="button"
                    onClick={() => setTab("paste")}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-semibold transition-colors",
                      tab === "paste"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                    )}
                  >
                    Raw Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("file")}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-semibold transition-colors",
                      tab === "file"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                    )}
                  >
                    Upload File
                  </button>
                </div>

                {/* Tab content */}
                {tab === "paste" ? (
                  <PasteInput value={rawText} onChange={setRawText} />
                ) : (
                  <FileUpload onUpload={handleFileUpload} />
                )}

                {/* Actions */}
                <div className="mt-8">
                  <button
                    type="button"
                    onClick={handleParse}
                    disabled={!rawText.trim()}
                    className="w-full py-4 bg-primary text-on-primary rounded-full font-headline font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <span>Parse & Review</span>
                    <Icon name="arrow_forward" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
