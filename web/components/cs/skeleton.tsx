import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Shimmer placeholder. Hidden from assistive tech; wrap a group in `aria-busy` + a visible/sr-only "Loading" label. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("cs-skeleton h-4 rounded-lg", className)} {...rest} />;
}
