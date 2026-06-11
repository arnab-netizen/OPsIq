# Owner Mode Full-Capacity — Roadmap Audit Addendum

Hostile, skeptical audit of `execution.md` (2058 lines) performed before any
Module 2 planning. **Documentation only — `execution.md` is NOT edited by this
addendum.** Official status at audit time: `OWNER_MODE_STAGING_PROVEN` (Module 1
migrated, deployed, runtime-proven, security-proven; Module 2 not started;
public/SaaS frozen).

---

## 1. Executive verdict

`execution.md` is a **strong module catalogue and governance contract** — it lists
13 modules covering every consultant role, with per-module build contracts, test/
audit matrices, fail-closed rules, status vocabularies, commit rules, and a real
implementation order. As a *what-to-build* inventory it is **sufficient to begin
Module 2 (Financial Intelligence) planning now**.

It is **NOT yet sufficient to guarantee a genuine full-capacity owner system**,
because the cross-cutting "spine" that turns 10 separate dashboards into one owner
operating system is under-specified. The roadmap repeatedly promises "the single
highest-impact next action across money, sales, operations, marketing, staff, SOPs,
strategy" — but **no module defines the shared contract or algorithm that produces
that single ranked action across domains.** Each module computes its own scores in
isolation; nothing specifies how they normalize and roll up into one Business
Condition, one risk/opportunity ranking, and one prioritized action queue.

Verdict: **PROCEED to Module 2 planning, but adopt the additions in §4–§8 as a
parallel "Owner Intelligence Spine" before module integration points.** Module 2
can be specced/built; the spine must exist before "full capacity" can be claimed.
`execution.md` does not have to be rewritten first, but it should be amended with
this addendum's spine + the corrections in §9 before Module 2 reaches dashboard
integration.

---

## 2. Strong areas (keep as-is)

- **Core owner loop** (Input→Diagnosis→Severity→Recommendation→Action→Execution→
  Verification→Dashboard→Next Cycle) — clear and proven in Module 1.
- **Module 1 Owner Recovery** — backbone, runtime+security proven.
- **Financial (M2), Cashflow (M5), Operations (M4), Sales (M3), Marketing (M6),
  SOP/Execution (M7), Strategy (M8), Portfolio (M9)** — each has inputs, metrics,
  risk rules, owner outputs, APIs, UI, tests defined. Good breadth.
