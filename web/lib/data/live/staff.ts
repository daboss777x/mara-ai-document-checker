import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteUrl, SUPABASE_NOT_CONFIGURED } from "@/lib/env";
import { fail, ok, type Result } from "@/lib/data/result";
import {
  CONSENT_WORDING,
  cityLine,
  dealChip,
  DEAL_FILES_BUCKET,
  documentFileHref,
  firstName,
  initials,
  maskPhone,
  severityChip,
  SIGNED_URL_TTL_SECONDS,
  staffChecklistChip,
} from "@/lib/data/labels";
import { createClient } from "@/lib/supabase/server";
import type {
  AuditLogRow,
  ChecklistItemRow,
  Database,
  DealRow,
  DocumentRow,
  DocumentTypeRow,
  FindingRow,
  Json,
  UserRow,
} from "@/lib/db/types";
import type {
  ActivityEntry,
  CreateDealResult,
  DealListRow,
  DealPageVM,
  DealRef,
  DealsListVM,
  MutationResult,
  NewDealFormVM,
  NewDealInput,
  ReviewItemVM,
  ReviewQueueVM,
  StaffSession,
} from "@/lib/view-models";

/**
 * Staff reads/writes against Supabase with the signed-in user's session (RLS decides what they
 * can see). Column names follow docs/CONTRACTS.md §3. Multi-step writes are sequential, not
 * transactional: TODO(decision) move markItemComplete/sendFixRequest/createDeal into RPCs once
 * Kwame's migrations land.
 */
type Db = SupabaseClient<Database>;
type Ctx = { db: Db; user: UserRow };

const NOT_SIGNED_IN = "You're signed out. Sign in again.";
const err = (e: { message: string } | null | undefined, what: string) => `Couldn't ${what}${e ? ` (${e.message})` : ""}.`;

async function context(): Promise<Result<Ctx>> {
  const db = (await createClient()) as Db | null;
  if (!db) return fail(SUPABASE_NOT_CONFIGURED);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return fail(NOT_SIGNED_IN);
  const { data: user } = await db.from("users").select("*").eq("id", auth.user.id).maybeSingle();
  if (!user) return fail("Your account isn't set up for this brokerage yet.");
  return ok({ db, user });
}

const dealRef = (d: DealRow): DealRef => ({ id: d.id, dealNumber: d.deal_number, address: d.property_address, cityLine: cityLine(d.city, d.state, d.zip) });
const typeName = (types: DocumentTypeRow[], key: string) => types.find((t) => t.key === key)?.name ?? key;
const group = <T, K extends string>(rows: T[], key: (r: T) => K): Map<K, T[]> => {
  const m = new Map<K, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
};
/** Newest non-superseded version per checklist item. */
function latestByItem(docs: DocumentRow[]): Map<string, DocumentRow> {
  const m = new Map<string, DocumentRow>();
  for (const d of docs) {
    if (d.status === "uploading" || d.status === "superseded") continue;
    const cur = m.get(d.checklist_item_id);
    if (!cur || d.version > cur.version) m.set(d.checklist_item_id, d);
  }
  return m;
}

