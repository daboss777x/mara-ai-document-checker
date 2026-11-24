import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MaraAvatar } from "./mara-avatar";

/** Light-blue tinted card for anything Mara wrote. Always labelled as AI-drafted. */
export function MaraCard({
  label = "Prepared by Mara",
  approvedBy,
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  label?: string;
  /** Shown after the label, e.g. "Rachel Kim". Renders "· approved by Rachel Kim". */
  approvedBy?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("cs-mara flex flex-col gap-2.5 p-3.5", className)} {...rest}>
      <div className="flex items-center gap-2.5">
        <MaraAvatar size="sm" />
        <span className="text-[13px] font-semibold text-cs-ink-2">
          {label}
          {approvedBy ? ` · approved by ${approvedBy}` : ""}
        </span>
      </div>
      <div className="text-[14.5px] leading-relaxed text-cs-ink">{children}</div>
    </div>
  );
}
