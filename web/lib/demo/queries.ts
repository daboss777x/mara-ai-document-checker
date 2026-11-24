import "server-only";
import { getSiteUrl } from "@/lib/env";
import {
  CONSENT_WORDING,
  cityLine,
  clientHeadline,
  clientItemChip,
  clientItemStatus,
  clientUploadStatusLabel,
  dealChip,
  documentFileHref,
  firstName,
  maskPhone,
  maskPhoneShort,
  severityChip,
  staffChecklistChip,
  UPLOAD_ACCEPT_LABEL,
  UPLOAD_ACCEPTED_TYPES,
  UPLOAD_MAX_BYTES,
} from "@/lib/data/labels";
import {
  DEMO_AGENT_PHONE,
  DEMO_BROKERAGE_NAME,
  DEMO_USER,
  DOCUMENT_TYPES,
  cannedCheck,
  type DemoClient,
  type DemoDeal,
  type DemoDoc,
  type DemoFinding,
  type DemoItem,
  type DemoState,
} from "@/lib/demo/fixtures";
import { demoState, nextDemoId, nowIso } from "@/lib/demo/store";
import type {
  ActivityEntry,
  ClientChecklistItem,
  ClientChecklistVM,
  ClientItemVM,
  ClientPortalVM,
  ClientVerifyVM,
  DealListRow,
  DealPageVM,
  DealRef,
  DealsListVM,
  FindingVM,
  NewDealFormVM,
  ReviewItemVM,
  ReviewQueueVM,
  StaffChecklistItem,
  StaffSession,
} from "@/lib/view-models";

// ---------------------------------------------------------------------------
// Shared helpers (also used by mutations)
// ---------------------------------------------------------------------------
export const typeOf = (key: string) => DOCUMENT_TYPES.find((t) => t.key === key) ?? { key, name: key, description: "", defaultOn: false };

export const findDeal = (st: DemoState, id: string) => st.deals.find((d) => d.id === id);
export const findItem = (st: DemoState, id: string) => st.items.find((i) => i.id === id);
export const clientOfDeal = (st: DemoState, dealId: string) => st.clients.find((c) => c.dealId === dealId)!;

/** Newest first. `uploading` rows are invisible (the client hasn't confirmed them). */
export function docsOfItem(st: DemoState, itemId: string): DemoDoc[] {
  return st.documents.filter((d) => d.itemId === itemId && d.status !== "uploading").sort((a, b) => b.version - a.version);
}
/** The version under review: the newest one that isn't superseded. */
export const latestDoc = (st: DemoState, itemId: string): DemoDoc | null =>
  docsOfItem(st, itemId).find((d) => d.status !== "superseded") ?? null;

export const findingsOfDoc = (st: DemoState, docId: string): DemoFinding[] => st.findings.filter((f) => f.documentId === docId);

export function logActivity(st: DemoState, dealId: string, actor: "agent" | "client" | "mara" | "system", text: string): void {
  st.activity.push({ id: nextDemoId("act"), dealId, at: nowIso(), actor, text });
}

export const dealRef = (d: DemoDeal): DealRef => ({ id: d.id, dealNumber: d.dealNumber, address: d.address, cityLine: cityLine(d.city, d.state, d.zip) });

export const touch = (d: DemoDeal) => {
  d.updatedAt = nowIso();
};

/**
 * The demo "Mara": any item in `checking` finishes on the next staff read. It supersedes the
 * older versions, writes canned findings, and moves the item to `review`.
 */
export function settleChecking(st: DemoState): void {
  for (const item of st.items) {
    if (item.status !== "checking") continue;
    const docs = st.documents.filter((d) => d.itemId === item.id && d.status !== "uploading").sort((a, b) => b.version - a.version);
    const doc = docs[0];
    if (!doc) continue;
    for (const old of docs.slice(1)) old.status = "superseded";
    const check = cannedCheck(item.typeKey, doc.version);
    doc.status = "checked";
    doc.aiSummary = check.summary;
    if (findingsOfDoc(st, doc.id).length === 0) {
      check.findings.forEach((f) => st.findings.push({ id: nextDemoId("finding"), documentId: doc.id, itemId: item.id, ...f }));
    }
    item.status = "review";
    const deal = findDeal(st, item.dealId);
    if (deal) touch(deal);
    const n = check.findings.length;
    logActivity(st, item.dealId, "mara", `Mara checked the ${typeOf(item.typeKey).name.toLowerCase()} and found ${n === 0 ? "nothing to fix" : `${n} ${n === 1 ? "thing" : "things"}`}.`);
  }
}

function s(): DemoState {
  const st = demoState();
  settleChecking(st);
  return st;
}

function reviewQueueItems(st: DemoState): DemoItem[] {
  return st.items
    .filter((i) => i.status === "review")
    .sort((a, b) => (latestDoc(st, a.id)?.uploadedAt ?? "").localeCompare(latestDoc(st, b.id)?.uploadedAt ?? ""));
}

