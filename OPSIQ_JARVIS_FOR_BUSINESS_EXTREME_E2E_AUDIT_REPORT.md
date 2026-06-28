# OPSIQ — JARVIS FOR BUSINESS: EXTREME END-TO-END HOSTILE AUDIT REPORT

Read-only, pre-merge. Scope: prove (or disprove) that OpsIQ behaves as a governed owner
co-pilot end-to-end: **seed → command-center → gates → arbitration → approval →
proof/completion → training/process → opportunity/compliance → self-eval → memory → changed
state**. Every claim below cites code (`file:line`) and the test that exercises it. Nothing is
asserted on faith; where a thing is NOT proven, it is named as such.

- Branch: `claude/opsiq-jarvis-360-audit-m8jro7`
- Audited HEAD: `6b077b2` (working tree clean)
- Code-bearing commit: `7a9161b`. `835b2d6` and `6b077b2` differ from it ONLY in
  `OPSIQ_JARVIS_360_HOSTILE_REAUDIT_3.md` (`git diff --name-only` confirmed). The compiled/tested
  code is therefore byte-identical to the green CI commit `835b2d6`.

## 0. Local verification run (this audit)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, clean |
| Owner-mode tests | `npx vitest run src/__tests__/owner-mode` | **210 passed, 2 skipped** (`[db]`, run only in CI) |
| Governance (strict) | `npm run governance:scan:strict` | 32 matched / **0 new** (baseline frozen) → pass |
| Wrapped-handler ratchet | `npm run audit:wrapped-handlers:ratchet` | 29 baseline / **0 new** → pass |

CI on GitHub (`ci.yml`): `7a9161b` **success** (×2), `835b2d6` **success** (×2). The DB lane
(`TEST_WITH_DB=true`, postgres:16) is included in those runs, so the `[db]` owner-loop test
(`owner-loop.db.test.ts`) passed in CI. HEAD `6b077b2` (docs-only) has two runs in progress at audit
time; they exercise byte-identical code to the green `835b2d6`.

## 1. The eleven-link owner spine — runtime truth

Each link is verified at the **runtime call site**, not only in a unit test.

### L1 — Seed (archetype → real workspace)
`src/services/owner-mode/archetype-seed.service.ts` seeds the laundry archetype (equipment,
finance snapshot, opportunities, SOP draft, process) through real services. **Production-guarded
twice:** `assertSeedAllowed()` throws `SeedNotAllowedError` when `NODE_ENV === "production"`
(`archetype-seed.service.ts:29-30`) AND the route returns 403 (`api/owner/dev/seed-archetype/route.ts:22`).
Route is `withCanonicalEnforcement` (OWNER_MANAGE + workspace). Tests: `archetype-seed.test.ts`,
`owner-archetype-seed.test.ts`.

### L2 — Command center (what to do / not do / due)
`owner-control-center` composes the owner home: blocked recommendations, finance/proof blocks,
`approvalsAvoided` (EH-16), `reassessmentsDue` (EH-21). The hollow `arbitrationWhatNotToDo` read was
**removed** (H3) — the what-NOT-to-do now derives only from genuine signals (data-sufficiency,
finance/cash/margin blocks, capacity bottlenecks, reassessment-due). Tests:
`owner-control-center.test.ts`, `owner-block-metrics.test.ts`.

### L3 — Safety gates (the spine) — WIRED ON THE REAL PATH
`enforceOwnerActionGates(...)` (`owner-action-gate.service.ts`) runs **opt-out → do-not-repeat →
capacity → cash → margin → compliance** and blocks via `ConflictError` + audits
`owner.gate_promotion_blocked`. It is invoked in **all seven** owner-domain action services
(`owner-{finance,cashflow,sales,marketing,operations,sop,strategy}/action.service.ts`), each time
**after** transition validation and **before** the persist — e.g. `owner-sales/action.service.ts:47`
gate, `:68` `db.ownerSalesAction.update`. A new material path that forgets the gate **fails CI**:
`material-gate-registry.ts` lists all 11 material paths and `material-gate-registry.test.ts:25-26`
reads each file and asserts the enforcing symbol is present. Tests: `owner-action-gate.test.ts`
(18), `gate-enforcement-policy.test.ts`, `compliance-boundary.test.ts`, `completion-bypass-regression.test.ts`.

