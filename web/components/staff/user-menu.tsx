import { ChevronsUpDown, LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { PersonAvatar } from "@/components/staff/person-avatar";
import { cn } from "@/lib/utils";
import type { StaffSession } from "@/lib/view-models";

const ROLE_LABEL = { agent: "Agent", broker: "Broker" } as const;

/** User menu: name, role, sign out. A <details> disclosure, so it works without JavaScript. */
export function UserMenu({ session, placement = "up", compact = false }: { session: StaffSession; placement?: "up" | "down"; compact?: boolean }) {
  const { user } = session;
  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-[14px] px-2 py-1.5 hover:bg-white/55 [&::-webkit-details-marker]:hidden",
          compact && "px-1",
        )}
        aria-label={compact ? `Account: ${user.name}` : undefined}
      >
        <PersonAvatar initials={user.initials} />
        {compact ? null : (
          <span className="min-w-0 flex-1 text-left">
            <strong className="block truncate text-sm">{user.name}</strong>
            <span className="block truncate text-xs text-cs-ink-2">{ROLE_LABEL[user.role]}</span>
          </span>
        )}
        {compact ? null : (
          <ChevronsUpDown aria-hidden="true" className="size-4 flex-none text-cs-ink-2" />
        )}
      </summary>
      <div
        className={cn(
          "cs-panel absolute z-50 flex w-64 flex-col gap-1 rounded-2xl p-2",
          placement === "up" ? "bottom-full left-0 mb-2" : "top-full right-0 mt-2",
        )}
      >
        <div className="px-3 py-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-cs-ink-2">{user.email}</p>
          <p className="mt-0.5 truncate text-xs text-cs-ink-2">
            {ROLE_LABEL[user.role]} · {session.brokerageName}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium text-cs-ink hover:bg-cs-neutral-bg"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
