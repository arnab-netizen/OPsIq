# Owner Adjudication UI / Queue — REPORT

## A. Files created
- `src/domain/owner-mode/adjudication-queue.ts` — pure `buildAdjudicationQueue` +
  `ADJUDICATION_OUTCOME_OPTIONS` + `AdjudicationQueueItem` types.
- `src/app/api/owner/proof-risk/queue/route.ts` — GET queue route (OWNER_VIEW, workspace-scoped).
- `src/components/owner/AdjudicationQueue.tsx` — prop-driven owner queue/review component.
- `src/app/(authenticated)/owner/adjudication/page.tsx` — owner adjudication page (fetch + submit).
- `src/__tests__/owner-mode/adjudication-queue.test.ts` — 9 domain unit tests.
- `src/__tests__/components/adjudication-queue.test.tsx` — 9 jsdom component tests.
- `src/__tests__/app/owner-adjudication-page.test.tsx` — 3 jsdom page integration tests.
- `docs/remediation/owner-adjudication-ui-queue-depth-pass/` — this pack (6 docs).

## B. Files changed
- `src/app/(authenticated)/owner/now/page.tsx` — added a "Proof-risk review queue" link (now-view integration).

## C. Schema changes
None. This pass is UI + read-model only; it reuses the existing tables, service, and route.

## D. Backend / server logic
- `buildAdjudicationQueue(nowViewBlocks)` — pure, deterministic flatten of the proof-risk blocks into
  queue items with a deterministic `sourceRef` + `proofIds` (the exact adjudicate-route payload), the
  current adjudication status per (sourceType, sourceRef), severity-first ordering, an `adjudicable`
  flag (COMPLETE + has proofIds), and a summary. Dedupes a timing signal that is also the top gaming
  signal. No risk is re-derived; no outcome is invented.
- `GET /api/owner/proof-risk/queue` — canonical-enforced (OWNER_VIEW, workspace-scoped); calls
  `getOwnerNowView` + `buildAdjudicationQueue`; returns `{ items, summary, outcomeOptions, adjudicationSummary }`.
- Submission uses the **existing** canonical `POST /api/proof-risk/adjudicate` route/service unchanged.

## E. Frontend logic
- `AdjudicationQueue` (prop-driven): renders each item (source, finding, severity, completeness,
  explanation, proof count + representative refs, actor, status, recommended action, missing data),
  offers the seven outcomes, requires a reason (≥3 chars), delegates to `onAdjudicate`, and shows a
  safe success/error result. BLOCKED_BY_DATA items render without a submit control. A standing fairness
  note is always shown. No fetch, no risk logic, no hidden score, no fraud/theft/negligence wording.
- `/owner/adjudication` page: loads the queue, wires `onAdjudicate` to the canonical route with the
  exact payload + an idempotency key, sanitizes errors, and refreshes on success.

## F. Acceptance criteria checklist
- [x] Owner-accessible page renders active proof-risk findings.
- [x] Each item shows why it was raised, evidence refs, source type, severity, completeness, actor,
      status, recommended action, missing data.
- [x] All seven adjudication outcomes are selectable.
- [x] A reason is required before submit.
- [x] Submission uses the existing canonical backend route (no bypass, no UI-only mutation).
- [x] Success updates visible state (cleared finding drops out on refresh; kept-active stays).
- [x] Validation / unauthorized / wrong-workspace handled with safe messages (no raw internal error).
- [x] No fraud/theft/negligence label; no hidden staff score.
- [x] Reachable from the Owner Now View (link) and links back.
- [x] tsc 0 · prisma valid · governance 31 frozen / 0 new · `next build` exit 0.
- [x] 21 UI/domain tests + 9 domain tests pass; changed-area regression 781 pass.

## G. Known limitations
- **Browser E2E is NOT run** — proof is jsdom component + page render/interaction only. Classification
  is therefore `..._REAL_BUT_NOT_BROWSER_PROVEN`.
- The queue surfaces the single top gaming signal + top credibility concern (matching the now-view
  contract), plus all reused-hash submitters and active timing signals — not every historical finding.
- No pagination/filtering (minimal UI, single workspace scope).

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md` (commands) and `REAL_BUSINESS_UI_WALKTHROUGH.md` (owner scenario).

## I. Trigger map
- Now-view recomputes proof-risk blocks → queue reflects them on next load/refresh.
- Owner submits a decision → canonical service records + audits it → cleared proofs suppress on refresh;
  a new supporting proof re-surfaces the finding.

## J. Failure modes covered
Empty queue (friendly empty state); BLOCKED_BY_DATA finding (visible, not adjudicable); backend
validation error (safe message); unauthorized/wrong-workspace (safe message); reason omitted (submit
blocked); timing/gaming duplicate (deduped).

## K. Events emitted
No new event type — the existing adjudicate service still emits `proof_risk.adjudicated` atomically.

## L. Automated tests added
21 (9 domain + 9 component + 3 page).
