/**
 * View models: the contract between the data layer (`@/lib/data`) and every screen.
 * Source of truth: docs/CONTRACTS.md §5 (lean build).
 *
 * - Screens import TYPES from here and call `@/lib/data` functions; they never touch fixtures
 *   or Supabase rows directly.
 * - Every type is inferred from a Zod schema, so tests (and the live data layer) can parse what
 *   they return.
 * - Dates are ISO strings: `IsoDate` = "YYYY-MM-DD" (Postgres `date`), `IsoDateTime` = ISO 8601
 *   with offset (Postgres `timestamptz`). Screens format them (see `@/lib/format`).
 * - `tone` sets the status chip colour (design tokens ok / warn / bad / info / neutral).
 *   Status is always shown as text + colour, so every chip carries a `label`.
 *
 * Safe to import from client components (no server code here).
 */
import { z } from "zod";

export type { Result } from "@/lib/data/result";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const isoDateTime = z.iso.datetime({ offset: true });
export const id = z.string().min(1);

export const toneSchema = z.enum(["ok", "warn", "bad", "info", "neutral"]);
export type Tone = z.infer<typeof toneSchema>;

/** A status chip: always text + colour. */
export const chipSchema = z.object({ label: z.string(), tone: toneSchema });
export type Chip = z.infer<typeof chipSchema>;

export const dataModeSchema = z.enum(["demo", "live"]);
export type DataMode = z.infer<typeof dataModeSchema>;

export const personSchema = z.object({
  id: id,
  name: z.string(),
  initials: z.string().max(3),
});
export type Person = z.infer<typeof personSchema>;

/** Compact deal reference used in lists ("1208 Barton Hills Dr"). */
export const dealRefSchema = z.object({
  id: id,
  dealNumber: z.string(),
  address: z.string(),
  /** "Austin, TX 78704" */
  cityLine: z.string(),
});
export type DealRef = z.infer<typeof dealRefSchema>;

// ---------------------------------------------------------------------------
// Enums (match docs/CONTRACTS.md §2 / §3 exactly)
// ---------------------------------------------------------------------------
export const checklistStatusSchema = z.enum(["missing", "checking", "review", "needs_fix", "complete", "waived"]);
export const documentStatusSchema = z.enum(["uploading", "received", "processing", "checked", "failed", "superseded"]);
export const findingSeveritySchema = z.enum(["blocker", "warning"]);
export const findingStatusSchema = z.enum(["open", "dismissed"]);
export const dealStatusSchema = z.enum(["open", "complete"]);
export const messageKindSchema = z.enum(["invite", "verify_code", "reminder", "fix_request"]);
export const staffRoleSchema = z.enum(["agent", "broker"]);

export type ChecklistStatus = z.infer<typeof checklistStatusSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;
export type FindingStatus = z.infer<typeof findingStatusSchema>;
export type DealStatus = z.infer<typeof dealStatusSchema>;
export type MessageKind = z.infer<typeof messageKindSchema>;
export type StaffRole = z.infer<typeof staffRoleSchema>;

// ---------------------------------------------------------------------------
// Staff session
// ---------------------------------------------------------------------------
export const staffUserSchema = personSchema.extend({
  email: z.string(),
  role: staffRoleSchema,
});
export type StaffUser = z.infer<typeof staffUserSchema>;

export const staffSessionSchema = z.object({
  mode: dataModeSchema,
  user: staffUserSchema,
  brokerageName: z.string(),
  /** Sidebar badge: items waiting for review. */
  reviewCount: z.number().int().min(0),
});
export type StaffSession = z.infer<typeof staffSessionSchema>;

// ---------------------------------------------------------------------------
// /review: queue + HITL screen
// ---------------------------------------------------------------------------
export const reviewQueueRowSchema = z.object({
  itemId: id,
  deal: dealRefSchema,
  clientName: z.string(),
  documentName: z.string(),
  uploadedAt: isoDateTime,
  version: z.number().int().positive(),
  blockerCount: z.number().int().min(0),
  warningCount: z.number().int().min(0),
  documentStatus: documentStatusSchema,
});
export type ReviewQueueRow = z.infer<typeof reviewQueueRowSchema>;

export const reviewQueueSchema = z.object({ items: z.array(reviewQueueRowSchema) });
export type ReviewQueueVM = z.infer<typeof reviewQueueSchema>;

