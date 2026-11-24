import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { Panel } from "@/components/cs";
import { FindingCounts } from "@/components/review/findings-chips";
import { formatWhen } from "@/components/review/logic";
import type { ReviewQueueRow } from "@/lib/view-models";

/** Queue of items waiting for the agent, oldest first. Each row is one big tap target. */
export function ReviewQueue({ rows }: { rows: ReviewQueueRow[] }) {
  return (
    <Panel padded={false} className="overflow-hidden">
      <ul className="divide-y divide-cs-ink/10">
        {rows.map((r) => (
          <li key={r.itemId}>
            <Link
              href={`/review/${r.itemId}`}
              className="flex min-h-[76px] items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-white/70 md:px-6"
            >
              <span aria-hidden="true" className="hidden size-11 flex-none items-center justify-center rounded-2xl border border-cs-info-line bg-cs-info-bg text-cs-link sm:inline-flex">
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-semibold text-cs-ink">
                  {r.documentName}
                  {r.version > 1 ? <span className="ml-2 text-[12.5px] font-medium text-cs-ink-3">v{r.version}</span> : null}
                </span>
                <span className="block truncate text-sm text-cs-ink-2">
                  {r.clientName} · {r.deal.address}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <FindingCounts blockers={r.blockerCount} warnings={r.warningCount} />
                  <span className="text-xs text-cs-ink-3">Uploaded {formatWhen(r.uploadedAt)}</span>
                </span>
              </span>
              <span className="hidden text-sm font-semibold text-cs-link sm:inline">Review</span>
              <ChevronRight className="size-5 flex-none text-cs-ink-3" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ReviewQueueSkeleton() {
  return (
    <Panel padded={false} aria-busy="true" aria-label="Loading the review queue">
      <ul className="divide-y divide-cs-ink/10">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3.5 px-4 py-4 md:px-6">
            <span className="cs-skeleton hidden size-11 flex-none rounded-2xl sm:block" aria-hidden="true" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="cs-skeleton h-4 w-56 max-w-full rounded-lg" aria-hidden="true" />
              <span className="cs-skeleton h-3.5 w-40 max-w-full rounded-lg" aria-hidden="true" />
              <span className="cs-skeleton h-6 w-32 rounded-full" aria-hidden="true" />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