async function audit(db: Db, user: UserRow, dealId: string, action: string, text: string): Promise<void> {
  await db.from("audit_log").insert({ deal_id: dealId, actor: "agent", actor_id: user.id, action, details_json: { text } });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getSession(): Promise<Result<StaffSession>> {
  const c = await context();
  if (!c.ok) return c;
  const { db, user } = c.data;
  const [{ data: brokerage }, { count }] = await Promise.all([
    db.from("brokerages").select("name").eq("id", user.brokerage_id).maybeSingle(),
    db.from("checklist_items").select("id", { count: "exact", head: true }).eq("status", "review"),
  ]);
  return ok({
    mode: "live",
    user: { id: user.id, name: user.name, initials: initials(user.name), email: user.email ?? "", role: user.role },
    brokerageName: brokerage?.name ?? "Your brokerage",
    reviewCount: count ?? 0,
  });
}

async function reviewItems(db: Db): Promise<{ items: ChecklistItemRow[]; docs: Map<string, DocumentRow> }> {
  const { data: items } = await db.from("checklist_items").select("*").eq("status", "review");
  const rows = items ?? [];
  if (rows.length === 0) return { items: [], docs: new Map() };
  const { data: docs } = await db.from("documents").select("*").in("checklist_item_id", rows.map((i) => i.id));
  const latest = latestByItem(docs ?? []);
  rows.sort((a, b) => (latest.get(a.id)?.created_at ?? "").localeCompare(latest.get(b.id)?.created_at ?? ""));
  return { items: rows, docs: latest };
}

export async function listReviewQueue(): Promise<Result<ReviewQueueVM>> {
  const c = await context();
  if (!c.ok) return c;
  const { db } = c.data;
  const { items, docs } = await reviewItems(db);
  if (items.length === 0) return ok({ items: [] });
  const dealIds = [...new Set(items.map((i) => i.deal_id))];
  const docIds = [...docs.values()].map((d) => d.id);
  const [{ data: deals }, { data: clients }, { data: types }, { data: findings }] = await Promise.all([
    db.from("deals").select("*").in("id", dealIds),
    db.from("clients").select("*").in("deal_id", dealIds),
    db.from("document_types").select("*"),
    db.from("findings").select("*").in("document_id", docIds).eq("status", "open"),
  ]);
  const byDeal = new Map((deals ?? []).map((d) => [d.id, d]));
  const clientByDeal = new Map((clients ?? []).map((cl) => [cl.deal_id, cl]));
  const openByDoc = group(findings ?? [], (f) => f.document_id);
  return ok({
    items: items.flatMap((item) => {
      const doc = docs.get(item.id);
      const deal = byDeal.get(item.deal_id);
      if (!doc || !deal) return [];
      const open = openByDoc.get(doc.id) ?? [];
      return [
        {
          itemId: item.id,
          deal: dealRef(deal),
          clientName: clientByDeal.get(deal.id)?.name ?? "Client",
          documentName: typeName(types ?? [], item.document_type_key),
          uploadedAt: doc.created_at,
          version: doc.version,
          blockerCount: open.filter((f) => f.severity === "blocker").length,
          warningCount: open.filter((f) => f.severity === "warning").length,
          documentStatus: doc.status,
        },
      ];
    }),
  });
}

export async function getReviewItem(itemId: string): Promise<Result<ReviewItemVM | null>> {
  const c = await context();
  if (!c.ok) return c;
  const { db } = c.data;
  const { data: item } = await db.from("checklist_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) return ok(null);
  const [{ data: deal }, { data: client }, { data: type }, { data: docs }, queue] = await Promise.all([
    db.from("deals").select("*").eq("id", item.deal_id).maybeSingle(),
    db.from("clients").select("*").eq("deal_id", item.deal_id).maybeSingle(),
    db.from("document_types").select("*").eq("key", item.document_type_key).maybeSingle(),
    db.from("documents").select("*").eq("checklist_item_id", item.id).neq("status", "uploading"),
    reviewItems(db),
  ]);
  if (!deal || !client) return ok(null);
  const all = (docs ?? []).sort((a, b) => b.version - a.version);
  const doc = latestByItem(all).get(item.id) ?? null;
  const { data: findingRows } = doc ? await db.from("findings").select("*").eq("document_id", doc.id) : { data: [] as FindingRow[] };
  const findings = findingRows ?? [];
  const open = findings.filter((f) => f.status === "open");
  const queueIds = queue.items.map((i) => i.id);
  const idx = queueIds.indexOf(item.id);
  return ok({
    item: {
      id: item.id,
      name: type?.name ?? item.document_type_key,
      description: type?.description ?? "",
      status: item.status,
      chip: staffChecklistChip(item.status),
      fixNote: item.fix_note,
    },
    deal: dealRef(deal),
    client: { name: client.name, phoneMasked: maskPhone(client.phone), canText: !!client.sms_consent_at && !client.sms_opt_out_at },
    document: doc
      ? {
          id: doc.id,
          filename: doc.original_filename ?? "Document",
          version: doc.version,
          uploadedAt: doc.created_at,
          pageCount: doc.page_count,
          status: doc.status,
          fileHref: documentFileHref(deal.id, doc.id),
          aiSummary: doc.ai_summary,
        }
      : null,
    findings: findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      chip: severityChip(f.severity),
      ruleKey: f.rule_key,
      message: f.message,
      clientFixText: f.client_fix_text ?? f.message,
      page: f.page,
      quote: f.quote,
      status: f.status,
    })),
    versions: all.map((d) => ({ id: d.id, version: d.version, uploadedAt: d.created_at, status: d.status })),
    suggestedFixNote: open.length ? open.map((f) => f.client_fix_text ?? f.message).join(" ") : (item.fix_note ?? ""),
    nextItemId: idx >= 0 ? (queueIds[idx + 1] ?? null) : (queueIds[0] ?? null),
  });
}

