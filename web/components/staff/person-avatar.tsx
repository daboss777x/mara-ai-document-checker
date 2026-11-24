import { cn } from "@/lib/utils";

const sizes = { sm: "size-[30px] text-[11px]", md: "size-9 text-[13px]" } as const;

/** Initials avatar for people (Mara uses MaraAvatar instead). Decorative: pair with a visible name. */
export function PersonAvatar({ initials, size = "md", className }: { initials: string; size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-full border border-[#c3d5f5] bg-[#e3ecfb] font-bold text-cs-link",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
