"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button, Panel } from "@/components/cs";
import { createDealAction } from "@/app/(staff)/actions";
import { toE164US } from "@/components/review/logic";
import { useActionToast } from "@/components/staff/action-toast";
import { cn } from "@/lib/utils";
import { newDealInputSchema, type NewDealFormVM } from "@/lib/view-models";

const inputClass =
  "h-12 w-full rounded-2xl border bg-white px-4 text-[15px] text-cs-ink placeholder:text-[#7a89a8] focus:border-cs-brand focus:shadow-[0_0_0_4px_rgba(25,81,252,0.15)] focus:outline-none";

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (p: { id: string; describedBy: string | undefined; invalid: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-cs-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-cs-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-[13px] font-medium text-cs-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** One-page new-deal form. Validated with the shared Zod schema here (for field errors) and again on the server. */
export function NewDealForm({ form }: { form: NewDealFormVM }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { show, node } = useActionToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [types, setTypes] = useState<string[]>(() => form.documentTypes.filter((t) => t.defaultOn).map((t) => t.key));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    const input = {
      address: get("address"),
      city: get("city"),
      zip: get("zip"),
      clientName: get("clientName"),
      clientPhone: toE164US(get("clientPhone")),
      clientEmail: get("clientEmail"),
      smsConsent: consent,
      documentTypeKeys: types,
      dueDate: get("dueDate"),
    };
    const parsed = newDealInputSchema.safeParse(input);
    const next: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
    if (!consent) next.smsConsent = "Tick the box to confirm the client agreed to texts.";
    setErrors(next);
    if (Object.keys(next).length) {
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"], #sms-consent[aria-invalid="true"]');
      first?.focus();
      return;
    }
    start(async () => {
      const r = await createDealAction(input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        show({ ok: false, message: r.message ?? "Please fix the highlighted fields.", demo: false });
        return;
      }
      show({ ok: true, message: r.message, demo: r.demo });
      router.push(`/deals/${r.dealId}`);
    });
  }

  const err = (k: string) => errors[k];
  const cls = (invalid: boolean) => cn(inputClass, invalid ? "border-cs-bad" : "border-cs-line");

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-5">
      <Panel className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Property</h2>
        <Field label="Street address" error={err("address")}>
          {({ id, describedBy, invalid }) => (
            <input id={id} name="address" autoComplete="street-address" aria-invalid={invalid} aria-describedby={describedBy} className={cls(invalid)} placeholder="1208 Barton Hills Dr" />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="City" error={err("city")}>
            {({ id, describedBy, invalid }) => (
              <input id={id} name="city" autoComplete="address-level2" aria-invalid={invalid} aria-describedby={describedBy} className={cls(invalid)} placeholder="Austin" />
            )}
          </Field>
          <Field label="ZIP" error={err("zip")}>
            {({ id, describedBy, invalid }) => (
              <input id={id} name="zip" inputMode="numeric" maxLength={5} autoComplete="postal-code" aria-invalid={invalid} aria-describedby={describedBy} className={cls(invalid)} placeholder="78704" />
            )}
          </Field>
        </div>
      </Panel>

      <Panel className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Client</h2>
        <Field label="Name" error={err("clientName")}>
          {({ id, describedBy, invalid }) => (
            <input id={id} name="clientName" autoComplete="off" aria-invalid={invalid} aria-describedby={describedBy} className={cls(invalid)} placeholder="Enoch Omunu" />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile phone" hint="Mara texts the client a secure link here." error={err("clientPhone")}>
            {({ id, describedBy, invalid }) => (
              <input id={id} name="clientPhone" type="tel" inputMode="tel" autoComplete="off" aria-invalid={invalid} aria-describedby={describedBy} className={cls(invalid)} placeholder="(512) 555-0142" />
            )}
          </Field>
          <Field label="Email (optional)" error={err("clientEmail")}>
            {({ id, describedBy, invalid }) => (
              <input id={id} name="clientEmail" type="email" autoComplete="off" aria-invalid={invalid} aria-describedby={describedBy} className={cls(invalid)} placeholder="name@example.com" />
            )}
          </Field>
        </div>
        <div className={cn("flex items-start gap-3 rounded-2xl border p-3.5", err("smsConsent") ? "border-cs-bad bg-cs-bad-bg" : "border-cs-info-line bg-cs-info-bg")}>
          <input
            id="sms-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={Boolean(err("smsConsent"))}
            aria-describedby="sms-consent-text"
            className="mt-0.5 size-6 flex-none accent-[var(--color-cs-brand)]"
          />
          <div className="min-w-0">
            <label htmlFor="sms-consent" id="sms-consent-text" className="block text-sm leading-relaxed text-cs-ink">
              {form.consentWording}
            </label>
            {err("smsConsent") ? (
              <p role="alert" className="mt-1 text-[13px] font-medium text-cs-bad">
                {err("smsConsent")}
              </p>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Documents to collect</h2>
        <fieldset className="flex flex-col gap-2" aria-describedby={err("documentTypeKeys") ? "types-err" : undefined}>
          <legend className="sr-only">Documents to collect</legend>
          {form.documentTypes.map((t) => {
            const on = types.includes(t.key);
            return (
              <label key={t.key} className={cn("flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors", on ? "border-cs-info-line bg-cs-info-bg" : "border-cs-line bg-white/80 hover:bg-white")}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setTypes((cur) => (e.target.checked ? [...cur, t.key] : cur.filter((k) => k !== t.key)))}
                  className="mt-0.5 size-5 flex-none accent-[var(--color-cs-brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold">{t.name}</span>
                  {t.description ? <span className="block text-[13px] text-cs-ink-2">{t.description}</span> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        {err("documentTypeKeys") ? (
          <p id="types-err" role="alert" className="text-[13px] font-medium text-cs-bad">
            {err("documentTypeKeys")}
          </p>
        ) : null}
        <Field label="Due date (optional)" hint="Shown to the client on each item." error={err("dueDate")} className="sm:max-w-xs">
          {({ id, describedBy, invalid }) => <input id={id} name="dueDate" type="date" aria-invalid={invalid} aria-describedby={describedBy} className={cls(invalid)} />}
        </Field>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={pending} icon={<Send />}>
          Create deal and text the client
        </Button>
        <Button type="button" variant="secondary" size="lg" disabled={pending} onClick={() => router.push("/deals")}>
          Cancel
        </Button>
      </div>
      {node}
    </form>
  );
}
