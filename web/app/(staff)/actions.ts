"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createDeal,
  dismissFinding,
  markItemComplete,
  regenerateClientLink,
  reopenItem,
  resendInvite,
  sendFixRequest,
  setDealReminders,
  waiveItem,
} from "@/lib/data";
import { newDealInputSchema, type MutationResult } from "@/lib/view-models";

/** What a staff action tells the UI (toast). `demo` → nothing left the system. */
export type StaffActionResult = { ok: boolean; message: string; demo: boolean };

const INVALID: StaffActionResult = { ok: false, message: "That request wasn't valid.", demo: false };

function toResult<T>(r: MutationResult<T>): StaffActionResult {
  return r.ok ? { ok: true, message: r.message, demo: r.mode === "demo" } : { ok: false, message: r.error, demo: r.mode === "demo" };
}

function refresh(dealId?: string) {
  revalidatePath("/review", "layout");
  revalidatePath("/deals", "layout");
  if (dealId) revalidatePath(`/deals/${encodeURIComponent(dealId)}`);
}

const idSchema = z.string().min(1).max(100);

export async function markCompleteAction(itemId: unknown): Promise<StaffActionResult> {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return INVALID;
  const r = await markItemComplete(id.data);
  refresh();
  return toResult(r);
}

const fixNoteSchema = z.string().trim().min(1, "Write a short note for the client.").max(1000, "Keep the note under 1,000 characters.");

export async function sendFixRequestAction(itemId: unknown, fixNote: unknown): Promise<StaffActionResult> {
  const id = idSchema.safeParse(itemId);
  const note = fixNoteSchema.safeParse(fixNote);
  if (!id.success) return INVALID;
  if (!note.success) return { ok: false, message: note.error.issues[0]?.message ?? INVALID.message, demo: false };
  const r = await sendFixRequest(id.data, note.data);
  refresh();
  return toResult(r);
}

export async function dismissFindingAction(findingId: unknown): Promise<StaffActionResult> {
  const id = idSchema.safeParse(findingId);
  if (!id.success) return INVALID;
  const r = await dismissFinding(id.data);
  refresh();
  return toResult(r);
}

const checklistActionSchema = z.enum(["waive", "reopen"]);

/** Deal page → Waive / Reopen on a checklist row. */
export async function checklistItemAction(dealId: unknown, itemId: unknown, action: unknown): Promise<StaffActionResult> {
  const d = idSchema.safeParse(dealId);
  const i = idSchema.safeParse(itemId);
  const a = checklistActionSchema.safeParse(action);
  if (!d.success || !i.success || !a.success) return INVALID;
  const r = a.data === "waive" ? await waiveItem(i.data) : await reopenItem(i.data);
  refresh(d.data);
  return toResult(r);
}

export async function setRemindersAction(dealId: unknown, on: unknown): Promise<StaffActionResult> {
  const d = idSchema.safeParse(dealId);
  const o = z.boolean().safeParse(on);
  if (!d.success || !o.success) return INVALID;
  const r = await setDealReminders(d.data, o.data);
  refresh(d.data);
  return toResult(r);
}

export async function resendInviteAction(dealId: unknown): Promise<StaffActionResult> {
  const d = idSchema.safeParse(dealId);
  if (!d.success) return INVALID;
  const r = await resendInvite(d.data);
  refresh(d.data);
  return toResult(r);
}

/** "New client link": retires the old link and returns a fresh URL once (no SMS needed). */
export async function newClientLinkAction(dealId: unknown): Promise<StaffActionResult & { url?: string }> {
  const d = idSchema.safeParse(dealId);
  if (!d.success) return INVALID;
  const r = await regenerateClientLink(d.data);
  refresh(d.data);
  return { ...toResult(r), url: r.ok ? r.data.url : undefined };
}

export type CreateDealState =
  | { ok: false; message?: string; fieldErrors?: Record<string, string> }
  | { ok: true; dealId: string; message: string; demo: boolean };

/** New deal form → validates with the shared Zod schema, then creates deal + items + client link + invite. */
export async function createDealAction(input: unknown): Promise<CreateDealState> {
  const parsed = newDealInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  if (!parsed.data.smsConsent) {
    return { ok: false, fieldErrors: { smsConsent: "Tick the box to confirm the client agreed to texts." } };
  }
  const r = await createDeal(parsed.data);
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, dealId: r.data.dealId, message: r.message, demo: r.mode === "demo" };
}
