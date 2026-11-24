"use client";

import { useId, useState, useTransition } from "react";
import { MessageSquareOff } from "lucide-react";
import { Toggle } from "@/components/cs";
import { setSmsOptOutAction } from "@/app/c/[token]/actions";
import type { ClientChecklistVM } from "@/lib/view-models";
import { useClientToast } from "./toast-provider";

/**
 * "SMS reminders" toggle. Turning it off is the same as replying STOP.
 * TODO(decision): whether switching texts back ON in the portal counts as fresh SMS consent (TCPA).
 */
export function SmsSettings({ token, sms }: { token: string; sms: ClientChecklistVM["sms"] }) {
  const toast = useClientToast();
  const [on, setOn] = useState(!sms.optedOut);
  const [pending, start] = useTransition();
  const labelId = useId();

  function change(next: boolean) {
    const prev = on;
    setOn(next);
    start(async () => {
      const r = await setSmsOptOutAction(token, !next).catch(() => null);
      if (!r || !r.ok) {
        setOn(prev);
        toast({ tone: "error", title: "We couldn't change your text settings", description: r?.error ?? "Try again in a moment." });
        return;
      }
      toast({ tone: "success", title: r.message, description: r.mode === "demo" ? "Demo mode. No text was sent." : undefined });
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p id={labelId} className="font-semibold">
            SMS reminders
          </p>
          <p className="text-sm text-cs-ink-2">{on ? "We'll text you a nudge when something is still missing." : "Reminder texts are off."}</p>
        </div>
        <Toggle checked={on} onCheckedChange={change} disabled={pending || !sms.canToggle} aria-labelledby={labelId} />
      </div>
      <p className="flex items-start gap-2 text-[13px] text-cs-ink-3">
        <MessageSquareOff className="mt-0.5 size-4 flex-none" aria-hidden="true" />
        {sms.canToggle ? "You can also reply STOP to any text from us." : "Your agent hasn't recorded text consent, so we won't text you."}
      </p>
    </div>
  );
}
