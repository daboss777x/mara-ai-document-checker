"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowRight, MinusCircle, RotateCcw } from "lucide-react";
import { checklistItemAction } from "@/app/(staff)/actions";
import { buttonClasses, Panel } from "@/components/cs";
import { formatDate } from "@/components/review/logic";
import { useActionToast } from "@/components/staff/action-toast";
import { ToneChip } from "@/components/staff/tone-chip";
import { cn } from "@/lib/utils";
import type { StaffChecklistItem } from "@/lib/view-models";

const small = "inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap disabled:opacity-55 md:h-9";

function RowActions({ item, run, pending }: { item: StaffChecklistItem; run: (itemId: string, action: "waive" | "reopen") => void; pending: boolean }) {
  const canReview = item.lastUploadAt !== null && item.status !== "waived";
  const canWaive = item.status !== "complete" && item.status !== "waived";
  const canReopen = item.status === "complete" || item.status === "waived";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canReview ? (
        <Link
          href={`/review/${item.id}`}
          aria-label={`Review ${item.name}`}
          className={cn(buttonClasses(item.status === "review" ? "primary" : "secondary", "md"), "h-11 px-4 text-[13px] md:h-9")}
        >
          Review
          <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
      {canWaive ? (
        <button type="button" disabled={pending} aria-label={`Waive ${item.name}`} onClick={() => run(item.id, "waive")} className={cn(small, "border-cs-line bg-white/85 text-cs-ink hover:bg-white")}>
          <MinusCircle className="size-4" aria-hidden="true" />
          Waive
        </button>
      ) : null}
      {canReopen ? (
        <button type="button" disabled={pending} aria-label={`Reopen ${item.name}`} onClick={() => run(item.id, "reopen")} className={cn(small, "border-cs-line bg-white/85 text-cs-ink hover:bg-white")}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Reopen
        </button>
      ) : null}
    </div>
  );
}

/** Checklist: a table from md up, stacked cards on phones. Waive and Reopen need no confirm (both are reversible). */
export function ChecklistTable({ dealId, items }: { dealId: string; items: StaffChecklistItem[] }) {
  const [pending, start] = useTransition();
  const { show, node } = useActionToast();
  const run = (itemId: string, action: "waive" | "reopen") => start(async () => show(await checklistItemAction(dealId, itemId, action)));

  return (
    <Panel padded={false} className="overflow-hidden">
      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">Documents for this deal</caption>
        <thead>
          <tr className="border-b border-cs-ink/10 text-xs tracking-wide text-cs-ink-3 uppercase">
            <th scope="col" className="px-6 py-3 font-semibold">Document</th>
            <th scope="col" className="px-3 py-3 font-semibold">Status</th>
            <th scope="col" className="px-3 py-3 font-semibold">Last upload</th>
            <th scope="col" className="px-3 py-3 font-semibold">Findings</th>
            <th scope="col" className="px-6 py-3 font-semibold"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cs-ink/10">
          {items.map((it) => (
            <tr key={it.id}>
              <th scope="row" className="px-6 py-3.5 font-semibold text-cs-ink">{it.name}</th>
              <td className="px-3 py-3.5"><ToneChip chip={it.chip} /></td>
              <td className="px-3 py-3.5 text-cs-ink-2">{it.lastUploadAt ? formatDate(it.lastUploadAt) : "—"}</td>
              <td className="px-3 py-3.5 text-cs-ink-2">{it.openFindings > 0 ? `${it.openFindings} open` : "—"}</td>
              <td className="px-6 py-3.5"><RowActions item={it} run={run} pending={pending} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-cs-ink/10 md:hidden">
        {items.map((it) => (
          <li key={it.id} className="flex flex-col gap-2.5 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-semibold text-cs-ink">{it.name}</p>
              <ToneChip chip={it.chip} />
            </div>
            <p className="text-[13px] text-cs-ink-3">
              {it.lastUploadAt ? `Uploaded ${formatDate(it.lastUploadAt)}` : "Nothing uploaded"}
              {it.openFindings > 0 ? ` · ${it.openFindings} open ${it.openFindings === 1 ? "finding" : "findings"}` : ""}
            </p>
            {it.status === "needs_fix" && it.fixNote ? <p className="rounded-xl bg-cs-warn-bg px-3 py-2 text-[13px] text-cs-warn">{it.fixNote}</p> : null}
            <RowActions item={it} run={run} pending={pending} />
          </li>
        ))}
      </ul>
      {node}
    </Panel>
  );
}
