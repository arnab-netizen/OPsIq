/**
 * Owner MANUAL-ENTRY FORM contract (PASS 45) — the single, pure definition of the owner-facing manual-entry
 * surface. It maps the low-load owner sections to the proven `OwnerInputCategory` taxonomy (input-catalog),
 * defines the mandatory privacy copy, and provides a PII guard that REUSES the proven `stripPii` sanitizer
 * (no second PII definition). It contains NO decision logic, NO DB, NO IO — the governed backend
 * (`/api/owner/manual-entry` → `submitManualEntry` → parser → `OwnerDataIntake`) remains the authority.
 *
 * Owner sections are a friendly grouping over the 20 canonical categories; each section resolves to exactly
 * one `OwnerInputCategory`, so a submission is always a valid record for the existing parser. The form never
 * collects PII: the guard blocks a submission whose free-text fields contain an email/phone/named-contact.
 */
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";
import { stripPii } from "@/domain/owner-mode/public-signal-interpretation";

/** Mandatory pre-submission warning + safe copy shown on the manual-entry page. */
export const MANUAL_ENTRY_WARNING =
  "Do not enter customer phone numbers, emails, full names, addresses, bank details, passwords, contracts, payroll records, or unredacted invoices.";
export const MANUAL_ENTRY_SAFE_COPY: readonly string[] = [
  "Enter operational facts, not personal identities.",
  "Use placeholders such as CUSTOMER_001, STAFF_A, VENDOR_A.",
  "OpsIQ will not contact anyone or take external action.",
  "Material actions still require owner approval.",
  "Evidence is required before completion.",
];

export interface ManualEntryFieldSpec {
  /** The `fields` key sent to the backend record (stable, parser-friendly). */
  key: string;
  label: string;
  /** "text" = free operational note; "amount" = non-negative aggregate number; "shorttext" = one line. */
  kind: "text" | "amount" | "shorttext";
  required?: boolean;
  placeholder?: string;
}

export interface ManualEntrySection {
  /** Stable section id used by the UI + tests. */
  id: string;
  title: string;
  /** The canonical category this section persists as (one section → one category). */
  category: OwnerInputCategory;
  /** Essential sections render first (expanded); optional sections are collapsed by default (progressive disclosure). */
  essential: boolean;
  helper: string;
  fields: ManualEntryFieldSpec[];
}

const EVIDENCE_FIELD: ManualEntryFieldSpec = { key: "evidenceRef", label: "Evidence reference (id only, optional)", kind: "shorttext", placeholder: "e.g. order-note-123 (not the contents)" };
const MISSING_FIELD: ManualEntryFieldSpec = { key: "missingData", label: "What you don't know yet (optional)", kind: "shorttext", placeholder: "e.g. exact defect rate is unknown" };
const NOTE = (placeholder: string): ManualEntryFieldSpec => ({ key: "note", label: "What happened (operational note)", kind: "text", required: true, placeholder });

