import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { fail, ok, type Result } from "@/lib/data/result";
import { callMaraClient, type ClientAction } from "@/lib/mara-client";
import {
  clientChecklistSchema,
  clientItemSchema,
  clientPortalSchema,
  clientUploadTargetSchema,
  clientVerifyResultSchema,
  clientVerifySchema,
  type ClientChecklistVM,
  type ClientItemVM,
  type ClientPortalVM,
  type ClientUploadInput,
  type ClientUploadTarget,
  type ClientVerifyResult,
  type ClientVerifyVM,
  type MutationResult,
} from "@/lib/view-models";

/**
 * Client portal, live mode: every read/write is `POST {MARA}/client/{action}` (HMAC-signed).
 * The device session Mara issues on a correct code lives in an httpOnly cookie scoped to
 * `/c/{token}`, so one browser can hold sessions for several links.
 */
const COOKIE_PREFIX = "mara_cs_";
const SESSION_DAYS = 30;

export const VERIFY_REQUIRED = "verify_required";
export const LINK_EXPIRED = "link_expired";

const cookieName = (token: string) => `${COOKIE_PREFIX}${token}`;

async function readSession(token: string): Promise<string | undefined> {
  return (await cookies()).get(cookieName(token))?.value;
}

async function writeSession(token: string, session: string): Promise<void> {
  (await cookies()).set(cookieName(token), session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/c/${token}`,
    maxAge: SESSION_DAYS * 86_400,
  });
}

type Called = { ok: true; data: unknown } | { ok: false; status: number; error: string };

async function call(action: ClientAction, token: string, extra: Record<string, unknown> = {}, withSession = true): Promise<Called> {
  const session = withSession ? await readSession(token) : undefined;
  return callMaraClient(action, { token, ...(session ? { session } : {}), ...extra });
}

const message = (c: { status: number; error: string }) =>
  c.status === 404 || c.status === 410 ? LINK_EXPIRED : c.status === 401 || c.status === 403 ? VERIFY_REQUIRED : c.error;

/** Call, then parse with the VM schema. 404/410 → `null` (unknown or expired link). */
async function read<S extends z.ZodType>(action: ClientAction, token: string, schema: S, extra: Record<string, unknown> = {}, inject: Record<string, unknown> = {}): Promise<Result<z.infer<S> | null>> {
  const r = await call(action, token, extra);
  if (!r.ok) return r.status === 404 || r.status === 410 ? ok(null) : fail(message(r));
  const parsed = schema.safeParse({ ...(r.data && typeof r.data === "object" ? r.data : {}), ...inject });
  return parsed.success ? ok(parsed.data) : fail("Mara sent something we didn't expect. Try again.");
}

export const getClientPortal = (token: string): Promise<Result<ClientPortalVM | null>> =>
  read("portal", token, clientPortalSchema, {}, { mode: "live", token });

/** Mara's `portal` answer carries the verify fields flat (CONTRACTS §7); name fields are nested. */
const portalAsVerify = z
  .object({
    client: z.object({ firstName: z.string() }),
    agent: z.object({ name: z.string() }),
    phoneMasked: z.string(),
    state: z.enum(["ready", "expired", "locked"]),
    resendAfterSeconds: z.number().int().min(0),
  })
  .transform((p) => ({
    firstName: p.client.firstName,
    agentName: p.agent.name,
    phoneMasked: p.phoneMasked,
    state: p.state,
    resendAfterSeconds: p.resendAfterSeconds,
  }))
  .pipe(clientVerifySchema);

export const getClientVerify = (token: string): Promise<Result<ClientVerifyVM | null>> =>
  read("portal", token, portalAsVerify);

export const getClientChecklist = (token: string): Promise<Result<ClientChecklistVM | null>> =>
  read("checklist", token, clientChecklistSchema);

export const getClientItem = (token: string, itemId: string): Promise<Result<ClientItemVM | null>> =>
  read("item", token, clientItemSchema, { itemId });

const liveOk = <T>(msg: string, data: T): MutationResult<T> => ({ ok: true, mode: "live", message: msg, data });
const liveBad = <T = undefined>(error: string): MutationResult<T> => ({ ok: false, mode: "live", error });

async function act<T>(action: ClientAction, token: string, schema: z.ZodType<T>, msg: string, extra: Record<string, unknown> = {}, withSession = true): Promise<MutationResult<T>> {
  const r = await call(action, token, extra, withSession);
  if (!r.ok) return liveBad(message(r));
  const parsed = schema.safeParse(r.data);
  return parsed.success ? liveOk(msg, parsed.data) : liveBad("Mara sent something we didn't expect. Try again.");
}

/** Actions whose answer carries nothing the page needs. */
const anyBody = z.unknown().transform(() => undefined);

export const sendVerifyCode = (token: string): Promise<MutationResult<undefined>> =>
  act("send_code", token, anyBody, "We texted you a new code.", {}, false);

/** On success Mara returns a session; it goes in an httpOnly cookie and never reaches the page. */
export async function verifyClientCode(token: string, code: string): Promise<MutationResult<ClientVerifyResult>> {
  const r = await call("verify_code", token, { code }, false);
  if (!r.ok) return liveBad(message(r));
  const data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
  const parsed = clientVerifyResultSchema.safeParse(data);
  if (!parsed.success) return liveBad("Mara sent something we didn't expect. Try again.");
  if (parsed.data.verified && typeof data.session === "string") await writeSession(token, data.session);
  return parsed.data.verified ? liveOk("Verified.", parsed.data) : liveBad(`That code didn't match. ${parsed.data.attemptsLeft} tries left.`);
}

export const createClientUpload = (token: string, itemId: string, file: ClientUploadInput): Promise<MutationResult<ClientUploadTarget>> =>
  act("create_upload", token, clientUploadTargetSchema, "Ready to upload.", { itemId, filename: file.filename, sizeBytes: file.sizeBytes, mime: file.mime });

export const confirmClientUpload = (token: string, documentId: string): Promise<MutationResult<undefined>> =>
  act("confirm_upload", token, anyBody, "Got it. Mara is checking it now.", { documentId });

export const setClientSmsOptOut = (token: string, optOut: boolean): Promise<MutationResult<undefined>> =>
  act("set_opt_out", token, anyBody, optOut ? "Reminder texts are off." : "Reminder texts are on.", { optOut });
