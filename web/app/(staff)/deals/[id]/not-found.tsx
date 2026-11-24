import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClasses, EmptyState, Panel } from "@/components/cs";

export default function DealNotFound() {
  return (
    <Panel>
      <EmptyState
        icon={<SearchX />}
        title="Deal not found"
        description="It may not exist, or you may not be on this deal."
        action={
          <Link href="/deals" className={buttonClasses("secondary")}>
            Back to deals
          </Link>
        }
      />
    </Panel>
  );
}
