/**
 * The data layer every screen calls: `import { listReviewQueue, getClientChecklist } from "@/lib/data"`.
 * Server-only. Each function returns a view model from `@/lib/view-models` (reads: Result<VM>,
 * mutations: MutationResult) and picks demo fixtures (MARA_DEMO=1) or Supabase / Mara (live).
 */
export * from "@/lib/data/staff";
export * from "@/lib/data/client";
export type { Result } from "@/lib/data/result";
