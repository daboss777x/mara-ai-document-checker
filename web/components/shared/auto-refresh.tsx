"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the current server page every `ms` while `active`, so a page catches Mara's
 * check (and the agent's decision) without a manual reload. Pauses while the tab is hidden.
 */
export function AutoRefresh({ active = true, ms = 5000 }: { active?: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [active, ms, router]);
  return null;
}
