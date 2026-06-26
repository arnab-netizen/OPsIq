# Approved Execution Boundary v2 + Fail-Closed Validator — Slice Report

Date: 2026-06-25
Branch: `claude/opsiq-owner-mode-build-219oib`
Slice: **SLICE 6 — Approved Execution Boundary v2** (Owner Mode guided-execution build)
Classification: **PASS_BACKEND_ONLY_UI_PENDING**

## Why this slice
Pre-build capability verification (fail-closed, repo-evidence-based) found the
boundary keystone genuinely **ABSENT**:

| Capability | Classification | Evidence |
|---|---|---|
| AI ledger persistence (Slice 1) | PROVEN_BY_CODE_AND_TEST | `src/services/ai/ledger-persistence.ts` + merged report; commit `05a57be` |
| Business audit persistence (Slice 2) | PROVEN_BY_CODE | `src/infra/audit.ts` `emitAuditEvent`, `src/domain/constants/audit-events.ts` (93+ events) |
| Learning eligibility gate (Slice 15) | PROVEN_BY_CODE | `src/domain/owner-mode/learning-eligibility.ts` `assessLearningEligibility` |
| Outcome verification (Slice 12) | PROVEN_BY_CODE | `src/domain/owner-mode/outcome-tracking.ts`, `OwnerActionOutcome` |
| **Execution Boundary v2 (Slice 6)** | **FALSE (absent)** → now PROVEN_BY_CODE_AND_TEST | no `ExecutionBoundary` model/validator existed |
| **Boundary validator** | **FALSE (absent)** → now PROVEN_BY_CODE_AND_TEST | no `validateInstructionAgainstBoundary` existed |
| Proof system (Slice 8) | UNVERIFIED/absent | only `proofText`/`proofAttachmentUrl` fields, no workflow |
| Employee lifecycle (Slice 3) | PARTIAL | `WorkspaceMembership` exists (Prisma) but member-enforcement is an in-memory mock store; no SUSPENDED/OFFBOARDED enum |

Boundary validation is the gate Addendum D names explicitly: *no employee-facing
AI guidance may be shown unless validation status is `BOUNDARY_VALIDATION_PASSED`*.
It is pure domain logic, so it is fully provable in this environment without the
DB lane.

## A. Files created
- `src/domain/execution/boundary.ts` — boundary value object, status enum,
  capacity enum, content-hash, sealing/immutability, versioning, validator.
- `src/__tests__/domain/execution/boundary.test.ts` — 38 unit + negative tests.
- `EXECUTION_BOUNDARY_V2_SLICE_REPORT.md` — this report.

## B. Files changed
- `src/domain/constants/audit-events.ts` — additive: `EXECUTION_BOUNDARY_CREATED`,
  `EXECUTION_BOUNDARY_SUPERSEDED`, `EXECUTION_BOUNDARY_VALIDATION_BLOCKED`
  (for the persistence/guidance call sites in later slices).

## C. Schema changes
- **NONE.** No Prisma migration. The boundary persistence model is deferred to the
  service slice that will store sealed boundaries; this slice delivers the domain
  contract + validator so later persistence does not require a rewrite (groundwork
  rule). `contentHash` + `boundaryVersion` are designed to map directly onto an
  additive table.

## D. Backend logic implemented
- `BoundaryValidationStatus` — the full explicit status enum (Addendum D), incl.
  PASSED, 11 BLOCKED_*, 2 ESCALATE_*, 2 FAILED_* states.
- `ApprovedExecutionBoundary` — every field required by Slice 6 + Addendum E
  (versioning, validity window, role/action/customer/channel envelopes, financial
  limits, promise flags, capacity rule, data-access, governance metadata,
  `isActive`, `supersedesBoundaryVersion`, `contentHash`).
- `computeBoundaryContentHash` — deterministic sha256 over canonicalized semantic
  content (excludes mutable `isActive` and `contentHash`).
- `sealBoundary` — computes hash + deep-freezes (immutability after approval).
- `createNextBoundaryVersion` — new immutable version, supersedes previous, never
  mutates the previous version.
- `validateInstructionAgainstBoundary` — fail-closed validator returning the first
  failing/escalating condition in deterministic order, or PASSED; emits a
  ledger-ready `BoundaryValidationResult` (validationStatus, boundaryId,
  boundaryVersion, validatedAt, validatedByService, reason, blockedInstructionSummary).

## E. Frontend logic implemented
- **NONE** (backend domain slice). No UI surface in this slice.