export async function listDeals(q?: string): Promise<Result<DealsListVM>> {
  const c = await context();
  if (!c.ok) return c;
  const { db } = c.data;
  const { data: deals } = await db.from("deals").select("*").order("updated_at", { ascending: false });
  const rows = deals ?? [];
  if (rows.length === 0) return ok({ rows: [] });
  const ids = rows.map((d) => d.id);
  const [{ data: clients }, { data: items }] = await Promise.all([
    db.from("clients").select("*").in("deal_id", ids),
    db.from("checklist_items").select("*").in("deal_id", ids),
  ]);
  const clientByDeal = new Map((clients ?? []).map((cl) => [cl.deal_id, cl]));
  const itemsByDeal = group(items ?? [], (i) => i.deal_id);
  const needle = q?.trim().toLowerCase();
  const out: DealListRow[] = rows
    .map((d) => {
      const its = (itemsByDeal.get(d.id) ?? []).filter((i) => i.status !== "waived");
      return {
        ...dealRef(d),
        clientName: clientByDeal.get(d.id)?.name ?? "Client",
        status: d.status,
        chip: dealChip(d.status),
        doneCount: its.filter((i) => i.status === "complete").length,
        totalCount: its.length,
        reviewCount: its.filter((i) => i.status === "review").length,
        needsFixCount: its.filter((i) => i.status === "needs_fix").length,
        updatedAt: d.updated_at,
      };
    })
    .filter((r) => !needle || [r.address, r.clientName, r.dealNumber, r.cityLine].some((x) => x.toLowerCase().includes(needle)));
  return ok({ rows: out });
}

