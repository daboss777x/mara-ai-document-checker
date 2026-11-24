import { Panel } from "@/components/cs";
import { LinkExpired, LoadError } from "@/components/client/states";
import { VerifyForm } from "@/components/client/verify-form";
import { getClientPortal, getClientVerify } from "@/lib/data";

export const metadata = { title: "Verify it's you" };

/** Verify (first open of a personal link). On success Mara issues a 30-day device session cookie. */
export default async function ClientVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [res, portal] = await Promise.all([getClientVerify(token), getClientPortal(token)]);
  if (res.ok && !res.data) return <LinkExpired />;
  if (!res.ok) {
    return (
      <main className="mx-auto w-full max-w-[520px] px-4 pt-10 pb-10">
        <LoadError message={res.error} />
      </main>
    );
  }
  const vm = res.data!;
  if (vm.state === "expired") return <LinkExpired />;
  const p = portal.ok ? portal.data : null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[480px] flex-col gap-6 px-4 pt-6 pb-10 min-[900px]:justify-center min-[900px]:pt-10">
      <div className="cs-glass flex h-14 items-center rounded-full px-5">
        <span className="font-display text-[22px] leading-none">Cedar &amp; Stone</span>
        <span className="ml-2.5 text-[11px] tracking-[3px] text-cs-ink-2 uppercase">Realty</span>
      </div>
      <div>
        <h1 className="font-display text-[42px] leading-[1.02] cs-sky-text min-[900px]:text-[52px]">Hi {vm.firstName}</h1>
        <p className="mt-2 text-[16px] font-medium cs-sky-text">
          For your security, enter the 6-digit code we just texted to {vm.phoneMasked}.
        </p>
      </div>
      <Panel>
        <VerifyForm token={token} vm={vm} mode={p?.mode ?? "live"} agentPhone={p?.agent.phone ?? null} />
      </Panel>
    </main>
  );
}
