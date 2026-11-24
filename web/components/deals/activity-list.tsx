import { Panel } from "@/components/cs";
import { formatWhen } from "@/components/review/logic";
import type { ActivityEntry } from "@/lib/view-models";

/** Audit trail for the deal, newest first. */
export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Panel className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Activity</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-cs-ink-2">Nothing has happened on this deal yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-cs-ink/10">
          {entries.map((a) => (
            <li key={a.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
              <time dateTime={a.at} className="w-36 flex-none text-xs text-cs-ink-3">
                {formatWhen(a.at)}
              </time>
              <p className="min-w-0 text-sm text-cs-ink">
                {a.text.startsWith(a.actorLabel) ? (
                  <>
                    <strong className="font-semibold">{a.actorLabel}</strong>
                    {a.text.slice(a.actorLabel.length)}
                  </>
                ) : (
                  <>
                    <strong className="font-semibold">{a.actorLabel}</strong> {a.text}
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
