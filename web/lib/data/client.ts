import "server-only";
import { z } from "zod";
import { isDemoMode } from "@/lib/env";
import { ok, type Result } from "@/lib/data/result";
import * as demo from "@/lib/demo/queries";
import * as demoMut from "@/lib/demo/mutations";
import * as live from "@/lib/data/live/client";
import {
  clientUploadInputSchema,
  type ClientChecklistVM,
  type ClientItemVM,
  type ClientPortalVM,
  type ClientUploadTarget,
  type ClientVerifyResult,
  type ClientVerifyVM,
  type MutationResult,
} from "@/lib/view-models";

/**
 * Client portal (/c/[token]) data functions. `null` = unknown/expired token (render the
 * expired-link state). Demo: tokens `demo` (Enoch), `demo-marcus`, `demo-dana`, plus any link
 * created by `createDeal`. Live: every call goes to Mara `/client/{action}` (HMAC), the device
 * session is an httpOnly cookie set by `verifyClientCode`.
 *
 * Read errors: `VERIFY_REQUIRED` means "send the client to /c/{token}/verify".
 */
export { VERIFY_REQUIRED, LINK_EXPIRED } from "@/lib/data/live/client";

const tokenSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
const idSchema = z.string().min(1).max(100);
const validToken = (t: string) => tokenSchema.safeParse(t).success;
const validId = (x: string) => idSchema.safeParse(x).success;

const invalid = <T = undefined>(error = "That request wasn't valid."): MutationResult<T> => ({ ok: false, mode: isDemoMode() ? "demo" : "live", error });

export async function getClientPortal(token: string): Promise<Result<ClientPortalVM | null>> {
  if (!validToken(token)) return ok(null);
  return isDemoMode() ? ok(demo.getClientPortal(token)) : live.getClientPortal(token);
}

export async function getClientVerify(token: string): Promise<Result<ClientVerifyVM | null>> {
  if (!validToken(token)) return ok(null);
  return isDemoMode() ? ok(demo.getClientVerify(token)) : live.getClientVerify(token);
}

export async function getClientChecklist(token: string): Promise<Result<ClientChecklistVM | null>> {
  if (!validToken(token)) return ok(null);
  return isDemoMode() ? ok(demo.getClientChecklist(token)) : live.getClientChecklist(token);
}

export async function getClientItem(token: string, itemId: string): Promise<Result<ClientItemVM | null>> {
  if (!validToken(token) || !validId(itemId)) return ok(null);
  return isDemoMode() ? ok(demo.getClientItem(token, itemId)) : live.getClientItem(token, itemId);
}

export async function sendVerifyCode(token: string): Promise<MutationResult<undefined>> {
  if (!validToken(token)) return invalid();
  return isDemoMode() ? demoMut.sendVerifyCode(token) : live.sendVerifyCode(token);
}

export async function verifyClientCode(token: string, code: string): Promise<MutationResult<ClientVerifyResult>> {
  if (!validToken(token) || typeof code !== "string" || code.length > 10) return invalid();
  return isDemoMode() ? demoMut.verifyClientCode(token, code.trim()) : live.verifyClientCode(token, code.trim());
}

/** Step 1 of an upload: the browser then PUTs the bytes to `uploadUrl` (demo: skip the PUT). */
export async function createClientUpload(token: string, itemId: string, file: unknown): Promise<MutationResult<ClientUploadTarget>> {
  const f = clientUploadInputSchema.safeParse(file);
  if (!validToken(token) || !validId(itemId) || !f.success) return invalid("That file couldn't be uploaded.");
  return isDemoMode() ? demoMut.createClientUpload(token, itemId, f.data) : live.createClientUpload(token, itemId, f.data);
}

/** Step 2: the file is in storage. Flips the document to `received`; the item becomes `checking`. */
export async function confirmClientUpload(token: string, documentId: string): Promise<MutationResult<undefined>> {
  if (!validToken(token) || !validId(documentId)) return invalid();
  return isDemoMode() ? demoMut.confirmClientUpload(token, documentId) : live.confirmClientUpload(token, documentId);
}

export async function setClientSmsOptOut(token: string, optOut: boolean): Promise<MutationResult<undefined>> {
  if (!validToken(token) || typeof optOut !== "boolean") return invalid();
  return isDemoMode() ? demoMut.setClientSmsOptOut(token, optOut) : live.setClientSmsOptOut(token, optOut);
}
