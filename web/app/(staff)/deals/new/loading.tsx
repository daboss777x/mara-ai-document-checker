import { Panel, Skeleton } from "@/components/cs";

export default function NewDealLoading() {
  return (
    <div className="flex max-w-3xl flex-col gap-5" aria-busy="true">
      <Skeleton className="h-12 w-72 max-w-full opacity-60" />
      {[0, 1, 2].map((i) => (
        <Panel key={i} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </Panel>
      ))}
    </div>
  );
}
