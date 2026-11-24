import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks } from "lucide-react";
import { buttonClasses, EmptyState, Panel } from "@/components/cs";
import { ActivityList } from "@/components/deals/activity-list";
import { ChecklistTable } from "@/components/deals/checklist-table";
import { DealControls } from "@/components/deals/deal-controls";
import { ErrorPanel } from "@/components/staff/error-panel";
import { ToneChip } from "@/components/staff/tone-chip";
import { getDeal } from "@/lib/data";
import { AutoRefresh } from "@/components/shared/auto-refresh";

export const metadata: Metadata = { title: "Deal" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getDeal(id);
  if (!result.ok) return <ErrorPanel title="This deal didn't load" message={result.error} retryHref={`/deals/${id}`} />;
  if (!result.data) notFound();

  const { deal, client, items, activity } = result.data;
  const done = items.filter((i) => i.status === "complete").length;
  const counted = items.filter((i) => i.status !== "waived").length;

  return (
    <>
      <AutoRefresh active={items.some((i) => i.status === "checking")} />
      <div>
        <Link href="/deals" className={buttonClasses("secondary")}>
          <ArrowLeft aria-hidden="true" />
          Deals
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="cs-sky-text text-xs font-semibold tracking-[2.4px] uppercase">
            Deal {deal.dealNumber} · {client.name}
          </p>
          <h1 className="cs-sky-text mt-1.5 font-display text-[40px] leading-none break-words md:text-[54px]">{deal.address}</h1>
          <p className="cs-sky-text mt-2 text-sm font-medium">
            {deal.cityLine} · {done}/{counted} done
          </p>
        </div>
        <ToneChip chip={deal.chip} className="h-9 px-4 text-sm" />
      </header>

      <DealControls
        dealId={deal.id}
        clientName={client.name}
        phone={client.phone}
        canText={client.smsConsent && !client.optedOut}
        remindersEnabled={deal.remindersEnabled}
        clientLinkUrl={deal.clientLinkUrl}
        dealComplete={deal.status === "complete"}
      />

      {client.optedOut || !client.smsConsent ? (
        <p role="status" className="rounded-2xl border border-cs-warn-line bg-cs-warn-bg px-4 py-3 text-sm font-medium text-cs-warn">
          {client.optedOut ? `${client.name} opted out of texts.` : `${client.name} hasn't agreed to texts.`} Reminders and fix-request texts won&apos;t be sent; fixes still show in their portal.
        </p>
      ) : null}

      <section aria-labelledby="checklist-h" className="flex flex-col gap-3">
        <h2 id="checklist-h" className="cs-sky-text text-xl font-semibold">
          Checklist
        </h2>
        {items.length === 0 ? (
          <Panel>
            <EmptyState icon={<ListChecks />} title="No documents on this deal" description="This deal has no checklist items yet." />
          </Panel>
        ) : (
          <ChecklistTable dealId={deal.id} items={items} />
        )}
      </section>

      <ActivityList entries={activity} />
    </>
  );
}