const toFinding = (f: DemoFinding): FindingVM => ({
  id: f.id,
  severity: f.severity,
  chip: severityChip(f.severity),
  ruleKey: f.ruleKey,
  message: f.message,
  clientFixText: f.clientFixText,
  page: f.page,
  quote: f.quote,
  status: f.status,
});

const effectiveItems = (st: DemoState, dealId: string) => st.items.filter((i) => i.dealId === dealId && i.status !== "waived");

// ---------------------------------------------------------------------------
// Staff reads
// ---------------------------------------------------------------------------
export function getSession(): StaffSession {
  const st = s();
  return {
    mode: "demo",
    user: DEMO_USER,
    brokerageName: DEMO_BROKERAGE_NAME,
    reviewCount: st.items.filter((i) => i.status === "review").length,
  };
}

export function listReviewQueue(): ReviewQueueVM {
  const st = s();
  return {
    items: reviewQueueItems(st).flatMap((item) => {
      const doc = latestDoc(st, item.id);
      const deal = findDeal(st, item.dealId);
      if (!doc || !deal) return [];
      const open = findingsOfDoc(st, doc.id).filter((f) => f.status === "open");
      return [
        {
          itemId: item.id,
          deal: dealRef(deal),
          clientName: clientOfDeal(st, deal.id).name,
          documentName: typeOf(item.typeKey).name,
          uploadedAt: doc.uploadedAt,
          version: doc.version,
          blockerCount: open.filter((f) => f.severity === "blocker").length,
          warningCount: open.filter((f) => f.severity === "warning").length,
          documentStatus: doc.status,
        },
      ];
    }),
  };
}

export function getReviewItem(itemId: string): ReviewItemVM | null {
  const st = s();
  const item = findItem(st, itemId);
  const deal = item && findDeal(st, item.dealId);
  if (!item || !deal) return null;
  const client = clientOfDeal(st, deal.id);
  const type = typeOf(item.typeKey);
  const doc = latestDoc(st, item.id);
  const findings = doc ? findingsOfDoc(st, doc.id) : [];
  const open = findings.filter((f) => f.status === "open");
  const queue = reviewQueueItems(st).map((i) => i.id);
  const idx = queue.indexOf(item.id);
  const nextItemId = idx >= 0 ? (queue[idx + 1] ?? null) : (queue[0] ?? null);
  return {
    item: { id: item.id, name: type.name, description: type.description, status: item.status, chip: staffChecklistChip(item.status), fixNote: item.fixNote },
    deal: dealRef(deal),
    client: { name: client.name, phoneMasked: maskPhone(client.phone), canText: client.smsConsent && !client.optedOut },
    document: doc
      ? {
          id: doc.id,
          filename: doc.filename,
          version: doc.version,
          uploadedAt: doc.uploadedAt,
          pageCount: doc.pageCount,
          status: doc.status,
          fileHref: documentFileHref(deal.id, doc.id),
          aiSummary: doc.aiSummary,
        }
      : null,
    findings: findings.map(toFinding),
    versions: docsOfItem(st, item.id).map((d) => ({ id: d.id, version: d.version, uploadedAt: d.uploadedAt, status: d.status })),
    suggestedFixNote: open.length ? open.map((f) => f.clientFixText).join(" ") : (item.fixNote ?? ""),
    nextItemId,
  };
}

function toListRow(st: DemoState, d: DemoDeal): DealListRow {
  const items = effectiveItems(st, d.id);
  return {
    ...dealRef(d),
    clientName: clientOfDeal(st, d.id).name,
    status: d.status,
    chip: dealChip(d.status),
    doneCount: items.filter((i) => i.status === "complete").length,
    totalCount: items.length,
    reviewCount: items.filter((i) => i.status === "review").length,
    needsFixCount: items.filter((i) => i.status === "needs_fix").length,
    updatedAt: d.updatedAt,
  };
}

