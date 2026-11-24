import { StatusChip } from "@/components/cs";

/** "2 blockers" / "1 warning" chips for queue rows; a quiet "Clean" chip when Mara found nothing. */
export function FindingCounts({ blockers, warnings }: { blockers: number; warnings: number }) {
  if (!blockers && !warnings) return <StatusChip tone="done">No findings</StatusChip>;
  return (
    <>
      {blockers ? <StatusChip tone="block">{blockers === 1 ? "1 blocker" : `${blockers} blockers`}</StatusChip> : null}
      {warnings ? <StatusChip tone="fix">{warnings === 1 ? "1 warning" : `${warnings} warnings`}</StatusChip> : null}
    </>
  );
}
