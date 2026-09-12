# Broader Owner-Mode Browser E2E — depth pass (PASS 13)

Proves critical Owner-Mode workflows through the real browser UI (real Next app + real Postgres backend +
real seeded data), not only service/unit/DB tests. Two journeys plus negative governance checks, run in the
`owner-pilot-e2e` workflow alongside the existing owner specs.

## 1. PASS 12 merge status
Merged — PR #145 squashed to main `331252b8`.

## 2. Branch
`claude/broader-owner-mode-browser-e2e-depth-pass`

## 3. Main HEAD before
`331252b8` (PASS 12 merged).

## 4. HEAD after
This PR's head.

## 5. Files changed
- `tests/browser/45-owner-opportunity-loop.spec.ts` (created) — journeys A + B + negative checks.
- `scripts/seed-e2e-opportunity.ts` (created) — seeds one live B2B opportunity into the E2E owner workspace via the governed `submitExternalOpportunitySignal` service (existing DB seed path; no fabricated data).
- `.github/workflows/owner-pilot-e2e.yml` (changed) — added the opportunity seed step and spec 45 to the browser run list.

## 6. Browser tests added
Flow 45 (serial, one login as the E2E owner):
- **A1** — `/owner/process-intelligence` loads; the "Grow" cockpit group is a collapsed `<details>` and opens on click (progressive disclosure).
- **A2** — the opportunity **execution** surface renders a real task (owner badge, skip-risk, the OpsIQ-drafts-only guardrail "never submits, contacts customers, or spends", evidence collapsed) or an honest empty state.
- **A3** — the opportunity / validation / portfolio / outcome surfaces each render (real or honest empty).
- **B1** — the top process breakdown is shown first and is NOT nested inside any collapsed group (top action, not a backlog dump).
- **B2** — cash / govern / follow-through are collapsed groups (anti-overload); opening "govern" shows the approval-policy surface with an explicit approval level (high-risk approval gate visible).
- **negative** — the page carries no fabricated money/percent, no fraud/HR-discipline labels, no hidden score, no auto-submit/auto-contact language.
- **B3** — the owner navigates back to the Owner Now View; the link back to process-intelligence is present; no fatal console errors.

## 7. Browser journey A result
PASS — 7/7 locally against the real app (see §12).

## 8. Browser journey B result
PASS — core-operations surfaces render top-action-first with collapsed secondary groups and a visible approval gate.

## 9. Negative checks result
PASS — no fabricated money/percent, no prohibited labels, no hidden score, no auto-submit/auto-contact language.

## 10. Commands run
- `prisma validate` / `prisma generate` — OK
- `tsc --noEmit` — clean
- `governance:scan:strict` — 31 frozen / 0 new
- `lint:ratchet` — PASS (errors 2155→2105, warnings unchanged)
- `npm run build` — BUILD_OK
- Local Postgres 16 (throwaway): `prisma migrate deploy` + `seed-owner-scenarios` + `seed-e2e-proof-risk` + `seed-e2e-opportunity` → app started → `playwright test tests/browser/45-...` → **7 passed**.

## 11. Commands failed/blocked
None. (One authoring bug — `main` matched the app-shell + page `<main>` — was fixed by scoping to the innermost `<main>`; re-run 7/7 green.)

## 12. CI status
Local browser run: **7 passed (4.5s)**. CI `owner-pilot-e2e` runs the same spec with the same seeds; required lanes gated on merge.

## 13. PR/merge status
Open — pending CI gate.

## 14. Main HEAD after merge
To be recorded on merge.

## 15. Whether continuing to PASS 14
Yes — Multi-Actor Throughput Proof, after this PR merges.

## Classification
BROADER_OWNER_MODE_BROWSER_E2E_PROVEN — opportunity journey passes, core-operations journey passes, negative
checks pass, no raw owner overload, no hidden score/unsupported labels, the high-risk approval gate is visible,
and the browser run is green locally (CI mirrors it). No new DB sim was required: the browser seeds through the
existing governed DB seed path.
