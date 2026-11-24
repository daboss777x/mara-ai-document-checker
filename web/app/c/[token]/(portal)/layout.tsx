import { redirect } from "next/navigation";
import { ClientHeader } from "@/components/client/client-nav";
import { LinkExpired, LoadError } from "@/components/client/states";
import { getClientPortal, VERIFY_REQUIRED } from "@/lib/data";

/** Shell for the checklist and item pages: header + content. Verify sits outside it. */
export default async function ClientPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const res = await getClientPortal(token);
  if (res.ok && !res.data) return <LinkExpired />;
  if (!res.ok && res.error === VERIFY_REQUIRED) redirect(`/c/${encodeURIComponent(token)}/verify`);
  if (!res.ok) {
    return (
      <main className="mx-auto w-full max-w-[640px] px-4 pt-10 pb-10">
        <LoadError message={res.error} />
      </main>
    );
  }
  const p = res.data!;
  if (p.needsVerification) redirect(`/c/${encodeURIComponent(token)}/verify`);

  return (
    <div className="min-h-svh px-4 pt-4 pb-10 min-[900px]:px-6 min-[900px]:pt-5">
      <ClientHeader token={p.token} clientName={p.client.name} agentName={p.agent.name} agentPhone={p.agent.phone} />
      <main id="main" className="mx-auto mt-4 w-full max-w-[1200px] min-[900px]:mt-9">
        {children}
      </main>
    </div>
  );
}