- **Connectors (M10)** — correctly deferred ("do not build connectors before the
  core loop is stable"), with validation/normalization/owner-confirmation rules.
- **Trust/Audit/Explainability (M11)** + **anti-hallucination rules (§18)** —
  strong: every recommendation must show detection, why, source data, calculation,
  confidence, risk-if-ignored, expected impact, verification.
- **Governance**: No-False-Green (§1.1), Backbone-First (§1.2), Fail-Closed (§1.4),
  per-module build contract (§23), testing matrix (§24), audit matrix (§25), commit
  rules (§26), stop conditions (§28). These are excellent and should be enforced.
- **Runtime-proof discipline** (§23.8) and **real-business validation (M13)**.

## Consultant-role coverage (Phase A summary)

| Role | Covered? | Strength | Module | Key missing piece |
|---|---|---|---|---|
| Business strategist | Yes | PARTIAL | M8 | strategy-ranking formulas undefined |
| Turnaround consultant | Yes | PARTIAL | M1+M2+M5 | no cross-domain triage/severity rollup |
| Recovery consultant | Yes | STRONG | M1 | — |
| Financial consultant | Yes | STRONG | M2 | — |
| Cashflow consultant | Yes | STRONG | M5 | — |
| Sales consultant | Yes | STRONG | M3 | — |
| Customer-retention consultant | Yes | PARTIAL | M3 | no cohort/churn/win-back lifecycle |
| Marketing consultant | Yes | STRONG/PARTIAL | M6 | attribution model thin |
| Operations consultant | Yes | STRONG | M4 | — |
| Process/SOP consultant | Yes | STRONG | M7 | — |
| Staff-productivity consultant | Yes | PARTIAL | M4+M7 | no per-staff profile / labour-cost-to-output |
| Execution/accountability consultant | Yes | STRONG | M7 | — |
| Verification/audit consultant | Yes | STRONG | M1+M11 | — |
| Multi-business portfolio advisor | Yes | STRONG | M9 | rollup aggregation formula undefined |

---

## 3. Weak / missing areas (Phase B classification, 40 items)

STRONG (28): financial health, cashflow/runway, debt/EMI, break-even, profit
leakage, customer acquisition, repeat purchase, B2B opportunity ranking, machine/
equipment capacity, quality/rework/complaints, delivery/fulfilment, SOP compliance,
marketing ROI, channel effectiveness, offer effectiveness, scenario planning,
execution accountability, verification/before-after, audit trail, anti-hallucination,
connectors/data intake, mobile usability, multi-business portfolio, real-business
validation, runtime-proof requirements, CI/test/audit gates, fail-closed governance,
sales pipeline (B2B).

PARTIAL (9): business onboarding/model classification; revenue quality; customer
retention (no churn/cohort); sales pipeline (B2C funnel); pricing/discount leakage
(no elasticity/margin-by-price); staff productivity (no per-person); risk scoring
(per-module only, no rollup); opportunity scoring (model undefined); data confidence
(referenced, not computed); missing-data handling (principle stated, per-metric
impact on confidence not specified).

WEAK (2): **action prioritization across domains** (the "one next action" promise
has no defined impact×confidence×urgency×effort model); **industry templates /
business-model adaptivity** (the system must work for "any owner-operated business"
but thresholds/metric-relevance are generic, with no per-industry template pack).

MISSING (3): **owner time allocation / owner-as-bottleneck**; **adaptive
re-evaluation triggers** (KPI deterioration, failed implementation, shock event,
owner non-compliance, key-person loss → forced re-diagnosis); **Business Condition
Profile** as a first-class cross-domain entity (the "severity ranking" step has no
defined model/output object).

> Note vs `CLAUDE.md`: the repo's product truth requires modelling **four
> dimensions at all times** (consulting lifecycle stage, business condition,
> intervention mode/phase, human execution reality) and a **mandatory adaptive
> re-evaluation rule**. `execution.md` models business condition and the loop well,
> but **human-execution-reality** (owner bottlenecking, follow-through risk,
> resistance to change, communication breakdown, morale, management capability,
> key-person dependency, accountability weakness) and the **adaptive re-evaluation
> rule** are largely absent. This is the most important conformance gap.

---

## 4. Required roadmap additions

1. **Owner Intelligence Spine (cross-cutting, not a leaf module).** A shared
   contract every module emits into: a canonical `Finding`, `Recommendation`,
   `Action`, and `Score` shape with normalized fields (domain, severity 0–100,
   confidence 0–1, business-impact in money/time, urgency, effort, evidence,
   source metric, verification metric). Module 1 already has most of this — promote
   it to a shared spec all modules must conform to.
2. **Business Condition Profile** — a first-class, persisted, versioned object that
   aggregates per-domain scores into one condition (e.g. SURVIVAL / FRAGILE /
   STABILIZING / GROWING) with the contributing evidence. This is the missing
   "Severity Ranking" output.
3. **Cross-domain Prioritization Engine** — deterministic ranking that merges all
   domains' findings/actions into one queue and selects the single highest-impact
   next action (impact × confidence × urgency ÷ effort, survival-weighted). Define
   the formula, tie-breakers, and survival-overrides-growth precedence.
4. **Adaptive Re-evaluation Engine** — explicit triggers that force re-diagnosis and
   re-prioritization: new critical evidence, KPI deterioration, unresolved critical
   blocker, failed implementation, shock event, scope change, owner non-compliance
   on a critical action, major client loss, key-employee loss. Plus a **review
   cadence** per business condition.
5. **Industry/Business-Model Template Packs** — per-industry metric relevance +
   threshold packs selected at onboarding, with safe generic defaults, so the
   product fits "any owner-operated business" without hardcoding one.
6. **Human-Execution-Reality model** — owner time allocation / owner-as-bottleneck,
   follow-through risk, accountability weakness, key-person dependency (business-
   operational variables only, per `CLAUDE.md` human-factors safety — no
   psychology). Feed these into action assignment and risk.
7. **Data-Confidence model** — explicit per-metric confidence computation and how
   missing/stale data lowers diagnosis confidence and is surfaced to the owner.

## 5. Required module additions / amendments

- **New Module: Owner Command Center / Business Condition (early).** §22 Phase 2
  already calls for an `/owner` shell, but the *Owner UI* is Module 12 (last) — a
  sequencing contradiction. Make the command-center + Business Condition Profile an
  early shared module (after M1, before M2 dashboard integration).
- **Amend M2–M9** to require each module to emit into the Spine contract (§4.1) and
  feed the Business Condition Profile + Prioritization Engine — not just a private
  dashboard.
- **Amend M3** with a dedicated retention/cohort/win-back sub-capability and a
  pricing/discount-margin sub-capability.
- **Amend M4/M7** with per-staff productivity + labour-cost-to-output and the
  human-execution-reality variables.
- **Amend M8/M9** with explicit scoring/ranking formulas (currently prose).
- **New Module: Adaptive Re-evaluation & Review Cadence** (cross-cutting).

## 6. Required test / audit additions

- **Prioritization determinism tests** — same inputs → same single next action;
  survival-overrides-growth precedence proven.
- **Business Condition rollup tests** — per-domain scores → condition, with evidence.
- **Adaptive-trigger tests** — each trigger forces re-evaluation and re-ranking.
- **Industry-template tests** — same metrics, different industry pack → different
  relevant findings, with generic fallback.
- **Confidence/missing-data tests** — missing/stale inputs lower confidence and are
  surfaced, never silently assumed (extends §18 anti-hallucination).
- **Cross-module integration tests** — a finding in any domain reaches the owner
  home queue and the verification loop.
- Add these categories to §24 testing matrix and §25 audit matrix.

## 7. Required runtime-proof additions

Extend §23.8 so each new module's runtime proof must additionally demonstrate, on
the deployed app: (a) the module's finding appears in the **cross-domain owner home
queue**, (b) it contributes to the **Business Condition Profile**, (c) an **adaptive
trigger** (e.g. a KPI deterioration) forces re-evaluation, and (d) the verification
loop updates both the module dashboard and the owner home. (Reuse the proven
`module-1-owner-recovery-runtime-proof` HTTP-smoke pattern.)

## 8. Required anti-false-green controls

- A module is not "full-capacity-contributing" until it emits into the Spine and is
  visible in the owner home — not merely passing its own dashboard test.
- The Prioritization Engine and Business Condition Profile must be **deterministic**
  (no LLM for core ranking, per §23.3) and **explainable** (§18) — every ranked
  action shows its impact/confidence/urgency/effort inputs.
- Confidence may never be silently upgraded; missing data must read as missing.
- `OWNER_MODE_FULL_CAPACITY_V1` must require a **cross-domain** runtime proof, not a
  sum of per-module proofs.

## 9. Revised module sequence (corrections only)

Keep the existing module set; fix ordering/drift:

1. **Spine first**: after Module 1, build the shared Finding/Action/Score contract +
   **Business Condition Profile** + **Owner Command Center shell** + **Prioritization
   Engine** (this is §22 "Phase 2", elevated and made concrete) before Module 2's
   dashboard integration.
2. Then **Module 2 Financial → M5 Cashflow** (survival cluster) — cash/finance are
   the fastest survival levers; current order already starts with Finance, good.
3. Then **M3 Sales → M6 Marketing** (revenue cluster), **M4 Operations → M7 SOP/
   Execution** (delivery cluster), **M8 Strategy**, **M9 Portfolio**.
4. **Adaptive Re-evaluation Engine** woven in from Module 2 onward (not deferred).
5. **M10 Connectors → M12 mobile polish → M13 real-business → Phase 12 hardening →
   Phase 13 public/SaaS** (unchanged, correctly last).
6. **Doc-drift fixes (when execution.md is next authorized for edit):** update §30
   "Current Next Action" (it still says "fix PR #31 Phase 3 Slice 2 env override" —
   now done); reconcile the Phase-number vs Module-number offset in §22; resolve the
   Owner-UI-is-Module-12 vs command-center-needed-early contradiction.

## 10. Definition of OWNER_MODE_FULL_CAPACITY_V1

`OWNER_MODE_FULL_CAPACITY_V1` is reached only when **all** are true:

1. **Domains live & integrated:** Recovery, Finance, Cashflow, Sales, Marketing,
   Operations, SOP/Execution, Strategy, Portfolio — each STAGING_PROVEN and each
   emitting into the **Spine** (canonical Finding/Action/Score).
2. **One business condition:** a persisted **Business Condition Profile** rolls up
   all domains into a single condition with evidence and confidence.
3. **One next action:** the **Prioritization Engine** deterministically produces the
   single highest-impact next action across all domains (survival-weighted,
   explainable), surfaced on the owner home.
4. **Adaptive loop:** defined re-evaluation triggers + review cadence demonstrably
   force re-diagnosis and re-prioritization.
5. **Evidence-only:** anti-hallucination + per-metric confidence + missing-data
   honesty enforced everywhere; no invented numbers.
6. **Human-execution-reality** variables modelled and feeding assignment/risk
   (business-operational only).
7. **Industry-adaptive:** works for ≥2 distinct industries via template packs with
   generic fallback; no hardcoded business.
8. **Multi-business:** portfolio command center ranks businesses and routes owner
   attention.
9. **Verification everywhere:** every domain supports before/after verification that
   updates module + owner home dashboards.
10. **Proven on real business** (M13) end-to-end with no manual DB edits, plus a
    **cross-domain** deployed runtime proof and green CI/audit gates.

Until 1–10 hold, status stays at `OWNER_MODE_STAGING_PROVEN` (or an intermediate
value), never `OWNER_MODE_FULL_CAPACITY_V1`. Public/SaaS remains FROZEN throughout.