export function listDeals(q?: string): DealsListVM {
  const st = s();
  const needle = q?.trim().toLowerCase();
  const rows = st.deals
    .filter((d) => d.agentId === DEMO_USER.id)
    .map((d) => toListRow(st, d))
    .filter((r) => !needle || [r.address, r.clientName, r.dealNumber, r.cityLine].some((x) => x.toLowerCase().includes(needle)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { rows };
}

export function getDeal(id: string): DealPageVM | null {
  const st = s();
  const deal = findDeal(st, id);
  if (!deal) return null;
  const client = clientOfDeal(st, deal.id);
  const items: StaffChecklistItem[] = st.items
    .filter((i) => i.dealId === deal.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => {
      const docs = docsOfItem(st, i.id);
      const latest = latestDoc(st, i.id);
      return {
        id: i.id,
        name: typeOf(i.typeKey).name,
        status: i.status,
        chip: staffChecklistChip(i.status),
        dueDate: i.dueDate,
        lastUploadAt: docs[0]?.uploadedAt ?? null,
        openFindings: latest ? findingsOfDoc(st, latest.id).filter((f) => f.status === "open").length : 0,
        fixNote: i.fixNote,
      };
    });
  const actor = { agent: DEMO_USER.name.split(" ")[0], client: client.name.split(" ")[0], mara: "Mara", system: "System" } as const;
  const activity: ActivityEntry[] = st.activity
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => a.dealId === deal.id)
    .sort((x, y) => y.a.at.localeCompare(x.a.at) || y.idx - x.idx)
    .map(({ a }) => ({ id: a.id, at: a.at, actorLabel: actor[a.actor], text: a.text }));
  return {
    deal: { ...dealRef(deal), status: deal.status, chip: dealChip(deal.status), remindersEnabled: deal.remindersEnabled, clientLinkUrl: `${getSiteUrl()}/c/${client.token}` },
    client: { name: client.name, phone: client.phone, email: client.email, smsConsent: client.smsConsent, optedOut: client.optedOut },
    items,
    activity,
  };
}

export function getNewDealForm(): NewDealFormVM {
  return { documentTypes: DOCUMENT_TYPES.map((t) => ({ ...t })), consentWording: CONSENT_WORDING };
}

/** Demo file URL: the bundled sample PDF (no storage in demo). `null` = unknown document. */
export const DEMO_SAMPLE_PDF = "/demo/sample-document.pdf";
export function getDocumentFileUrl(dealId: string, docId: string): { url: string } | null {
  const st = s();
  const doc = st.documents.find((d) => d.id === docId && d.dealId === dealId && d.status !== "uploading");
  return doc ? { url: DEMO_SAMPLE_PDF } : null;
}

// ---------------------------------------------------------------------------
// Client reads (token → client). Demo skips the SMS code unless asked: /c/demo/verify still works.
// ---------------------------------------------------------------------------
export function clientCtx(st: DemoState, token: string): { client: DemoClient; deal: DemoDeal } | null {
  const client = st.clients.find((c) => c.token === token);
  const deal = client && findDeal(st, client.dealId);
  return client && deal ? { client, deal } : null;
}

export function getClientPortal(token: string): ClientPortalVM | null {
  const ctx = clientCtx(demoState(), token);
  if (!ctx) return null;
  const { client, deal } = ctx;
  return {
    mode: "demo",
    token,
    client: { firstName: firstName(client.name), name: client.name },
    deal: { address: deal.address, cityLine: cityLine(deal.city, deal.state, deal.zip) },
    agent: { name: DEMO_USER.name, phone: DEMO_AGENT_PHONE },
    needsVerification: false,
  };
}

export function getClientVerify(token: string): ClientVerifyVM | null {
  const ctx = clientCtx(demoState(), token);
  if (!ctx) return null;
  return {
    firstName: firstName(ctx.client.name),
    phoneMasked: maskPhoneShort(ctx.client.phone),
    agentName: DEMO_USER.name,
    state: ctx.client.failedAttempts >= 5 ? "locked" : "ready",
    resendAfterSeconds: 30,
  };
}

function toClientItem(st: DemoState, i: DemoItem): ClientChecklistItem | null {
  const status = clientItemStatus(i.status);
  if (!status) return null;
  const type = typeOf(i.typeKey);
  return {
    id: i.id,
    name: type.name,
    description: type.description,
    status,
    chip: clientItemChip(status, i.status === "review"),
    checked: i.status === "review",
    fixNote: status === "needs_fix" ? i.fixNote : null,
    dueDate: i.dueDate,
    uploadedAt: docsOfItem(st, i.id)[0]?.uploadedAt ?? null,
  };
}

export function getClientChecklist(token: string): ClientChecklistVM | null {
  const st = demoState();
  const ctx = clientCtx(st, token);
  if (!ctx) return null;
  const items = st.items
    .filter((i) => i.dealId === ctx.deal.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((i) => toClientItem(st, i) ?? []);
  const toDo = items.filter((i) => i.status === "to_do" || i.status === "needs_fix");
  const checking = items.filter((i) => i.status === "checking");
  const done = items.filter((i) => i.status === "done");
  return {
    headline: clientHeadline(firstName(ctx.client.name), toDo.length, checking.length),
    doneCount: done.length,
    totalCount: items.length,
    toDo,
    checking,
    done,
    sms: { optedOut: ctx.client.optedOut, canToggle: ctx.client.smsConsent },
  };
}

export function getClientItem(token: string, itemId: string): ClientItemVM | null {
  const st = demoState();
  const ctx = clientCtx(st, token);
  const raw = ctx && st.items.find((i) => i.id === itemId && i.dealId === ctx.deal.id);
  const item = raw && toClientItem(st, raw);
  if (!raw || !item) return null;
  const docs = docsOfItem(st, raw.id);
  return {
    item,
    uploads: docs.map((d, idx) => ({
      id: d.id,
      filename: d.filename,
      uploadedAt: d.uploadedAt,
      statusLabel: clientUploadStatusLabel(d.status, idx === 0, raw.status),
    })),
    upload: { maxBytes: UPLOAD_MAX_BYTES, acceptedTypes: UPLOAD_ACCEPTED_TYPES, acceptLabel: UPLOAD_ACCEPT_LABEL },
  };
}
