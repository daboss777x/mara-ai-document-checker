import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClasses, EmptyState, Panel } from "@/components/cs";

export default function ReviewItemNotFound() {
  return (
    <Panel>
      <EmptyState
        icon={<SearchX />}
        title="Item not found"
        description="It may not exist, or it isn't on one of your deals."
        action={
          <Link href="/review" className={buttonClasses("secondary")}>
            Back to review
          </Link>
        }
      />
    </Panel>
  );
}
