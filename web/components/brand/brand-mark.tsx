import { cn } from "@/lib/utils";
import { getBrokerageTheme } from "@/lib/theme";

/** Cedar & Stone wordmark (text only, no symbol; swapped per brokerage via the theme). */
export function BrandMark({ subtitle = "Realty · Staff", className }: { subtitle?: string | null; className?: string }) {
  const theme = getBrokerageTheme();
  const name = theme.name.replace(/\s+Realty$/i, "");
  return (
    <span className={cn("flex flex-col leading-tight text-cs-ink", className)}>
      <span className="font-display text-2xl">{name}</span>
      {subtitle ? <span className="text-[10.5px] tracking-[3px] text-cs-ink-2 uppercase">{subtitle}</span> : null}
    </span>
  );
}
