import type { Metadata } from "next";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { buttonClasses, EmptyState, Panel } from "@/components/cs";
import { ReviewQueue } from "@/components/review/review-queue";
import { ErrorPanel } from "@/components/staff/error-panel";
import { PageHeader } from "@/components/staff/page-header";
import { listReviewQueue } from "@/lib/data";
import { AutoRefresh } from "@/components/shared/auto-refresh";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const result = await listReviewQueue();
  if (!result.ok) {
    return (
      <>
        <PageHeader eyebrow="Mara has checked these" title="Review" />
        <ErrorPanel title="The queue didn't load" message={result.error} retryHref="/review" />
      </>
    );
  }

  const { items } = result.data;
  return (
    <>
      <AutoRefresh ms={6000} />
      <PageHeader
        eyebrow="Mara has checked these"
        title={items.length === 0 ? "Review" : items.length === 1 ? "1 document to review" : `${items.length} documents to review`}
        description={items.length ? "Oldest first. Open one, check Mara's findings, then complete it or ask for a fix." : undefined}
      />
      {items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<PartyPopper />}
            title="All caught up."
            description="Nothing is waiting for you. New uploads from clients show up here once Mara has checked them."
            action={
              <Link href="/deals" className={buttonClasses("secondary")}>
                See all deals
              </Link>
            }
          />
        </Panel>
      ) : (
        <ReviewQueue rows={items} />
      )}
    </>
  );
}