const jtext = (j: Json, action: string): string => {
  if (j && typeof j === "object" && !Array.isArray(j) && typeof j.text === "string") return j.text;
  const s = action.replace(/[._]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const actorLabel = (a: AuditLogRow["actor"], agent: string, client: string) => ({ agent, client, mara: "Mara", system: "System" })[a];

export async function getDeal(id: string): Promise<Result<DealPageVM | null>> {
  const c = await context();
  if (!c.ok) return c;
  const { db, user } = c.data;
  const { data: deal } = await db.from("deals").select("*").eq("id", id).maybeSingle();
  if (!deal) return ok(null);
  const [{ data: client }, { data: items }, { data: types }, { data: docs }, { data: log }, { data: agent }] = await Promise.all([
    db.from("clients").select("*").eq("deal_id", id).maybeSingle(),
    db.from("checklist_items").select("*").eq("deal_id", id).order("sort_order"),
    db.from("document_types").select("*"),
    db.from("documents").select("*").eq("deal_id", id).neq("status", "uploading"),
    db.from("audit_log").select("*").eq("deal_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("users").select("name").eq("id", deal.agent_id).maybeSingle(),
  ]);
  if (!client) return ok(null);
  const docRows = docs ?? [];
  const latest = latestByItem(docRows);
  const docIds = [...latest.values()].map((d) => d.id);
  const { data: openFindings } = docIds.length ? await db.from("findings").select("*").in("document_id", docIds).eq("status", "open") : { data: [] as FindingRow[] };
  const openByDoc = group(openFindings ?? [], (f) => f.document_id);
  const lastUpload = (itemId: string) => docRows.filter((d) => d.checklist_item_id === itemId).map((d) => d.created_at).sort().pop() ?? null;
  const agentFirst = firstName(agent?.name ?? user.name);
  const activity: ActivityEntry[] = (log ?? []).map((a) => ({
    id: a.id,
    at: a.created_at,
    actorLabel: actorLabel(a.actor, agentFirst, firstName(client.name)),
    text: jtext(a.details_json, a.action),
  }));
  return ok({
    deal: {
      ...dealRef(deal),
      status: deal.status,
      chip: dealChip(deal.status),
      remindersEnabled: deal.reminders_enabled,
      // The database stores only a hash of the link; a fresh link comes from `resendInvite`.
      clientLinkUrl: null,
    },
    client: { name: client.name, phone: client.phone, email: client.email, smsConsent: !!client.sms_consent_at, optedOut: !!client.sms_opt_out_at },
    items: (items ?? []).map((i) => {
      const doc = latest.get(i.id);
      return {
        id: i.id,
        name: typeName(types ?? [], i.document_type_key),
        status: i.status,
        chip: staffChecklistChip(i.status),
        dueDate: i.due_date,
        lastUploadAt: lastUpload(i.id),
        openFindings: doc ? (openByDoc.get(doc.id) ?? []).length : 0,
        fixNote: i.fix_note,
      };
    }),
    activity,
  });
}

export async function getNewDealForm(): Promise<Result<NewDealFormVM>> {
  const c = await context();
  if (!c.ok) return c;
  const { data: types, error } = await c.data.db.from("document_types").select("*").order("name");
  if (error) return fail(err(error, "load the document types"));
  return ok({
    // TODO(decision): which types are ticked by default; for now all of them.
    documentTypes: (types ?? []).map((t) => ({ key: t.key, name: t.name, description: t.description, defaultOn: true })),
    consentWording: CONSENT_WORDING,
  });
}

/** 60-second signed URL on `deal-files`, created server-side after RLS confirms the user can see the row. */
export async function getDocumentFileUrl(dealId: string, docId: string): Promise<Result<{ url: string } | null>> {
  const c = await context();
  if (!c.ok) return c;
  const { db } = c.data;
  const { data: doc } = await db.from("documents").select("*").eq("id", docId).eq("deal_id", dealId).maybeSingle();
  if (!doc || !doc.file_path) return ok(null);
  const { data, error } = await db.storage.from(DEAL_FILES_BUCKET).createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return fail("This file isn't available right now. Try again.");
  return ok({ url: data.signedUrl });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
type Step = Promise<MutationResult<undefined>>;
const live = <T>(message: string, data: T): MutationResult<T> => ({ ok: true, mode: "live", message, data });
const bad = <T = undefined>(error: string): MutationResult<T> => ({ ok: false, mode: "live", error });

async function withCtx<T>(fn: (c: Ctx) => Promise<MutationResult<T>>): Promise<MutationResult<T>> {
  const c = await context();
  return c.ok ? fn(c.data) : bad(c.error);
}

async function itemWithName(db: Db, itemId: string) {
  const { data: item } = await db.from("checklist_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) return null;
  const { data: type } = await db.from("document_types").select("name").eq("key", item.document_type_key).maybeSingle();
  return { item, name: (type?.name ?? item.document_type_key).toLowerCase() };
}

export function markItemComplete(itemId: string): Step {
  return withCtx(async ({ db, user }) => {
    const x = await itemWithName(db, itemId);
    if (!x) return bad("That item wasn't found.");
    if (x.item.status === "missing" || x.item.status === "checking") return bad("Nothing to complete yet: there's no checked upload.");
    const { error } = await db.from("checklist_items").update({ status: "complete", fix_note: null }).eq("id", itemId);
    if (error) return bad(err(error, "mark it complete"));
    await audit(db, user, x.item.deal_id, "item.complete", `${firstName(user.name)} marked the ${x.name} complete.`);
    return live("Marked complete.", undefined);
  });
}

export function sendFixRequest(itemId: string, fixNote: string): Step {
  return withCtx(async ({ db, user }) => {
    const x = await itemWithName(db, itemId);
    if (!x) return bad("That item wasn't found.");
    const { data: client } = await db.from("clients").select("*").eq("deal_id", x.item.deal_id).maybeSingle();
    if (!client) return bad("This deal has no client.");
    const { error } = await db.from("checklist_items").update({ status: "needs_fix", fix_note: fixNote }).eq("id", itemId);
    if (error) return bad(err(error, "save the fix request"));
    // The approved fix_request row is the agent's click; Mara's webhook sends it (consent, quiet hours, content filter apply there).
    const { error: msgError } = await db.from("messages").insert({
      deal_id: x.item.deal_id,
      client_id: client.id,
      kind: "fix_request",
      body: fixNote,
      status: "queued",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    });
    if (msgError) return bad(err(msgError, "queue the text"));
    await audit(db, user, x.item.deal_id, "item.fix_requested", `${firstName(user.name)} sent ${firstName(client.name)} a fix request for the ${x.name}.`);
    return live(`Fix request sent to ${firstName(client.name)}.`, undefined);
  });
}

export function dismissFinding(findingId: string): Step {
  return withCtx(async ({ db, user }) => {
    const { data: f } = await db.from("findings").select("*").eq("id", findingId).maybeSingle();
    if (!f) return bad("That finding wasn't found.");
    const { error } = await db.from("findings").update({ status: "dismissed" }).eq("id", findingId);
    if (error) return bad(err(error, "dismiss the finding"));
    const { data: item } = await db.from("checklist_items").select("deal_id").eq("id", f.checklist_item_id).maybeSingle();
    if (item) await audit(db, user, item.deal_id, "finding.dismissed", `${firstName(user.name)} dismissed a finding (${f.rule_key}).`);
    return live("Finding dismissed.", undefined);
  });
}

async function setStatus(itemId: string, status: ChecklistItemRow["status"], action: string, verb: string, message: string): Step {
  return withCtx(async ({ db, user }) => {
    const x = await itemWithName(db, itemId);
    if (!x) return bad("That item wasn't found.");
    let next = status;
    if (action === "item.reopened") {
      const { count } = await db.from("documents").select("id", { count: "exact", head: true }).eq("checklist_item_id", itemId).neq("status", "uploading");
      next = (count ?? 0) > 0 ? "review" : "missing";
    }
    const { error } = await db.from("checklist_items").update({ status: next, ...(next === "waived" ? { fix_note: null } : {}) }).eq("id", itemId);
    if (error) return bad(err(error, `${verb} it`));
    await audit(db, user, x.item.deal_id, action, `${firstName(user.name)} ${verb} the ${x.name}.`);
    return live(message, undefined);
  });
}
export const waiveItem = (itemId: string): Step => setStatus(itemId, "waived", "item.waived", "waived", "Waived.");
export const reopenItem = (itemId: string): Step => setStatus(itemId, "missing", "item.reopened", "reopened", "Reopened.");

export function setDealReminders(dealId: string, on: boolean): Step {
  return withCtx(async ({ db, user }) => {
    const { data, error } = await db.from("deals").update({ reminders_enabled: on }).eq("id", dealId).select("id");
    if (error || !data?.length) return bad(err(error, "change reminders"));
    await audit(db, user, dealId, "deal.reminders", `${firstName(user.name)} turned reminders ${on ? "on" : "off"}.`);
    return live(`Reminders are ${on ? "on" : "off"}.`, undefined);
  });
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const LINK_DAYS = 30;

/** Revoke old links, mint a new one, return its URL (only the hash is stored; shown once). */
async function mintLink(db: Db, clientId: string): Promise<Result<string>> {
  const token = randomBytes(32).toString("base64url");
  const { error: revokeError } = await db.from("client_links").update({ revoked_at: new Date().toISOString() }).eq("client_id", clientId).is("revoked_at", null);
  if (revokeError) return fail(err(revokeError, "retire the old client link"));
  // No .select(): agents can't read client_links back (RLS), so the id is generated here.
  const { error } = await db.from("client_links").insert({
    id: randomUUID(),
    client_id: clientId,
    token_hash: sha256(token),
    expires_at: new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString(),
  });
  return error ? fail(err(error, "create the client link")) : ok(`${getSiteUrl()}/c/${token}`);
}

/** TODO(decision): the invite body is built here because the raw link only exists now; Mara's `invite` template should wrap it. */
const inviteBody = (first: string, agent: string, address: string, url: string) =>
  `Hi ${first}, ${agent} at Cedar & Stone Realty set up a document checklist for ${address}. Open it here: ${url}`;

export function resendInvite(dealId: string): Step {
  return withCtx(async ({ db, user }) => {
    const { data: deal } = await db.from("deals").select("*").eq("id", dealId).maybeSingle();
    const { data: client } = await db.from("clients").select("*").eq("deal_id", dealId).maybeSingle();
    if (!deal || !client) return bad("That deal wasn't found.");
    const link = await mintLink(db, client.id);
    if (!link.ok) return bad(link.error);
    const { error } = await db.from("messages").insert({
      deal_id: dealId,
      client_id: client.id,
      kind: "invite",
      body: inviteBody(firstName(client.name), firstName(user.name), deal.property_address, link.data),
      status: "queued",
    });
    if (error) return bad(err(error, "queue the invite"));
    await audit(db, user, dealId, "invite.resent", `${firstName(user.name)} resent the invite to ${firstName(client.name)}.`);
    return live(`Invite sent to ${firstName(client.name)} with a fresh link.`, undefined);
  });
}

/** "Copy client link": retires the old link and returns a new URL once (the database only keeps its hash). */
export function regenerateClientLink(dealId: string): Promise<MutationResult<{ url: string }>> {
  return withCtx(async ({ db, user }) => {
    const { data: client } = await db.from("clients").select("*").eq("deal_id", dealId).maybeSingle();
    if (!client) return bad("That deal wasn't found.");
    const link = await mintLink(db, client.id);
    if (!link.ok) return bad(link.error);
    await audit(db, user, dealId, "link.regenerated", `${firstName(user.name)} made a new client link. The old one stopped working.`);
    return live("New link ready. The old one no longer works.", { url: link.data });
  });
}

export function createDeal(input: NewDealInput): Promise<MutationResult<CreateDealResult>> {
  return withCtx(async ({ db, user }) => {
    // deal_number comes from the database default; deals is the only table that supports INSERT ... RETURNING for agents.
    const { data: deal, error } = await db
      .from("deals")
      .insert({ brokerage_id: user.brokerage_id, agent_id: user.id, property_address: input.address, city: input.city, state: "TX", zip: input.zip })
      .select("*")
      .single();
    if (error || !deal) return bad(err(error, "create the deal"));
    const clientId = randomUUID();
    const { error: cErr } = await db.from("clients").insert({
      id: clientId,
      deal_id: deal.id,
      name: input.clientName,
      phone: input.clientPhone,
      email: input.clientEmail ?? null,
      sms_consent_at: input.smsConsent ? new Date().toISOString() : null,
    });
    if (cErr) return bad(err(cErr, "save the client"));
    const { error: iErr } = await db.from("checklist_items").insert(
      input.documentTypeKeys.map((key, i) => ({ id: randomUUID(), deal_id: deal.id, document_type_key: key, due_date: input.dueDate ?? null, sort_order: i + 1 })),
    );
    if (iErr) return bad(err(iErr, "create the checklist"));
    const link = await mintLink(db, clientId);
    if (!link.ok) return bad(link.error);
    if (input.smsConsent) {
      const { error: mErr } = await db.from("messages").insert({
        id: randomUUID(),
        deal_id: deal.id,
        client_id: clientId,
        kind: "invite",
        body: inviteBody(firstName(input.clientName), firstName(user.name), input.address, link.data),
        status: "queued",
      });
      if (mErr) return bad(err(mErr, "queue the invite"));
    }
    await audit(db, user, deal.id, "deal.created", `${firstName(user.name)} created the deal${input.smsConsent ? ` and invited ${firstName(input.clientName)}` : ""}.`);
    return live(input.smsConsent ? "Deal created. The invite text is on its way." : "Deal created. No text was sent (no SMS consent).", { dealId: deal.id, clientLinkUrl: link.data });
  });
}
