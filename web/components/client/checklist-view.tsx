import Link from "next/link";
import { CheckCircle2, PartyPopper } from "lucide-react";
import { buttonClasses, EmptyState, Panel, Progress, StatusChip } from "@/components/cs";
import type { ClientChecklistItem, ClientChecklistVM, ClientPortalVM } from "@/lib/view-models";
import { cn } from "@/lib/utils";
import { chipTone, dayLabel, uploadedLabel } from "./format";
import { SmsSettings } from "./sms-settings";
import { AutoRefresh } from "@/components/shared/auto-refresh";

const eyebrow = "text-[11px] font-semibold tracking-[3px] uppercase cs-sky-text min-[900px]:text-[13px]";

function dueSoon(iso: string | null): boolean {
  if (!iso) return false;
  return (Date.parse(`${iso}T23:59:59Z`) - Date.now()) / 86_400_000 <= 3;
}

/** Checklist home: headline, progress, To do (incl. needs-fix with the fix note), Being checked, Done, SMS toggle. */
export function ChecklistView({ portal, vm }: { portal: ClientPortalVM; vm: ClientChecklistVM }) {
  const base = `/c/${encodeURIComponent(portal.token)}`;
  const allDone = vm.totalCount > 0 && vm.toDo.length === 0 && vm.checking.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 min-[900px]:gap-[22px]">
      <AutoRefresh active={vm.checking.length > 0} />
      <div>
        <p className={eyebrow}>
          {portal.deal.address} · {portal.deal.cityLine.replace(/ \d{5}$/, "")}
        </p>
        <h1 className="mt-1.5 font-display text-[42px] leading-[1.02] cs-sky-text min-[900px]:mt-2 min-[900px]:text-[60px] min-[900px]:leading-none">
          {vm.headline}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-cs-ink-2">
          Mara, our assistant, checks each document within a few minutes. Then {portal.agent.name.split(" ")[0]} reviews it.
        </p>
      </div>

      {vm.totalCount === 0 ? (
        <Panel>
          <EmptyState
            title="Your checklist is on its way"
            description={`${portal.agent.name.split(" ")[0]} is setting up the list of documents for your home. We'll text you when it's ready.`}
          />
        </Panel>
      ) : (
        <Panel className="flex flex-col gap-2.5 p-4 min-[900px]:gap-3.5 min-[900px]:px-6 min-[900px]:py-[22px]">
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <strong className="min-[900px]:text-base">
              {vm.doneCount} of {vm.totalCount} done
            </strong>
            <span className="text-cs-ink-2">
              {vm.checking.length ? `${vm.checking.length} being checked · ` : ""}
              {vm.toDo.length ? `${vm.toDo.length} to go` : "Nothing left to do"}
            </span>
          </div>
          <Progress value={vm.doneCount} max={vm.totalCount} label="Checklist progress" />
        </Panel>
      )}

      {allDone ? (
        <Panel>
          <EmptyState icon={<PartyPopper />} title="You're all set" description="Everything is in and checked. We'll text you if anything changes." />
        </Panel>
      ) : null}

      {vm.toDo.length ? <h2 className={cn(eyebrow, "mt-1")}>To do · {vm.toDo.length}</h2> : null}
      {vm.toDo.map((i) => (
        <ToDoRow key={i.id} item={i} base={base} />
      ))}

      {vm.checking.length ? <h2 className={cn(eyebrow, "mt-1")}>Being checked · {vm.checking.length}</h2> : null}
      {vm.checking.map((i) => (
        <Panel key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 min-[900px]:px-[22px] min-[900px]:py-[18px]">
          <div className="min-w-0 flex-[1_1_320px]">
            <div className="flex flex-wrap items-center justify-between gap-2.5 min-[900px]:justify-start">
              <Link href={`${base}/items/${i.id}`} className="text-[15px] font-semibold hover:underline min-[900px]:text-[17px]">
                {i.name}
              </Link>
              <StatusChip tone="check">{i.chip.label}</StatusChip>
            </div>
            {i.uploadedAt ? <p className="mt-1 text-sm text-cs-ink-2">Uploaded {uploadedLabel(i.uploadedAt)}</p> : null}
          </div>
        </Panel>
      ))}

      {vm.done.length ? <h2 className={cn(eyebrow, "mt-1")}>Done · {vm.done.length}</h2> : null}
      {vm.done.length ? (
        <Panel padded={false} className="px-4 py-1 min-[900px]:px-[22px] min-[900px]:py-1.5">
          <ul>
            {vm.done.map((i) => (
              <li key={i.id} className="flex min-h-[46px] items-center gap-2.5 border-b border-[rgba(11,31,77,0.08)] text-[14.5px] last:border-0 min-[900px]:min-h-[52px] min-[900px]:gap-3 min-[900px]:text-[15px]">
                <CheckCircle2 className="size-[18px] flex-none text-[#12924f]" aria-hidden="true" />
                <span className="flex-1">{i.name}</span>
                <span className="text-[13px] text-cs-ink-3">Done</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="mt-2 p-4 min-[900px]:p-6">
        <SmsSettings token={portal.token} sms={vm.sms} />
      </Panel>
    </div>
  );
}

function ToDoRow({ item: i, base }: { item: ClientChecklistItem; base: string }) {
  const fix = i.status === "needs_fix";
  return (
    <article
      className={cn(
        "cs-panel flex flex-col gap-2 p-4 min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-center min-[900px]:gap-4 min-[900px]:px-[22px] min-[900px]:py-5",
        fix && "border-cs-warn-line",
      )}
    >
      <div className="min-w-0 min-[900px]:flex-[1_1_320px]">
        <div className="flex items-center justify-between gap-2.5 min-[900px]:flex-wrap min-[900px]:justify-start">
          <h3 className="text-base font-semibold min-[900px]:text-[17px]">{i.name}</h3>
          <StatusChip tone={chipTone(i.chip.tone)}>{i.chip.label}</StatusChip>
        </div>
        {fix && i.fixNote ? (
          <p className="mt-2 rounded-xl bg-[#fff4de] px-3 py-2.5 text-sm text-[#5c3700] min-[900px]:text-[14.5px]">{i.fixNote}</p>
        ) : (
          <p className="mt-1 text-sm text-cs-ink-2">{i.description}</p>
        )}
        {i.dueDate ? (
          <p className={cn("mt-1.5 text-[13px] min-[900px]:text-[13.5px]", dueSoon(i.dueDate) ? "font-semibold text-cs-warn" : "text-cs-ink-2")}>Due {dayLabel(i.dueDate)}</p>
        ) : null}
      </div>
      <Link href={`${base}/items/${i.id}`} className={buttonClasses("primary", "md", "w-full min-[900px]:w-auto")}>
        {fix ? "Upload fixed copy" : "Upload"}
      </Link>
    </article>
  );
}