/** The 10 owner-facing sections. Essential first; the rest collapse. Each resolves to one governed category. */
export const MANUAL_ENTRY_SECTIONS: readonly ManualEntrySection[] = [
  { id: "business_snapshot", title: "Business snapshot", category: "customer_count", essential: true,
    helper: "A quick sense of your current volume (no personal data).",
    fields: [NOTE("e.g. about 40 orders/week, steady"), { key: "orderCount", label: "Recent order/customer count (optional)", kind: "amount", placeholder: "40" }, MISSING_FIELD] },
  { id: "current_issue", title: "Current issue", category: "proof_completion", essential: true,
    helper: "The main operating problem you want help with right now.",
    fields: [NOTE("e.g. late deliveries this week on several orders"), EVIDENCE_FIELD, MISSING_FIELD] },
  { id: "cash_cost", title: "Cash / cost pressure", category: "cash_debt", essential: false,
    helper: "Owner-supplied aggregates only. No bank details, no counterparties. This note is context only — it doesn't count toward your Money setup. For that, add a snapshot on the Money page.",
    fields: [NOTE("e.g. cash is tight this month"), { key: "cashInHand", label: "Cash in hand (aggregate, optional)", kind: "amount", placeholder: "25000" }, { key: "overdueReceivables", label: "Overdue receivables (aggregate, optional)", kind: "amount" }, MISSING_FIELD] },
  { id: "customer_quality", title: "Customer / quality issue", category: "complaints_reviews", essential: false,
    helper: "Describe the complaint/rework pattern operationally. Use placeholders for people.",
    fields: [NOTE("e.g. repeat complaints about staining after service"), EVIDENCE_FIELD, MISSING_FIELD] },
  { id: "staff_process", title: "Staff / process / SOP issue", category: "sops_checklists", essential: false,
    helper: "Describe the process/SOP gap — a process fact, never a person's character.",
    fields: [NOTE("e.g. no final-check step before hand-off (STAFF_A)"), EVIDENCE_FIELD, MISSING_FIELD] },
  { id: "owner_workload", title: "Owner workload", category: "staff_attendance", essential: false,
    helper: "Where your own time is going.",
    fields: [NOTE("e.g. I handle all customer follow-ups myself"), MISSING_FIELD] },
  { id: "opportunity", title: "Opportunity / growth idea", category: "marketing", essential: false,
    helper: "A growth idea or public opportunity — a signal, not a commitment.",
    fields: [NOTE("e.g. a B2B_CLIENT_A enquiry for weekly service"), MISSING_FIELD] },
  { id: "vendor", title: "Vendor / supply issue", category: "vendor_invoices", essential: false,
    helper: "A supply/vendor problem (use VENDOR_A, no personal contacts).",
    fields: [NOTE("e.g. VENDOR_A delivery late by 5 days"), EVIDENCE_FIELD, MISSING_FIELD] },
  { id: "revenue", title: "Revenue / sales note", category: "revenue_sales", essential: false,
    helper: "Owner-supplied sales aggregate (optional). This note is context only — it doesn't count toward your Money setup. For that, add a snapshot on the Money page.",
    fields: [NOTE("e.g. sales flat vs last month"), { key: "revenue", label: "Period revenue (aggregate, optional)", kind: "amount" }, MISSING_FIELD] },
  { id: "missing_data", title: "Missing / uncertain data", category: "tax_compliance", essential: false,
    helper: "Anything important you know you're missing — OpsIQ will ask rather than guess.",
    fields: [NOTE("e.g. I don't have exact margins yet"), MISSING_FIELD] },
];

export function sectionById(id: string): ManualEntrySection | null {
  return MANUAL_ENTRY_SECTIONS.find((s) => s.id === id) ?? null;
}

export type ManualFieldValue = string | number | boolean | null;

export interface PiiGuardResult { hasPii: boolean; offendingKeys: string[] }

/** Reuse the proven public-signal sanitizer to DETECT PII in free-text fields. Blocks, does not silently store. */
export function detectPiiInFields(fields: Record<string, ManualFieldValue>): PiiGuardResult {
  const offendingKeys: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string" && v.trim().length > 0) {
      if (stripPii(v).removed) offendingKeys.push(k);
    }
  }
  return { hasPii: offendingKeys.length > 0, offendingKeys };
}

export interface ManualEntryValidation { ok: boolean; errors: string[] }

/**
 * Validate one section submission BEFORE it reaches the governed backend:
 *  - at least one usable field value (mirrors the parser's "no usable field values" rule),
 *  - the required note is present,
 *  - amount fields are non-negative (mirrors the parser's amount rule so the owner sees a plain-language error),
 *  - NO PII (blocked with redaction guidance).
 */
export function validateManualEntry(section: ManualEntrySection, fields: Record<string, ManualFieldValue>): ManualEntryValidation {
  const errors: string[] = [];
  const note = fields.note;
  if (typeof note !== "string" || note.trim().length === 0) {
    errors.push("Add a short operational note describing what happened.");
  }
  for (const spec of section.fields) {
    const v = fields[spec.key];
    if (spec.kind === "amount" && typeof v === "number" && (!Number.isFinite(v) || v < 0)) {
      errors.push(`${spec.label} must be a non-negative number.`);
    }
  }
  const usable = Object.values(fields).some((v) => (typeof v === "string" ? v.trim().length > 0 : typeof v === "number" && Number.isFinite(v)));
  if (!usable) errors.push("Enter at least one operating fact before submitting.");
  const pii = detectPiiInFields(fields);
  if (pii.hasPii) {
    errors.push("Personal data detected (email/phone/name). Remove it and use a placeholder like CUSTOMER_001, then resubmit — OpsIQ does not store personal identities.");
  }
  return { ok: errors.length === 0, errors };
}

/** Build the governed backend `fields` record from the section's entered values (drops empty/undefined). */
export function buildManualEntryFields(fields: Record<string, ManualFieldValue>): Record<string, ManualFieldValue> {
  const out: Record<string, ManualFieldValue> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") { const t = v.trim(); if (t.length > 0) out[k] = t; }
    else out[k] = v;
  }
  return out;
}
