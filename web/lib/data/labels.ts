/**
 * Pure mapping helpers shared by the demo and Supabase branches (no I/O, safe anywhere).
 */
import type { ChecklistStatus, Chip, ClientItemStatus, DealStatus, DocumentStatus, FindingSeverity } from "@/lib/view-models";

export function initials(name: string): string {
  const parts = name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "+15125550123" → "(512) •••-0123". Non-US numbers keep only the last 4. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "•••-••••";
  const digits = e164.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  if (digits.length === 11 && digits.startsWith("1")) return `(${digits.slice(1, 4)}) •••-${last4}`;
  return `•••-${last4}`;
}

/** "+15125550123" → "•••-•••-0123" (client verify screen). */
export function maskPhoneShort(e164: string | null | undefined): string {
  const digits = (e164 ?? "").replace(/\D/g, "");
  return `•••-•••-${digits.slice(-4) || "????"}`;
}

export function cityLine(city: string | null, state: string | null, zip: string | null): string {
  return [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function severityChip(severity: FindingSeverity): Chip {
  return severity === "blocker" ? { label: "Blocker", tone: "bad" } : { label: "Warning", tone: "warn" };
}

/** Agent wording (CONTRACTS §2). */
export function staffChecklistChip(status: ChecklistStatus): Chip {
  switch (status) {
    case "missing":
      return { label: "Missing", tone: "neutral" };
    case "checking":
      return { label: "Mara checking", tone: "info" };
    case "review":
      return { label: "Ready for review", tone: "warn" };
    case "needs_fix":
      return { label: "Fix requested", tone: "warn" };
    case "complete":
      return { label: "Complete", tone: "ok" };
    case "waived":
      return { label: "Waived", tone: "neutral" };
  }
}

/** Client wording: the client never sees "review" or "missing". `waived` is hidden (null). */
export function clientItemStatus(status: ChecklistStatus): ClientItemStatus | null {
  switch (status) {
    case "missing":
      return "to_do";
    case "needs_fix":
      return "needs_fix";
    case "checking":
    case "review":
      return "checking";
    case "complete":
      return "done";
    case "waived":
      return null;
  }
}

export function clientItemChip(status: ClientItemStatus, checked = false): Chip {
  if (status === "checking" && checked) return { label: "Checked · with your agent", tone: "info" };
  switch (status) {
    case "to_do":
      return { label: "To do", tone: "neutral" };
    case "needs_fix":
      return { label: "Needs a fix", tone: "warn" };
    case "checking":
      return { label: "Being checked", tone: "info" };
    case "done":
      return { label: "Done", tone: "ok" };
  }
}

export function dealChip(status: DealStatus): Chip {
  return status === "complete" ? { label: "Complete", tone: "ok" } : { label: "Open", tone: "info" };
}

/** "Hi Enoch, 3 things left" / "You're all set, Enoch." */
export function clientHeadline(first: string, toDoCount: number, checkingCount: number): string {
  if (toDoCount > 0) return `Hi ${first}, ${toDoCount} ${toDoCount === 1 ? "thing" : "things"} left`;
  if (checkingCount > 0) return `Thanks ${first}, we're checking your documents`;
  return `You're all set, ${first}`;
}

/** What the client sees next to one of their uploads. */
export function clientUploadStatusLabel(docStatus: DocumentStatus, isLatest: boolean, itemStatus: ChecklistStatus): string {
  if (docStatus === "superseded" || !isLatest) return "Replaced";
  if (itemStatus === "complete") return "Accepted";
  if (itemStatus === "needs_fix") return "Needs a fix";
  return "Being checked";
}

/** Document status chip for the agent's version list. */
export function documentStatusLabel(status: DocumentStatus): string {
  switch (status) {
    case "uploading":
      return "Uploading";
    case "received":
      return "Received";
    case "processing":
      return "Mara checking";
    case "checked":
      return "Checked";
    case "failed":
      return "Couldn't read";
    case "superseded":
      return "Replaced";
  }
}

/** Same-origin route that 302/303s to a 60-second signed URL (see `getDocumentFileUrl`). */
export function documentFileHref(dealId: string, docId: string): string {
  return `/deals/${dealId}/documents/${docId}/file`;
}

/** Upload limits for the client portal: PDF, Word, JPG/PNG up to 25 MB. */
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];
export const UPLOAD_ACCEPT_LABEL = "PDF, Word, JPG or PNG, up to 25 MB.";

// File storage (CONTRACTS §3): private `deal-files` bucket; staff get 60-second signed URLs.
export const DEAL_FILES_BUCKET = "deal-files";
export const SIGNED_URL_TTL_SECONDS = 60;
export const DEFAULT_TIMEZONE = "America/Chicago";

/** Shown next to the SMS-consent checkbox on the new-deal form. */
export const CONSENT_WORDING =
  "I confirm my client agreed to receive text messages from Cedar & Stone Realty about this deal (document requests and reminders). Message and data rates may apply. They can reply STOP to opt out.";
