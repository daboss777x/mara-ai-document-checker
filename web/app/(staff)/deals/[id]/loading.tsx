import { Panel, Skeleton } from "@/components/cs";

export default function DealLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <Skeleton className="h-11 w-28 rounded-full opacity-60" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48 opacity-60" />
        <Skeleton className="h-12 w-96 max-w-full opacity-60" />
      </div>
      <Skeleton className="h-16 w-full rounded-[18px] opacity-60" />
      <Panel padded={false}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-cs-ink/10 px-6 py-4 last:border-0">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-7 w-24 rounded-full" />
          </div>
        ))}
      </Panel>
    </div>
  );
}
