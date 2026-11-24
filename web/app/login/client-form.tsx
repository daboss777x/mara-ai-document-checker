"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, CodeInput } from "@/components/cs";

const fieldCls =
  "h-[54px] w-full rounded-2xl border border-cs-line bg-white/92 px-[18px] text-base text-cs-ink placeholder:text-[#5b6d93] focus:border-cs-brand focus:shadow-[0_0_0_4px_rgba(25,81,252,0.15)] focus:outline-none";

/**
 * Client sign in: phone/email → 6-digit code. Demo: any code opens Enoch's portal (/c/demo).
 * Live clients open the personal link their agent texted (C1 Verify lives on /c/[token]).
 * TODO(decision): a phone/email OTP lookup from this page needs a Mara endpoint; until then live mode points to the link.
 */
export function ClientSignIn({ demo, onEnter }: { demo: boolean; onEnter: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"contact" | "code">("contact");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const v = contact.trim();
    if (v.length < 5 || v.length > 200) return setError("Enter the mobile number or email your agent has on file.");
    setError(null);
    if (!demo) return setInfo("Open the personal link your agent texted you. It takes you straight to your checklist.");
    setStep("code");
  }

  function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Enter all 6 digits.");
    setError(null);
    onEnter();
    router.push("/c/demo");
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="mt-2.5 flex flex-col gap-[18px]" noValidate>
        <div>
          <p className="text-xs font-semibold tracking-[2.5px] text-cs-brand uppercase">Check your phone</p>
          <h2 className="mt-2 font-display text-[38px] leading-none text-cs-ink">Enter your code.</h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-cs-ink-2">We sent a 6-digit code. It works for 10 minutes.{demo ? " Demo: any 6 digits work." : ""}</p>
        </div>
        <CodeInput value={code} onChange={setCode} invalid={Boolean(error)} />
        {error ? (
          <p role="alert" className="text-sm text-cs-bad">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg">
          Open my portal
        </Button>
        <button type="button" onClick={() => setCode("")} className="-ml-3.5 inline-flex h-11 self-start items-center rounded-full px-3.5 text-sm text-cs-link underline">
          Send a new code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="mt-2.5 flex flex-col gap-[18px]" noValidate>
      <div>
        <p className="text-xs font-semibold tracking-[2.5px] text-cs-brand uppercase">Client sign in</p>
        <h2 className="mt-2 font-display text-[38px] leading-none text-cs-ink">Welcome home.</h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-cs-ink-2">Enter the mobile number or email your agent has on file. We&apos;ll send you a 6-digit code.</p>
      </div>
      <label htmlFor="contact" className="flex flex-col gap-2 text-sm font-medium">
        Mobile number or email
        <input
          id="contact"
          type="text"
          autoComplete="username"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          placeholder="(512) 555-0123 or you@email.com"
          className={fieldCls}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-cs-bad">
          {error}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="rounded-xl border border-cs-info-line bg-cs-info-bg px-3 py-2 text-sm text-cs-info">
          {info}
        </p>
      ) : null}
      <Button type="submit" size="lg">
        Send my code
      </Button>
      <p className="text-[13px] leading-normal text-cs-ink-2">First time here? Open the link your agent texted you.</p>
    </form>
  );
}
