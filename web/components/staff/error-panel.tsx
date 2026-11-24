import Link from "next/link";
import { CloudOff } from "lucide-react";
import { buttonClasses, EmptyState, Panel } from "@/components/cs";

/** Inline error for a failed data read. `retryHref` reloads the same view. */
export function ErrorPanel({
  title = "This didn't load",
  message,
  retryHref,
  className,
}: {
  title?: string;
  message?: string;
  retryHref?: string;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <EmptyState
        tone="error"
        icon={<CloudOff />}
        title={title}
        description={message ?? "Something went wrong on our side. Try again; if it keeps happening, tell your broker."}
        action={
          retryHref ? (
            <Link href={retryHref} className={buttonClasses("secondary")}>
              Try again
            </Link>
          ) : undefined
        }
      />
    </Panel>
  );
}
