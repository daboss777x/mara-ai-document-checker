import type { Metadata } from "next";
import Link from "next/link";
import { FolderOpen, Plus, Search, SearchX } from "lucide-react";
import { buttonClasses, EmptyState, Panel } from "@/components/cs";
import { DealsList } from "@/components/deals/deals-list";
import { ErrorPanel } from "@/components/staff/error-panel";
import { PageHeader } from "@/components/staff/page-header";
import { listDeals } from "@/lib/data";

export const metadata: Metadata = { title: "Deals" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function NewDealButton() {
  return (
    <Link href="/deals/new" className={buttonClasses("primary")}>
      <Plus aria-hidden="true" />
      New deal
    </Link>
  );
}

export default async function DealsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? "";
  const result = await listDeals(q || undefined);

  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Your deals" title="Deals" actions={<NewDealButton />} />
        <ErrorPanel title="Deals didn't load" message={result.error} retryHref="/deals" />
      </>
    );
  }

  const { rows } = result.data;
  const searching = q.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Your deals"
        title={searching ? "Search results" : rows.length === 1 ? "1 deal" : `${rows.length} deals`}
        actions={<NewDealButton />}
      />

      <form action="/deals" method="get" role="search" className="relative max-w-[520px]">
        <label htmlFor="deal-search" className="sr-only">
          Search deals by address or client
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-cs-ink-3" />
        <input
          id="deal-search"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={200}
          placeholder="Search by address or client"
          className="h-12 w-full rounded-full border border-cs-line bg-white/95 pr-4 pl-11 text-[15px] text-cs-ink placeholder:text-[#5b6d93] focus:border-cs-brand focus:shadow-[0_0_0_4px_rgba(25,81,252,0.15)] focus:outline-none"
        />
      </form>

      {rows.length === 0 ? (
        <Panel>
          {searching ? (
            <EmptyState
              icon={<SearchX />}
              title="No deals match"
              description={`Nothing matches "${q}". Try another address or client name.`}
              action={
                <Link href="/deals" className={buttonClasses("secondary")}>
                  Show all deals
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={<FolderOpen />}
              title="No deals yet"
              description="Start one with New deal. Mara sets up the checklist and texts your client a link."
              action={<NewDealButton />}
            />
          )}
        </Panel>
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            Showing {rows.length} {rows.length === 1 ? "deal" : "deals"}
          </p>
          <DealsList rows={rows} />
        </>
      )}
    </>
  );
}