export const findingSchema = z.object({
  id: id,
  severity: findingSeveritySchema,
  chip: chipSchema,
  ruleKey: z.string(),
  message: z.string(),
  /** Plain-language fix shown to the client. */
  clientFixText: z.string(),
  page: z.number().int().positive().nullable(),
  quote: z.string().nullable(),
  status: findingStatusSchema,
});
export type FindingVM = z.infer<typeof findingSchema>;

export const reviewItemSchema = z.object({
  item: z.object({
    id: id,
    name: z.string(),
    description: z.string(),
    status: checklistStatusSchema,
    chip: chipSchema,
    fixNote: z.string().nullable(),
  }),
  deal: dealRefSchema,
  client: z.object({
    name: z.string(),
    /** "•••-•••-4417" */
    phoneMasked: z.string(),
    /** Consent given and not opted out: a fix request SMS can go out. */
    canText: z.boolean(),
  }),
  /** The version under review. `null` when nothing has been uploaded. */
  document: z
    .object({
      id: id,
      filename: z.string(),
      version: z.number().int().positive(),
      uploadedAt: isoDateTime,
      pageCount: z.number().int().positive().nullable(),
      status: documentStatusSchema,
      /** Same-origin route that 302s to the 60-second signed URL. */
      fileHref: z.string(),
      aiSummary: z.string().nullable(),
    })
    .nullable(),
  findings: z.array(findingSchema),
  versions: z.array(
    z.object({ id: id, version: z.number().int().positive(), uploadedAt: isoDateTime, status: documentStatusSchema }),
  ),
  /** Fix note pre-filled from the open findings' `clientFixText`. */
  suggestedFixNote: z.string(),
  /** Next item in the review queue after this one. */
  nextItemId: id.nullable(),
});
export type ReviewItemVM = z.infer<typeof reviewItemSchema>;

// ---------------------------------------------------------------------------
// /deals
// ---------------------------------------------------------------------------
export const dealListRowSchema = dealRefSchema.extend({
  clientName: z.string(),
  status: dealStatusSchema,
  chip: chipSchema,
  doneCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  reviewCount: z.number().int().min(0),
  needsFixCount: z.number().int().min(0),
  updatedAt: isoDateTime,
});
export type DealListRow = z.infer<typeof dealListRowSchema>;

export const dealsListSchema = z.object({ rows: z.array(dealListRowSchema) });
export type DealsListVM = z.infer<typeof dealsListSchema>;

export const staffChecklistItemSchema = z.object({
  id: id,
  name: z.string(),
  status: checklistStatusSchema,
  chip: chipSchema,
  dueDate: isoDate.nullable(),
  lastUploadAt: isoDateTime.nullable(),
  openFindings: z.number().int().min(0),
  fixNote: z.string().nullable(),
});
export type StaffChecklistItem = z.infer<typeof staffChecklistItemSchema>;

export const activityEntrySchema = z.object({
  id: id,
  at: isoDateTime,
  /** "Rachel", "Mara", "Enoch" or "System" */
  actorLabel: z.string(),
  text: z.string(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const dealPageSchema = z.object({
  deal: dealRefSchema.extend({
    status: dealStatusSchema,
    chip: chipSchema,
    remindersEnabled: z.boolean(),
    /** Only when the link is known (demo, or just created). The DB stores a hash. */
    clientLinkUrl: z.string().nullable(),
  }),
  client: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().nullable(),
    smsConsent: z.boolean(),
    optedOut: z.boolean(),
  }),
  items: z.array(staffChecklistItemSchema),
  activity: z.array(activityEntrySchema),
});
export type DealPageVM = z.infer<typeof dealPageSchema>;

// ---------------------------------------------------------------------------
// /deals/new
// ---------------------------------------------------------------------------
export const newDealFormSchema = z.object({
  documentTypes: z.array(z.object({ key: z.string(), name: z.string(), description: z.string(), defaultOn: z.boolean() })),
  /** Exact SMS-consent wording shown next to the checkbox. */
  consentWording: z.string(),
});
export type NewDealFormVM = z.infer<typeof newDealFormSchema>;

/** Server-side validation for "New deal". Also used by the form for field errors. */
export const newDealInputSchema = z.object({
  address: z.string().trim().min(3, "Enter the street address.").max(200),
  city: z.string().trim().min(2, "Enter the city.").max(100),
  zip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP."),
  clientName: z.string().trim().min(2, "Enter the client's name.").max(120),
  clientPhone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use international format, like +15125550142."),
  clientEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().email("Enter a valid email.").max(200).optional(),
  ),
  smsConsent: z.boolean(),
  documentTypeKeys: z.array(z.string().min(1)).min(1, "Pick at least one document."),
  dueDate: z.preprocess((v) => (v === "" ? undefined : v), isoDate.optional()),
});
export type NewDealInput = z.infer<typeof newDealInputSchema>;

