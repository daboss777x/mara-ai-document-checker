import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const cls =
  "inline-flex items-center rounded-lg border border-[#c3d8fb] bg-[#e8f1ff] px-2 py-0.5 font-mono text-[12.5px] whitespace-nowrap text-cs-link no-underline";

/** Source reference chip, e.g. "p. 4" or "Contract §7". Renders a link when `href` is given. */
export function Ref({
  children,
  href,
  className,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { children: ReactNode }) {
  if (href) {
    return (
      <a href={href} className={cn(cls, "hover:bg-[#d9e8ff]", className)} {...rest}>
        {children}
      </a>
    );
  }
  return <span className={cn(cls, className)}>{children}</span>;
}
