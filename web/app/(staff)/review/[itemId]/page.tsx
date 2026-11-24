import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewWorkbench } from "@/components/review/review-workbench";
import { ErrorPanel } from "@/components/staff/error-panel";
import { getReviewItem } from "@/lib/data";
import { AutoRefresh } from "@/components/shared/auto-refresh";

export const metadata: Metadata = { title: "Review item" };

export default async function ReviewItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const result = await getReviewItem(itemId);
  if (!result.ok) return <ErrorPanel title="This item didn't load" message={result.error} retryHref={`/review/${itemId}`} />;
  if (!result.data) notFound();
  // Keyed by item so the editable note resets when a different item loads.
  const doc = result.data.document;
  const busy = result.data.item.status === "checking" || doc?.status === "received" || doc?.status === "processing" || doc?.status === "uploading";
  return (
    <>
      <AutoRefresh active={busy} />
      <ReviewWorkbench key={result.data.item.id} vm={result.data} />
    </>
  );
}