### L4 — Arbitration (chosen vs rejected + what-not-to-do)
`arbitrateInterventions` runs in the **consulting pipeline only** (`recommendation.ts:1366`, the sole
non-test caller), persisting the full verdict to the audit payload (EH-05). Owner-mode does **not**
fabricate an `owner.arbitration_resolved` row (H3). This is reported honestly: arbitration is a
recommendation-generation concern, not an owner-runtime concern. Tests: `intervention-arbitration.test.ts`,
`decision-arbitration.test.ts`.

### L5 — Approval workload reduction
`resolveOwnerApproval` consults standing instructions + approval memory and **auto-handles** when
allowed/remembered, recording a `handledByOpsIQ` attention event (counted as "approvals avoided").
`enforceApprovalRequirement` (`approval/workflow.ts`) calls it for high-impact approvals and creates
**no** approval request when auto-handled. Tests: `owner-approval-resolution.test.ts` (4 cases incl.
forbidden / memory-reuse / genuine-owner-decision), `approval-memory.test.ts`.

### L6 — Proof-gated completion (no bypass)
`completeTask` (`task-completion.service.ts`) is the **sole runtime caller** of `applyTaskTransition`
(`grep` across `src` confirms no other non-test caller). It gates on
`evaluateProofClearance` (accepted **and** non-duplicate **and** fresh; `:153`) before transitioning,
and passes `extraAuditEvents` so `OWNER_TASK_COMPLETED` + `OWNER_TASK_OVERRIDE_USED` are atomic
(EH-28/30). `reviewProof` rejects a duplicate-flagged proof at ACCEPTED via
`ProofDuplicateRejectedError` (EH-11). Tests: `task-completion.test.ts`,
`completion-bypass-regression.test.ts`, `evidence-disclosure.test.ts`.

### L7 — Training / process adaptation
A FAILED self-evaluation also fires `deriveTrainingFromObservedFailure` (EH-07) and
`triggerProcessReviewOnRepeatedFailure` (EH-08). Tests: `staff-training.test.ts`,
`process-review.test.ts`, `sop-document.test.ts`.

### L8 — Opportunity decision with REAL capacity + margin
`decideOpportunity` (`opportunity-decision.service.ts`) screens with **live** capacity
(`assessFleetCapacity`) and **live** margin (`grossMarginPctFrom` over the latest snapshot), scoped by
`businessId` (H2). Surfaced in the owner UI (`OwnerActions` → `POST /api/owner/opportunities/decide`,
OWNER_MANAGE). Tests: `opportunity-decision.test.ts`, `opportunity-contract-guardrails.test.ts`,
`owner-ui-actions.test.ts`.

### L9 — Compliance gate
The gate hard-blocks any material transition when an `ownerComplianceItem` is `isExpired`
(`COMPLIANCE_BLOCKED`), forcing professional review. Tests: `owner-action-gate.test.ts`
("expired … professional review", "present but not expired"), `compliance-boundary.test.ts`.

### L10 — Self-eval → business memory
`recordSelfEvaluation` (`self-evaluation.service.ts`) auto-writes a `scope:<domain>` do-not-repeat
memory (with `businessId`) on a FAILED owner outcome via `scopeKeyForImpactArea` — giving the gate's
scope check a **real writer** (M1). Tests: `self-evaluation-loop.test.ts`, `self-evaluation.test.ts`,
`do-not-repeat-scope.test.ts`.

### L11 — Changed state (the loop closes)
The recorded memory **blocks the next promotion** for that business. `owner-loop-service.test.ts`
composes the whole chain through the real wired services (capacity → arbitration → approval →
proof-gated completion → self-eval failure → memory → next promotion blocked). The `[db]` variant
(`owner-loop.db.test.ts`) runs the seed→gate-block→control-center loop against real postgres in CI.

## 2. Bypass attempts (hostile)

