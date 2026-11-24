import type { ReactNode } from "react";
import { AlertTriangle, Check, CircleDashed, Clock, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipTone = "done" | "fix" | "block" | "check" | "todo";

const tones: Record<ChipTone, { cls: string; label: string; icon: ReactNode }> = {
  done: { cls: "bg-cs-ok-bg text-cs-ok border-cs-ok-line", label: "Done", icon: <Check /> },
  fix: { cls: "bg-cs-warn-bg text-cs-warn border-cs-warn-line", label: "Needs a fix", icon: <AlertTriangle /> },
  block: { cls: "bg-cs-bad-bg text-cs-bad border-cs-bad-line", label: "Blocker", icon: <OctagonAlert /> },
  check: { cls: "bg-cs-info-bg text-cs-info border-cs-info-line", label: "Being checked", icon: <Clock /> },
  todo: { cls: "bg-cs-neutral-bg text-cs-neutral border-cs-neutral-line", label: "To do", icon: <CircleDashed /> },
};

/** Status is always icon + text + colour, never colour alone. */
export function StatusChip({
  tone,
  children,
  hideIcon = false,
  className,
}: {
  tone: ChipTone;
  /** Overrides the default label for the tone. */
  children?: ReactNode;
  hideIcon?: boolean;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-[11px] text-[12.5px] font-semibold whitespace-nowrap [&_svg]:size-3.5",
        t.cls,
        className,
      )}
    >
      {hideIcon ? null : <span aria-hidden="true" className="inline-flex">{t.icon}</span>}
      {children ?? t.label}
    </span>
  );
}
