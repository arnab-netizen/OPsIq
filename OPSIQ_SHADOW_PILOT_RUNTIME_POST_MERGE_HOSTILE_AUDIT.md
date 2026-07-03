# OPSIQ POST-MERGE HOSTILE AUDIT — Runtime-Readiness Remediation Waves 1–4

> Conducted under `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. **Tier 3 — Post-Merge / Milestone Audit**
> (a major remediation chain merged: PRs #97–#100). Read-only. **CI was NOT triggered by this audit**; only
> existing CI from the merged PRs was inspected. No PR opened, no merge, no workflow_dispatch.

## 1. Scope
- Selected tier: **Tier 3** (multi-PR remediation chain merged; touches ingestion-adjacent queries, proof loop,
  outcome/learning/reassessment, auth-adjacent routes, governance). Why: §2.4/§38 trigger conditions 2–5, 9.
- Audit branch: `claude/runtime-readiness-final-audit` (docs-only).
- Final main HEAD: `ce9a43b6` (Wave 4 #100). Chain: `04bdb326`(#97) → `20492a43`(#98) → `e70496f4`(#99) → `ce9a43b6`(#100).
- Working tree: clean.
- Merged PRs audited: **#97 Wave 1** RUNTIME_SCHEMA_QUERY_SWEEP; **#98 Wave 2** REAL_OWNER_RUNTIME_LOOP;
  **#99 Wave 3** VALUE_LEARNING_REASSESSMENT_LOOP; **#100 Wave 4** GOVERNANCE_HARDENING_SWEEP.

## 2. Production-vs-Test proof classification (§31)
The wave proofs are **production-service + real-Prisma-DB** (local Postgres 16), driving the real services
(`getActionById`, `getKPIsForEngagement`, `updateKPIValue`, `recordStandingInstruction`,
`intakeProofSubmission`, `reassessBudget`/`updateBudgetAction`, `runOwnerAdvice`, `generateRecommendation`).
They are **not** seed-only, not mock-only. **Caveat (weakest link):** the *full* UI→route→service→DB→read-model
→owner-plan→dashboard loop is **not** end-to-end proven across **all** critical domains — see §5 blockers.

## 3. Claim-to-Proof matrix (merged claims)
| Claim | Required layer | Actual layer | Evidence | Verdict |
|---|---|---|---|---|
| Schema-invalid Action/KPI/Finding queries rescoped; no PrismaClientValidationError | real Prisma DB | **DB** | `schema-query-sweep.db.test.ts` (6) — returns scoped rows, cross-ws→NotFound, empty→empty-not-500 | PASS |
| `getActionById` cross-workspace read-leak closed | auth/isolation DB | **DB** | same suite (foreign ws → NotFound) | PASS |
| Owner standing-instructions writable in-product + read back | route+service+DB | **service+DB** (route static-verified) | `standing-instruction-write.db.test.ts` (4); route `POST /api/owner/standing-instructions` canonical OWNER_MANAGE | PASS (route reachability = source-verified, not browser) |
| Proof-submit contract server-authoritative (no self-cert; dup-detect live) | service+DB+auth | **DB** | `proof-intake.service.db.test.ts` (6) — DB requirement authoritative, dup flagged, foreign-ws not-found, non-assignee denied, missing taskId rejected | PASS |
| Outcome disposition+variance steers next plan | loop (write→readback→behavior) | **DB loop** | `prior-outcome-steering.db.test.ts` (5) — persisted FAILED steers w/ variance; UNVERIFIED no steer/no success; ws+business scoped | PASS |
| Specific missing-inputs surfaced to owner | UI+logic | **logic+component** (browser at CI) | `supporting-figures.test.ts` (8) + `owner-supervisor-summary.test.tsx` | PARTIAL (browser E2E = CI-lane, not fresh-local) |
| Prior-failure learning read back into recommendations (primary+alternatives) | logic (ws-scoped) | **logic** | `recommendation-learning.test.ts` (8) | PASS (ws-scoped; NOT business-scoped — see §5) |
| Dead footgun/orphan code removed; gates green | logic/governance | **logic** | `tsc` green post-deletion; 520 adjacency tests | PASS |

All 37 representative proofs **re-run green on merged `main`** this audit (see §8).

## 4. Diff-scope + deletion/weakening check (§9)
- No scope-creep into public SaaS / billing / launch / marketing / Stripe / Lemon Squeezy / external integrations
  (grep of the four merged diffs — none touch those areas).
- **Deletions (Wave 4):** 5 files (`execution-stub.ts`, `lib/ingestion/csv.ts`, `services/ingestion/csv.ts`,
  `services/ingestion/validate.ts`, empty `scheduler.ts`) — all grep-proven zero-importer; `tsc` + 520 tests green
  after. **No test deleted. No threshold lowered. No ratchet relaxed** (baseline still 2155; current 2084 ≤).
  **No scanner made non-blocking** (auth-scanner stays blocking + green). No workflow trigger narrowed.

## 5. BLOCKERS / MAJORS / MINORS / DEFERRED (hostile default — what is NOT proven)
### Runtime gaps that cap the milestone (why this is PARTIAL, not READY)
- **MAJOR — Non-finance ingestion does not materialize (§14 FAIL).** `materializeIntake` materializes **only**
  `finance` → `OwnerFinancialSnapshot`; `operations`/`sales`/`sop`/`marketing` CSV and **all 20 manual-entry
  categories** dead-end at `OwnerDataIntake` and never reach the numeric read models the owner plan consumes.
  So the "data-in → owner plan" loop is proven only for finance. A real owner entering operations/staff/customer
  data cannot clear `need_more_data` for those domains. → domain/schema decision (documented, Wave 2/3 deferred).
- **MAJOR — `detectHighPriorityOverdueActions` still throws** (`src/services/escalation.ts`: queries
  non-existent `Action.priority`/`dueDate`), blocking the `escalation-checks` route (§20/§22). Wave-1-deferred
  domain decision (`Action.priority`).
- **MAJOR — M1 session-truth fabrication (§19.2).** `canonical-verified-session.ts` hardcodes
  `workspace.isActive:true` / `entitlements.limits:{}` / `planId:"default"`. **Latent** (no live gate reads it),
  but per §19.2 a fabricated session-authz value is a flagged finding. Owner/product decision (hot-path read).
- **MAJOR — M4 escalation honesty (§22).** Engagement escalation *alerts* are `logger.warn` + internal audit only
  (no delivery, no delivery-state label) — but entangled with the throwing action detector above. Deferred.
- **MAJOR — Scheduled (time-based) reassessment not wired (§23).** Correctly labelled: scanner + token-gated route
  exist, no durable scheduler invokes them; **no fake scheduler**; event-triggered reassessment works.
- **MAJOR — 3 legacy internal-only routes** (`users/[userId]` PATCH+POST, `leads/[leadId]` POST,
  `contacts/[contactId]` DELETE) remain on `withEnforcementFull`+`withAuth({internalOnly})`; their **success paths**
  depend on services querying `User`/`LeadRecord`/`ClientAccount` by a `workspaceId` those models lack → happy-path
  still blocked (deny paths provable). Clearing strict-auth needs a canonical-wrapper enhancement (would weaken the
  internal-only gate if forced). Deferred.
- **MINOR — Owner-visible browser E2E** for the new Wave 3 `supervisor-missing-to-quantify` block was validated by
  the CI owner browser lanes (13/18), not a fresh local Playwright run; component + domain + runtime proven locally.
- **MINOR — B6/S3 learning is workspace- but not business-scoped** (`OperatorItem` has no `businessId`). Domain
  decision, not a defect.

### DEFERRED DECISIONS (owner/schema — cannot hide blockers; each documented in wave deferred-decisions docs)
Non-finance materialization mapping; `Action.priority`/`dueDate`; `User`/`Lead`/`ClientAccount` workspace scoping;
`ClientContact.version`; M1 hot-path read + enforcement; M4 delivery model; durable scheduler; break-even/margin/EV
figures (placeholder-contaminated); demo-credential rotation + TLS `rejectUnauthorized` + `startup`/`build-info`
gating (security decisions). Risk if deferred: non-finance owners cannot fully drive the loop; escalation route
500s; latent authz state. None of these were masked, empty-arrayed, or 200-on-failure.

## 6. Existing CI status (inspected, NOT triggered) (§24.1)
Each merged PR reached `mergeable_state: clean` with **both required `build-and-test (20.x)` twins green** and all
lanes success/expected-skip at merge time: #97 (build-and-test 85005589791/…525961), #98, #99 (…034925/…972815),
#100 (…859328/…820415). No red required checks; expected skips only (LANE_A Neon Secrets, Auto-deploy Staging).
**CI required-before-merge was satisfied for every wave.** No workflow trigger narrowed; auth-scanner remained
blocking (§9.3 clean).

## 7. Governance / lint / strict-auth (§24.3) — on merged `main`, this audit
- `lint:ratchet` **PASS** — baseline 2155 / current **2084** / `changed_file_lint_errors: 0` (waves reduced errors).
- `governance:scan:strict` **0 new** (frozen baseline intact — not relaxed).
- `auth-governance-scanner` **comply** (blocking).
- Live **strict-auth 30 → 6** across the runtime-readiness program (7→6 in Wave 4); remaining 6 = 5 legacy-route
  imports (deferred, above) + intentional test surface.

## 8. Local proof re-run (this audit, merged main) (§8)
`TEST_WITH_DB=true` local Postgres 16:
`vitest run schema-query-sweep.db + standing-instruction-write.db + proof-intake.service.db +
prior-outcome-steering.db + supporting-figures + recommendation-learning` → **6 files, 37 tests, all passed**
(11.75s). Confirms the merged fixes are live and green post-merge, not just at PR time.

## 9. Final hostile self-audit (§34) — key answers
1. Production or seeded? **Production service + real Prisma** (not seed-only). ✔ (loop-completeness capped by §5.)
2. Owner reach via UI/API? Standing-instructions/proof/tasks: **routes exist** (source-verified). Non-finance
   ingestion: **materialization missing** ✗ (MAJOR).
3. Written data reaches owner plan? Finance + outcomes + missing-inputs: **yes**; non-finance ingestion: **no** ✗.
4. Affects confidence/action/recommendation? **Yes** (learning lowers confidence; outcome disposition defers;
   missing-inputs surfaced). ✔
5. Desktop+mobile where owner-visible? Wave 3 block: **component+CI-lane** (not fresh-local browser). PARTIAL.
6. Isolation proven? **Yes** — cross-workspace/business DB-proven (Waves 1/2/3). ✔
7. Prisma queries schema-valid? **Yes for swept sites**; `detectHighPriorityOverdueActions` **still invalid** ✗.
8. Denied requests fail-closed? **Yes** (proof non-assignee denied; foreign-ws NotFound). ✔
9. Service errors honest? **Yes** — no 200-on-failure introduced; expected rejections explicit; unexpected re-throw.
10–11. Ignored/quarantined + scanners: auth-scanner blocking+green; no relevant ignored test masks these areas.
12–14. Any `any`/fallback/placeholder/stub/hidden-error/write-only added? **No** — Wave 4 *removed* a fabricated
   field + a footgun; placeholder margin constants remain **unsurfaced** (not owner-facing).
15–20. Loop closure: **proof loop closed** (assign→require→submit→gate); **outcome→next-plan closed**;
   **learning→recommendation closed**; **reassessment event-triggered** (time-based honestly not wired);
   owner sees quantified value **or** exact missing inputs (finance path). Non-finance data-in loop **open** ✗.
21–25. No fake profit/live-outcome claim; no public-SaaS overclaim; no AI autonomy; no duplicate engine (M7 stays
   deleted); **no gate weakened**. ✔
26–28. Prior gates green where checked; limitations explicit (above + wave deferred docs); classification below is
   the weakest-link-limited honest verdict.

## 10. Classification (§2.4 / §5.2 weakest-link / §35)
**`MILESTONE_RUNTIME_PARTIAL`**

The four waves fixed and **DB-proved** significant, real runtime blockers — schema-invalid production queries + a
cross-workspace read leak (Wave 1), an orphaned owner-write path + a self-certifiable proof contract (Wave 2),
a write-only outcome loop + dropped value/missing-input signal (Wave 3), and dead-code footguns (Wave 4) — each
merged with **green required CI** and re-verified green on `main` this audit, with **no gate weakened, no
fabrication added, no masking, no overclaim**. But per the standard's weakest-link and no-write-only-loop laws,
the milestone is **PARTIAL, not READY**: the full real-owner runtime loop is **not end-to-end proven across all
critical domains** — non-finance CSV/manual ingestion does not materialize into read models, the overdue-action
escalation path still throws, session-authz state is still fabricated (latent), scheduled reassessment is honestly
not wired, and three internal-only route success-paths remain blocked on schema-scoping decisions. These are
documented owner/schema decisions, not hidden failures.

This is explicitly **NOT** `MILESTONE_RUNTIME_READY`, **NOT** `SHADOW_PILOT_RUNTIME_READY`, **NOT** `LIVE_PILOT_READY`,
**NOT** `LIVE_OUTCOME_PROVEN`, **NOT** `PUBLIC_SAAS_READY`. No live business outcome was measured or claimed.

## 11. Next remediation sequence (owner decisions required)
1. **Ingestion materialization (highest runtime leverage):** define per-domain CSV/manual → snapshot field
   mappings (or the new read models for sales/sop/marketing) — needs owner domain + possible schema decision.
2. **`Action.priority`/`dueDate`** decision → unblocks the overdue-action escalation path + M4 honesty label.
3. **Canonical-wrapper `internalOnly`+workspace** enhancement + `User`/`Lead`/`ClientAccount` scoping → clears the
   last strict-auth routes' success paths.
4. **M1** real workspace read + enforcement decision; **durable scheduler** infra decision; **security decisions**
   (demo-credential, TLS verify, health-probe gating).
Each is a scoped follow-up wave; none can be closed cleanly without a schema change, a wrapper enhancement, or an
owner decision.

## 12. CI statement (§1.1 / §35)
**CI was not triggered by this audit.** Existing CI from PRs #97–#100 was inspected and was green (required lanes)
at each merge. No CI is required to *produce* this read-only audit.
