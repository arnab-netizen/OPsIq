# Current OpsIQ Status

**Last updated:** 2026-07-04 (post-merge owner-mode excellence pass) ·
**Branch of record:** `claude/post-merge-owner-mode-excellence-profit-startup-hardening` ·
**Merged to main:** the owner-use spine `d5e0ea60` is now on `origin/main` (fast-forward). ·
**Base:** `origin/main` @ `d5e0ea60`.

This is the single authoritative status of OpsIQ. It supersedes the 575 historical audit narratives
now archived under `docs/archive/2026-07-04-pre-owner-use-consolidation/`.

## Dedicated Reused-Hash / Duplicate-Proof Precheck depth pass (latest)
- **Base:** `origin/main` @ `c0186f3f` (Fake-Proof → Anti-Gaming Link PR #119 merged).
- **Branch:** `claude/reused-hash-proof-precheck-depth-pass`.
- **Classification:** `REUSED_HASH_PROOF_PRECHECK_REAL_AND_OWNER_VISIBLE` (+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`).
- **Reused proof is now deterministic, queryable, and workspace-scoped.** A pure precheck
  (`reused-hash-precheck.ts`) + read-only service (`getReusedHashFindings` / `getReusedHashFindingForProof`)
  classifies exact `fileHash` reuse conservatively: cross-task → `NEEDS_REVIEW_DUPLICATE` (same operator
  HIGH), same-task → `ALLOWED_DUPLICATE` (no false warning), cross-workspace → `BLOCKED_CROSS_WORKSPACE`
  (no IDs leaked), missing hash → `DATA_INSUFFICIENT`. **No schema change** (`@@index([workspaceId, fileHash])`
  already exists); derived, no new mutation/audit.
- **Feeds the pipeline deterministically:** per-operator reuse drives an attributed `REUSED_PROOF`
  credibility concern + a `REUSED_PROOF_PATTERN` anti-gaming signal (both supersede the coarse
  duplicate-flag heuristic and exclude legitimate same-task reuse); the now-view exposes a
  `reusedProofFindings` block; `ANTI_GAMING_RISK` / `EVIDENCE_CREDIBILITY_RISK` reflect it. No fraud
  label, no hidden score, no cross-tenant leakage.
- **Still missing:** owner adjudication surface + UI; artifact-reference/signature match sources (exact
  hash only); browser E2E.
- **Verification:** tsc 0 · prisma valid (no schema change) · governance strict 0-new · owner-mode +
  execution 681 unit + 792 DB tests green · 14 new tests · DB sim 3/3. Details:
  `docs/remediation/reused-hash-proof-precheck-depth-pass/`.

## Fake / Reused / Suspicious Proof Dispute → Anti-Gaming Link depth pass
- **Base:** `origin/main` @ `e70f5986` (Operational Event Resolution / Aging PR #118 merged).
- **Branch:** `claude/fake-proof-anti-gaming-link-depth-pass`.
- **Classification:** `FAKE_PROOF_ANTI_GAMING_LINK_REAL_AND_OWNER_VISIBLE` (+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `BUSINESS_CONTROL_SLO_STRENGTHENED`).
- **Fake/reused/suspicious proof DISPUTES now feed Anti-Gaming Analytics as staff/manager behaviour
  patterns.** New conservative signals (no fraud label, no hidden score): `SUSPECTED_FAKE_OR_REUSED_PROOF_PATTERN`,
  `TAMPER_SUSPECTED_PROOF_PATTERN`, `WRONG_OR_INSUFFICIENT_PROOF_PATTERN`, `MANAGER_ACCEPTED_SUSPICIOUS_PROOF`,
  `REVIEW_QUALITY_CONCERN`. Derived from the governed `proof.disputed` trail + persisted
  `tamper_suspected`/`duplicateFlagged` fields — **no schema change, no new mutation, no new audit**.
- **Detection honesty:** a single severe event is a WARNING (`isRepeatedPattern=false`); repetition (≥2)
  is a pattern. Every signal carries reason codes + proof/audit refs; each links a related credibility
  concern (not duplicated) and the profit-leak/constraint the dispute already drives (`WEAK_PROOF_REWORK_RISK`/`STAFF`/`MANAGER`).
- **Owner-visible / SLO:** `topGamingSignal` surfaces the pattern; `ANTI_GAMING_RISK` FAILs on a
  high/critical fake pattern; a high-risk repeated pattern carries a reassessment trigger. Cross-workspace
  proof cannot influence a signal; clean workspace → `DATA_INSUFFICIENT`.
- **Still missing:** dedicated reused-hash precheck; owner adjudication surface + UI; browser E2E.
- **Verification:** tsc 0 · prisma valid (no schema change) · governance strict 0-new · owner-mode
  622 unit + 717 DB tests green · 13 new tests · DB sim 2/2. Details:
  `docs/remediation/fake-proof-anti-gaming-link-depth-pass/`.

## Operational Event Resolution / Aging + Delivery/Pricing Constraint Wiring depth pass
- **Base:** `origin/main` @ `57c1769b` (Complaint/Rework Event Linkage PR #117 merged).
- **Branch:** `claude/operational-event-resolution-aging-depth-pass`.
- **Classification:** `OPERATIONAL_EVENT_RESOLUTION_AGING_REAL_AND_OWNER_VISIBLE` (+ `CONSTRAINT_ENGINE_STRENGTHENED`, `PROFIT_LEAK_RADAR_STRENGTHENED`, `BUSINESS_CONTROL_SLO_STRENGTHENED`).
- **Complaint/rework events are now resolvable, age-sensitive, and business-actionable.** Status FSM
  (OPEN | IN_REVIEW | RESOLVED | DISMISSED | DUPLICATE) + severity-scaled overdue windows (CRITICAL 24h
  / HIGH 48h / MEDIUM 120h / LOW 240h from server `createdAt`) + governed status-change service
  (`resolve`/`dismiss`/`in_review`/`duplicate`, audited `operational_event.status_changed`, fail-closed,
  idempotent, concurrency-safe) + `POST /api/complaint-rework` actions. Two additive columns
  (`resolved_by_user_id`, `resolution_note`).
- **Became measurable / actionable:** open vs overdue vs resolved; overdue-severe **escalation**; a
  new `OPERATIONAL_EVENT_RESOLUTION` SLO (PASS/WARN/FAIL/NOT_MEASURABLE). Live-risk aggregates now count
  **active** events only, so resolving clears the top leak/constraint — while `PROOF_OUTCOME_INTEGRITY`
  stays FAIL (a resolved complaint does not un-fail a sign-off that didn't hold). Now-view exposes an
  `operationalEventHealth` block.
- **Delivery/pricing wiring:** linked delivery/late-service complaint → DELIVERY constraint +
  DELIVERY_DELAY_COST leak; billing/pricing complaint → PRICING constraint + PRICING_UNDERCHARGE leak —
  both **NEEDS_DATA** until a real amount/margin is entered (no fabricated figure).
- **Still missing:** customer-retention wiring from complaints (needs repeat data); fake-proof →
  anti-gaming link; UI + browser E2E.
- **Verification:** tsc 0 · prisma valid · governance strict 0-new · migration additive · changed-area
  694 unit + 104/661 DB tests green · 23 new tests · DB sim 4/4. Details:
  `docs/remediation/operational-event-resolution-aging-depth-pass/`.

## Complaint / Rework Event Linkage depth pass
- **Base:** `origin/main` @ `9381efab` (Dispute → Profit/Constraint Wiring PR #116 merged).
- **Branch:** `claude/complaint-rework-event-linkage-depth-pass`.
- **Classification:** `COMPLAINT_REWORK_EVENT_LINKAGE_REAL_AND_OWNER_VISIBLE` (+ `PROOF_OUTCOME_INTEGRITY_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `PROFIT_LEAK_RADAR_STRENGTHENED`).
- **Per-event complaint/rework is now real + linkable to accepted proof — the business impact of bad
  accepted work is measurable.** One minimal generic `OperationalEvent` table (COMPLAINT|REWORK,
  additive migration) + service (`recordOperationalEvent` / `linkOperationalEventToProof` /
  `getComplaintReworkLinks`, governed/audited/fail-closed/idempotent) + `POST /api/complaint-rework`.
- **Became measurable:** `proof→complaint` and `proof→rework` (LINKED, were NOT_MEASURABLE), attributed
  to the operator. `PROOF_OUTCOME_INTEGRITY` now consumes linked complaint/rework; credibility raises
  `ACCEPTED_PROOF_WITH_COMPLAINT` / `_WITH_REWORK`; the radar surfaces COMPLAINT_REVENUE_RISK /
  REWORK_REDO_COST (MEASURED impact when an amount is supplied, else qualitative); constraint engine
  gets QUALITY. Now-view exposes a `complaintReworkLinks` block.
- **No fabrication:** events are recorded by a governed service (never invented); no financial figure
  unless a real amount is entered (NEEDS_DATA otherwise); server `createdAt` trusted, user `occurredAt`
  untrusted; reassessment idempotent (via the existing dispute flow); not a CRM/ticketing/refund module.
- **Still missing:** delivery/pricing complaint → constraint wiring; fake-proof → anti-gaming link; UI + browser E2E.
- **Verification:** tsc 0 · prisma valid · governance strict 0-new · migration applies cleanly · changed-area
  90 files/742 tests green · 20 new tests. Details: `docs/remediation/complaint-rework-event-linkage-depth-pass/`.

## Dispute → Profit/Constraint Wiring depth pass
- **Base:** `origin/main` @ `dc18ca6e` (Governed Proof Dispute Surface PR #115 merged).
- **Branch:** `claude/dispute-profit-constraint-wiring-depth-pass`.
- **Classification:** `DISPUTE_PROFIT_CONSTRAINT_WIRING_REAL_AND_OWNER_VISIBLE` (+ `PROFIT_LEAK_RADAR_STRENGTHENED`, `CONSTRAINT_ENGINE_STRENGTHENED`).
- **Live proof disputes now move the business-risk layer, not only proof integrity.** The
  `proof.disputed` audit trail is mapped (pure `dispute-risk.ts` + DB service) into Profit-Leak +
  Constraint drivers: REWORK/QUALITY/BAD_OUTCOME→REWORK_REDO_COST+QUALITY;
  CUSTOMER_COMPLAINT→COMPLAINT_REVENUE_RISK; WRONG/FAKE/MANAGER_ERROR→WEAK_PROOF_REWORK_RISK +
  STAFF/MANAGER. Both engines gained dispute count inputs + dispute-attributed findings that compete
  in the existing top-leak/top-constraint selection; the now-view feeds the counts and exposes a
  `disputeRisk` block. `OTHER` is not overclassified.
- **No fabrication:** financial impact is always qualitative (NEEDS_DATA) — no per-event complaint/
  rework model, so no revenue/churn/redo number is invented; missing model disclosed on each signal.
  Credibility + `PROOF_OUTCOME_INTEGRITY` unchanged (not duplicated); reassessment not duplicated.
- **No schema change** — reads the `proof.disputed` audit trail.
- **Still missing:** per-event complaint/rework model (impact stays qualitative); direct fake-proof→
  anti-gaming link; UI + browser E2E.
- **Verification:** tsc 0 · prisma valid (no schema change) · governance strict 0-new · changed-area
  87 files/724 tests green · 17 new tests. Details: `docs/remediation/dispute-profit-constraint-wiring-depth-pass/`.

## Governed Proof Dispute Surface depth pass
- **Base:** `origin/main` @ `ab4d1baa` (Proof↔Outcome Linkage PR #114 merged).
- **Branch:** `claude/governed-proof-dispute-surface-depth-pass`.
- **Classification:** `GOVERNED_PROOF_DISPUTE_REAL_AND_OWNER_VISIBLE` (+ `PROOF_OUTCOME_INTEGRITY_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`).
- **Live ACCEPTED → DISPUTED flow now exists** — closes the PR #114 gap. `disputeAcceptedProof` service +
  `POST /api/proof/dispute`: an owner/authorized reviewer disputes a previously-accepted proof (8
  categories, reason required), reversing it with atomic `proof.reviewed` + `proof.disputed` audits and
  a governed idempotent reassessment keyed to the proof (`sourceProofId`). The `proof.reviewed(ACCEPTED
  →DISPUTED)` audit is exactly what the PR #114 linkage reader consumes, so credibility
  (`ACCEPTED_PROOF_WITH_BAD_OUTCOME`), the `PROOF_OUTCOME_INTEGRITY` SLO, and the now-view update
  automatically — no orphan path.
- **Safety:** server-authoritative load; capability gate (`PROOF_REVIEW`, owner-only `VERIFY_FINAL_OUTCOME`
  for override); SoD (no self-dispute); ACCEPTED-only; cross-workspace fail-closed; idempotent; atomic audit.
- **No schema change** — dispute record persisted as the `proof.disputed` audit event; category is governed
  metadata, never a faked complaint/rework row.
- **Still missing:** per-event complaint/rework model (`relatedComplaintId`/`relatedReworkId` = missing-source);
  dispute-category → profit-leak/constraint wiring; UI + browser E2E.
- **Verification:** tsc 0 · prisma valid (no schema change) · governance strict 0-new · changed-area 85 files/707
  tests green · 18 new tests. Details: `docs/remediation/governed-proof-dispute-surface-depth-pass/`.

## Proof ↔ Outcome Linkage + Reassessment Creation depth pass
- **Base:** `origin/main` @ `26a52182` (Runtime Control Correlation PR #113 merged).
- **Branch:** `claude/proof-outcome-reassessment-linkage-depth-pass`.
- **Classification:** `PROOF_OUTCOME_REASSESSMENT_LINKAGE_REAL_AND_OWNER_VISIBLE` (+ `PROOF_TO_OUTCOME_SLO_MEASURABILITY_IMPROVED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`).
- **Real, keyed, DB-backed linkages** (no fabrication, from the `proof.reviewed` audit trail):
  `PROOF_TO_BAD_RESULT_LINK` (accepted proof → later DISPUTED/OVERRIDDEN — a single audit row with
  `fromStatus=ACCEPTED` proves the reversal), `PROOF_TO_REWORK_LINK` (`resubmissionOfId`), and
  `OUTCOME_TO_REASSESSMENT_LINK` (via the new creation service). Pure domain
  (`proof-outcome-linkage.ts`) + DB service + now-view wiring (`payload.proofOutcomeLinkage`).
- **Reassessment creation service** (`createReassessmentEvent`, was missing): atomic row +
  `OWNER_REASSESSMENT_CREATED` audit, idempotent, keyed to `sourceProofId`/`outcomeId`. Gives the
  correction loop a real governed entry point and makes `REASSESSMENT_LATENCY` measurable.
- **Became measurable:** `PROOF_OUTCOME_INTEGRITY` SLO (accepted-then-reversed rate); credibility now
  fires `ACCEPTED_PROOF_WITH_BAD_OUTCOME` and stops calling a contradicted submitter "reliable".
- **Still NOT_MEASURABLE (documented):** `PROOF_TO_COMPLAINT_LINK` (period-aggregate complaints only);
  `PROOF_TO_OUTCOME_LINK` to recommendation/action outcomes (disjoint trees).
- **Schema:** additive `owner_reassessment_events.sourceProofId` (backfill-safe) + index; migration
  `20260705120000_reassessment_source_proof`.
- **Verification:** tsc 0 · prisma valid · governance strict 0-new · changed-area 89 files/734 tests
  green · 22 new tests. Browser E2E untouched. Details: `docs/remediation/proof-outcome-reassessment-linkage-depth-pass/`.

## Runtime Control Correlation depth pass
- **Base:** `origin/main` @ `47a7741d` (Business-Control SLO PR #112 merged).
- **Branch:** `claude/opsiq-hostile-audit-jye6h4`.
- **Classification:** `RUNTIME_CONTROL_CORRELATION_REAL_AND_OWNER_VISIBLE` (audit-durability partial, disclosed).
- **Converted NOT_MEASURABLE → measured** (from real persisted timestamps, no fake correlations):
  `REASSESSMENT_LATENCY` (OwnerReassessmentEvent createdAt→closed), `SHOCK_HANDLING_LATENCY`
  (ShockEvent recorded→`CONDITION_CHANGED` audit), `AUDIT_DURABILITY` (ShockEvent→`SHOCK_EVENT_RECORDED`
  audit coverage — PARTIAL: shock mutation class). Pure domain (`control-correlation.ts`) + DB service
  (`control-correlation.service.ts`, 90-day workspace-scoped window) + now-view wiring
  (`payload.controlCorrelations` + measured `businessControlHealth`).
- **New persisted signal:** `Proof.tamperSuspected` (backfill-safe column + index; migration
  `20260705000000_proof_tamper_suspected`) set atomically on precheck `POSSIBLE_TAMPER_RISK`, consumed by
  the Evidence Credibility Graph (`TAMPER_SUSPECTED_PROOF`).
- **Still NOT_MEASURABLE (documented):** `PROOF_TO_OUTCOME_CORRELATION` (no persisted proof↔outcome join);
  audit durability for non-shock classes (atomic-audit-guaranteed, not yet metered); startup/runtime-isolation.
- **Verification:** tsc 0 · prisma valid · governance strict 0-new · changed-area 79 files/667 tests green
  · 23 new tests (14 unit + 4 SLO + 2 precheck + 3 DB simulation).
- Details: `docs/remediation/runtime-control-correlation-depth-pass/`.

## Business-Control SLO depth pass
- **Consolidation:** Evidence Credibility Graph (PR #111) CI-green + fast-forward merged to `main`
  (`6a840314`); all prior depth passes remain on main.
- **Branch:** `claude/business-control-slo-depth-pass`.
- **Business-Control SLOs:** `BUSINESS_CONTROL_SLO_REAL_AND_OWNER_VISIBLE` — deterministic 15-SLI grading
  of OpsIQ's own control loop (PASS/WARN/FAIL/NOT_MEASURABLE), owner-callable + surfaced via
  `/api/owner/now-view` (`payload.businessControlHealth`), graded from the now-view's existing signals +
  proof counts, linked to constraint/profit-leak/gaming/credibility. No fake/always-green metrics; honest
  NOT_MEASURABLE with exact missing source. 17 tests (13 unit + 4 DB). Governance strict 0-new; 649 pass.
- **Measurable:** owner workload/bottleneck, anti-gaming risk, credibility risk, weak-proof rate,
  proof-review backlog, constraint/profit-leak freshness, opportunity/now-view completeness.
  **NOT_MEASURABLE (missing source):** audit-durability correlation, reassessment/shock latency, startup
  completeness, runtime isolation.
- **Still missing/partial:** the above NOT_MEASURABLE source linkages; Process Intelligence;
  authenticated browser E2E; APPR-01 breadth.
- Details: `docs/remediation/business-control-slo-depth-pass/`.

## Evidence Credibility Graph depth pass (latest)
- **Consolidation:** Anti-Gaming Analytics (PR #110) CI-fixed (governance strict 0-new) + fast-forward
  merged to `main` (`de63b786`); all prior depth passes remain on main.
- **Branch:** `claude/evidence-credibility-graph-depth-pass`.
- **Evidence Credibility Graph:** `EVIDENCE_CREDIBILITY_GRAPH_REAL_AND_OWNER_VISIBLE` — deterministic
  per-entity credibility (submitter/reviewer/proof-type/item) from real Proof/review data: self-review,
  review-quality concern, unreliable vs reliable-with-caveat submitter, owner-review-burden, weak
  proof-type, reused/stale/tamper. Owner-callable + surfaced via `/api/owner/now-view`
  (`payload.topCredibilityConcern`), linked to Anti-Gaming + Profit-Leak + Constraint. Reason codes +
  evidence (no hidden score); RELIABLE only w/ no contradiction + disclosed outcome-linkage gap;
  DATA_INSUFFICIENT otherwise. 16 tests (12 unit + 4 DB). Governance strict 0-new; 632 tests pass.
- **Still missing/partial:** accepted-proof↔complaint/rework/outcome linkage (needs persisted events);
  Business-Control SLOs, Process Intelligence; authenticated browser E2E; APPR-01 breadth.
- Details: `docs/remediation/evidence-credibility-graph-depth-pass/`.

## Anti-Gaming Analytics depth pass (latest)
- **Consolidation:** all 5 prior depth passes are on `main` (`59c85033`) — owner-use spine, opportunity
  envelope, Owner Workload Budget, Constraint Engine, Profit-Leak Radar (fast-forward merged this pass).
- **Branch:** `claude/anti-gaming-analytics-depth-pass`.
- **Anti-Gaming Analytics:** `ANTI_GAMING_ANALYTICS_REAL_AND_OWNER_VISIBLE` — deterministic cross-event
  staff/manager/operator pattern detection from real Proof/review data (self-review, rubber-stamp,
  repeated weak/reused/rejected/late proof, staff-driven review burden, proof flood + DATA_INSUFFICIENT),
  owner-callable + surfaced via `/api/owner/now-view` (`payload.topGamingSignal`), linked to the
  Constraint Engine + Profit-Leak Radar. Transparent reason codes (no black-box staff score), honest
  repetition thresholds. 16 tests (12 unit + 4 DB). Broad regression 93 files / 810 tests pass.
- **Still missing/partial:** complaint/tamper/escalation-linked gaming types (need persisted sources);
  Evidence Credibility Graph, Business-Control SLOs, Process Intelligence; authenticated browser E2E;
  APPR-01 breadth.
- Details: `docs/remediation/anti-gaming-analytics-depth-pass/` + `docs/remediation/pr-merge-consolidation/`.

## Profit-Leak Radar depth pass (latest)
- **Branch:** `claude/profit-leak-radar-depth-pass` · **Base/main:** `0438927c`.
- **Profit-Leak Radar:** `PROFIT_LEAK_RADAR_REAL_AND_OWNER_VISIBLE` — deterministic highest-value-leak
  detection (discount/pricing/low-margin-B2B/cash-risk-growth/complaints/rework/churn/delivery/
  owner-bottleneck/idle-capacity + DATA_INSUFFICIENT), fed by live now-view signals, surfaced via
  `/api/owner/now-view` (`payload.topProfitLeak`), linked to the Constraint Engine, feeding the
  Opportunity envelope + Owner Workload Budget. No fabricated ROI/margin (real discount figures only;
  NEEDS_DATA where margin absent). 19 tests (16 unit + 3 DB). Broad regression 91 files / 794 tests pass.
- **Still missing/partial:** Anti-Gaming Analytics, Evidence Credibility Graph, Business-Control SLOs,
  Process Intelligence; delivery/major-client-loss/startup event-signal ingestion; authenticated browser
  E2E; APPR-01 breadth.
- Details: `docs/remediation/profit-leak-radar-depth-pass/`.

## Constraint / Bottleneck Engine depth pass (prior)
- **Branch:** `claude/constraint-bottleneck-engine-depth-pass` · **Base/main:** `394427e7`.
- **Constraint Engine:** `CONSTRAINT_ENGINE_REAL_AND_OWNER_VISIBLE` — deterministic single-binding-
  constraint identification (CASH/OWNER/QUALITY/CAPACITY/EQUIPMENT/DELIVERY/PRICING/STAFF/
  CUSTOMER_RETENTION/B2B_ACCOUNT/STARTUP_VALIDATION/COMPLIANCE/DATA_INSUFFICIENT), fed by the live
  Owner Now View signals, surfaced via `/api/owner/now-view` (`payload.topConstraint`), integrated with
  the Owner Workload Budget and the Opportunity envelope (gates + caps scaling into a bottleneck).
  Honest DATA_INSUFFICIENT; 18 tests (15 unit + 3 DB). Broad regression 89 files / 775 tests pass.
- **Still missing/partial:** Profit-Leak Radar, Anti-Gaming Analytics, Evidence Credibility Graph,
  Business-Control SLOs, Process Intelligence; authenticated browser E2E; APPR-01 breadth.
- Details: `docs/remediation/constraint-bottleneck-engine-depth-pass/`.

## Elite hardening pass (prior)
- **Branch:** `claude/elite-business-operating-system-hardening` · **Base/main:** `be62a606`.
- **Owner Workload Budget:** `REAL_AND_OWNER_VISIBLE` — grouping, noise suppression, owner-only vs
  delegable split, owner-bottleneck flag, real proof-review/reassessment counts, transparent
  owner-minutes/minutes-saved estimate; surfaced via `/api/owner/now-view`. 8 new tests.
- **Constraint Engine / Profit Leak Radar / Anti-gaming analytics:** `PARTIAL` (real backend signals,
  no dedicated typed engine yet). **Evidence Credibility Graph / Business-Control SLOs / Process
  Intelligence:** `MISSING` (not stubbed). **AI abstention gate:** intentionally blocked (no LLM
  write-path active).
- **Overall:** `HIGH_VALUE_PRIVATE_OWNER_SYSTEM_PROVEN` / `REMEDIATION_PARTIAL_CONTINUE_REQUIRED`.
- Details: `docs/remediation/elite-business-operating-system-hardening/`.

## Mode classifications (prior pass)
- **Owner Mode:** `OWNER_MODE_READY_WITH_INTENTIONAL_GUARDRAILS`.
- **Startup Mode:** `STARTUP_MODE_PRIVATE_BASELINE_PROVEN`.
- **Wealth / Opportunity / Profit Generation Mode:** `WEALTH_OPPORTUNITY_PRIVATE_BASELINE_PROVEN`
  (owner-decision envelope added: confidence, missing-data disclosure, cash impact, owner-approval
  gate, first-test action, success metric, stop-loss, reassessment trigger — deterministic, no
  fabricated ROI).
- **Product Hunt:** NOT READY. **Public SaaS / billing / webhooks:** BLOCKED (frozen).
- Verification: `tsc` 0 errors; broad suite **271 files / 4733 tests pass**.
- Details: `docs/remediation/post-merge-owner-mode-excellence/FINAL_POST_MERGE_OWNER_MODE_EXCELLENCE_REPORT.md`.

## What OpsIQ is
A governed business intervention and consulting operating system that models four dimensions at all
times: consulting lifecycle stage, business condition, intervention mode/phase, and human execution
reality.

## Readiness
- **Private owner mode (Arnab's own businesses): READY**, with the restrictions below.
- **Public multi-tenant SaaS: NOT READY** (billing, webhooks, approval-threshold breadth, schema
  cascade hardening, LLM-safety abstention gate all remain).

## Governance spine (verified this pass)
- **Atomic audit** on all governed mutations (AUDIT-01 closed) — state change + audit commit together.
- **Evidence integrity** — canonical `Evidence` + proof pipeline; the AI proof precheck (EVID-01) now
  screens every submission (tamper/format/reuse) and weak evidence can never count as verified
  (completion clears only on a human-`ACCEPTED`, non-duplicate, fresh proof). The parallel evidence-
  bundle surface is safely disabled (DEC-EVID-01).
- **Separation of duty** — a performer cannot approve/verify their own work.
- **Adaptive re-evaluation** — all 9 mandatory triggers wired to real callers (REEVAL-01), including
  owner non-compliance and major client loss, each correlation-idempotent.
- **Tenant isolation** — owner data is workspace-scoped and fails closed without a workspace.
- **Route error safety** — owner-use routes return governed messages, no raw internal leaks (CM-SEC-02).

## Proof
- `tsc --noEmit`: 0 errors. `next build`: exit 0 (all owner routes compile). Chromium smoke of
  `/login`,`/signup`: 200 with forms.
- 1139 tests pass across security / owner-mode / execution / domain suites.
- Real, un-mocked owner-loop simulation (`real-business-owner-loop.db.test.ts`): 5/5 scenarios.

## Restrictions in force for owner use
1. Solo/small-team; multi-actor high-value **financial** delegation awaits APPR-01.
2. Do not hard-delete governed parents (workspaces/engagements) until SCHEMA-02 is closed.
3. Evidence bundles are OFF; use canonical evidence + proof.
4. AI abstention gate (AI-02) not wired — safe now (deterministic + human-gated loop), required before
   LLM proposals enter the write path.
5. Scripted authenticated browser E2E recommended before onboarding many non-owner staff.

## Where to look
- Blocker ledger, closures, gate, readiness verdict, evidence JSON:
  `docs/remediation/2026-07-04-real-owner-use-readiness/`.
- Historical audit narratives (superseded, retained for traceability):
  `docs/archive/2026-07-04-pre-owner-use-consolidation/`.
