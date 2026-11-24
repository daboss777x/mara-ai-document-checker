/**
 * Hand-written row types for the lean schema (docs/CONTRACTS.md §3). Used by the RLS-respecting
 * Supabase clients so the live data layer is typed. Replace with generated types once the
 * migrations land (`npx supabase@2 gen types typescript`).
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRow = {
  id: string;
  brokerage_id: string;
  role: "agent" | "broker";
  name: string;
  email: string | null;
  phone: string | null;
};
export type BrokerageRow = { id: string; name: string; timezone: string };
export type DealRow = {
  id: string;
  brokerage_id: string;
  deal_number: string;
  agent_id: string;
  property_address: string;
  city: string;
  state: string;
  zip: string;
  status: "open" | "complete";
  reminders_enabled: boolean;
  created_at: string;
  updated_at: string;
};
export type ClientRow = {
  id: string;
  deal_id: string;
  name: string;
  phone: string;
  email: string | null;
  sms_consent_at: string | null;
  sms_opt_out_at: string | null;
  timezone: string;
};
export type ClientLinkRow = {
  id: string;
  client_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};
export type DocumentTypeRow = { key: string; name: string; description: string; standard_key: string };
export type ChecklistItemRow = {
  id: string;
  deal_id: string;
  document_type_key: string;
  status: "missing" | "checking" | "review" | "needs_fix" | "complete" | "waived";
  fix_note: string | null;
  due_date: string | null;
  sort_order: number;
  completed_at: string | null;
  completed_by: string | null;
};
export type DocumentRow = {
  id: string;
  deal_id: string;
  checklist_item_id: string;
  version: number;
  file_path: string | null;
  original_filename: string | null;
  page_count: number | null;
  status: "uploading" | "received" | "processing" | "checked" | "failed" | "superseded";
  ai_summary: string | null;
  checked_at: string | null;
  created_at: string;
};
export type FindingRow = {
  id: string;
  document_id: string;
  checklist_item_id: string;
  severity: "blocker" | "warning";
  rule_key: string;
  message: string;
  client_fix_text: string | null;
  page: number | null;
  quote: string | null;
  status: "open" | "dismissed";
  dismissed_by: string | null;
  created_at: string;
};
export type MessageRow = {
  id: string;
  deal_id: string;
  client_id: string;
  kind: "invite" | "verify_code" | "reminder" | "fix_request";
  body: string;
  status: "queued" | "sent" | "failed" | "blocked";
  approved_by: string | null;
  approved_at: string | null;
};
export type AuditLogRow = {
  id: string;
  deal_id: string | null;
  actor: "agent" | "client" | "mara" | "system";
  actor_id: string | null;
  action: string;
  details_json: Json;
  created_at: string;
};

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      users: Table<UserRow>;
      brokerages: Table<BrokerageRow>;
      deals: Table<DealRow>;
      clients: Table<ClientRow>;
      client_links: Table<ClientLinkRow>;
      document_types: Table<DocumentTypeRow>;
      checklist_items: Table<ChecklistItemRow>;
      documents: Table<DocumentRow>;
      findings: Table<FindingRow>;
      messages: Table<MessageRow>;
      audit_log: Table<AuditLogRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