## F. Acceptance criteria checklist (Slice 6 + Addendum D/E required tests)
- [x] missing boundary fails closed
- [x] inactive/superseded boundary fails closed (`FAILED_INVALID_BOUNDARY_VERSION`)
- [x] version mismatch fails closed
- [x] content-hash mismatch fails closed (instruction & tampered-row variants)
- [x] expired / not-yet-valid boundary fails closed
- [x] exhausted maxUses fails closed
- [x] forbidden role / role outside allowed roles blocked
- [x] forbidden action / action outside allowed actions blocked
- [x] forbidden customer segment blocked
- [x] forbidden communication channel blocked
- [x] discount beyond limit blocked; ambiguous (no limit) discount fails closed
- [x] refund promise where forbidden blocked
- [x] spend with no limit fails closed
- [x] B2B price quote rejected when not permitted
- [x] same-day delivery rejected when capacity RED / UNKNOWN; passes on GREEN; owner exception honored
- [x] data access outside boundary blocked
- [x] owner-override action escalates to owner; escalation-trigger action routes to manager review
- [x] sealed boundary cannot be mutated in place (frozen, incl. nested arrays)
- [x] boundary update creates a new version; previous version unchanged
- [x] validation result carries all fields required to ledger/audit the outcome

## G. Known limitations
- Boundary persistence (Prisma model + migration) and the audit/ledger write at the
  blocked-validation call site are **not** in this slice — they belong to the
  guidance-generation slice (Slice 10) and a boundary-store service. The constants
  and the structured `BoundaryValidationResult` are in place so those wire in
  without rewrite.
- The validator is not yet invoked by any production caller (no employee-facing
  guidance path exists yet — Slice 10).

## H. Manual verification steps
1. `npm install --ignore-scripts` (Prisma engine download is blocked by proxy in
   this env; not needed for this pure-domain slice).
2. `TEST_WITH_DB= npx vitest run src/__tests__/domain/execution/boundary.test.ts`
   → 38 passed.
3. `npx tsc --noEmit` → `boundary.ts` / `boundary.test.ts` / `audit-events.ts`
   emit **0 errors**.

## I. Trigger map
- Owner approves a recommendation → service seals an `ApprovedExecutionBoundary`
  (Slice 10 call site) → `EXECUTION_BOUNDARY_CREATED` audit event.
- Boundary changed → `createNextBoundaryVersion` → `EXECUTION_BOUNDARY_SUPERSEDED`.
- Any AI/guided instruction → `validateInstructionAgainstBoundary` before display →
  blocked/escalated results → `EXECUTION_BOUNDARY_VALIDATION_BLOCKED`.

## J. Failure modes covered
Missing / inactive / superseded / version-mismatched / hash-tampered / expired /
usage-exhausted boundary; forbidden/unlisted role, action, segment, channel;
over-limit and ambiguous financial limits; forbidden refund/price-quote/same-day
promises; capacity-gated same-day/express; out-of-scope data access; owner/manager
escalation routing. Default on any ambiguity is BLOCK or ESCALATE — never PASS.

## K. Events emitted
- This slice adds the event **names** (additive). No event is written yet because no
  caller exists; writing happens in the persistence/guidance slice.

## L. Automated tests added
- `src/__tests__/domain/execution/boundary.test.ts` — 38 tests, all passing.

---

## SLICE 6 CLOSEOUT
- **Classification:** PASS_BACKEND_ONLY_UI_PENDING
- **Prisma validate:** NOT_RUN_WITH_REASON — Prisma engine download blocked by proxy
  (ECONNRESET) in this env; no schema change in this slice, so no migration to validate.
- **Prisma migrate status:** MIGRATE_STATUS_NOT_RUN_WITH_REASON — same; no migration added.
- **Backend enforcement:** fail-closed validator + immutable sealed boundary.
- **UI path:** none (deferred to Slice 10).
- **Authorization/security:** boundary is the authorization envelope; validator
  fails closed on every ambiguity; immutability enforced via deep-freeze + hash.
- **AI boundary/ledger:** validator is the precondition for any AI guidance display;
  result is ledger-ready. Actual ledger write deferred to caller slice.
- **Business audit:** event names added; writes deferred to caller slice.
- **Transaction/atomicity review:** pure function, no IO; no transaction surface.
- **Prompt-injection containment:** N/A in this slice (no untrusted text consumed);
  the validator operates on typed instruction fields, not free text.
- **Tests added:** 38 (unit + negative).
- **Tests run:** boundary file (38 passed); full domain suite `src/__tests__/domain/`
  (64 files / 2772 tests passed) → no regression.
- **Cross-slice regressions run:** pure-domain layer (incl. audit-events consumers in
  domain) — green. DB-backed lanes (AI ledger, business audit DB tests) NOT run here
  (CI_NOT_VERIFIED / DB_NOT_VERIFIED — require generated Prisma client + Postgres lane,
  which CI provides). My only change to a shared file is additive constants, which the
  green domain suite + clean tsc confirm is non-breaking.
- **Cross-slice regression result:** PASS (pure-domain); DB lane not run in this env.
- **Result:** PASS
- **Can this slice be used by a real owner?** NO — no UI/persistence yet; this is the
  enforcement primitive other slices consume.
- **Can this slice be used by a real employee?** NO — no employee-facing surface yet.
- **What would break in real use?** Nothing wired yet; risk is only that a future
  caller forgets to call the validator. Mitigation: Slice 10 must gate guidance display
  on `isBoundaryValidationPassed`.