export const createDealResultSchema = z.object({
  dealId: id,
  /** The raw client link, shown once (the database only stores its hash). `null` when not available. */
  clientLinkUrl: z.string().nullable(),
});
export type CreateDealResult = z.infer<typeof createDealResultSchema>;

// ---------------------------------------------------------------------------
// Client portal (/c/[token])
// ---------------------------------------------------------------------------
/** Shell for every client page. */
export const clientPortalSchema = z.object({
  mode: dataModeSchema,
  token: z.string(),
  client: z.object({ firstName: z.string(), name: z.string() }),
  deal: z.object({ address: z.string(), cityLine: z.string() }),
  agent: z.object({ name: z.string(), phone: z.string().nullable() }),
  /** True: show the verify screen before anything else. */
  needsVerification: z.boolean(),
});
export type ClientPortalVM = z.infer<typeof clientPortalSchema>;

export const clientVerifySchema = z.object({
  firstName: z.string(),
  /** "•••-•••-4417" */
  phoneMasked: z.string(),
  agentName: z.string(),
  state: z.enum(["ready", "expired", "locked"]),
  resendAfterSeconds: z.number().int().min(0),
});
export type ClientVerifyVM = z.infer<typeof clientVerifySchema>;

export const clientItemStatusSchema = z.enum(["to_do", "needs_fix", "checking", "done"]);
export type ClientItemStatus = z.infer<typeof clientItemStatusSchema>;

export const clientChecklistItemSchema = z.object({
  id: id,
  name: z.string(),
  /** Plain "what is this". */
  description: z.string(),
  status: clientItemStatusSchema,
  chip: chipSchema,
  /** Mara has finished checking and the agent is reviewing it (status stays `checking`). */
  checked: z.boolean().default(false),
  /** The agent's fix request, shown when status is `needs_fix`. */
  fixNote: z.string().nullable(),
  dueDate: isoDate.nullable(),
  uploadedAt: isoDateTime.nullable(),
});
export type ClientChecklistItem = z.infer<typeof clientChecklistItemSchema>;

export const clientChecklistSchema = z.object({
  /** "Hi Enoch, 3 things left" */
  headline: z.string(),
  doneCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  /** To do, including needs-fix items. */
  toDo: z.array(clientChecklistItemSchema),
  checking: z.array(clientChecklistItemSchema),
  done: z.array(clientChecklistItemSchema),
  sms: z.object({ optedOut: z.boolean(), canToggle: z.boolean() }),
});
export type ClientChecklistVM = z.infer<typeof clientChecklistSchema>;

export const clientUploadConfigSchema = z.object({
  maxBytes: z.number().int().positive(),
  acceptedTypes: z.array(z.string()),
  acceptLabel: z.string(),
});
export type ClientUploadConfig = z.infer<typeof clientUploadConfigSchema>;

export const clientItemSchema = z.object({
  item: clientChecklistItemSchema,
  uploads: z.array(
    z.object({ id: id, filename: z.string(), uploadedAt: isoDateTime, statusLabel: z.string() }),
  ),
  upload: clientUploadConfigSchema,
});
export type ClientItemVM = z.infer<typeof clientItemSchema>;

/** What the browser sends before uploading (the bytes go browser → Storage, never through here). */
export const clientUploadInputSchema = z.object({
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  mime: z.string().min(1).max(200),
});
export type ClientUploadInput = z.infer<typeof clientUploadInputSchema>;

export const clientUploadTargetSchema = z.object({ documentId: id, uploadUrl: z.string() });
export type ClientUploadTarget = z.infer<typeof clientUploadTargetSchema>;

export const clientVerifyResultSchema = z.object({ verified: z.boolean(), attemptsLeft: z.number().int().min(0) });
export type ClientVerifyResult = z.infer<typeof clientVerifyResultSchema>;

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
/**
 * Every mutation returns this. In demo mode `mode === "demo"`: the UI shows a "Demo" toast
 * with `message`, and nothing left the system.
 */
export type MutationResult<T = undefined> =
  | { ok: true; mode: DataMode; message: string; data: T }
  | { ok: false; mode: DataMode; error: string };
