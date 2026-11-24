import { Panel, Skeleton } from "@/components/cs";

export default function ReviewItemLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-4 w-56 opacity-60" />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,1fr)]">
        <Panel padded={false}>
          <Skeleton className="h-[62svh] w-full rounded-[22px] lg:h-[calc(100svh-210px)]" />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-3">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-10 w-72 max-w-full" />
          </Panel>
          <Panel className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </Panel>
          <Panel className="flex flex-col gap-2.5">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </Panel>
          <Panel>
            <Skeleton className="h-32 w-full rounded-2xl" />
          </Panel>
        </div>
      </div>
    </div>
  );
}
