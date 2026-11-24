import "server-only";
import { z } from "zod";
import { isDemoMode } from "@/lib/env";
import { ok, type Result } from "@/lib/data/result";
import * as demo from "@/lib/demo/queries";
import * as demoMut from "@/lib/demo/mutations";
import * as live from "@/lib/data/live/staff";
import {
  newDealInputSchema,
  type CreateDealResult,
  type DataMode,
  type DealPageVM,
  type DealsListVM,
  type MutationResult,
  type NewDealFormVM,
  type ReviewItemVM,
  type ReviewQueueVM,
  type StaffSession,
} from "@/lib/view-models";

/**
 * Staff-area data functions (docs/CONTRACTS.md §5). Every screen calls these, never fixtures or
 * Supabase directly. Demo mode (MARA_DEMO=1) → in-memory fixtures; otherwise Supabase with the
 * user's session (RLS).
 */

// Seeded ids are UUIDs, demo ids are slugs: accept any short opaque string, never interpolate it into SQL.
const idSchema = z.string().min(1).max(100);
const validId = (id: string) => idSchema.safeParse(id).success;

export function dataMode(): DataMode {
  return isDemoMode() ? "demo" : "live";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getStaffSession(): Promise<Result<StaffSession>> {
  return isDemoMode() ? ok(demo.getSession()) : live.getSession();
}

/** Home: items in `review` across my deals, oldest first. */
export async function listReviewQueue(): Promise<Result<ReviewQueueVM>> {
  return isDemoMode() ? ok(demo.listReviewQueue()) : live.listReviewQueue();
}

/** HITL screen. `null` = not found or hidden by RLS (render notFound()). */
export async function getReviewItem(itemId: string): Promise<Result<ReviewItemVM | null>> {
  if (!validId(itemId)) return ok(null);
  return isDemoMode() ? ok(demo.getReviewItem(itemId)) : live.getReviewItem(itemId);
}

/** Deals list; `q` searches address, client, deal number. */
export async function listDeals(q?: string): Promise<Result<DealsListVM>> {
  const query = typeof q === "string" ? q.trim().slice(0, 100) : undefined;
  return isDemoMode() ? ok(demo.listDeals(query)) : live.listDeals(query);
}

/** Deal page. `null` = not found or hidden by RLS. */
export async function getDeal(id: string): Promise<Result<DealPageVM | null>> {
  if (!validId(id)) return ok(null);
  return isDemoMode() ? ok(demo.getDeal(id)) : live.getDeal(id);
}

export async function getNewDealForm(): Promise<Result<NewDealFormVM>> {
  return isDemoMode() ? ok(demo.getNewDealForm()) : live.getNewDealForm();
}

/**
 * Short-lived link to view a filed document: a 60-second signed URL created server-side.
 * Demo: the bundled sample PDF. `null` = not found, hidden by RLS, or not filed yet.
 */
export async function getDocumentFileUrl(dealId: string, docId: string): Promise<Result<{ url: string } | null>> {
  if (!validId(dealId) || !validId(docId)) return ok(null);
  return isDemoMode() ? ok(demo.getDocumentFileUrl(dealId, docId)) : live.getDocumentFileUrl(dealId, docId);
}

// ---------------------------------------------------------------------------
// Mutations. Inputs are untrusted (server actions pass form data through): validate here.
// ---------------------------------------------------------------------------
const invalid = <T = undefined>(error = "That request wasn't valid."): MutationResult<T> => ({ ok: false, mode: dataMode(), error });

const fixNoteSchema = z.string().trim().min(1, "Write what the client needs to fix.").max(1000, "Keep the fix note under 1000 characters.");

export async function markItemComplete(itemId: string): Promise<MutationResult<undefined>> {
  if (!validId(itemId)) return invalid();
  return isDemoMode() ? demoMut.markItemComplete(itemId) : live.markItemComplete(itemId);
}

/** Creates the approved `fix_request` message and sets `needs_fix` + `fix_note`. */
export async function sendFixRequest(itemId: string, fixNote: string): Promise<MutationResult<undefined>> {
  const note = fixNoteSchema.safeParse(fixNote);
  if (!validId(itemId)) return invalid();
  if (!note.success) return invalid(note.error.issues[0]?.message);
  return isDemoMode() ? demoMut.sendFixRequest(itemId, note.data) : live.sendFixRequest(itemId, note.data);
}

export async function dismissFinding(findingId: string): Promise<MutationResult<undefined>> {
  if (!validId(findingId)) return invalid();
  return isDemoMode() ? demoMut.dismissFinding(findingId) : live.dismissFinding(findingId);
}

export async function waiveItem(itemId: string): Promise<MutationResult<undefined>> {
  if (!validId(itemId)) return invalid();
  return isDemoMode() ? demoMut.waiveItem(itemId) : live.waiveItem(itemId);
}

export async function reopenItem(itemId: string): Promise<MutationResult<undefined>> {
  if (!validId(itemId)) return invalid();
  return isDemoMode() ? demoMut.reopenItem(itemId) : live.reopenItem(itemId);
}

export async function setDealReminders(dealId: string, on: boolean): Promise<MutationResult<undefined>> {
  if (!validId(dealId) || typeof on !== "boolean") return invalid();
  return isDemoMode() ? demoMut.setDealReminders(dealId, on) : live.setDealReminders(dealId, on);
}

/** Live: mints a fresh client link (the old one stops working) and queues the invite SMS. */
export async function resendInvite(dealId: string): Promise<MutationResult<undefined>> {
  if (!validId(dealId)) return invalid();
  return isDemoMode() ? demoMut.resendInvite(dealId) : live.resendInvite(dealId);
}

/** "Copy client link": live retires the old link and returns a fresh URL once; demo returns the fixed demo link. */
export async function regenerateClientLink(dealId: string): Promise<MutationResult<{ url: string }>> {
  if (!validId(dealId)) return invalid();
  return isDemoMode() ? demoMut.regenerateClientLink(dealId) : live.regenerateClientLink(dealId);
}

/** Input is `unknown` on purpose: server actions hand over raw form data. Zod decides. */
export async function createDeal(input: unknown): Promise<MutationResult<CreateDealResult>> {
  const parsed = newDealInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  return isDemoMode() ? demoMut.createDeal(parsed.data) : live.createDeal(parsed.data);
}
