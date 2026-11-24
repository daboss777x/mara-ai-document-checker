import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Lighter frosted surface for nav, chips and floating bars. Text inside is always ink. */
export function Glass({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("cs-glass rounded-[22px]", className)} {...rest} />;
}
