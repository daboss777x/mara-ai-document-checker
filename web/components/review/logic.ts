/** Pure helpers for the staff screens. No React, no data access. */

/** Builds the client-facing fix note from the open findings' client text (deduped, in order). */
export function buildFixNote(findings: { status: string; clientFixText: string | null | undefined }[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const f of findings) {
    if (f.status !== "open") continue;
    const text = f.clientFixText?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    lines.push(text);
  }
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  return lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
}

/** "(512) 555-0142" / "512-555-0142" / "+1 512 555 0142" → "+15125550142". Returns the input trimmed if it can't be read as US. */
export function toE164US(input: string): string {
  const trimmed = input.trim();
  if (/^\+\d{8,15}$/.test(trimmed.replace(/[\s().-]/g, ""))) return trimmed.replace(/[\s().-]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

/** "+15125550142" → "(•••) •••-0142". Shows only the last four digits. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return digits.length < 4 ? "••••" : `(•••) •••-${digits.slice(-4)}`;
}

/** Adds #page=n to a file route URL (drops any existing hash). */
export function withPage(fileHref: string, page: number | null | undefined): string {
  const base = fileHref.split("#")[0];
  return page && page > 0 ? `${base}#page=${page}` : base;
}

/** "3/6 done" progress as a 0-100 number. */
export function percent(done: number, total: number): number {
  return total <= 0 ? 0 : Math.round((Math.min(done, total) / total) * 100);
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });

/** "Nov 23, 2:14 PM" (brokerage time). Empty string for missing/invalid input. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE_TIME.format(d);
}

/** "Nov 23". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE.format(d);
}

/** "2 blockers · 1 warning" or "No findings". */
export function findingsSummary(blockers: number, warnings: number): string {
  const parts: string[] = [];
  if (blockers) parts.push(`${blockers} ${blockers === 1 ? "blocker" : "blockers"}`);
  if (warnings) parts.push(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`);
  return parts.length ? parts.join(" · ") : "No findings";
}
