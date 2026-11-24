import { Skeleton } from "@/components/cs";
import { DealsListSkeleton } from "@/components/deals/deals-list";

export default function DealsLoading() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32 opacity-60" />
        <Skeleton className="h-12 w-80 max-w-full opacity-60" />
      </div>
      <Skeleton className="h-12 w-[360px] max-w-full rounded-full opacity-60" />
      <DealsListSkeleton />
    </>
  );
}
