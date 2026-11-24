import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** "error" uses role=alert and red accents. */
  tone?: "neutral" | "error";
  className?: string;
}) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : undefined}
      className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "mb-1 inline-flex size-14 items-center justify-center rounded-full border [&_svg]:size-6",
            error ? "border-cs-bad-line bg-cs-bad-bg text-cs-bad" : "border-cs-info-line bg-cs-info-bg text-cs-link",
          )}
        >
          {icon}
        </span>
      ) : null}
      <h3 className="font-display text-[28px] leading-tight text-cs-ink">{title}</h3>
      {description ? <p className="max-w-sm text-[14.5px] text-cs-ink-2">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
