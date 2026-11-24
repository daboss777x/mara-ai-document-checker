"use server";

import { revalidatePath } from "next/cache";
import { confirmClientUpload, createClientUpload, sendVerifyCode, setClientSmsOptOut, verifyClientCode } from "@/lib/data";

/**
 * Client portal server actions. Thin wrappers: every input is re-validated (Zod) in
 * `@/lib/data/client`, which picks demo or live. In demo mode nothing calls Mara or a provider.
 * The device session after verify is an httpOnly cookie set inside `verifyClientCode`.
 */

const refresh = (token: string) => revalidatePath(`/c/${encodeURIComponent(token)}`, "layout");

export async function verifyCodeAction(token: string, code: string) {
  const r = await verifyClientCode(token, code);
  if (r.ok) refresh(token);
  return r;
}

export async function sendVerifyCodeAction(token: string) {
  return sendVerifyCode(token);
}

/** Step 1: ask for an upload slot. The browser then PUTs the bytes to the returned URL. */
export async function createUploadAction(token: string, itemId: string, file: { filename: string; sizeBytes: number; mime: string }) {
  return createClientUpload(token, itemId, file);
}

/** Step 2: the bytes are in storage. */
export async function confirmUploadAction(token: string, documentId: string) {
  const r = await confirmClientUpload(token, documentId);
  if (r.ok) refresh(token);
  return r;
}

export async function setSmsOptOutAction(token: string, optOut: boolean) {
  const r = await setClientSmsOptOut(token, optOut);
  if (r.ok) refresh(token);
  return r;
}
