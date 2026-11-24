/**
 * Demo fixtures (FICTITIOUS ONLY): Cedar & Stone Realty, agent Rachel Kim, client Enoch Omunu.
 * Lean story (docs/CONTRACTS.md §3 seed): three deals, items in every status, one item in `review`
 * with 2 findings and one `needs_fix`.
 *
 * `createDemoState()` returns a fresh, mutable copy each call; the store keeps one per process.
 */
import type { ChecklistStatus, DealStatus, DocumentStatus, FindingSeverity, FindingStatus, StaffUser } from "@/lib/view-models";

/** The demo's "now" for seed data: Monday Nov 24 2026, 9:00 AM in Austin. */
export const DEMO_NOW = "2026-11-24T09:00:00-06:00";
/** Enoch Omunu's client link: /c/demo */
export const DEMO_TOKEN = "demo";

export const IDS = {
  brokerage: "b0000000-0000-4000-8000-000000000001",
  rachel: "a0000000-0000-4000-8000-000000000002",
  barton: "d0000000-0000-4000-8000-000000000001",
  rainey: "d0000000-0000-4000-8000-000000000002",
  cherrywood: "d0000000-0000-4000-8000-000000000003",
} as const;

export const DEMO_USER: StaffUser = {
  id: IDS.rachel,
  name: "Rachel Kim",
  initials: "RK",
  email: "rachel.kim@example.com",
  role: "agent",
};

export const DEMO_BROKERAGE_NAME = "Cedar & Stone Realty";
export const DEMO_AGENT_PHONE = "(512) 555-0142";

export type DemoDocType = { key: string; name: string; description: string; defaultOn: boolean };

/** Six fictitious Texas residential types (config/document_types.yaml mirrors these keys). */
export const DOCUMENT_TYPES: DemoDocType[] = [
  { key: "buyer_rep_agreement", name: "Buyer representation agreement", description: "Your agreement with Cedar & Stone to represent you as a buyer. Sign and initial every page.", defaultOn: true },
  { key: "sales_contract", name: "Residential sales contract", description: "The signed purchase contract for the home, with every page initialed.", defaultOn: true },
  { key: "sellers_disclosure", name: "Seller's disclosure notice", description: "The seller's notice about the condition of the property. It needs the seller's signature and date.", defaultOn: true },
  { key: "lead_paint_addendum", name: "Lead-based paint addendum", description: "Required for homes built before 1978. Sign and date it.", defaultOn: true },
  { key: "preapproval_letter", name: "Pre-approval letter", description: "A current letter from your lender showing your pre-approval amount.", defaultOn: true },
  { key: "hoa_addendum", name: "HOA addendum", description: "Only needed if the home is in a homeowners association.", defaultOn: false },
];


export type DemoDeal = {
  id: string;
  dealNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: DealStatus;
  remindersEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  agentId: string;
};

export type DemoClient = {
  id: string;
  dealId: string;
  name: string;
  phone: string;
  email: string | null;
  smsConsent: boolean;
  optedOut: boolean;
  token: string;
  failedAttempts: number;
};

export type DemoItem = {
  id: string;
  dealId: string;
  typeKey: string;
  status: ChecklistStatus;
  fixNote: string | null;
  dueDate: string | null;
  sortOrder: number;
  completedAt: string | null;
};

export type DemoDoc = {
  id: string;
  dealId: string;
  itemId: string;
  version: number;
  filename: string;
  uploadedAt: string;
  status: DocumentStatus;
  pageCount: number | null;
  aiSummary: string | null;
};

export type DemoFinding = {
  id: string;
  documentId: string;
  itemId: string;
  severity: FindingSeverity;
  ruleKey: string;
  message: string;
  clientFixText: string;
  page: number | null;
  quote: string | null;
  status: FindingStatus;
};

export type DemoActivity = { id: string; dealId: string; at: string; actor: "agent" | "client" | "mara" | "system"; text: string };

export type DemoState = {
  seq: number;
  deals: DemoDeal[];
  clients: DemoClient[];
  items: DemoItem[];
  documents: DemoDoc[];
  findings: DemoFinding[];
  activity: DemoActivity[];
};

const SALES_V1_FINDINGS: Omit<DemoFinding, "id" | "documentId" | "itemId">[] = [
  {
    severity: "blocker",
    ruleKey: "required_initials",
    message: "Buyer initials are missing at the bottom of page 2.",
    clientFixText: "Page 2 needs your initials at the bottom.",
    page: 2,
    quote: "Buyer initials: ______  Seller initials: ______",
    status: "open",
  },
  {
    severity: "warning",
    ruleKey: "required_dates",
    message: "The date next to the buyer signature on page 1 looks blank.",
    clientFixText: "Please add today's date next to your signature on page 1.",
    page: 1,
    quote: "Buyer signature: Enoch Omunu   Date: ________",
    status: "open",
  },
];

