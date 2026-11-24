"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ExternalLink, FileSearch, MessageSquareWarning, Quote, Send, X } from "lucide-react";
import { Button, MaraCard, Panel, StatusChip } from "@/components/cs";
import { dismissFindingAction, markCompleteAction, sendFixRequestAction, type StaffActionResult } from "@/app/(staff)/actions";
import { formatWhen, withPage } from "@/components/review/logic";
import { useActionToast } from "@/components/staff/action-toast";
import { ToneChip } from "@/components/staff/tone-chip";
import { cn } from "@/lib/utils";
import type { FindingVM, ReviewItemVM } from "@/lib/view-models";

const MAX_NOTE = 1000;

/** The HITL screen: document on the left, Mara's read and the decision on the right. Stacks on mobile. */
export function ReviewWorkbench({ vm }: { vm: ReviewItemVM }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { show, node } = useActionToast();
  const [page, setPage] = useState<number | null>(null);
  // null = untouched, so the note follows the suggestion (which changes when a finding is dismissed).
  const [edited, setEdited] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"complete" | "fix" | null>(null);

  const { item, client, document: doc, findings } = vm;
  const note = edited ?? vm.suggestedFixNote;
  const openFindings = findings.filter((f) => f.status === "open");
  const dismissed = findings.filter((f) => f.status === "dismissed");
  const alreadyComplete = item.status === "complete";
  const noteTooLong = note.length > MAX_NOTE;
  const noteEmpty = note.trim().length === 0;

  function leave() {
    router.push(vm.nextItemId ? `/review/${vm.nextItemId}` : "/review");
  }

  function run(action: () => Promise<StaffActionResult>, then?: "leave" | "queue" | "refresh") {
    start(async () => {
      const r = await action();
      show(r);
      if (!r.ok) return;
      setConfirm(null);
      if (then === "queue") router.push("/review");
      else if (then === "leave") leave();
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/review" className="cs-sky-text font-semibold underline-offset-2 hover:underline">
          Review
        </Link>
        <span aria-hidden="true" className="cs-sky-text opacity-70">/</span>
        <Link href={`/deals/${vm.deal.id}`} className="cs-sky-text font-medium underline-offset-2 hover:underline">
          {vm.deal.address}
        </Link>
      </nav>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,1fr)]">
        {/* Document */}
        <Panel padded={false} className="overflow-hidden lg:sticky lg:top-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cs-ink/10 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{doc?.filename ?? item.name}</p>
              {doc ? (
                <p className="text-xs text-cs-ink-3">
                  Version {doc.version} · uploaded {formatWhen(doc.uploadedAt)}
                  {doc.pageCount ? ` · ${doc.pageCount} ${doc.pageCount === 1 ? "page" : "pages"}` : ""}
                </p>
              ) : null}
            </div>
            {doc ? (
              <a
                href={withPage(doc.fileHref, page)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-cs-line bg-white/85 px-3.5 text-[13px] font-medium hover:bg-white"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Open in new tab
              </a>
            ) : null}
          </div>
          {doc ? (
            <iframe
              key={`${doc.id}-${page ?? 0}`}
              title={`${doc.filename}${page ? `, page ${page}` : ""}`}
              src={withPage(doc.fileHref, page)}
              className="block h-[62svh] w-full bg-white lg:h-[calc(100svh-210px)] lg:min-h-[520px]"
            />
          ) : (
            <div className="flex h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center">
              <FileSearch className="size-8 text-cs-ink-3" aria-hidden="true" />
              <p className="font-display text-2xl">Nothing uploaded yet</p>
              <p className="max-w-xs text-sm text-cs-ink-2">When the client uploads this document, you&apos;ll see it here.</p>
            </div>
          )}
        </Panel>

        {/* Decision panel */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <ToneChip chip={item.chip} />
              <span className="text-sm text-cs-ink-2">
                {client.name} · {vm.deal.dealNumber}
              </span>
            </div>
            <h1 className="font-display text-[34px] leading-tight break-words md:text-[40px]">{item.name}</h1>
            {item.description ? <p className="text-sm text-cs-ink-2">{item.description}</p> : null}
          </Panel>

          <MaraCard label="Mara's summary">
            {doc?.aiSummary ? <p>{doc.aiSummary}</p> : <p className="text-cs-ink-2">Mara hasn&apos;t written a summary for this document.</p>}
          </MaraCard>

          <Panel className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">
              Findings <span className="font-normal text-cs-ink-3">({openFindings.length} open)</span>
            </h2>
            {findings.length === 0 ? (
              <p className="flex items-center gap-2 rounded-2xl border border-cs-ok-line bg-cs-ok-bg px-3.5 py-3 text-sm font-medium text-cs-ok">
                <CheckCircle2 className="size-5 flex-none" aria-hidden="true" />
                Mara found nothing to flag.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {[...openFindings, ...dismissed].map((f) => (
                  <FindingRow
                    key={f.id}
                    f={f}
                    disabled={pending}
                    onPage={(p) => setPage(p)}
                    onDismiss={() => run(() => dismissFindingAction(f.id), "refresh")}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="flex flex-col gap-3">
            <label htmlFor="fix-note" className="text-base font-semibold">
              Note to the client
            </label>
            <p id="fix-note-help" className="-mt-1.5 text-[13px] text-cs-ink-2">
              Pre-filled from the open findings. Edit it before you send. This is exactly what the client will read.
            </p>
            <textarea
              id="fix-note"
              value={note}
              onChange={(e) => setEdited(e.target.value)}
              rows={5}
              aria-describedby="fix-note-help fix-note-count"
              className="w-full resize-y rounded-2xl border border-cs-line bg-white p-3.5 text-[15px] leading-relaxed text-cs-ink focus:border-cs-brand focus:shadow-[0_0_0_4px_rgba(25,81,252,0.15)] focus:outline-none"
            />
            <p id="fix-note-count" className={cn("text-right text-xs", noteTooLong ? "font-semibold text-cs-bad" : "text-cs-ink-3")}>
              {note.length}/{MAX_NOTE}
            </p>

            {confirm ? (
              <div role="alertdialog" aria-labelledby="confirm-title" className="flex flex-col gap-3 rounded-2xl border border-cs-info-line bg-cs-info-bg p-4">
                <p id="confirm-title" className="text-[15px] font-semibold text-cs-ink">
                  {confirm === "complete"
                    ? `Mark ${item.name} complete for ${client.name}?`
                    : `Send this fix request to ${client.name} at ${client.phoneMasked}?`}
                </p>
                {confirm === "fix" ? (
                  <p className="text-sm text-cs-ink-2">
                    {client.canText
                      ? "They'll get a text with a link, and the note shows in their portal."
                      : `${client.name} can't be texted (no consent, or they opted out). The note will still show in their portal.`}
                  </p>
                ) : (
                  <p className="text-sm text-cs-ink-2">The client will see this item as Done.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    loading={pending}
                    icon={confirm === "complete" ? <CheckCircle2 /> : <Send />}
                    onClick={() =>
                      // Complete → back to the review queue; fix request → straight on to the next item.
                      confirm === "complete" ? run(() => markCompleteAction(item.id), "queue") : run(() => sendFixRequestAction(item.id, note), "leave")
                    }
                  >
                    {confirm === "complete" ? "Yes, mark complete" : "Yes, send it"}
                  </Button>
                  <Button variant="secondary" disabled={pending} icon={<X />} onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  className="flex-1"
                  icon={<CheckCircle2 />}
                  disabled={!doc || alreadyComplete}
                  onClick={() => setConfirm("complete")}
                >
                  Mark complete
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="flex-1"
                  icon={<MessageSquareWarning />}
                  disabled={!doc || noteEmpty || noteTooLong}
                  onClick={() => setConfirm("fix")}
                >
                  Send fix request
                </Button>
              </div>
            )}
            {alreadyComplete ? <p className="text-xs text-cs-ink-3">This item is already complete.</p> : null}
          </Panel>

          {vm.versions.length > 0 ? (
            <Panel className="flex flex-col gap-2.5">
              <h2 className="text-base font-semibold">Versions</h2>
              <ul className="flex flex-col divide-y divide-cs-ink/10">
                {vm.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      <strong>Version {v.version}</strong>
                      <span className="ml-2 text-cs-ink-3">{formatWhen(v.uploadedAt)}</span>
                    </span>
                    {v.id === doc?.id ? (
                      <StatusChip tone="check" hideIcon>
                        Under review
                      </StatusChip>
                    ) : (
                      <span className="text-xs text-cs-ink-3">{v.status === "superseded" ? "Replaced" : v.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <div className="flex justify-end">
            {vm.nextItemId ? (
              <Link href={`/review/${vm.nextItemId}`} className="cs-sky-text inline-flex h-11 items-center gap-2 text-sm font-semibold underline-offset-2 hover:underline">
                Next item
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <Link href="/review" className="cs-sky-text inline-flex h-11 items-center text-sm font-semibold underline-offset-2 hover:underline">
                Back to the queue
              </Link>
            )}
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}

function FindingRow({ f, disabled, onPage, onDismiss }: { f: FindingVM; disabled: boolean; onPage: (page: number) => void; onDismiss: () => void }) {
  const dismissed = f.status === "dismissed";
  return (
    <li className={cn("flex flex-col gap-2 rounded-2xl border border-cs-line bg-white/80 p-3.5", dismissed && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <ToneChip chip={f.chip} />
        {dismissed ? <span className="text-xs font-semibold text-cs-ink-3">Dismissed</span> : null}
        {f.page ? (
          <button
            type="button"
            onClick={() => onPage(f.page as number)}
            className="inline-flex h-8 items-center rounded-full border border-cs-info-line bg-cs-info-bg px-3 text-[12.5px] font-semibold text-cs-link hover:bg-[#d3e5ff]"
          >
            Go to page {f.page}
          </button>
        ) : null}
      </div>
      <p className={cn("text-[14.5px] text-cs-ink", dismissed && "line-through")}>{f.message}</p>
      {f.quote ? (
        <blockquote className="flex gap-2 rounded-xl bg-cs-neutral-bg px-3 py-2 text-[13.5px] text-cs-ink-2 italic">
          <Quote className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
          <span className="min-w-0 break-words">{f.quote}</span>
        </blockquote>
      ) : null}
      {dismissed ? null : (
        <div>
          <button
            type="button"
            disabled={disabled}
            onClick={onDismiss}
            aria-label={`Dismiss finding: ${f.message}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-cs-line bg-white px-3.5 text-[13px] font-medium text-cs-ink hover:bg-cs-neutral-bg disabled:opacity-55"
          >
            <X className="size-4" aria-hidden="true" />
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}
