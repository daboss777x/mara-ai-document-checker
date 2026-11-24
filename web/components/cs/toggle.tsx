import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Switch (role=switch). Controlled. Space/Enter toggle natively because it is a button. */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "aria-checked"> & {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Accessible name (visible label should be next to it, or pass aria-labelledby instead). */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-[26px] w-11 flex-none rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-55",
        "after:absolute after:top-[2px] after:left-[2px] after:size-5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.2)] after:transition-transform",
        checked ? "border-cs-brand bg-cs-brand after:translate-x-[18px]" : "border-[#b9c7e0] bg-[#cfd9ec]",
        className,
      )}
      {...rest}
    />
  );
}
