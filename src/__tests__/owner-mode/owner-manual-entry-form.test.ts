/**
 * Owner manual-entry FORM contract (PASS 45) — pure unit proof.
 *
 * Proves the owner-facing manual-entry definition is safe and backend-consistent: every section maps to a
 * valid governed OwnerInputCategory; the mandatory privacy warning + safe copy are present; the PII guard
 * (reusing the proven stripPii) detects email/phone/named-contact and passes placeholders; and validation
 * mirrors the parser's rules (required note, non-negative amounts, at least one usable field) plus a PII block.
 */
import { describe, it, expect } from "vitest";
import { OWNER_INPUT_CATEGORIES } from "@/domain/owner-mode/input-catalog";
import {
  MANUAL_ENTRY_SECTIONS, MANUAL_ENTRY_WARNING, MANUAL_ENTRY_SAFE_COPY,
  detectPiiInFields, validateManualEntry, buildManualEntryFields, sectionById,
} from "@/domain/owner-mode/owner-manual-entry-form";

describe("owner manual-entry form contract", () => {
  it("1. every section maps to a valid governed OwnerInputCategory and has an id + a required note", () => {
    expect(MANUAL_ENTRY_SECTIONS.length).toBeGreaterThanOrEqual(10);
    for (const s of MANUAL_ENTRY_SECTIONS) {
      expect(OWNER_INPUT_CATEGORIES as readonly string[]).toContain(s.category);
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.fields.some((f) => f.key === "note" && f.required)).toBe(true);
    }
  });

  it("2. section ids are unique and there is at least one essential + one optional section", () => {
    const ids = MANUAL_ENTRY_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MANUAL_ENTRY_SECTIONS.some((s) => s.essential)).toBe(true);
    expect(MANUAL_ENTRY_SECTIONS.some((s) => !s.essential)).toBe(true);
  });

  it("3. the mandatory privacy warning names the forbidden fields", () => {
    expect(MANUAL_ENTRY_WARNING).toMatch(/phone numbers/i);
    expect(MANUAL_ENTRY_WARNING).toMatch(/emails/i);
    expect(MANUAL_ENTRY_WARNING).toMatch(/passwords/i);
    expect(MANUAL_ENTRY_WARNING).toMatch(/payroll|contracts|invoices/i);
  });

  it("4. the safe copy carries the placeholders + no-external-action + owner-approval + evidence guidance", () => {
    const blob = MANUAL_ENTRY_SAFE_COPY.join(" ").toLowerCase();
    expect(blob).toMatch(/operational facts, not personal identities/);
    expect(blob).toMatch(/customer_001|staff_a|vendor_a/);
    expect(blob).toMatch(/will not contact anyone/);
    expect(blob).toMatch(/owner approval/);
    expect(blob).toMatch(/evidence is required/);
  });

  it("5. detectPiiInFields flags an email", () => {
    expect(detectPiiInFields({ note: "customer emailed test@example.com about it" }).hasPii).toBe(true);
  });

  it("6. detectPiiInFields flags a phone number", () => {
    expect(detectPiiInFields({ note: "call them on 07700 900123" }).hasPii).toBe(true);
  });

  it("7. detectPiiInFields flags a named contact / titled name", () => {
    expect(detectPiiInFields({ note: "spoke to Mr Smith about the delay" }).hasPii).toBe(true);
  });

  it("8. detectPiiInFields passes clean operational text with placeholders", () => {
    const r = detectPiiInFields({ note: "STAFF_A missed CUSTOMER_001 pickup; VENDOR_A late", evidenceRef: "order-note-123" });
    expect(r.hasPii).toBe(false);
    expect(r.offendingKeys).toEqual([]);
  });

  it("9. validateManualEntry requires an operational note", () => {
    const s = sectionById("current_issue")!;
    const r = validateManualEntry(s, { note: "" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/operational note/i);
  });

  it("10. validateManualEntry rejects a negative amount in plain language", () => {
    const s = sectionById("cash_cost")!;
    const r = validateManualEntry(s, { note: "cash tight", cashInHand: -5 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/non-negative/i);
  });

  it("11. validateManualEntry blocks PII with redaction guidance", () => {
    const s = sectionById("customer_quality")!;
    const r = validateManualEntry(s, { note: "Mrs Sen at sen@mail.com complained" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/personal data detected|placeholder like CUSTOMER_001/i);
  });

  it("12. validateManualEntry accepts a clean operational note", () => {
    const s = sectionById("current_issue")!;
    const r = validateManualEntry(s, { note: "late deliveries this week on several orders", evidenceRef: "order-note-123" });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("13. buildManualEntryFields trims strings and drops empty/undefined values", () => {
    const out = buildManualEntryFields({ note: "  hi  ", empty: "  ", n: 5, gone: null });
    expect(out).toEqual({ note: "hi", n: 5 });
  });
});
