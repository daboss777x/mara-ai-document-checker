"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, House, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "review" };

export const STAFF_NAV: NavItem[] = [
  { href: "/review", label: "Review", icon: ClipboardCheck, badge: "review" },
  { href: "/deals", label: "Deals", icon: House },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

function Count({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-cs-brand px-[7px] text-xs font-bold text-white",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
      <span className="sr-only"> to review</span>
    </span>
  );
}

/** Sidebar nav (desktop, ≥1024px). */
export function SidebarNav({ reviewCount }: { reviewCount: number }) {
  const isActive = useActive();
  return (
    <nav aria-label="Staff" className="flex flex-col gap-1">
      {STAFF_NAV.map(({ href, label, icon: Icon, badge }) => {
        const on = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-[14px] px-3.5 text-[14.5px] transition-colors",
              on
                ? "bg-white font-semibold text-cs-ink shadow-[0_4px_14px_rgba(10,40,110,0.10)]"
                : "font-medium text-cs-ink-2 hover:bg-white/55 hover:text-cs-ink",
            )}
          >
            <Icon className="size-5 flex-none" strokeWidth={1.8} aria-hidden="true" />
            {label}
            {badge && reviewCount > 0 ? <Count n={reviewCount} className="ml-auto" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar (mobile and tablet, <1024px). */
export function BottomNav({ reviewCount }: { reviewCount: number }) {
  const isActive = useActive();
  return (
    <nav
      aria-label="Staff"
      className="cs-glass fixed inset-x-3 bottom-3 z-40 rounded-[22px] px-1.5 py-1.5 pb-[max(6px,env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="grid grid-cols-2">
        {STAFF_NAV.map(({ href, label, icon: Icon, badge }) => {
          const on = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[11.5px]",
                  on ? "bg-white font-semibold text-cs-ink shadow-[0_4px_14px_rgba(10,40,110,0.10)]" : "font-medium text-cs-ink-2",
                )}
              >
                <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                {label}
                {badge && reviewCount > 0 ? (
                  <Count n={reviewCount} className="absolute top-0.5 left-[calc(50%+4px)] h-[18px] min-w-[18px] px-1 text-[10.5px]" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
