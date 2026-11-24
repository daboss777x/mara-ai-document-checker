import Link from "next/link";
import { MessageSquareText, Phone } from "lucide-react";
import { initials } from "@/lib/data/labels";

type HeaderProps = { token: string; clientName: string; agentName: string; agentPhone: string | null };

const avatar = "inline-flex flex-none items-center justify-center rounded-full bg-cs-ink font-semibold text-white";
const pill = "inline-flex h-11 items-center gap-2 rounded-full border border-cs-line bg-white/85 px-3.5 text-sm font-medium";

/** Glass header: brand on the left, the agent's call/text shortcuts on the right. One screen family, no nav tabs. */
export function ClientHeader({ token, clientName, agentName, agentPhone }: HeaderProps) {
  const tel = agentPhone?.replace(/[^\d+]/g, "");
  const agentFirst = agentName.split(" ")[0] ?? agentName;
  return (
    <header className="cs-glass mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 rounded-full pr-1.5 pl-5 min-[900px]:h-16 min-[900px]:pr-3 min-[900px]:pl-[26px]">
      <Link href={`/c/${encodeURIComponent(token)}`} className="flex items-baseline gap-2.5 rounded-full">
        <span className="font-display text-[22px] leading-none min-[900px]:text-[25px]">Cedar &amp; Stone</span>
        <span className="hidden text-[11px] tracking-[3px] text-cs-ink-2 uppercase min-[900px]:inline">Realty</span>
      </Link>
      <div className="flex items-center gap-2">
        {tel ? (
          <>
            <a href={`tel:${tel}`} className={pill} aria-label={`Call ${agentFirst}`}>
              <Phone className="size-4" aria-hidden="true" />
              <span className="max-[599px]:sr-only">Call {agentFirst}</span>
            </a>
            <a href={`sms:${tel}`} className={pill} aria-label={`Text ${agentFirst}`}>
              <MessageSquareText className="size-4" aria-hidden="true" />
              <span className="max-[599px]:sr-only">Text</span>
            </a>
          </>
        ) : (
          <span className="px-3 text-sm text-cs-ink-2">Your agent: {agentName}</span>
        )}
        <span className={`${avatar} hidden size-10 text-sm min-[900px]:inline-flex`} aria-label={`Signed in as ${clientName}`} role="img">
          {initials(clientName)}
        </span>
      </div>
    </header>
  );
}
