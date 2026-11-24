/** Display formatting for dates and times. Pure; safe in server and client components. */

/** Brokerage timezone for display. TODO(decision): read the brokerage's timezone. */
export const DISPLAY_TZ = "America/Chicago";

function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
}

/** Format a Postgres `date` (YYYY-MM-DD) without a timezone shift: "Nov 24, 2026". */
export function formatDate(value: string | null | undefined): string {
  const d = value ? parseIsoDate(value.slice(0, 10)) : null;
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "2026-12-18" → "Fri, Dec 18". */
export function formatDay(value: string | null | undefined): string {
  const d = value ? parseIsoDate(value) : null;
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "2026-12-18" → "Dec 18". */
export function formatShortDate(value: string | null | undefined): string {
  const d = value ? parseIsoDate(value) : null;
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const dayKey = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Timestamp relative to `now`: "9:41 AM", "Yesterday, 4:10 PM", "Nov 20, 4:10 PM". */
export function formatWhen(iso: string | null | undefined, now: string | Date = new Date(), timeZone = DISPLAY_TZ): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const n = typeof now === "string" ? new Date(now) : now;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const today = dayKey(n, timeZone);
  const yesterday = dayKey(new Date(n.getTime() - 86_400_000), timeZone);
  const k = dayKey(d, timeZone);
  if (k === today) return time;
  if (k === yesterday) return `Yesterday, ${time}`;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  return `${date}, ${time}`;
}
