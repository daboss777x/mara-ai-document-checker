"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { Button, CodeInput } from "@/components/cs";
import { sendVerifyCodeAction, verifyCodeAction } from "@/app/c/[token]/actions";
import type { ClientVerifyVM, DataMode } from "@/lib/view-models";
import { useClientToast } from "./toast-provider";

/** C1 Verify: 6-digit code. Demo accepts any 6 digits except 000000. */
export function VerifyForm({ token, vm, mode, agentPhone }: { token: string; vm: ClientVerifyVM; mode: DataMode; agentPhone: string | null }) {
  const router = useRouter();
  const toast = useClientToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(vm.state === "locked");
  const [wait, setWait] = useState(vm.resendAfterSeconds);
  const [pending, start] = useTransition();
  const agentFirst = vm.agentName.split(" ")[0] ?? vm.agentName;

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function verify(c: string) {
    if (c.length !== 6 || pending) return;
    setError(null);
    start(async () => {
      const r = await verifyCodeAction(token, c).catch(() => null);
      if (r?.ok) {
        router.push(`/c/${encodeURIComponent(token)}`);
        return;
      }
      const msg = r?.error ?? "Something went wrong. Try again.";
      if (/too many/i.test(msg)) setLocked(true);
      setError(msg);
      setCode("");
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    verify(code);
  }

  function resend() {
    setWait(vm.resendAfterSeconds || 30);
    start(async () => {
      const r = await sendVerifyCodeAction(token).catch(() => null);
      if (!r || !r.ok) {
        toast({ tone: "error", title: "We couldn't send a new code", description: r?.error ?? "Try again in a moment." });
        return;
      }
      toast({ tone: "info", title: "New code requested", description: r.mode === "demo" ? "Demo mode. No text was sent. Use any 6 digits except 000000." : undefined });
    });
  }

  if (locked) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-cs-bad-line bg-cs-bad-bg p-4 text-cs-bad">
        <p className="flex items-center gap-2 font-semibold">
          <Lock className="size-5" aria-hidden="true" /> Too many tries
        </p>
        <p className="text-[14.5px]">For your safety, this link is paused for 15 minutes. Then you can try again, or contact {agentFirst}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <CodeInput value={code} onChange={setCode} onComplete={verify} invalid={!!error} disabled={pending} label="6-digit code" />
      {error ? (
        <p role="alert" className="-mt-1 text-sm font-medium text-cs-bad">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={code.length !== 6}>
        Verify
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={resend} disabled={wait > 0} className="h-11 rounded-full font-medium text-cs-link underline disabled:text-cs-ink-3 disabled:no-underline">
          {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
        </button>
        {agentPhone ? (
          <a href={`tel:${agentPhone.replace(/[^\d+]/g, "")}`} className="inline-flex h-11 items-center font-medium text-cs-link underline">
            Not you? Contact {agentFirst}
          </a>
        ) : (
          <span className="text-cs-ink-2">Not you? Contact {agentFirst}</span>
        )}
      </div>
      {mode === "demo" ? <p className="text-[13px] text-cs-ink-3">Demo: any 6 digits work except 000000.</p> : null}
    </form>
  );
}
