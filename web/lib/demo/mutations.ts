import "server-only";
import { getSiteUrl } from "@/lib/env";
import { DEMO_USER, DOCUMENT_TYPES, type DemoDeal, type DemoItem, type DemoState } from "@/lib/demo/fixtures";
import { clientCtx, clientOfDeal, docsOfItem, findDeal, findItem, logActivity, settleChecking, touch, typeOf } from "@/lib/demo/queries";
import { demoState, nextDemoId, nowIso } from "@/lib/demo/store";
import { firstName } from "@/lib/data/labels";
import type { ClientUploadTarget, ClientVerifyResult, CreateDealResult, MutationResult, NewDealInput } from "@/lib/view-models";

/**
 * Demo mutations. They change only the in-memory demo state: nothing is sent, stored or
 * persisted. Every success message says so, so the UI never implies a real text went out.
 */
const done = <T>(message: string, data: T): MutationResult<T> => ({ ok: true, mode: "demo", message, data });
const refuse = <T>(error: string): MutationResult<T> => ({ ok: false, mode: "demo", error });
const NOT_SENT = "Demo mode: no text was sent.";

function st(): DemoState {
  const s = demoState();
  settleChecking(s);
  return s;
}

/** Deal → complete when every non-waived item is complete (and back to open otherwise). */
function syncDealStatus(s: DemoState, deal: DemoDeal): void {
  const items = s.items.filter((i) => i.dealId === deal.id && i.status !== "waived");
  const complete = items.length > 0 && items.every((i) => i.status === "complete");
  if (complete && deal.status !== "complete") {
    deal.status = "complete";
    logActivity(s, deal.id, "system", "All documents are complete. The deal is complete.");
  } else if (!complete && deal.status === "complete") {
    deal.status = "open";
  }
  touch(deal);
}