| # | Attempted bypass | Result |
|---|---|---|
| 1 | Promote a material owner action skipping the gate | Blocked — gate called before persist in all 7 services; registry test fails CI if dropped |
| 2 | Add a new owner-domain action service without a gate | Blocked — `material-gate-registry.test.ts` asserts the symbol per file |
| 3 | Complete a task without accepted proof | Blocked — `evaluateProofClearance`; `TaskCompletionBlockedError` |
| 4 | Complete a task on duplicate/stale proof | Blocked — clearance requires non-duplicate + fresh; `reviewProof` rejects duplicate at ACCEPTED |
| 5 | Transition a task via `applyTaskTransition` directly | No runtime caller exists except proof-gated `completeTask` |
| 6 | Use one business's bottleneck/expired-licence/memory to block another | Blocked — `bizScope` scopes every read to `{workspaceId, OR:[{businessId},{businessId:null}]}` (H1); margin scoped to `{workspaceId, businessId}`; where-capture test asserts it |
| 7 | Re-ask the owner for a remembered/standing-instruction approval | Auto-handled, no approval request created |
| 8 | Seed archetype data in production | 403 at route + `SeedNotAllowedError` in service |
| 9 | Decide an opportunity using stale/global capacity or margin | Uses live fleet + latest snapshot, business-scoped |
| 10 | Surface a fabricated "what not to do" with no real signal | Removed (H3); only genuine signals remain |
| 11 | Render a raw backend error string to the operator | Governed — owner page `apiPost` returns operator-safe copy (governance scan: 0 new) |

All eleven are closed in code with a test or a structural guarantee.

## 3. Test-quality audit

- **30 owner-mode suites / 210 tests + 2 `[db]`.** Not vanity tests: they capture `where` clauses to
  prove isolation (#6), assert error *types* (`ConflictError`, `TaskCompletionBlockedError`,
  `DoNotRepeatBlockedError`), and assert audit event names/payloads.
- **DI pattern is sound:** services take an injected `db` + mocked `@/infra/audit`; the
  `@/lib/db` mock includes `getDbInstance` (the H4 fix) so suites pass under both local and
  `TEST_WITH_DB=true` lanes.
- **Regression guards:** `material-gate-registry.test.ts` (gate-drop), `completion-bypass-regression.test.ts`
  (proof bypass), `gate-enforcement-policy.test.ts` (default-on/opt-out).

## 4. Honest residuals (NOT closed)

- **M3 — automatic approval-generation:** the memory-consult primitive is live and reachable, but
  OpsIQ does not yet *pre-consult memory for every owner decision before ever asking*. This is a
  future enhancement, not a correctness defect.
- **L1 — compliance expiring-soon:** only *expired* hard-blocks; expiring-soon does not. Deliberate
  (blocking valid operations early would over-block).
- **L2 — control-center block counts are workspace-scoped:** business-level counts would need
  `businessId` indexed on audit events. Documented trade-off.
- **EH-23 — browser/Playwright E2E:** there is no headless-browser test driving the rendered owner UI.
  The owner loop is proven at the **service + DB-route** layer, not through a real browser.

## 5. Classification

**OWNER_FLOW_DB_ROUTE_PROVEN.**

The governed owner spine is real, wired on the actual owner action paths, business-isolation-correct,
proof-gated, memory-closing, and proven end-to-end at the service layer and against real postgres in
CI (`owner-loop.db.test.ts`, green run on byte-identical code). All prior hostile findings
(H1/H2/H3/H4/M1/M2/L3 and the EH register's non-E2E items) are closed with tests.

It is **NOT** yet `READY_FOR_REAL_WORLD_CASE_TRAINING` for two honest reasons: **EH-23** (no browser
E2E proving the rendered UI drives the spine) and **M3** (automatic owner-mode approval-generation is a
documented future enhancement). These are the only gaps between the current proven state and a
full real-world-case-ready classification.

## 6. Verdict

OpsIQ functions as a governed owner co-pilot: it seeds a real business, tells the owner what to do and
what not to do from genuine signals, blocks unsafe promotions per-business across
capacity/cash/margin/compliance/do-not-repeat, reduces approval workload through memory, refuses
completion without cleared proof, learns from failure into business memory, and changes its next
recommendation accordingly — with every mutation audited and every material path guarded against
regression. The remaining distance to "real-world case training" is a browser-E2E layer and an
automatic approval-generation flow, both named explicitly above.
