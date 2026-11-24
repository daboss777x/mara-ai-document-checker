"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Link2, RotateCw, Send, X } from "lucide-react";
import { Button, Toggle } from "@/components/cs";
import { newClientLinkAction, resendInviteAction, setRemindersAction } from "@/app/(staff)/actions";
import { maskPhone } from "@/components/review/logic";
import { useActionToast } from "@/components/staff/action-toast";

/** Deal header controls: reminders toggle, copy client link, resend invite (with a confirm naming the client + phone). */
export function DealControls({
  dealId,
  clientName,
  phone,
  canText,
  remindersEnabled,
  clientLinkUrl,
  dealComplete,
}: {
  dealId: string;
  clientName: string;
  phone: string;
  canText: boolean;
  remindersEnabled: boolean;
  clientLinkUrl: string | null;
  dealComplete: boolean;
}) {
  const [pending, start] = useTransition();
  const { show, node } = useActionToast();
  const [reminders, setReminders] = useState(remindersEnabled);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const linkUrl = clientLinkUrl ?? freshLink;

  function toggle(next: boolean) {
    const prev = reminders;
    setReminders(next);
    start(async () => {
      const r = await setRemindersAction(dealId, next);
      show(r);
      if (!r.ok) setReminders(prev);
    });
  }

  /** No readable link (live mode keeps only its hash): make a new one, then copy it. */
  function newLink() {
    start(async () => {
      const r = await newClientLinkAction(dealId);
      if (!r.ok || !r.url) return show(r);
      setFreshLink(r.url);
      try {
        await navigator.clipboard.writeText(r.url);
        show({ ok: true, message: "New client link copied. The old one no longer works.", demo: r.demo });
      } catch {
        show(r);
      }
    });
  }

  async function copy() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      show({ ok: true, message: "Client link copied.", demo: false });
    } catch {
      show({ ok: false, message: "Couldn't copy. Select the link and copy it by hand.", demo: false });
    }
  }

  function resend() {
    start(async () => {
      const r = await resendInviteAction(dealId);
      show(r);
      if (r.ok) setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="cs-glass flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[18px] px-4 py-3">
        <div className="flex items-center gap-3">
          <Toggle
            checked={reminders}
            onCheckedChange={toggle}
            disabled={pending || dealComplete}
            aria-labelledby="reminders-label"
          />
          <span id="reminders-label" className="text-sm font-semibold text-cs-ink">
            Automatic SMS reminders {reminders ? "on" : "off"}
          </span>
        </div>
        <span className="flex-1" />
        {linkUrl ? (
          <>
            <Button variant="secondary" icon={copied ? <Check /> : <Copy />} onClick={copy}>
              {copied ? "Copied" : "Copy client link"}
            </Button>
            <a href={linkUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-cs-link underline">
              Open client portal <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </>
        ) : (
          <Button variant="secondary" icon={<Link2 />} loading={pending} disabled={pending} onClick={newLink} title="Makes a new secure link for the client and copies it. The old link stops working.">
            New client link
          </Button>
        )}
        <Button variant="secondary" icon={<RotateCw />} disabled={pending} onClick={() => setConfirming(true)}>
          Resend invite
        </Button>
      </div>
      {confirming ? (
        <div role="alertdialog" aria-labelledby="resend-title" className="flex flex-col gap-3 rounded-2xl border border-cs-info-line bg-cs-info-bg p-4">
          <p id="resend-title" className="text-[15px] font-semibold text-cs-ink">
            Text a new invite to {clientName} at {maskPhone(phone)}?
          </p>
          <p className="text-sm text-cs-ink-2">
            {canText ? "This sends a fresh secure link and replaces the old one." : `${clientName} can't be texted (no consent, or they opted out), so nothing will be sent.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button loading={pending} icon={<Send />} disabled={!canText} onClick={resend}>
              Yes, resend
            </Button>
            <Button variant="secondary" icon={<X />} disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {node}
    </div>
  );
}
