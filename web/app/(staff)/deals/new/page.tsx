import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonClasses } from "@/components/cs";
import { NewDealForm } from "@/components/deals/new-deal-form";
import { ErrorPanel } from "@/components/staff/error-panel";
import { PageHeader } from "@/components/staff/page-header";
import { getNewDealForm } from "@/lib/data";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage() {
  const result = await getNewDealForm();
  return (
    <>
      <div>
        <Link href="/deals" className={buttonClasses("secondary")}>
          <ArrowLeft aria-hidden="true" />
          Deals
        </Link>
      </div>
      <PageHeader eyebrow="New deal" title="Who are we working with?" description="One page. Mara builds the checklist and texts your client a link." />
      {result.ok ? <NewDealForm form={result.data} /> : <ErrorPanel title="The form didn't load" message={result.error} retryHref="/deals/new" />}
    </>
  );
}