- **What proof exists?** 38 passing unit/negative tests; clean tsc on changed files;
  green full domain suite.
- **What proof is missing?** DB/migration proof (none needed; no schema change), and a
  live caller invoking the validator (Slice 10).
- **Any previously passing gate weakened?** NO.
- **Next slice:** Slice 3 (employee/manager account lifecycle with fail-closed
  suspension/offboarding access revocation) — the next genuinely-missing foundational
  piece — then Slice 7 (delegated task state machine) and Slice 10 (guided flow that
  consumes this validator).

---

## SLICE 6 VERIFICATION ADDENDUM (2026-06-25)

Requested before starting Slice 3. Findings + patches:

1. **Enum values exactly match prompt.** 16/16 verified by extraction:
   PASSED; BLOCKED_EXPIRED, _ROLE, _FORBIDDEN_ACTION, _DISCOUNT_LIMIT, _REFUND_PROMISE,
   _SPEND_LIMIT, _CUSTOMER_PROMISE, _COMMUNICATION_CHANNEL, _CUSTOMER_SEGMENT,
   _DATA_ACCESS, _CAPACITY; ESCALATE_OWNER_APPROVAL_REQUIRED,
   ESCALATE_MANAGER_REVIEW_REQUIRED; FAILED_MISSING_BOUNDARY,
   FAILED_INVALID_BOUNDARY_VERSION. No extra/missing members.

2. **tsc command:** `npx tsc --noEmit` (whole project; `tsconfig.json` has
   `noEmit: true`, `strict: true`). The changed files are type-checked by **direct
   tsc**, not by the tests — vitest transpiles via esbuild and does **not** type-check.
   Result: 0 errors attributable to `boundary.ts`, `boundary.test.ts`,
   `audit-events.ts`. The 61 remaining project errors are pre-existing and
   environmental (`Cannot find module '@/generated/prisma/client'` — the Prisma engine
   download is blocked by the proxy here so the client isn't generated; CI generates it).

3. **computeBoundaryContentHash covers every safety-relevant field.** It hashes the
   whole boundary by **exclusion**: it strips only `contentHash` (self) and `isActive`
   (mutable lifecycle), then canonicalizes (recursively sorted keys, Dates→ISO) and
   sha256s everything else. So all envelopes/limits/flags/metadata
   (roles, actions, segments, channels, maxDiscount/Refund/Spend/Overtime, promise
   flags, capacity rule, dataAccess, escalation/legal/brand flags,
   ownerOverrideRequiredFor, validity window, version, supersedes) are covered. Tests
   assert the hash ignores `isActive` and changes on a semantic field.

4. **sealBoundary prevents nested mutation.** `deepFreeze` recurses into every
   object/array property and `Object.freeze`s each before freezing the root. Tests
   assert both top-level assignment **and** `allowedActions.push(...)` throw.

5. **Validation recomputes & compares contentHash, fail-closed on mismatch.** The
   validator recomputes the hash and (a) blocks if stored `contentHash` ≠ recomputed
   (tamper), and (b) blocks if the instruction's pinned `boundaryContentHash` ≠ the
   boundary's. Both → `FAILED_INVALID_BOUNDARY_VERSION`. Tests cover both paths.

6. **Ambiguity cases — fail closed (PATCHED where gaps existed):**
   - missing `maxDiscount` when discount requested → BLOCKED_DISCOUNT_LIMIT (already)
   - missing/false `refundPromiseAllowed` when refund requested → BLOCKED_REFUND_PROMISE (already)
   - missing/false `sameDayPromiseAllowed` when same-day requested → BLOCKED_CUSTOMER_PROMISE (already)
   - **missing/empty `allowedRoles`** → **PATCHED** to BLOCKED_ROLE (empty allow-list now denies)
   - **missing/invalid `validUntil`/`validFrom`** → **PATCHED** to BLOCKED_EXPIRED (NaN/non-Date window denies)
   - **missing `boundaryVersion`** → **PATCHED** to FAILED_INVALID_BOUNDARY_VERSION
   - **missing `contentHash`** (unsealed) → **PATCHED** to FAILED_INVALID_BOUNDARY_VERSION
   - Consistency hardening also applied to `allowedActions`, `allowedCustomerSegments`,
     `allowedCommunicationChannels`, `dataAccessBoundary`: a present value with an empty
     allow-list now denies. 7 new tests added (total 45, all passing).

7. **Runtime integration: NONE.** `grep` confirms zero callers of
   `validateInstructionAgainstBoundary` / `sealBoundary` / `ApprovedExecutionBoundary`
   outside the module and its test. **Classification: DOMAIN_ONLY_NOT_RUNTIME_ENFORCED.**
   Wiring into the guided-AI guidance path is **pending Slice 10** (the validator must
   gate guidance display via `isBoundaryValidationPassed`; escalation statuses show an
   escalation message, never the unsafe instruction).

Re-run after patches: `boundary.test.ts` → **45 passed**; full domain suite still green;
tsc unchanged (0 on changed files, 61 pre-existing/environmental).
