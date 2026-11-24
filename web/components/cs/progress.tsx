import { cn } from "@/lib/utils";

/** Determinate progress bar. Pass `label` for the accessible name. */
export function Progress({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      className={cn("h-2 overflow-hidden rounded-full bg-[#dde7f7]", className)}
    >
      <span
        className="block h-full rounded-full bg-gradient-to-r from-cs-brand to-[#5fa8ff] transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
