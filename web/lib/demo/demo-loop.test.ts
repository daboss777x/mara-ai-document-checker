import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmClientUpload,
  createClientUpload,
  createDeal,
  dismissFinding,
  getClientChecklist,
  getClientItem,
  getClientPortal,
  getDeal,
  getDocumentFileUrl,
  getReviewItem,
  getStaffSession,
  listDeals,
  listReviewQueue,
  markItemComplete,
  reopenItem,
  sendFixRequest,
  setClientSmsOptOut,
  verifyClientCode,
  waiveItem,
} from "@/lib/data";
import { resetDemoState } from "@/lib/demo/store";
import {
  clientChecklistSchema,
  clientItemSchema,
  clientPortalSchema,
  dealPageSchema,
  dealsListSchema,
  reviewItemSchema,
  reviewQueueSchema,
  staffSessionSchema,
} from "@/lib/view-models";

const TOKEN = "demo";
const BARTON = "d0000000-0000-4000-8000-000000000001";
const LEAD = "item-barton-lead"; // missing
const CONTRACT = "item-barton-contract"; // review, 2 findings
const DISCLOSURE = "item-barton-disclosure"; // needs_fix

beforeEach(() => {
  vi.stubEnv("MARA_DEMO", "1");
  resetDemoState();
});
afterEach(() => vi.unstubAllEnvs());

