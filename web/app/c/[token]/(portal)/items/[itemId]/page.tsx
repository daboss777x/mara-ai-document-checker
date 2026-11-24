import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClasses, EmptyState, Panel } from "@/components/cs";
import { ItemView } from "@/components/client/item-view";
import { LoadError } from "@/components/client/states";
import { getClientItem, VERIFY_REQUIRED } from "@/lib/data";
import { redirect } from "next/navigation";

/** Item page. The layout already handles expired links and verification. */
export default async function ClientItemPage({ params }: { params: Promise<{ token: string; itemId: string }> }) {
  const { token, itemId } = await params;
  const item = await getClientItem(token, itemId);
  if (!item.ok && item.error === VERIFY_REQUIRED) redirect(`/c/${encodeURIComponent(token)}/verify`);
  if (!item.ok) return <LoadError message={item.error} />;
  if (!item.data) {
    return (
      <Panel className="mx-auto max-w-[640px]">
        <EmptyState
          icon={<FileQuestion />}
          title="We couldn't find that item"
          description="It may have been removed from your checklist. Everything you still need is on your checklist."
          action={
            <Link href={`/c/${encodeURIComponent(token)}`} className={buttonClasses("primary")}>
              Go to my checklist
            </Link>
          }
        />
      </Panel>
    );
  }
  return <ItemView token={token} vm={item.data} />;
}
