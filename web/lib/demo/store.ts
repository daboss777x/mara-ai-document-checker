import "server-only";
import { createDemoState, type DemoState } from "@/lib/demo/fixtures";

/**
 * One in-memory demo state per server process (kept on globalThis so dev hot reloads don't
 * reset it). Demo mutations change only this; nothing is persisted or sent anywhere.
 */
const KEY = Symbol.for("mara.demoState.lean");
type G = typeof globalThis & { [KEY]?: DemoState };

export function demoState(): DemoState {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = createDemoState();
  return g[KEY];
}

/** Back to the fixtures (tests; a future "Reset demo" button). */
export function resetDemoState(): void {
  (globalThis as G)[KEY] = createDemoState();
}

export function nextDemoId(prefix: string): string {
  const s = demoState();
  s.seq += 1;
  return `${prefix}-demo-${s.seq}`;
}

/** Real "now" for events that happen while the demo runs. */
export const nowIso = (): string => new Date().toISOString();
