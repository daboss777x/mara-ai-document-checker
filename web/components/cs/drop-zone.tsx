"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * File drop target (also a real button + hidden file input for keyboard and tap).
 * Presentational: hands File[] to `onFiles`; validation and upload belong to the caller.
 * Pass `error` to show a rejection (e.g. file over 25 MB).
 */
export function DropZone({
  onFiles,
  title = "Drop files anywhere on your checklist",
  description = "PDF, Word, JPG or PNG, up to 25 MB.",
  accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png",
  multiple = true,
  disabled = false,
  error,
  actionLabel = "Choose files",
  children,
  className,
}: {
  onFiles: (files: File[]) => void;
  title?: string;
  description?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  error?: string;
  actionLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "cs-glass flex flex-wrap items-center gap-[18px] rounded-[22px] border-2 border-dashed p-[22px] transition",
        over ? "border-cs-brand bg-white/80 shadow-[0_0_0_4px_rgba(25,81,252,0.25)]" : "border-white/95",
        error && "border-cs-bad-line",
        disabled && "opacity-60",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-12 flex-none items-center justify-center rounded-full bg-cs-info-bg text-cs-brand"
      >
        <UploadCloud className="size-6" />
      </span>
      <div className="min-w-[200px] flex-1">
        <strong className="block text-base">{over ? "Release to add your files" : title}</strong>
        <p className="text-sm text-cs-ink-2">{description}</p>
        {error ? (
          <p role="alert" className="mt-1.5 text-sm font-medium text-cs-bad">
            {error}
          </p>
        ) : null}
        {children}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="cs-btn-primary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold disabled:opacity-55"
      >
        {actionLabel}
      </button>
    </div>
  );
}
