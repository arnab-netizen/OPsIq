# Deferred / Broad Gaps (PASS 45)

## Delivered
A dedicated, low-load owner manual-entry UI at `/owner/manual-entry`, wired to the existing proven governed
backend (`POST /api/owner/manual-entry` → `submitManualEntry` → `OwnerDataIntake`), with a PII guard that
reuses the proven `stripPii` sanitizer (client + server), progressive disclosure, and mandatory privacy copy.
Unit 13/13, component 10/10, browser 6/6. **R1 narrowed → effectively removed.**

## Deferred beyond PASS 45
1. **Bulk manual entry.** The new form saves one record per section (deliberate low-load). Bulk CSV/paste
   import stays on `/owner/intake` (already proven). A bulk manual-entry mode is not needed for self-use.
2. **Richer per-category fields.** The form uses a generic note + a few aggregates per section; the backend
   parser accepts a flexible field record. Category-specific structured fields (e.g. a dated cash series) are a
   later refinement — not required for the owner to make OpsIQ useful.
3. **`/dashboard` → manual-entry link (R6).** The form is reachable from the `/owner` sidebar; surfacing it from
   the post-login `/dashboard` is part of the R6 navigation fix (a later pass).

## Explicitly out of scope (frozen — not built)
Public SaaS, billing, Product Hunt, launch, paid promotion, live integrations, Local Mode, LLM/NLP, autonomous
browsing/action, a CRM, file-intelligence beyond current safe capability, any new decision engine.

## Honest limitation
This proves the owner can safely log operating facts into the governed substrate via a dedicated UI. It does
not add a new capability to OpsIQ's reasoning — it feeds the existing one. No fabricated financials, no external
action, no raw PII stored.
