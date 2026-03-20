"use client";

import { useState, useRef } from "react";
import { Icon } from "@/components/ui/icon";

interface FileUploadProps {
  onUpload: (file: File) => void;
}

export function FileUpload({ onUpload }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      setFileName(file.name);
      onUpload(file);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-widest text-on-surface-variant/70 px-1">
        Upload .txt File
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-outline-variant/30 hover:border-primary/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Icon
          name={fileName ? "description" : "upload_file"}
          className={fileName ? "text-primary mb-3" : "text-on-surface-variant/40 mb-3"}
          size="xl"
        />
        {fileName ? (
          <>
            <p className="text-sm font-bold text-primary">{fileName}</p>
            <p className="text-xs text-on-surface-variant mt-1">File loaded successfully</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-on-surface-variant">
              Drop a .txt file here or click to browse
            </p>
            <p className="text-xs text-on-surface-variant/50 mt-1">
              Expected format: Artist - Title, one per line
            </p>
          </>
        )}
      </div>
    </div>
  );
}
