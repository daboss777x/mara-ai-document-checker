"use client";

import { CloudOff } from "lucide-react";
import { Button, EmptyState, Panel } from "@/components/cs";

export default function StaffError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel>
      <EmptyState
        tone="error"
        icon={<CloudOff />}
        title="This page couldn't load"
        description="Something went wrong on our side. Try again; if it keeps happening, tell your broker."
        action={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </Panel>
  );
}
