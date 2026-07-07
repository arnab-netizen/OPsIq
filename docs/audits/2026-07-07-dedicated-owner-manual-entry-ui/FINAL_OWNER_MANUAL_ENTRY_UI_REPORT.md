# FINAL — Dedicated Owner Manual-Entry UI (PASS 45)

**Date:** 2026-07-07 · **Branch:** `claude/dedicated-owner-manual-entry-ui`
**Base main:** `ebd66cde` (contains PASS 43 #175, PASS 44 #176)
**Classification:** `OWNER_MANUAL_ENTRY_UI_PROVEN`

## Objective
Remove/narrow restriction **R1** (no dedicated manual-entry form) by giving the owner a dedicated, low-load
manual-entry UI wired to the existing proven governed backend, without weakening any safety gate or duplicating
backend logic.

## 1. Route added
**`/owner/manual-entry`** — `src/app/(authenticated)/owner/manual-entry/page.tsx`. Reachable from the owner
sidebar ("Log business data", `requiresOwner`) and links back to `/owner/cockpit`.

## 2. Backend route used
**`POST /api/owner/manual-entry`** (existing) → `submitManualEntry` → `parseInputRecord` → `OwnerDataIntake`
(owner-confirmed, audited). OWNER_MANAGE-gated, workspace-scoped. **No new decision/persistence logic** — the
only backend addition is a bounded **PII guard** that reuses the proven `stripPii` sanitizer.

## 3. Data fields exposed
10 owner-facing sections (2 essential + 8 optional, collapsed), each resolving to one governed
`OwnerInputCategory`: business snapshot, current issue, cash/cost, customer/quality, staff/process/SOP, owner
workload, opportunity, vendor, revenue, missing/uncertain data. Each has a required operational **note** plus
optional aggregate amounts, an **evidence reference** (id only), and a **missing-data** field.

## 4. Privacy warnings
The mandatory warning is always visible: *"Do not enter customer phone numbers, emails, full names, addresses,
bank details, passwords, contracts, payroll records, or unredacted invoices."* Plus the safe copy: "Enter
operational facts, not personal identities", "Use placeholders such as CUSTOMER_001, STAFF_A, VENDOR_A", "OpsIQ
will not contact anyone or take external action", "Material actions still require owner approval", "Evidence is
required before completion."

## 5. PII handling
Blocked with redaction guidance **client-side** (`validateManualEntry` → `detectPiiInFields`) **and
server-side** (route `detectPiiInFields` → `422 pii_blocked`), reusing the proven public-signal `stripPii`
(email / phone / titled- or contact-name). A PII-bearing note never reaches the backend and is never stored —
proven live in the browser (spec 51 #4).

## 6. Owner workload impact
Structurally low-load: 2 essential sections first, 8 optional collapsed, one governed record per save,
plain-language validation, no raw audit/system text, no re-keying, a clear link to the cockpit. (No measured
time-saving is claimed.)

## 7. Cockpit link / result
Each save persists an owner-confirmed `OwnerDataIntake` that improves the domain confidence read path; the owner
opens `/owner/cockpit` to act on the resulting governed top action / missing-data / evidence / monitor route.
No external action is ever taken.

## 8. Tests run
Unit `owner-manual-entry-form` 13/13 · Component `owner-manual-entry-page` 10/10 · governance:scan:strict
0-new · lint:ratchet 0-new · tsc · next build. (The proven `submitManualEntry`/parser/`OwnerDataIntake` path is
already DB + unit covered; no new DB test needed — no new DB-backed logic was added.)

## 9. Browser proof
`tests/browser/51-owner-manual-entry.spec.ts` — **6/6 local** (built app + seeded workspace + real Chromium):
page + warning + placeholders; optional sections collapsed; reachable from the owner sidebar; **a PII-bearing
note is blocked (client + server) and not saved**; **a redacted operational note saves through the governed
backend**; cockpit link + no PII / fake financials / autonomous copy. Wired into `owner-pilot-e2e`.

## 10. Remaining restrictions
R2 (deploy — PASS 46), R3 (workspace switcher), R4 (mobile cockpit — the new form itself is responsive), R5
(support/undo), R6 (`/dashboard` nav). The manual-entry form is per-section save (one record at a time); bulk
CSV/import stays on `/owner/intake`.

## 11. R1 status
**NARROWED → effectively removed.** The owner now has a dedicated field-by-field manual-entry form wired to the
governed backend with PII protection. Residual: single-record save (not a bulk importer).

## Classification justification
Dedicated route exists and is owner-reachable (sidebar); owner can submit minimum useful redacted data; PII
warnings are visible; PII-like input is blocked/sanitised (client + server, reusing the proven sanitizer);
submission maps to the existing governed backend; owner returns to the cockpit; unsafe actions remain blocked
(no external-action path); owner load stays low; unit + component + browser tests pass. → `OWNER_MANUAL_ENTRY_UI_PROVEN`.