const data = <T>(r: { ok: true; data: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
const must = async <T>(p: Promise<{ ok: boolean } & Record<string, unknown>>): Promise<T> => {
  const r = await p;
  if (!r.ok) throw new Error(String(r.error));
  return r.data as T;
};

/** Client uploads a file to an item (both steps). */
async function clientUploads(itemId: string, filename = "scan.pdf") {
  const slot = await must<{ documentId: string; uploadUrl: string }>(createClientUpload(TOKEN, itemId, { filename, sizeBytes: 1000, mime: "application/pdf" }));
  expect(slot.uploadUrl.startsWith("demo://")).toBe(true);
  await must(confirmClientUpload(TOKEN, slot.documentId));
  return slot.documentId;
}

describe("demo seed", () => {
  it("serves view models that parse, with an item in every status", async () => {
    // Client side first: staff reads settle `checking` into `review`.
    clientPortalSchema.parse(data(await getClientPortal(TOKEN))!);
    const list = clientChecklistSchema.parse(data(await getClientChecklist(TOKEN))!);
    expect(list.checking.map((i) => i.id).sort()).toEqual(["item-barton-contract", "item-barton-preapproval"]);

    staffSessionSchema.parse(data(await getStaffSession()));
    dealsListSchema.parse(data(await listDeals()));
    const deal = dealPageSchema.parse(data(await getDeal(BARTON))!);
    expect(new Set(deal.items.map((i) => i.status))).toEqual(new Set(["missing", "review", "needs_fix", "complete", "waived"]));
  });

  it("has the three deals and a review item with 2 findings", async () => {
    const rows = data(await listDeals()).rows;
    expect(rows.map((r) => r.address).sort()).toEqual(["1208 Barton Hills Dr", "3310 Cherrywood Rd", "44 Rainey St #1802"]);
    const item = reviewItemSchema.parse(data(await getReviewItem(CONTRACT))!);
    expect(item.findings).toHaveLength(2);
    expect(item.suggestedFixNote).toContain("initials");
    const needsFix = data(await getReviewItem(DISCLOSURE))!;
    expect(needsFix.item.status).toBe("needs_fix");
  });

  it("filters deals by search text", async () => {
    expect(data(await listDeals("rainey")).rows).toHaveLength(1);
    expect(data(await listDeals("enoch")).rows[0].address).toBe("1208 Barton Hills Dr");
    expect(data(await listDeals("nothing-matches")).rows).toHaveLength(0);
  });

  it("returns the sample PDF only for a real document", async () => {
    expect(data(await getDocumentFileUrl(BARTON, "doc-barton-contract"))).toEqual({ url: "/demo/sample-document.pdf" });
    expect(data(await getDocumentFileUrl(BARTON, "nope"))).toBeNull();
  });
});

describe("the full loop", () => {
  it("upload → checking → review with findings → fix request → re-upload → complete → deal completes", async () => {
    // The client uploads the missing lead-paint addendum.
    await clientUploads(LEAD);
    let list = data(await getClientChecklist(TOKEN))!;
    expect(list.checking.map((i) => i.id)).toContain(LEAD);

    // The next staff read: Mara has finished and it is waiting for review with canned findings.
    const queue = reviewQueueSchema.parse(data(await listReviewQueue()));
    expect(queue.items.map((i) => i.itemId)).toContain(LEAD);
    expect(data(await getStaffSession()).reviewCount).toBe(queue.items.length);
    const v1 = data(await getReviewItem(LEAD))!;
    expect(v1.item.status).toBe("review");
    expect(v1.document?.version).toBe(1);
    expect(v1.findings.length).toBe(2);

    // The agent sends a fix request.
    const sent = await sendFixRequest(LEAD, v1.suggestedFixNote);
    expect(sent).toMatchObject({ ok: true, mode: "demo" });
    expect(data(await getReviewItem(LEAD))!.item.status).toBe("needs_fix");

    // The client sees the fix note.
    list = data(await getClientChecklist(TOKEN))!;
    const row = list.toDo.find((i) => i.id === LEAD)!;
    expect(row.status).toBe("needs_fix");
    expect(row.fixNote).toBe(v1.suggestedFixNote);
    expect(data(await getClientItem(TOKEN, LEAD))!.item.fixNote).toBe(v1.suggestedFixNote);

    // Re-upload: version 2, which is clean.
    await clientUploads(LEAD, "fixed.pdf");
    const item = clientItemSchema.parse(data(await getClientItem(TOKEN, LEAD))!);
    expect(item.uploads.map((u) => u.filename)).toEqual(["fixed.pdf", "scan.pdf"]);
    const v2 = data(await getReviewItem(LEAD))!;
    expect(v2.document?.version).toBe(2);
    expect(v2.findings).toHaveLength(0);
    expect(v2.versions.map((v) => [v.version, v.status])).toEqual([[2, "checked"], [1, "superseded"]]);

    // The agent marks it complete.
    expect(await markItemComplete(LEAD)).toMatchObject({ ok: true });
    expect(data(await getClientChecklist(TOKEN))!.done.map((i) => i.id)).toContain(LEAD);
  });

  it("completes the deal when every non-waived item is complete, and reopening puts it back", async () => {
    // Cherrywood has 3 items: 2 complete, 1 needs_fix. Reopen then complete the last one.
    const CHERRY = "d0000000-0000-4000-8000-000000000003";
    expect(data(await getDeal(CHERRY))!.deal.status).toBe("open");
    expect((await reopenItem("item-cherry-contract")).ok).toBe(true);
    expect((await markItemComplete("item-cherry-contract")).ok).toBe(true);
    const done = data(await getDeal(CHERRY))!;
    expect(done.deal.status).toBe("complete");
    expect(done.activity[0].text).toMatch(/deal is complete/i);

    expect((await reopenItem("item-cherry-contract")).ok).toBe(true);
    expect(data(await getDeal(CHERRY))!.deal.status).toBe("open");
  });

  it("treats waived items as not required", async () => {
    const CHERRY = "d0000000-0000-4000-8000-000000000003";
    await waiveItem("item-cherry-contract");
    expect(data(await getDeal(CHERRY))!.deal.status).toBe("complete");
  });

  it("walks the review queue with nextItemId", async () => {
    const first = data(await listReviewQueue()).items;
    expect(first.length).toBeGreaterThanOrEqual(2);
    const a = data(await getReviewItem(first[0].itemId))!;
    expect(a.nextItemId).toBe(first[1].itemId);
    const last = data(await getReviewItem(first[first.length - 1].itemId))!;
    expect(last.nextItemId).toBeNull();
  });

  it("dismissing a finding removes it from the suggested fix note", async () => {
    const before = data(await getReviewItem(CONTRACT))!;
    const blocker = before.findings.find((f) => f.severity === "blocker")!;
    await dismissFinding(blocker.id);
    const after = data(await getReviewItem(CONTRACT))!;
    expect(after.findings.find((f) => f.id === blocker.id)?.status).toBe("dismissed");
    expect(after.suggestedFixNote).not.toContain(blocker.clientFixText);
    expect(data(await listReviewQueue()).items.find((i) => i.itemId === CONTRACT)?.blockerCount).toBe(0);
  });

  it("refuses to complete or fix an item with nothing uploaded", async () => {
    expect(await markItemComplete(LEAD)).toMatchObject({ ok: false });
    expect(await sendFixRequest(LEAD, "Please sign.")).toMatchObject({ ok: false });
  });

  it("rejects an empty fix note and bad ids without touching state", async () => {
    expect(await sendFixRequest(CONTRACT, "   ")).toMatchObject({ ok: false });
    expect(await markItemComplete("")).toMatchObject({ ok: false });
    expect(data(await getReviewItem(CONTRACT))!.item.status).toBe("review");
  });
});

describe("demo never sends anything", () => {
  it("says so in every mutation message that would have texted", async () => {
    const fix = await sendFixRequest(CONTRACT, "Please initial page 2.");
    expect(fix.ok && fix.message).toMatch(/no text was sent/i);
  });
});

describe("createDeal", () => {
  const input = {
    address: "9 Test Ln",
    city: "Austin",
    zip: "78702",
    clientName: "Jo Tester",
    clientPhone: "+15125550100",
    smsConsent: true,
    documentTypeKeys: ["sales_contract", "preapproval_letter"],
  };

  it("creates the deal, its checklist and a working client link", async () => {
    const r = await createDeal(input);
    if (!r.ok) throw new Error(r.error);
    const deal = dealPageSchema.parse(data(await getDeal(r.data.dealId))!);
    expect(deal.items.map((i) => i.status)).toEqual(["missing", "missing"]);
    expect(deal.deal.dealNumber).toMatch(/^\d{4}-\d{4}$/);
    const token = r.data.clientLinkUrl!.split("/c/")[1];
    const list = data(await getClientChecklist(token))!;
    expect(list.toDo).toHaveLength(2);
    expect(list.headline).toBe("Hi Jo, 2 things left");
  });

  it("rejects invalid input with the first problem", async () => {
    const r = await createDeal({ ...input, zip: "abc" });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.error).toMatch(/ZIP/);
  });
});

describe("client", () => {
  it("accepts any 6-digit code except 000000, and locks after 5 misses", async () => {
    expect(await verifyClientCode(TOKEN, "123456")).toMatchObject({ ok: true });
    for (let i = 0; i < 5; i++) expect(await verifyClientCode(TOKEN, "000000")).toMatchObject({ ok: false });
    const locked = await verifyClientCode(TOKEN, "123456");
    expect(locked.ok === false && locked.error).toMatch(/too many/i);
  });

  it("toggles SMS reminders", async () => {
    expect(data(await getClientChecklist(TOKEN))!.sms).toEqual({ optedOut: false, canToggle: true });
    await setClientSmsOptOut(TOKEN, true);
    expect(data(await getClientChecklist(TOKEN))!.sms.optedOut).toBe(true);
  });

  it("returns null for an unknown link and hides other deals' items", async () => {
    expect(data(await getClientPortal("nope"))).toBeNull();
    expect(data(await getClientItem(TOKEN, "item-rainey-rep"))).toBeNull();
    expect(await createClientUpload(TOKEN, "item-rainey-rep", { filename: "a.pdf", sizeBytes: 5, mime: "application/pdf" })).toMatchObject({ ok: false });
  });

  it("hides waived items and shows the fix note only on needs-fix items", async () => {
    const list = data(await getClientChecklist(TOKEN))!;
    const all = [...list.toDo, ...list.checking, ...list.done];
    expect(all.map((i) => i.id)).not.toContain("item-barton-hoa");
    expect(list.totalCount).toBe(5);
    expect(list.toDo.find((i) => i.id === DISCLOSURE)?.fixNote).toBeTruthy();
    expect(all.filter((i) => i.status !== "needs_fix").every((i) => i.fixNote === null)).toBe(true);
  });

  it("validates upload metadata", async () => {
    expect(await createClientUpload(TOKEN, LEAD, { filename: "", sizeBytes: 5, mime: "application/pdf" })).toMatchObject({ ok: false });
    expect(await createClientUpload(TOKEN, LEAD, "garbage")).toMatchObject({ ok: false });
  });
});
