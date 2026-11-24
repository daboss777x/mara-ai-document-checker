import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Content surface (white 88% to 70%, radius 22px). Padded by default; pass `padded={false}` for tables and lists. */
export function Panel({
  padded = true,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn("cs-panel", padded && "p-5 md:p-6", className)} {...rest} />;
}
