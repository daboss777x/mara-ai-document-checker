import { Panel, Skeleton } from "@/components/cs";

export default function StaffLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40 bg-white/40" />
        <Skeleton className="h-12 w-72 max-w-full" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Panel key={i} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </Panel>
        ))}
      </div>
    </div>
  );
}
