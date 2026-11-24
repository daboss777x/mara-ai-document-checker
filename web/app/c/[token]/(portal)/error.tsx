"use client";

import { Button, EmptyState, Panel } from "@/components/cs";
import { CloudOff } from "lucide-react";

/** Unexpected error on a client screen. Keeps the shell (nav, banner) and offers a retry. */
export default function ClientError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[640px]">
      <Panel>
        <EmptyState
          tone="error"
          icon={<CloudOff />}
          title="Mara is catching up"
          description="This page didn't load. Your uploads are safe. Try again in a moment."
          action={
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
          }
        />
      </Panel>
    </div>
  );
}
