import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Panel, Progress, StatusChip } from "@/components/cs";
import { formatDate, percent } from "@/components/review/logic";
import { ToneChip } from "@/components/staff/tone-chip";
import type { DealListRow } from "@/lib/view-models";

/** Simple list of deals: address, client, progress, and what needs the agent. */
export function DealsList({ rows }: { rows: DealListRow[] }) {
  return (
    <Panel padded={false} className="overflow-hidden">
      <ul className="divide-y divide-cs-ink/10">
        {rows.map((d) => (
          <li key={d.id}>
            <Link href={`/deals/${d.id}`} className="flex min-h-[84px] items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-white/70 md:px-6">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-semibold text-cs-ink">{d.address}</span>
                <span className="block truncate text-sm text-cs-ink-2">
                  {d.clientName} · {d.cityLine}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  {d.reviewCount > 0 ? <StatusChip tone="check" hideIcon>{d.reviewCount} to review</StatusChip> : null}
                  {d.needsFixCount > 0 ? <StatusChip tone="fix">{d.needsFixCount} needs fix</StatusChip> : null}
                  {d.status === "complete" ? <ToneChip chip={d.chip} /> : null}
                  <span className="text-xs text-cs-ink-3">Updated {formatDate(d.updatedAt)}</span>
                </span>
              </span>
              <span className="flex w-[104px] flex-none flex-col gap-1.5 text-right sm:w-36">
                <span className="text-sm font-semibold text-cs-ink">
                  {d.doneCount}/{d.totalCount} done
                </span>
                <Progress value={percent(d.doneCount, d.totalCount)} label={`${d.address}: ${d.doneCount} of ${d.totalCount} documents done`} />
              </span>
              <ChevronRight className="size-5 flex-none text-cs-ink-3" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function DealsListSkeleton() {
  return (
    <Panel padded={false} aria-busy="true" aria-label="Loading deals">
      <ul className="divide-y divide-cs-ink/10">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-4 px-4 py-4 md:px-6">
            <span className="flex flex-1 flex-col gap-2">
              <span className="cs-skeleton h-4 w-48 max-w-full rounded-lg" aria-hidden="true" />
              <span className="cs-skeleton h-3.5 w-36 max-w-full rounded-lg" aria-hidden="true" />
              <span className="cs-skeleton h-6 w-24 rounded-full" aria-hidden="true" />
            </span>
            <span className="cs-skeleton h-8 w-24 rounded-lg" aria-hidden="true" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
