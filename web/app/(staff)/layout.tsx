import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { buttonClasses, EmptyState, Panel } from "@/components/cs";
import { BottomNav, SidebarNav } from "@/components/staff/staff-nav";
import { UserMenu } from "@/components/staff/user-menu";
import { getStaffSession } from "@/lib/data";

// Per-user, RLS-scoped data: never prerender the staff area.
export const dynamic = "force-dynamic";

// TODO(Davis): live getSession() signals "signed out" only by this message; an error code would be sturdier.
const NOT_SIGNED_IN = "Not signed in.";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  // Middleware already guards these routes; the data layer checks the session again (defence in depth).
  const session = await getStaffSession();

  if (!session.ok) {
    if (session.error === NOT_SIGNED_IN) redirect("/login");
    return (
      <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 px-4 pt-10 pb-[300px]">
        <BrandMark className="cs-sky-text [&_span]:text-white" />
        <Panel>
          <EmptyState
            tone="error"
            icon={<KeyRound />}
            title="Staff portal unavailable"
            description={session.error}
            action={
              <Link href="/login" className={buttonClasses("secondary")}>
                Back to sign in
              </Link>
            }
          />
        </Panel>
      </main>
    );
  }

  const s = session.data;
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[1600px] items-start gap-5 px-4 pt-4 pb-[300px] md:px-5 md:pt-5">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="cs-panel sticky top-5 hidden min-h-[600px] w-[248px] flex-none flex-col gap-1.5 px-3.5 py-5 lg:flex">
        <Link href="/review" className="rounded-xl px-2 pb-4">
          <BrandMark />
        </Link>
        <SidebarNav reviewCount={s.reviewCount} />
        <div className="mt-auto flex flex-col gap-2 border-t border-cs-ink/12 pt-3">
          {s.mode === "demo" ? <DemoTag /> : null}
          <UserMenu session={s} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* Mobile / tablet header */}
        <header className="cs-glass flex h-16 items-center justify-between gap-3 rounded-full pr-2 pl-5 lg:hidden">
          <Link href="/review" aria-label="Review">
            <BrandMark subtitle={null} />
          </Link>
          <div className="flex items-center gap-1">
            {s.mode === "demo" ? <DemoTag /> : null}
            <UserMenu session={s} placement="down" compact />
          </div>
        </header>
        <main id="main" className="flex min-w-0 flex-col gap-5">
          {children}
        </main>
      </div>

      <BottomNav reviewCount={s.reviewCount} />
    </div>
  );
}

function DemoTag() {
  return (
    <span
      title="Fictitious demo data. Nothing is sent."
      className="inline-flex h-7 items-center self-start rounded-full border border-cs-info-line bg-cs-info-bg px-2.5 text-[11.5px] font-semibold text-cs-info"
    >
      Demo data
    </span>
  );
}
