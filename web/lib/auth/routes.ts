/** Route prefixes that make up the staff area (protected by middleware). */
export const STAFF_PREFIXES = ["/review", "/deals"] as const;

export function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Only allow same-origin relative redirects ("/deals/123"), never "//evil.com" or "https://...".
 */
export function safeNextPath(next: string | null | undefined, fallback = "/review"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
