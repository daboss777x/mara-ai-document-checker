import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page heading on the sky: eyebrow, Instrument Serif title, optional subtitle and actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="cs-sky-text text-xs font-semibold tracking-[2.4px] uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="cs-sky-text mt-1.5 font-display text-[40px] leading-none break-words md:text-[56px]">
          {title}
        </h1>
        {description ? <p className="cs-sky-text mt-2.5 text-base font-medium md:text-lg">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
