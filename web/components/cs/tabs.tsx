"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabItem = { id: string; label: ReactNode; count?: number; disabled?: boolean };

/**
 * Accessible tablist (roles + roving tabindex + arrow/Home/End keys). Controlled.
 * Render panels yourself and link them with `tabPanelProps(id)`; or use it as a filter bar and ignore panels.
 */
export function Tabs({
  tabs,
  value,
  onValueChange,
  label,
  idPrefix,
  className,
}: {
  tabs: TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  /** Accessible name for the tablist. */
  label: string;
  idPrefix?: string;
  className?: string;
}) {
  const auto = useId();
  const prefix = idPrefix ?? auto;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = tabs.filter((t) => !t.disabled);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = enabled.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const t = enabled[next];
    onValueChange(t.id);
    refs.current[t.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex flex-wrap gap-1 border-b border-cs-ink/12", className)}
    >
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`${prefix}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${prefix}-panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onValueChange(t.id)}
            className={cn(
              "-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3.5 text-sm transition-colors disabled:opacity-50",
              on ? "border-cs-brand font-semibold text-cs-ink" : "border-transparent font-medium text-cs-ink-2 hover:text-cs-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-cs-brand px-1.5 text-xs font-bold text-white">
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Props for the panel element matching a tab: `<div {...tabPanelProps(prefix, id)}>`. Pass the same `idPrefix` given to Tabs. */
export function tabPanelProps(idPrefix: string, id: string) {
  return {
    role: "tabpanel" as const,
    id: `${idPrefix}-panel-${id}`,
    "aria-labelledby": `${idPrefix}-tab-${id}`,
    tabIndex: 0,
  };
}
