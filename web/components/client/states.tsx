import { CloudOff, LinkIcon } from "lucide-react";
import { EmptyState, Panel, Skeleton } from "@/components/cs";
import { RetryButton } from "./retry-button";

/** Unknown, revoked or expired personal link. */
export function LinkExpired() {
  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pt-16 pb-[300px] min-[900px]:pt-24">
      <div>
        <p className="text-[11px] font-semibold tracking-[3px] uppercase cs-sky-text">Cedar &amp; Stone Realty</p>
        <h1 className="mt-2 font-display text-[42px] leading-[1.02] cs-sky-text">This link has expired</h1>
      </div>
      <Panel>
        <EmptyState
          icon={<LinkIcon />}
          title="Ask your agent for a new link"
          description="For your safety, personal links stop working after a while. Your agent can text or email you a fresh one. Your documents are safe."
        />
      </Panel>
    </main>
  );
}

/** Load failure with a retry. `message` comes from the data layer and is safe to show. */
export function LoadError({ message, title = "We couldn't load this page" }: { message?: string; title?: string }) {
  return (
    <Panel>
      <EmptyState
        tone="error"
        icon={<CloudOff />}
        title={title}
        description={`${message ?? "Something went wrong on our side."} Your uploads are safe.`}
        action={<RetryButton />}
      />
    </Panel>
  );
}

/** Skeleton used by every client route's loading.tsx. */
export function ScreenSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-48 rounded-full opacity-70" />
      <Skeleton className="h-11 w-4/5 rounded-2xl opacity-70" />
      <Panel className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32 rounded-full" />
        <Skeleton className="h-2 w-full rounded-full" />
      </Panel>
      {Array.from({ length: 3 }, (_, i) => (
        <Panel key={i} className="flex flex-col gap-2.5">
          <Skeleton className="h-5 w-1/2 rounded-full" />
          <Skeleton className="h-4 w-3/4 rounded-full" />
          <Skeleton className="h-11 w-full rounded-full" />
        </Panel>
      ))}
    </div>
  );
}
