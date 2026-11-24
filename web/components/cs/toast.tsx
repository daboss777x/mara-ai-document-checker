"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "info" | "success" | "error";

const tones: Record<ToastTone, { icon: ReactNode; ring: string }> = {
  info: { icon: <Info />, ring: "text-cs-link" },
  success: { icon: <Check />, ring: "text-cs-ok" },
  error: { icon: <AlertTriangle />, ring: "text-cs-bad" },
};

/** One toast card (presentational). Place inside `ToastViewport`; the caller owns the queue and timers. */
export function Toast({
  tone = "info",
  title,
  description,
  actionLabel,
  onAction,
  onDismiss,
  className,
}: {
  tone?: ToastTone;
  title: string;
  description?: string;
  /** e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "cs-panel pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-2xl p-3.5 pr-2 [animation:cs-toast-in_.25s_ease-out]",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("mt-0.5 inline-flex flex-none [&_svg]:size-5", t.ring)}>
        {t.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="text-[13.5px] text-cs-ink-2">{description}</p> : null}
      </div>
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="h-10 flex-none rounded-full px-3 text-sm font-medium text-cs-link underline"
        >
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex size-10 flex-none items-center justify-center rounded-full text-cs-ink-2 hover:bg-white/70"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** Fixed bottom-right stack (bottom-centre on mobile). Wrap Toasts in it. */
export function ToastViewport({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end",
        className,
      )}
    >
      {children}
    </div>
  );
}
