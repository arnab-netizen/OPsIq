# OPSIQ JARVIS 360 — HOSTILE RE-AUDIT (round 2)

Skeptical re-audit of the owner-flow closure campaign, distrusting the closure reports and
checking live code at HEAD `24017a8`. Findings that undercut recent "CLOSED" claims.

## Verdict
The owner-mode safety gate is genuinely wired across all 7 domains and is the real win. But several
recent closures are **thinner than claimed**: a **business-level isolation gap** in the gate, a
**hollow arbitration surfacing** in owner-mode, a **contrived do-not-repeat loop**, two **owner-invisible
API-only** closures, and the **DB proof is still unconfirmed in CI**.

---

## HIGH

### H1 — Business-level isolation gap in the owner-action gate
`src/services/owner-mode/owner-action-gate.service.ts` accepts `businessId` but only uses it for the
**cash** check (`ownerFinanceCycle`/`ownerCashflowCycle` are `{workspaceId, businessId}`-scoped). The
other four guards read **workspace-wide**:
- capacity: `ownerEquipment.findMany({where:{workspaceId}})` (line ~145)
- margin: `ownerFinancialSnapshot.findFirst({where:{workspaceId}})` (line ~180)
- compliance: `ownerComplianceItem.findMany({where:{workspaceId}})` (line ~196)
- do-not-repeat: `memoryKey: scope:<domain>` keyed by `{workspaceId}` (line ~135)

**Impact:** OpsIQ supports multiple businesses per workspace (the owner page has a business selector). In
a multi-business workspace, Business A's capacity bottleneck / expired licence / do-not-repeat rule /
low margin **blocks or mis-evaluates Business B's actions**. The gate looks business-aware (it takes
businessId) but is not. Single-business workspaces (and the seed/[db] test) hide this.
**Fix:** scope equipment/snapshot/compliance/do-not-repeat by `businessId` (where the models carry it).

### H2 — Same isolation gap in the live opportunity decision
`src/services/owner-mode/opportunity-decision.service.ts` takes `businessId` but reads `ownerEquipment`
and `ownerFinancialSnapshot` by `workspaceId` only (businessId is used solely as the audit `entityId`).
A multi-business owner gets an accept/reject/defer verdict computed from the **wrong business's** capacity
and margin.

### H3 — Arbitration surfacing (EH-05) is hollow in owner-mode
`arbitrateInterventions` is called **only** from `createRecommendationsFromInterventions`
(`recommendation.ts:1366`), which is called **only** from `consulting-engine/pipeline.ts:132` — the
**consulting** flow, not owner-mode. Owner-mode businesses never emit `OWNER_ARBITRATION_RESOLVED`, so the
control center's `arbitrationWhatNotToDo` is **always empty** for an owner business. The EH-05 "surface the
verdict" code reads an audit stream that owner-mode never writes. The closure renders nothing in practice.

### H4 — DB proof is STILL unconfirmed (process risk)
The `[db]` owner-loop test (`owner-loop.db.test.ts`) and the migrate/seed proof have **never been
confirmed green**: CI on the prior commits failed on the governance gate (now fixed at `09b49d7`), and the
re-run (`28322304094`) is **in_progress**. The seed composes 5 record* services; a single wrong required
field (e.g. on `createSopDraft` / `ownerProcess`) would fail only in CI. Until that run is green,
EH-22/EH-06/EH-26 "CLOSED_TESTED (DB in CI)" and the **REALISTIC_SIMULATION_READY_EXCEPT_E2E**
classification are **unproven**.

---

## MEDIUM

### M1 — do-not-repeat owner-mode loop is contrived
The gate reads `scope:<domain>` rules, and `scopeKeyForImpactArea` can produce that key, but **nothing at
runtime writes a `scope:<domain>` memory**. `recordSelfEvaluation`/`recordDoNotRepeat` use the caller's
`memoryKey`, and the routes pass it straight from the API body (owner-entered). So the gate's do-not-repeat
check only fires if an owner **manually records a rule with the exact magic key `scope:marketing`** (etc.).
EH-10 ("self-eval feeds future owner recommendations") is effectively **inert** without that manual step.

### M2 — EH-17/EH-19 are owner-invisible (API-only)
`/api/owner/opportunities/decide` has **no UI caller** (only `tasks/complete` + `approvals/resolve` are
wired into the OwnerActions panel). The owner cannot see the opportunity accept/reject/defer verdict in the
product. The closure claim "owner command center shows score/verdict/next action" is **not met** — it's
backend + API only (same shape as the EH-04 gap the campaign was meant to close).

### M3 — EH-15 "workload reduction" is a manual lookup, not automation
`resolveOwnerApproval` is reachable only via the OwnerActions form, where the owner must **hand-enter**
scope/actionType/decision text. There is no automatic approval-generation flow that consults memory
**before** asking the owner. So "approvals avoided" only increments when the owner manually drives the
form — the owner does work to record that work was avoided. It is not an automatic workload reduction.

### M4 — The `[db]` loop proves far less than "a realistic owner loop"
Even when green, `owner-loop.db.test.ts` asserts: seed inserts + **one** capacity gate-block + control
center counts + workspace isolation. It does **not** exercise cash/margin/compliance/do-not-repeat at the
DB level (the seed creates no finance cycle/snapshot, a non-expired licence, no do-not-repeat rule), and
does **not** run the full loop (approval → completion → self-eval → memory → next recommendation). Calling
it "one realistic owner loop proven at service/API/DB level" is an over-statement.

---

## LOW
- **L1** — compliance gate blocks only **fully expired** items (`isExpired`); an item expiring imminently
  (high-risk) does not defer. The audit asked for high-risk deferral.
- **L2** — control-center block counts are workspace-wide over a fixed 30-day window, not business-scoped
  (same isolation theme; multi-business workspaces show mixed counts).
- **L3** — the owner-mode **margin** gate applies to all finance/sales/marketing material transitions; a
  finance action unrelated to pricing is blocked when gross margin is below the floor (potential over-block;
  the consulting path gates margin only for pricing-classified recs).

---

## What genuinely holds (not over-claimed)
- Owner-mode gate is wired into all 7 domain action services on material transitions (DI-tested), with a
  bypass regression; capacity + cash + opt-out enforcement is real and tested.
- Proof-gated completion: single caller, anti-bypass regression, duplicate rejected at review + completion,
  SoD enforced, atomic audit — solid.
- Workspace isolation (not business isolation) and RBAC on the new routes hold; 0 new governance findings.

## Corrected classification
Given H1–H4, the honest classification is **OWNER_FLOW_BACKEND_PROVEN (workspace-level), with
business-level isolation gaps and an unconfirmed DB proof** — NOT `REALISTIC_SIMULATION_READY_EXCEPT_E2E`.
The campaign's safety spine is real and tested at workspace scope; the multi-business correctness, the
owner-visibility of opportunity decisions, the automatic memory/arbitration loop, and the DB-loop proof are
the gaps to close next.

## Priority fixes
1. H1/H2 — scope capacity/margin/compliance/do-not-repeat reads by `businessId` in the gate + opportunity
   service (and add a multi-business isolation test).
2. H4 — confirm/fix the CI `[db]` run; do not claim DB proof until green.
3. H3/M1 — either run arbitration + write `scope:` do-not-repeat memory in the owner-mode generation path,
   or stop surfacing/closing those as owner-mode features.
4. M2 — wire the opportunity decision into the owner UI (or reclassify EH-17/19 as API-only).
