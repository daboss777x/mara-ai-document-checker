"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/cs";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

const fieldCls =
  "h-[54px] w-full rounded-2xl border border-cs-line bg-white/92 px-[18px] text-base text-cs-ink placeholder:text-[#5b6d93] focus:border-cs-brand focus:shadow-[0_0_0_4px_rgba(25,81,252,0.15)] focus:outline-none";

/** Agent sign in: email + password, or a magic link. Uses the Supabase server actions (demo: straight to /review). */
export function AgentSignIn({
  next,
  demo,
  notice,
  onEnter,
  onError,
}: {
  next: string;
  demo: boolean;
  notice?: string;
  onEnter: () => void;
  onError: () => void;
}) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, initial);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLink, initial);
  const state = mode === "password" ? pwState : mlState;
  const pending = mode === "password" ? pwPending : mlPending;

  // Password sign-in redirects on success; show the "Opening your portal" overlay meanwhile.
  useEffect(() => {
    if (pwPending) onEnter();
  }, [pwPending, onEnter]);
  useEffect(() => {
    if (pwState.status === "error") onError();
  }, [pwState, onError]);

  const message = state.status !== "idle" ? state.message : notice;
  const isError = state.status === "error" || (state.status === "idle" && Boolean(notice));

  return (
    <form action={mode === "password" ? pwAction : mlAction} className="mt-2.5 flex flex-col gap-[18px]" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <p className="text-xs font-semibold tracking-[2.5px] text-cs-brand uppercase">Agent sign in</p>
        <h2 className="mt-2 font-display text-[38px] leading-none text-cs-ink">Good to see you.</h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-cs-ink-2">
          {demo ? "Demo: any email and password will do. You'll sign in as Rachel Kim." : "Mara has your documents ready to review."}
        </p>
      </div>
      <label htmlFor="aemail" className="flex flex-col gap-2 text-sm font-medium">
        Work email
        <input id="aemail" name="email" type="email" autoComplete="email" required placeholder="you@cedarstone.com" className={fieldCls} />
      </label>
      {mode === "password" ? (
        <label htmlFor="apass" className="flex flex-col gap-2 text-sm font-medium">
          Password
          <input id="apass" name="password" type="password" autoComplete="current-password" required placeholder="Your password" className={fieldCls} />
        </label>
      ) : null}

      {message ? (
        <p
          role={isError ? "alert" : "status"}
          className={isError ? "rounded-xl border border-cs-bad-line bg-cs-bad-bg px-3 py-2 text-sm text-cs-bad" : "rounded-xl border border-cs-info-line bg-cs-info-bg px-3 py-2 text-sm text-cs-info"}
        >
          {message}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending}>
        {mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </Button>
      <div className={demo ? "hidden" : "flex flex-wrap justify-between gap-3"}>
        <button
          type="button"
          onClick={() => setMode(mode === "password" ? "magic" : "password")}
          className="inline-flex min-h-11 items-center text-sm text-cs-link underline"
        >
          {mode === "password" ? "Email me a sign-in link" : "Use my password instead"}
        </button>
      </div>
    </form>
  );
}
