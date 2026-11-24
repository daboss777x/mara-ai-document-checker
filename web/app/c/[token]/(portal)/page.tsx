import { ChecklistView } from "@/components/client/checklist-view";
import { LoadError } from "@/components/client/states";
import { getClientChecklist, getClientPortal, VERIFY_REQUIRED } from "@/lib/data";
import { redirect } from "next/navigation";

/** Checklist home. The layout already handles expired links. */
export default async function ClientChecklistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [portal, list] = await Promise.all([getClientPortal(token), getClientChecklist(token)]);
  if (!list.ok && list.error === VERIFY_REQUIRED) redirect(`/c/${encodeURIComponent(token)}/verify`);
  if (!portal.ok || !list.ok) return <LoadError message={!list.ok ? list.error : !portal.ok ? portal.error : undefined} />;
  if (!portal.data || !list.data) return null;
  return <ChecklistView portal={portal.data} vm={list.data} />;
}
