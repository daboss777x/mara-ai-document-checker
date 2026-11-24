import { describe, expect, it } from "vitest";
import {
  checklistStatusSchema,
  clientChecklistSchema,
  clientItemStatusSchema,
  documentStatusSchema,
  findingSchema,
  newDealInputSchema,
  reviewQueueRowSchema,
} from "@/lib/view-models";

const valid = {
  address: "1208 Barton Hills Dr",
  city: "Austin",
  zip: "78704",
  clientName: "Enoch Omunu",
  clientPhone: "+15125550142",
  smsConsent: true,
  documentTypeKeys: ["sales_contract"],
};

describe("newDealInputSchema", () => {
  it("accepts a valid deal and treats blank optional fields as absent", () => {
    const r = newDealInputSchema.parse({ ...valid, clientEmail: "", dueDate: "" });
    expect(r.clientEmail).toBeUndefined();
    expect(r.dueDate).toBeUndefined();
    expect(newDealInputSchema.parse({ ...valid, clientEmail: "e@example.com", dueDate: "2026-12-01" })).toMatchObject({ clientEmail: "e@example.com", dueDate: "2026-12-01" });
  });

  it.each([
    ["zip", { zip: "7870" }],
    ["zip", { zip: "78704-1234" }],
    ["clientPhone", { clientPhone: "5125550142" }],
    ["clientPhone", { clientPhone: "+0125550142" }],
    ["clientEmail", { clientEmail: "not-an-email" }],
    ["documentTypeKeys", { documentTypeKeys: [] }],
    ["dueDate", { dueDate: "12/01/2026" }],
    ["address", { address: "" }],
    ["smsConsent", { smsConsent: "yes" }],
  ])("rejects a bad %s", (field, patch) => {
    const r = newDealInputSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });

  it("trims whitespace", () => {
    expect(newDealInputSchema.parse({ ...valid, address: "  9 Test Ln  " }).address).toBe("9 Test Ln");
  });
});

describe("enums match docs/CONTRACTS.md §2", () => {
  it("checklist, document and client item statuses", () => {
    expect(checklistStatusSchema.options).toEqual(["missing", "checking", "review", "needs_fix", "complete", "waived"]);
    expect(documentStatusSchema.options).toEqual(["uploading", "received", "processing", "checked", "failed", "superseded"]);
    expect(clientItemStatusSchema.options).toEqual(["to_do", "needs_fix", "checking", "done"]);
  });
});

describe("view model schemas", () => {
  it("parses a finding and rejects an unknown severity", () => {
    const f = { id: "f1", severity: "blocker", chip: { label: "Blocker", tone: "bad" }, ruleKey: "r", message: "m", clientFixText: "c", page: 2, quote: null, status: "open" };
    expect(findingSchema.parse(f)).toEqual(f);
    expect(findingSchema.safeParse({ ...f, severity: "info" }).success).toBe(false);
  });

  it("requires ISO date-times with an offset on queue rows", () => {
    const row = { itemId: "i", deal: { id: "d", dealNumber: "2026-0142", address: "a", cityLine: "c" }, clientName: "x", documentName: "y", uploadedAt: "2026-11-24T09:00:00-06:00", version: 1, blockerCount: 0, warningCount: 0, documentStatus: "checked" };
    expect(reviewQueueRowSchema.safeParse(row).success).toBe(true);
    expect(reviewQueueRowSchema.safeParse({ ...row, uploadedAt: "yesterday" }).success).toBe(false);
  });

  it("parses what Mara sends once its keys are camelized", () => {
    const vm = { headline: "Hi Enoch, 1 thing left", doneCount: 0, totalCount: 1, toDo: [{ id: "i", name: "n", description: "d", status: "needs_fix", chip: { label: "Needs a fix", tone: "warn" }, fixNote: "Sign p2", dueDate: null, uploadedAt: null }], checking: [], done: [], sms: { optedOut: false, canToggle: true } };
    expect(clientChecklistSchema.safeParse(vm).success).toBe(true);
  });
});