function lookup(s: DemoState, itemId: string): { item: DemoItem; deal: DemoDeal } | null {
  const item = findItem(s, itemId);
  const deal = item && findDeal(s, item.dealId);
  return item && deal ? { item, deal } : null;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
export function markItemComplete(itemId: string): MutationResult<undefined> {
  const s = st();
  const ctx = lookup(s, itemId);
  if (!ctx) return refuse("That item wasn't found.");
  const { item, deal } = ctx;
  if (item.status === "complete") return done("Already complete.", undefined);
  if (item.status === "missing" || item.status === "checking") return refuse("Nothing to complete yet: there's no checked upload.");
  item.status = "complete";
  item.fixNote = null;
  item.completedAt = nowIso();
  logActivity(s, deal.id, "agent", `Rachel marked the ${typeOf(item.typeKey).name.toLowerCase()} complete.`);
  syncDealStatus(s, deal);
  return done("Marked complete.", undefined);
}

export function sendFixRequest(itemId: string, fixNote: string): MutationResult<undefined> {
  const s = st();
  const ctx = lookup(s, itemId);
  if (!ctx) return refuse("That item wasn't found.");
  const { item, deal } = ctx;
  if (item.status !== "review" && item.status !== "needs_fix" && item.status !== "complete") return refuse("There's nothing uploaded to ask a fix for.");
  const client = clientOfDeal(s, deal.id);
  item.status = "needs_fix";
  item.fixNote = fixNote;
  item.completedAt = null;
  logActivity(s, deal.id, "agent", `Rachel sent ${firstName(client.name)} a fix request for the ${typeOf(item.typeKey).name.toLowerCase()}.`);
  syncDealStatus(s, deal);
  return done(`Fix request sent to ${firstName(client.name)}. ${NOT_SENT}`, undefined);
}

export function dismissFinding(findingId: string): MutationResult<undefined> {
  const s = st();
  const f = s.findings.find((x) => x.id === findingId);
  if (!f) return refuse("That finding wasn't found.");
  f.status = "dismissed";
  const item = findItem(s, f.itemId);
  if (item) logActivity(s, item.dealId, "agent", `Rachel dismissed a finding on the ${typeOf(item.typeKey).name.toLowerCase()}.`);
  return done("Finding dismissed.", undefined);
}

export function waiveItem(itemId: string): MutationResult<undefined> {
  const s = st();
  const ctx = lookup(s, itemId);
  if (!ctx) return refuse("That item wasn't found.");
  ctx.item.status = "waived";
  ctx.item.fixNote = null;
  logActivity(s, ctx.deal.id, "agent", `Rachel waived the ${typeOf(ctx.item.typeKey).name.toLowerCase()}.`);
  syncDealStatus(s, ctx.deal);
  return done("Waived.", undefined);
}

/** Reopen: back to `review` when there's an upload to look at, else `missing`. */
export function reopenItem(itemId: string): MutationResult<undefined> {
  const s = st();
  const ctx = lookup(s, itemId);
  if (!ctx) return refuse("That item wasn't found.");
  const hasUpload = docsOfItem(s, ctx.item.id).length > 0;
  ctx.item.status = hasUpload ? "review" : "missing";
  ctx.item.completedAt = null;
  logActivity(s, ctx.deal.id, "agent", `Rachel reopened the ${typeOf(ctx.item.typeKey).name.toLowerCase()}.`);
  syncDealStatus(s, ctx.deal);
  return done("Reopened.", undefined);
}

export function setDealReminders(dealId: string, on: boolean): MutationResult<undefined> {
  const s = st();
  const deal = findDeal(s, dealId);
  if (!deal) return refuse("That deal wasn't found.");
  deal.remindersEnabled = on;
  logActivity(s, deal.id, "agent", `Rachel turned reminders ${on ? "on" : "off"}.`);
  touch(deal);
  return done(`Reminders are ${on ? "on" : "off"}.`, undefined);
}

export function resendInvite(dealId: string): MutationResult<undefined> {
  const s = st();
  const deal = findDeal(s, dealId);
  if (!deal) return refuse("That deal wasn't found.");
  const client = clientOfDeal(s, deal.id);
  logActivity(s, deal.id, "agent", `Rachel resent the invite to ${firstName(client.name)}.`);
  return done(`Invite resent. ${NOT_SENT}`, undefined);
}

export function regenerateClientLink(dealId: string): MutationResult<{ url: string }> {
  const s = st();
  const deal = findDeal(s, dealId);
  if (!deal) return refuse("That deal wasn't found.");
  return done("Link ready. Demo mode: nothing was changed.", { url: `${getSiteUrl()}/c/${clientOfDeal(s, deal.id).token}` });
}

export function createDeal(input: NewDealInput): MutationResult<CreateDealResult> {
  const s = st();
  const year = new Date().getFullYear();
  const maxN = s.deals.reduce((m, d) => (d.dealNumber.startsWith(`${year}-`) ? Math.max(m, Number(d.dealNumber.slice(5))) : m), 0);
  const dealId = nextDemoId("deal");
  const now = nowIso();
  const token = `demo-${nextDemoId("link").replace(/-demo-/, "-")}`;
  s.deals.push({
    id: dealId,
    dealNumber: `${year}-${String(maxN + 1).padStart(4, "0")}`,
    address: input.address,
    city: input.city,
    state: "TX",
    zip: input.zip,
    status: "open",
    remindersEnabled: true,
    createdAt: now,
    updatedAt: now,
    agentId: DEMO_USER.id,
  });
  s.clients.push({
    id: nextDemoId("client"),
    dealId,
    name: input.clientName,
    phone: input.clientPhone,
    email: input.clientEmail ?? null,
    smsConsent: input.smsConsent,
    optedOut: false,
    token,
    failedAttempts: 0,
  });
  const keys = DOCUMENT_TYPES.filter((t) => input.documentTypeKeys.includes(t.key)).map((t) => t.key);
  keys.forEach((key, i) =>
    s.items.push({ id: nextDemoId("item"), dealId, typeKey: key, status: "missing", fixNote: null, dueDate: input.dueDate ?? null, sortOrder: i + 1, completedAt: null }),
  );
  logActivity(s, dealId, "agent", `Rachel created the deal and invited ${firstName(input.clientName)}.`);
  return done(`Deal created. ${NOT_SENT}`, { dealId, clientLinkUrl: `${getSiteUrl()}/c/${token}` });
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export function sendVerifyCode(token: string): MutationResult<undefined> {
  const ctx = clientCtx(demoState(), token);
  if (!ctx) return refuse("This link has expired. Ask your agent for a new one.");
  return done("Code sent. Demo mode: use any 6 digits except 000000.", undefined);
}

/** Any 6-digit code works in the demo except 000000 (shows the wrong-code state). */
export function verifyClientCode(token: string, code: string): MutationResult<ClientVerifyResult> {
  const ctx = clientCtx(demoState(), token);
  if (!ctx) return refuse("This link has expired. Ask your agent for a new one.");
  const c = ctx.client;
  if (c.failedAttempts >= 5) return refuse("Too many attempts. Try again in 15 minutes.");
  if (!/^\d{6}$/.test(code) || code === "000000") {
    c.failedAttempts += 1;
    return refuse(`That code didn't match. ${Math.max(0, 5 - c.failedAttempts)} tries left.`);
  }
  c.failedAttempts = 0;
  return done("Verified.", { verified: true, attemptsLeft: 5 });
}

/** Inserts the `uploading` document row. The demo upload URL is a marker: the browser skips the PUT. */
export function createClientUpload(token: string, itemId: string, file: { filename: string; sizeBytes: number; mime: string }): MutationResult<ClientUploadTarget> {
  const s = demoState();
  const ctx = clientCtx(s, token);
  const item = ctx && s.items.find((i) => i.id === itemId && i.dealId === ctx.deal.id);
  if (!ctx || !item) return refuse("That item wasn't found.");
  if (item.status === "waived" || item.status === "complete") return refuse("This one is already done.");
  const id = nextDemoId("doc");
  const version = s.documents.filter((d) => d.itemId === item.id).length + 1;
  s.documents.push({ id, dealId: ctx.deal.id, itemId: item.id, version, filename: file.filename, uploadedAt: nowIso(), status: "uploading", pageCount: null, aiSummary: null });
  return done("Ready to upload.", { documentId: id, uploadUrl: `demo://upload/${id}` });
}

/** The upload is in: the document becomes `received` and the item `checking`. Staff reads settle it. */
export function confirmClientUpload(token: string, documentId: string): MutationResult<undefined> {
  const s = demoState();
  const ctx = clientCtx(s, token);
  const doc = ctx && s.documents.find((d) => d.id === documentId && d.dealId === ctx.deal.id);
  const item = doc && findItem(s, doc.itemId);
  if (!ctx || !doc || !item) return refuse("We couldn't find that upload.");
  if (doc.status !== "uploading") return done("Already received.", undefined);
  doc.status = "received";
  doc.uploadedAt = nowIso();
  doc.pageCount = 3;
  item.status = "checking";
  logActivity(s, ctx.deal.id, "client", `${firstName(ctx.client.name)} uploaded the ${typeOf(item.typeKey).name.toLowerCase()}.`);
  touch(ctx.deal);
  return done("Got it. Mara is checking it now.", undefined);
}

export function setClientSmsOptOut(token: string, optOut: boolean): MutationResult<undefined> {
  const s = demoState();
  const ctx = clientCtx(s, token);
  if (!ctx) return refuse("This link has expired.");
  ctx.client.optedOut = optOut;
  logActivity(s, ctx.deal.id, "client", `${firstName(ctx.client.name)} turned reminder texts ${optOut ? "off" : "on"}.`);
  return done(optOut ? "Reminder texts are off." : "Reminder texts are on.", undefined);
}
