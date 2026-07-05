# Bottleneck → Correction Routing — BROWSER WALKTHROUGH

Real app + real backend, in the `owner-pilot-e2e` CI lane (built app on :3001 against a seeded Postgres;
`tests/browser/44-owner-process-intelligence.spec.ts`).

## Setup
`scripts/seed-owner-scenarios.ts` + `scripts/seed-e2e-proof-risk.ts` seed the E2E workspace, including
complaint/rework operational events linked to accepted proofs → a real REWORK_LOOP / QUALITY_FAILURE_LOOP
breakdown, which the router turns into proposed corrections.

## Steps (as the spec drives them)
1. Log in as the real E2E OWNER (`test1@staging.local`).
2. Open `/owner/process-intelligence`. Header **"Where your process is breaking"** loads.
3. The process breakdown panel renders (or an honest DATA_INSUFFICIENT/empty state) — no fraud/negligence
   label, no hidden score.
4. **"What to do about it" → Recommended corrections** renders (`process-corrections-panel`), or the
   honest empty state. When corrections routed:
   - the first correction shows an **instruction** (`pc-item-instruction`),
   - a required-approval badge (`pc-item-approval`) reading Owner / Manager / Staff,
   - the **PROPOSED** status (`pc-item-status`),
   - and no `auto-applied` / `approved automatically` wording anywhere.
5. Navigate back to the Owner Now View via `back-to-now`; no fatal console errors.
6. The Owner Now View still links to the process-intelligence surface (`process-intelligence-link`).

## What this proves
The corrections are a real owner-visible surface fed by the real backend derivation — not a mock — and
they honor the governance stance in the browser: proposals only, owner approval shown explicitly, no
prohibited labels.
