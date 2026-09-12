# Opportunity Portfolio / Capital Allocation — Depth Pass

Classification: `OPPORTUNITY_PORTFOLIO_CAPITAL_ALLOCATION_REAL_AND_OWNER_VISIBLE`

The final stage of the opportunity loop. It takes the promoted candidates (PASS 7) and their validation
experiments + status (PASS 8) and allocates each into a governed portfolio decision, enforcing the loop's
hardest rule: **capital and scale go only to opportunities whose validation has actually passed.** Nothing
scales on a hunch.

## A. Files created
- `src/domain/owner-mode/opportunity-portfolio-capital-allocation.ts` — the pure decide→scaling-gate→band loop.
- `src/__tests__/owner-mode/opportunity-portfolio-capital-allocation.test.ts` — 13 unit tests.
- `src/__tests__/components/portfolio-panel.test.tsx` — 9 jsdom component tests.
- `src/__tests__/execution/opportunity-portfolio-capital-allocation-simulation.db.test.ts` — DB-backed laundry sim + scaling-gate proof.
- `docs/remediation/opportunity-portfolio-capital-allocation-depth-pass/REPORT.md` — this file.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `opportunityPortfolio` added to `OwnerNowViewPayload`; `buildOpportunityPortfolio` run over the promoted candidates + validation analysis with the same cash/profit + capability context. No candidates → null.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `PortfolioPanel` + view types.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — the "Where capital goes next" subsection inside the Grow cockpit group.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — mock extended; asserts the portfolio panel renders.
- `.github/workflows/db-verification.yml` — new DB sim added to LANE_B and LANE_A file lists.

## C. Schema changes
None. The engine consumes the already-derived candidates + validation analysis; the portfolio is a pure derivation.

## D. Backend logic implemented (a real capital-allocation gate, not an enum shell)
- **8 portfolio decisions**: NEEDS_DATA, VALIDATE_CHEAPLY, OWNER_REVIEW_REQUIRED, PARK, REJECT, KILL, DO_NOW, SCALE_CANDIDATE.
- **`decidePortfolioItem`** — allocates one candidate into a ~24-field portfolio item (decision, validation status, capacity-known, capital-at-risk band, expected-return band, scale-blocked reason, recommended action, approval, refs) given its validation status.
- **The scaling gate (the whole point)**:
  - `SCALE_CANDIDATE` / `DO_NOW` are **unreachable unless validation status is PASSED** AND cash-safe AND capacity known AND legal clear AND no capability gap. A low-risk passed item is `DO_NOW` (small scale); anything larger is a `SCALE_CANDIDATE` requiring owner approval.
  - A PASSED item still blocked by an active cash/profit risk, high cash risk, unknown capacity, or unclear legal exposure → `OWNER_REVIEW_REQUIRED` with an explicit `scaleBlockedReason`.
  - `KILL` is reachable only when validation status is `FAILED` (a real negative result, not a guess).
  - Everything unvalidated falls back to VALIDATE_CHEAPLY / NEEDS_DATA / OWNER_REVIEW / PARK / REJECT.
- **`buildOpportunityPortfolio`** — matches each candidate to its experiment, allocates, ranks act-on-proof first, assigns priority, and surfaces only the single top action + a summary.
- **Guarantees**: no fabricated money (capital-at-risk and expected return are qualitative bands only); an always-present capital-discipline note ("capital follows proof, not hunches"); no profit guarantee, no reckless scale-now, no hidden score.

## E. Frontend logic implemented
`PortfolioPanel` (Executive Cockpit standard): the single top portfolio decision, the validation status that
gates it, an explicit scale-blocked / scale-unblocked line, qualitative capital-at-risk + expected-return
bands, the always-present capital-discipline note, an owner-approval badge where material, and an allocation
summary — never a raw dump. Rendered as a "Where capital goes next" subsection under the Grow cockpit group.

## F. Acceptance criteria checklist
- [x] Pure engine, ≥7 portfolio decisions (8 implemented).
- [x] ~24-field portfolio item.
- [x] Validation status gates scaling: SCALE_CANDIDATE / DO_NOW require PASSED; KILL requires FAILED.
- [x] Cash / capacity / legal / capability block a passed item → owner review with a reason.
- [x] No fabricated money (bands only); no profit guarantee; no reckless scale; no hidden score.
- [x] Wired into the Owner Now View + owner cockpit panel + page.
- [x] 13 domain + 9 component + page assertions + DB sim (scaling gate).
- [x] DB sim wired into LANE_B/LANE_A.
- [x] `tsc` 0 · governance 31 frozen / 0 new · lint:ratchet PASS.

## G. Known limitations
- Validation status is read from the matched experiment; because a live now-view derivation always produces
  `NOT_STARTED` experiments, the live portfolio never reaches SCALE_CANDIDATE / DO_NOW / KILL by construction —
  those paths require a recorded experiment outcome (a persistence path out of this slice's scope) and are
  proven by unit tests + the DB sim with injected PASSED/FAILED statuses.
- Candidate↔experiment matching is by (signal-source type + opportunity type); a persisted experiment id link
  is the natural next step once experiment outcomes are stored.

## H. Manual verification steps
1. `npx vitest run src/__tests__/owner-mode/opportunity-portfolio-capital-allocation.test.ts` → 13 passed.
2. `npx vitest run src/__tests__/components/portfolio-panel.test.tsx` → 9 passed.
3. `npx vitest run src/__tests__/app/owner-process-intelligence-page.test.tsx` → passes with the portfolio panel asserted.
4. LANE_B/LANE_A run `opportunity-portfolio-capital-allocation-simulation.db.test.ts` against real Postgres.
5. Load `/owner/process-intelligence` → open "Grow: opportunities to validate" → "Where capital goes next".

## I. Trigger map
Promoted candidates (PASS 7) + validation analysis (PASS 8) → `buildOpportunityPortfolio` →
`opportunityPortfolio` in the Owner Now View → `PortfolioPanel`.

## J. Failure modes covered
Unvalidated → capital withheld, validate/collect first; passed + safe → do-now / scale candidate (owner-gated);
passed but cash/capacity/legal blocked → owner review with reason; failed → kill; rejected → reject; clean
workspace → null; no fabricated money, no profit guarantee, no reckless scale, no hidden score, no
fraud/HR-discipline language.

## K. Events emitted
None (read/derivation path; no mutation).

## L. Automated tests added
13 pure + 9 component + 1 page assertion + 3 DB-sim checks (2 DB-backed + 1 scaling-gate) = 26 new checks.
