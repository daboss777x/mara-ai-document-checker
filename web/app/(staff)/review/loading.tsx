import { Skeleton } from "@/components/cs";
import { ReviewQueueSkeleton } from "@/components/review/review-queue";

export default function ReviewLoading() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40 opacity-60" />
        <Skeleton className="h-12 w-80 max-w-full opacity-60" />
      </div>
      <ReviewQueueSkeleton />
    </>
  );
}
