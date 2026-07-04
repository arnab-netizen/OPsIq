# Module 10 (Connectors & Data Intake) — Slice 4: UI + Command-Center Link — Report

Status: **BUILT + LOCALLY VERIFIED + MERGED TO MAIN.** Owner data-intake page
(`/owner/intake`) over the Slice-3 API + a Data Intake link on the owner home.
Migration already applied (Module 10 Data Intake Migration #1, staging). Module 1 +
all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Slice 3 (API + services) is proven and the migration is applied. The UI is next:
the owner-facing upload → review-candidate → confirm flow, which makes the §17
"owner confirmation before any diagnosis use" tangible.

## 2. Files created / changed

- `src/app/(authenticated)/owner/intake/page.tsx` — upload form (target domain +
  source select + CSV textarea + notes), a candidate review panel (validation
  badge, normalization status, unmapped columns, full error report, a 5-row
  preview of the normalized records) with a **Confirm** action that is disabled for
  an `invalid` candidate, and an intake history list with inline confirm. No
  business logic in the page — canonical `/api/owner/intake/*` only.
- `src/app/(authenticated)/owner/page.tsx` — Data Intake header link.

## 3. Honesty / governance

- No business logic in the page (canonical API only).
- An invalid candidate cannot be confirmed from the UI (button withheld; the API
  also fails closed) — connector data never reaches a diagnosis unconfirmed.
- Normalized values render `—` for nulls (missing/invalid), never invented.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx eslint` (intake page + owner home) | clean |
| `npm run build` | REAL_EXIT=0; `/owner/intake` page + 4 intake API routes registered |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |
| `npm test` (full suite) | 5951 passed / 204 skipped / 0 failed |

## 5. Gate status

**No gate reached by this slice** (UI over the proven API). Merged to `main` (the
migration is applied; the page reads/writes only the proven intake routes). Next is
**Slice 5 — deployed runtime proof** (upload → candidate → confirm against the
deployed app), then Slice 6 (audit). Public/SaaS stays frozen.
