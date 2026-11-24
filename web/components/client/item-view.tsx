import Link from "next/link";
import { ArrowLeft, CheckCircle2, Hourglass } from "lucide-react";
import { buttonClasses, EmptyState, Panel, StatusChip } from "@/components/cs";
import type { ClientItemVM } from "@/lib/view-models";
import { chipTone, dayLabel, uploadedLabel } from "./format";
import { UploadPanel } from "./upload-panel";
import { AutoRefresh } from "@/components/shared/auto-refresh";

/**
 * Item page: what it is, its status, the agent's fix note when `needs_fix`, the upload panel,
 * and the client's previous uploads. Never explains what a document means (CLAUDE.md rule 2).
 */
export function ItemView({ token, vm }: { token: string; vm: ClientItemVM }) {
  const base = `/c/${encodeURIComponent(token)}`;
  const { item } = vm;
  const fix = item.status === "needs_fix";
  const canUpload = item.status === "to_do" || fix;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      <Link href={base} className={buttonClasses("secondary", "md", "self-start")}>
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to checklist
      </Link>
      <div>
        <StatusChip tone={chipTone(item.chip.tone)}>{item.chip.label}</StatusChip>
        <h1 className="mt-2.5 font-display text-[40px] leading-[1.02] cs-sky-text min-[900px]:text-[52px]">{item.name}</h1>
        <p className="mt-2 text-[15.5px] font-medium cs-sky-text">{item.description}</p>
        {item.dueDate ? <p className="mt-1 text-sm font-medium cs-sky-text">Due {dayLabel(item.dueDate)}</p> : null}
      </div>

      {fix && item.fixNote ? (
        <Panel className="border-cs-warn-line p-4 min-[900px]:p-5">
          <p className="text-[13px] font-bold text-cs-warn">What to fix</p>
          <p className="mt-1.5 text-[17px] leading-[1.45]">{item.fixNote}</p>
        </Panel>
      ) : null}

      <AutoRefresh active={item.status === "checking"} />
      {item.status === "checking" && !item.checked ? (
        <Panel>
          <EmptyState icon={<Hourglass />} title="Mara is checking it" description="This takes a minute or two. This page updates by itself." />
        </Panel>
      ) : null}
      {item.status === "checking" && item.checked ? (
        <Panel>
          <EmptyState icon={<Hourglass />} title="Mara has checked it" description="Your agent is reviewing it now. If anything needs fixing, you'll see it here." />
        </Panel>
      ) : null}
      {item.status === "done" ? (
        <Panel>
          <EmptyState icon={<CheckCircle2 />} title="All done" description="This one is complete. Nothing else is needed." />
        </Panel>
      ) : null}

      {canUpload ? (
        <Panel className="p-4 min-[900px]:p-6">
          <UploadPanel token={token} itemId={item.id} itemName={item.name} config={vm.upload} fix={fix} />
        </Panel>
      ) : null}

      <section aria-labelledby="uploads-title" className="flex flex-col gap-3">
        <h2 id="uploads-title" className="text-[11px] font-semibold tracking-[3px] uppercase cs-sky-text">
          Your uploads
        </h2>
        {vm.uploads.length === 0 ? (
          <Panel className="px-4 py-3.5 text-sm text-cs-ink-2">Nothing uploaded yet.</Panel>
        ) : (
          <Panel padded={false} className="px-4 py-1">
            <ul>
              {vm.uploads.map((u) => (
                <li key={u.id} className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-[rgba(11,31,77,0.08)] py-2 text-[14.5px] last:border-0">
                  <span className="min-w-0 flex-[1_1_200px] font-medium break-all">{u.filename}</span>
                  <span className="text-[13px] text-cs-ink-3">{uploadedLabel(u.uploadedAt)}</span>
                  <span className="text-[13px] font-semibold text-cs-ink-2">{u.statusLabel}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </section>
    </div>
  );
}