export function createDemoState(): DemoState {
  const deals: DemoDeal[] = [
    { id: IDS.barton, dealNumber: "2026-0142", address: "1208 Barton Hills Dr", city: "Austin", state: "TX", zip: "78704", status: "open", remindersEnabled: true, createdAt: "2026-11-16T10:00:00-06:00", updatedAt: "2026-11-24T08:40:00-06:00", agentId: IDS.rachel },
    { id: IDS.rainey, dealNumber: "2026-0138", address: "44 Rainey St #1802", city: "Austin", state: "TX", zip: "78701", status: "open", remindersEnabled: true, createdAt: "2026-11-18T14:00:00-06:00", updatedAt: "2026-11-23T16:20:00-06:00", agentId: IDS.rachel },
    { id: IDS.cherrywood, dealNumber: "2026-0145", address: "3310 Cherrywood Rd", city: "Austin", state: "TX", zip: "78722", status: "open", remindersEnabled: false, createdAt: "2026-11-09T09:30:00-06:00", updatedAt: "2026-11-21T11:05:00-06:00", agentId: IDS.rachel },
  ];

  const clients: DemoClient[] = [
    { id: "c0000000-0000-4000-8000-000000000101", dealId: IDS.barton, name: "Enoch Omunu", phone: "+15125550142", email: "enoch.omunu@example.com", smsConsent: true, optedOut: false, token: DEMO_TOKEN, failedAttempts: 0 },
    { id: "c0000000-0000-4000-8000-000000000102", dealId: IDS.rainey, name: "Marcus Bell", phone: "+15125550177", email: null, smsConsent: true, optedOut: false, token: "demo-marcus", failedAttempts: 0 },
    { id: "c0000000-0000-4000-8000-000000000103", dealId: IDS.cherrywood, name: "Dana Whitfield", phone: "+15125550166", email: "dana.whitfield@example.com", smsConsent: true, optedOut: false, token: "demo-dana", failedAttempts: 0 },
  ];

  const item = (n: string, dealId: string, typeKey: string, status: ChecklistStatus, sortOrder: number, extra: Partial<DemoItem> = {}): DemoItem => ({
    id: `item-${n}`,
    dealId,
    typeKey,
    status,
    fixNote: null,
    dueDate: null,
    sortOrder,
    completedAt: status === "complete" ? "2026-11-20T15:00:00-06:00" : null,
    ...extra,
  });

  const items: DemoItem[] = [
    // 1208 Barton Hills Dr (Enoch): every status.
    item("barton-rep", IDS.barton, "buyer_rep_agreement", "complete", 1),
    item("barton-contract", IDS.barton, "sales_contract", "review", 2, { dueDate: "2026-11-27" }),
    item("barton-disclosure", IDS.barton, "sellers_disclosure", "needs_fix", 3, {
      fixNote: "Page 3 needs your initials at the bottom, and please date the signature line.",
      dueDate: "2026-11-28",
    }),
    item("barton-lead", IDS.barton, "lead_paint_addendum", "missing", 4, { dueDate: "2026-11-30" }),
    item("barton-preapproval", IDS.barton, "preapproval_letter", "checking", 5),
    item("barton-hoa", IDS.barton, "hoa_addendum", "waived", 6),
    // 44 Rainey St #1802 (Marcus)
    item("rainey-rep", IDS.rainey, "buyer_rep_agreement", "complete", 1),
    item("rainey-contract", IDS.rainey, "sales_contract", "review", 2),
    item("rainey-preapproval", IDS.rainey, "preapproval_letter", "missing", 3),
    item("rainey-hoa", IDS.rainey, "hoa_addendum", "missing", 4),
    // 3310 Cherrywood Rd (Dana)
    item("cherry-rep", IDS.cherrywood, "buyer_rep_agreement", "complete", 1),
    item("cherry-preapproval", IDS.cherrywood, "preapproval_letter", "complete", 2),
    item("cherry-contract", IDS.cherrywood, "sales_contract", "needs_fix", 3, { fixNote: "Please sign page 4 where the yellow tab is." }),
  ];

  const doc = (n: string, itemId: string, dealId: string, filename: string, uploadedAt: string, status: DocumentStatus, pageCount: number, aiSummary: string | null, version = 1): DemoDoc => ({
    id: `doc-${n}`,
    dealId,
    itemId,
    version,
    filename,
    uploadedAt,
    status,
    pageCount,
    aiSummary,
  });

  const documents: DemoDoc[] = [
    doc("barton-rep", "item-barton-rep", IDS.barton, "buyer-rep-signed.pdf", "2026-11-19T12:10:00-06:00", "checked", 3, "All signatures, initials and dates are present."),
    doc("barton-contract", "item-barton-contract", IDS.barton, "1208-barton-hills-contract.pdf", "2026-11-23T17:45:00-06:00", "checked", 9, "Signed and mostly complete. Initials are missing on page 2 and one date looks blank."),
    doc("barton-disclosure", "item-barton-disclosure", IDS.barton, "sellers-disclosure.pdf", "2026-11-22T10:20:00-06:00", "checked", 6, "Seller signed, but page 3 initials and the signature date are missing."),
    doc("barton-preapproval", "item-barton-preapproval", IDS.barton, "preapproval-letter.jpg", "2026-11-24T08:40:00-06:00", "processing", 1, null),
    doc("rainey-rep", "item-rainey-rep", IDS.rainey, "buyer-rep.pdf", "2026-11-19T09:00:00-06:00", "checked", 3, "All signatures, initials and dates are present."),
    doc("rainey-contract", "item-rainey-contract", IDS.rainey, "rainey-contract.pdf", "2026-11-23T16:20:00-06:00", "checked", 8, "Signed. One date field on page 1 looks blank."),
    doc("cherry-rep", "item-cherry-rep", IDS.cherrywood, "rep-agreement.pdf", "2026-11-10T13:00:00-06:00", "checked", 3, "All signatures, initials and dates are present."),
    doc("cherry-preapproval", "item-cherry-preapproval", IDS.cherrywood, "preapproval.pdf", "2026-11-12T10:30:00-06:00", "checked", 1, "Current letter, signed by the lender."),
    doc("cherry-contract", "item-cherry-contract", IDS.cherrywood, "cherrywood-contract.pdf", "2026-11-20T15:00:00-06:00", "checked", 8, "Buyer signature is missing on page 4."),
  ];

  const finding = (n: string, documentId: string, itemId: string, f: Omit<DemoFinding, "id" | "documentId" | "itemId">): DemoFinding => ({
    id: `finding-${n}`,
    documentId,
    itemId,
    ...f,
  });

  const findings: DemoFinding[] = [
    ...SALES_V1_FINDINGS.map((f, i) => finding(`barton-contract-${i + 1}`, "doc-barton-contract", "item-barton-contract", f)),
    finding("barton-disclosure-1", "doc-barton-disclosure", "item-barton-disclosure", {
      severity: "blocker",
      ruleKey: "required_initials",
      message: "Initials are missing at the bottom of page 3.",
      clientFixText: "Page 3 needs your initials at the bottom.",
      page: 3,
      quote: "Initials: ______",
      status: "open",
    }),
    finding("barton-disclosure-2", "doc-barton-disclosure", "item-barton-disclosure", {
      severity: "warning",
      ruleKey: "required_dates",
      message: "The signature date on page 6 is blank.",
      clientFixText: "Please date the signature line on page 6.",
      page: 6,
      quote: "Date: ________",
      status: "open",
    }),
    finding("rainey-contract-1", "doc-rainey-contract", "item-rainey-contract", {
      severity: "warning",
      ruleKey: "required_dates",
      message: "A date field on page 1 looks blank.",
      clientFixText: "Please add the date next to your signature on page 1.",
      page: 1,
      quote: "Date: ________",
      status: "open",
    }),
    finding("cherry-contract-1", "doc-cherry-contract", "item-cherry-contract", {
      severity: "blocker",
      ruleKey: "required_signatures",
      message: "The buyer signature is missing on page 4.",
      clientFixText: "Please sign page 4 where the yellow tab is.",
      page: 4,
      quote: "Buyer: ______________________",
      status: "open",
    }),
  ];

  const act = (n: number, dealId: string, at: string, actor: DemoActivity["actor"], text: string): DemoActivity => ({ id: `act-${n}`, dealId, at, actor, text });
  const activity: DemoActivity[] = [
    act(1, IDS.barton, "2026-11-16T10:00:00-06:00", "agent", "Rachel created the deal and invited Enoch."),
    act(2, IDS.barton, "2026-11-19T12:10:00-06:00", "client", "Enoch uploaded the buyer representation agreement."),
    act(3, IDS.barton, "2026-11-19T15:00:00-06:00", "agent", "Rachel marked the buyer representation agreement complete."),
    act(4, IDS.barton, "2026-11-22T10:25:00-06:00", "mara", "Mara checked the seller's disclosure notice and found 2 things."),
    act(5, IDS.barton, "2026-11-22T11:00:00-06:00", "agent", "Rachel sent Enoch a fix request for the seller's disclosure notice."),
    act(6, IDS.barton, "2026-11-23T17:50:00-06:00", "mara", "Mara checked the residential sales contract and found 2 things."),
    act(7, IDS.rainey, "2026-11-18T14:00:00-06:00", "agent", "Rachel created the deal and invited Marcus."),
    act(8, IDS.rainey, "2026-11-23T16:25:00-06:00", "mara", "Mara checked the residential sales contract and found 1 thing."),
    act(9, IDS.cherrywood, "2026-11-09T09:30:00-06:00", "agent", "Rachel created the deal and invited Dana."),
    act(10, IDS.cherrywood, "2026-11-21T11:05:00-06:00", "agent", "Rachel sent Dana a fix request for the residential sales contract."),
  ];

  return { seq: 0, deals, clients, items, documents, findings, activity };
}

/** What Mara "finds" in a demo upload: v1 has problems, a re-upload is clean (so the loop closes). */
export function cannedCheck(typeKey: string, version: number): { summary: string; findings: typeof SALES_V1_FINDINGS } {
  if (version <= 1 && typeKey !== "preapproval_letter") {
    return { summary: "Mostly complete. Initials are missing on page 2 and one date looks blank.", findings: SALES_V1_FINDINGS };
  }
  return { summary: "Looks complete: signatures, initials and dates are all present.", findings: [] };
}
