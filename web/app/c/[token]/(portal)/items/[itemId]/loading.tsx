import { ScreenSkeleton } from "@/components/client/states";

export default function Loading() {
  return (
    <div className="max-w-[760px]">
      <ScreenSkeleton />
    </div>
  );
}
