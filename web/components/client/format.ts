import type { ChipTone } from "@/components/cs";
import type { Tone } from "@/lib/view-models";
import { UPLOAD_ACCEPTED_TYPES, UPLOAD_MAX_BYTES } from "@/lib/data/labels";

/** Pure helpers for the client portal (safe in server and client components). */

const TZ = "America/Chicago";

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** "2026-11-26" → "Thu, Nov 26". */
export function dayLabel(iso: string): string {
  return utcDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** ISO date-time → "today, 9:41 AM" / "Nov 21, 4:10 PM" in the brokerage time zone. */
export function uploadedLabel(isoDateTime: string, now = new Date()): string {
  const d = new Date(isoDateTime);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  const day = (x: Date) => x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
  return day(d) === day(now) ? `today, ${t}` : `${day(d)}, ${t}`;
}

/** View-model tone → kit chip tone. */
export function chipTone(tone: Tone): ChipTone {
  switch (tone) {
    case "ok":
      return "done";
    case "warn":
      return "fix";
    case "bad":
      return "block";
    case "info":
      return "check";
    case "neutral":
      return "todo";
  }
}

/** 412_000 → "402 KB", 2_200_000 → "2.1 MB". */
export function bytesLabel(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** Browser File (or anything shaped like it) → the metadata the server registers. */
export function toUploadInput(file: { name: string; size: number; type: string }) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return {
    filename: file.name.slice(0, 255) || "file",
    sizeBytes: file.size,
    mime: file.type || MIME_BY_EXT[ext] || "application/octet-stream",
  };
}

/** Client-side pre-check (the server and Mara check again). Returns a friendly message, or null when fine. */
export function validateUpload(
  file: { name: string; size: number; type: string },
  limits: { maxBytes: number; acceptedTypes: string[] } = { maxBytes: UPLOAD_MAX_BYTES, acceptedTypes: UPLOAD_ACCEPTED_TYPES },
): string | null {
  const { mime, sizeBytes } = toUploadInput(file);
  if (sizeBytes <= 0) return "That file is empty.";
  if (sizeBytes > limits.maxBytes) return `That file is ${bytesLabel(sizeBytes)}. The limit is ${bytesLabel(limits.maxBytes)}.`;
  if (!limits.acceptedTypes.includes(mime)) return "We can only take PDF, Word, JPG or PNG files.";
  return null;
}

/** The demo upload URL is a marker: the browser skips the PUT. */
export const isDemoUploadUrl = (url: string): boolean => url.startsWith("demo://");

/** Copy for a mutation toast. Demo mode always says nothing left the system. */
export function demoNote(mode: "demo" | "live", what = "Nothing was sent"): string | undefined {
  return mode === "demo" ? `Demo mode. ${what}.` : undefined;
}
