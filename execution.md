# OpsIQ Full Owner Mode — Hostile Audit + Slice Execution Protocol v3

## Status of this file

This file replaces the previous `execution.md` protocol if the goal is strict, hostile, skeptical execution. Earlier versions were directionally useful but had loopholes that could allow broad interpretation, undocumented acceptance, weak module proof, false completion, build-loop drift, command misuse, and status-report trust without repo proof.

This v3 protocol is intentionally stricter. It includes the additional hostile-audit hardening rules added after auditing the zero-prompt build-loop version. It forces repo-first inspection, explicit module proof, smallest-slice implementation, evidence-backed closeout, negative testing, status discipline, and no completion claims without command evidence.

---

# 0. Controlling Principle

Claude must treat every Full Owner Mode module as incomplete until the repository proves otherwise.

Evidence hierarchy:

```text
1. Passing command output from current repo state
2. Tests that assert the required behaviour
3. Runtime/API/smoke proof
4. Implementation code wired to product flow
5. Persistence schema and migrations
6. Status documentation
7. Prior chat claims
```

Only levels 1–4 can prove implementation. Status documentation and chat claims are never proof by themselves.

---

# 1. Absolute Prohibitions

Claude must not:

```text
- claim COMPLETE without command evidence
- start coding before repo reality scan and module audit
- use prior chat/status reports as proof of completion
- use UI presence as proof of backend functionality
- use mocked/demo-only success as proof of production path
- skip negative tests for auth, bad input, missing data, and cross-workspace access
- weaken existing tests, wrappers, auth checks, or validation to make tests pass
- hide failing commands behind “environment issue” without exact error output
- retry unavailable DB/Docker repeatedly instead of reporting exact blocker
- broad-rewrite current modules unless repo evidence proves existing path is unusable
- add future/post-owner modules before current Full Owner Mode is verified
- implement CRM/browser/API/import/simulation/learning/growth modules in this phase
```

---

# 2. Allowed Status Values

Use only these status values:

```text
NOT_STARTED
FOUND_EXISTING_UNVERIFIED
PARTIAL_IMPLEMENTATION
IMPLEMENTED_UNTESTED
TESTED_PARTIAL
RUNTIME_DB_UNVERIFIED
BLOCKED_WITH_EVIDENCE
VERIFIED_COMPLETE
```

Definitions:

```text
NOT_STARTED:
  No meaningful implementation found.

FOUND_EXISTING_UNVERIFIED:
  Files or functions exist but wiring/tests/runtime proof are missing.

PARTIAL_IMPLEMENTATION:
  Some implementation exists but required behaviour is missing.

IMPLEMENTED_UNTESTED:
  Code exists but no targeted test has proven the behaviour.

TESTED_PARTIAL:
  Some tests pass but not the full module gate.

RUNTIME_DB_UNVERIFIED:
  Static/unit proof exists, but DB/runtime path could not be verified because the exact infrastructure command failed.

BLOCKED_WITH_EVIDENCE:
  Progress is blocked by exact repo/environment constraint with command output.

VERIFIED_COMPLETE:
  Full module/slice gate passed with implementation, wiring, persistence where required, negative tests, and command evidence.
```

Forbidden labels:

```text
DONE
COMPLETE
FIXED
READY
PRODUCTION READY
CONSULTANT-GRADE
FULLY IMPLEMENTED
```

---

# 3. Repo Reality Scan — Mandatory First Step

No implementation may start before this section is completed.

## 3.1 Required discovery commands

Run from repo root:

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
pwd
find . -maxdepth 3 -type f | sort | sed 's#^./##' | head -300
ls
```

## 3.2 Package manager detection

Inspect lockfiles before running package commands:

```bash
ls package.json pnpm-lock.yaml package-lock.json yarn.lock bun.lockb 2>/dev/null || true
cat package.json
```

Rules:

```text
- If pnpm-lock.yaml exists, prefer pnpm.
- If package-lock.json exists and no pnpm-lock.yaml, prefer npm.
- If yarn.lock exists and no npm/pnpm lockfile, prefer yarn.
- Do not change package manager.
- Do not regenerate lockfiles unless dependency change is necessary and justified.
```

## 3.3 Required source inspection targets

Check if present:

```text
execution.md
OWNER_MODE_STATUS_REPORT.md
README.md
package.json
prisma/schema.prisma
src/
app/
lib/
services/
components/
tests/
__tests__/
e2e/
playwright.config.*
vitest.config.*
jest.config.*
```

If paths differ, discover actual equivalents and document them.

## 3.4 Required grep/search commands

```bash
grep -R "Owner Mode\|owner mode\|OWNER_MODE\|ownerMode" -n . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git || true

grep -R "diagnosis\|Diagnosis\|recommendation\|Recommendation\|action\|Action\|verification\|Verification\|evidence\|Evidence" -n src app lib services components tests __tests__ e2e 2>/dev/null || true

grep -R "mock\|stub\|TODO\|FIXME\|placeholder\|fake\|demo-only\|hardcoded" -n src app lib services components tests __tests__ e2e 2>/dev/null || true

grep -R "workspaceId\|workspace_id\|userId\|auth\|capability\|role" -n src app lib services components tests __tests__ e2e 2>/dev/null || true
```

## 3.5 Required repo scan output

Claude must output exactly this structure before coding:

```text
REPO_REALITY_SCAN:
  branch:
  commit:
  working_tree_status:
  package_manager:
  scripts_found:
  app_framework:
  database_layer:
  auth_layer:
  test_frameworks:
  owner_mode_related_files:
  owner_mode_related_tests:
  status_docs_found:
  schema_models_relevant_to_owner_mode:
  api_routes_relevant_to_owner_mode:
  ui_routes_relevant_to_owner_mode:
  mock_placeholder_todo_hits:
  immediate_blockers:
```

If any field is unknown, Claude must write `UNKNOWN_WITH_EVIDENCE:` and explain what was checked.

---

# 4. Current Full Owner Mode Scope Boundary

This execution file applies only to the current Full Owner Mode modules.

Explicitly out of scope until all M01–M15 are `VERIFIED_COMPLETE`:

```text
- real-world case-study benchmark library
- public dataset harness
- synthetic scenario simulator
- adversarial test suite beyond module-level negative tests
- blind outcome testing
- learning from every output
- online growth intelligence
- lead research
- CRM/API/OAuth integrations
- browser-login/browser-assisted import
- sales pitch generator
- public SaaS polish beyond current Owner Mode
```

If Claude finds code for those future modules, it may document their existence but must not implement them in this phase.

---

# 5. Mandatory Full Owner Mode Module Inventory

Audit these modules at minimum:

```text
M01 Business Profile / Owner Context
M02 Data Intake / Input Capture
M03 Diagnosis Engine
M04 Evidence Model / Evidence Attachment
M05 Recommendation Engine
M06 Action Plan Generator
M07 Owner Dashboard
M08 Operator / Action Completion Flow
M09 Verification / Outcome Tracking
M10 Constraint Handling
M11 Audit Logging / Traceability
M12 Access Control / Workspace Isolation
M13 Demo / Seed / Smoke Data Integrity
M14 Error Handling / Fail-Closed Behaviour
M15 Tests / Smoke / CI Verification
```

If repository contains additional current Owner Mode modules, add them as M16+ and audit them using the same standard.

---

# 6. Required Module Audit Output

For every module, Claude must output:

```text
MODULE_AUDIT:
  module_id:
  module_name:
  status:
  implementation_files:
  api_routes:
  ui_files:
  persistence_models:
  service_functions:
  tests:
  commands_or_static_checks_used:
  current_wiring_proof:
  data_source_proof:
  workspace_isolation_proof:
  failure_mode_proof:
  mock_or_placeholder_risk:
  missing_contracts:
  missing_tests:
  runtime_risks:
  exact_acceptance_gaps:
  next_required_slice:
```

Rules:

```text
- Empty fields are not allowed.
- Use NONE_FOUND only after search evidence.
- Use UNKNOWN only with exact reason.
- A module with no negative test cannot be VERIFIED_COMPLETE.
- A module with no workspace isolation proof cannot be VERIFIED_COMPLETE if it touches user/business data.
- A module with only UI proof cannot be VERIFIED_COMPLETE.
```

---

# 7. Module Acceptance Gates

A module is `VERIFIED_COMPLETE` only if all applicable gates are satisfied.

## Universal gates

```text
implementation_present: true
wired_to_product_flow: true
real_data_path_or_valid_no_persistence_reason: true
workspace_scoped_where_required: true
auth_checked_where_required: true
validation_present: true
negative_tests_present: true
happy_path_tests_present: true
failure_mode_defined: true
no_mock_only_success_path: true
no_silent_failure_path: true
commands_passed: true
status_doc_updated: true
```

## Business critical gates

For M03–M09 and M11–M14:

```text
auditability_present: true
evidence_or_trace_present: true
transaction_safety_considered: true
bad_input_handled_fail_closed: true
```

## User-facing gates

For M01, M02, M07, M08, M09, M10:

```text
ui_or_api_user_path_exists: true
empty_state_handled: true
loading_or_pending_state_handled_where_applicable: true
error_state_handled: true
```

---

# 8. Exact Standards per Module

## M01 Business Profile / Owner Context

Must prove:

```text
- business profile can be created/read/updated
- profile is workspace-scoped
- profile affects diagnosis/recommendations or explicitly gates them when missing
- missing required profile data downgrades confidence or blocks diagnosis
- owner constraints can be attached, referenced, or linked
```

Required tests:

```text
- create/read/update profile
- invalid profile rejected
- cross-workspace access denied
- diagnosis without required profile data produces low-confidence/block state
```

## M02 Data Intake / Input Capture

Must prove:

```text
- owner input can be submitted
- input is persisted or intentionally transient with documented reason
- input is workspace-scoped
- input is validated
- invalid/missing input produces explicit error or low-confidence state
- source metadata is retained for any material input
```

If file upload exists, must prove:

```text
- file metadata stored
- unsupported file rejected
- oversized file rejected or safely handled
- extracted facts linked to source file
- extraction failure does not create false success
```

## M03 Diagnosis Engine

Must prove:

```text
- uses real persisted or validated input data
- produces specific findings
- includes root cause, impact, confidence, evidence, missing data, action, verification metric, risk
- does not produce high-confidence output from weak/missing/conflicting data
- deterministic enough for automated tests
```

Required output fields:

```text
finding
rootCause
impact
confidence
supportingEvidence
missingData
actions
verificationMetric
risk
```

## M04 Evidence Model / Evidence Attachment

Must prove:

```text
- material findings link to evidence
- evidence references source/input/period/value where applicable
- evidence is workspace-scoped
- evidence appears in API or dashboard path
- cross-workspace evidence attachment is blocked
```

Minimum evidence fields where data-based:

```text
sourceType
sourceId
metric
value
period
confidence
```

## M05 Recommendation Engine

Must prove:

```text
- recommendations link to diagnosis findings
- recommendations include priority, expected impact, risk/trade-off, verification metric
- recommendations respect constraints where available
- recommendations are not generic filler
- recommendations downgrade or block when evidence is weak
```

## M06 Action Plan Generator

Must prove:

```text
- actions are created from recommendations
- actions link back to diagnosis/recommendation
- actions have status, owner/operator where applicable, due date where applicable
- multi-record creation is transactional where partial write risk exists
- action creation failure does not leave orphaned records
```

## M07 Owner Dashboard

Must prove:

```text
- dashboard reads backend/persisted data
- dashboard displays diagnosis, evidence, recommendations, actions, verification status
- dashboard handles empty/loading/error states
- dashboard filters client-visible records correctly where applicable
- dashboard cannot display another workspace's data
```

## M08 Operator / Action Completion Flow

Must prove:

```text
- operator can complete assigned/allowed action
- completion records actual outcome
- completion validates required fields
- completion updates action status correctly
- unauthorized action completion is blocked
- completion cannot update wrong workspace/action
```

## M09 Verification / Outcome Tracking

Must prove:

```text
- verification links to action/diagnosis
- verification state supports unverified/verified/disputed/failed or repo-equivalent states
- verification uses actual outcome or evidence
- verification does not auto-pass without evidence
- dashboard reflects verification state
```

## M10 Constraint Handling

Must prove:

```text
- constraints are captured, derived, or explicitly marked unavailable
- recommendations check constraints
- constraint violations are surfaced
- high-cost/high-time actions are not recommended blindly
```

Minimum constraints:

```text
budget
time
staffing
cash_runway
data_availability
business_stage
risk_tolerance
```

## M11 Audit Logging / Traceability

Must prove critical event traceability for:

```text
business_profile_changed
input_submitted
diagnosis_created
evidence_attached
recommendation_created
action_created
action_completed
verification_changed
recommendation_accepted_or_rejected_where_applicable
```

If audit logging does not exist, first acceptable slice is to introduce minimal audit events around one critical path, not to build a massive audit framework.

## M12 Access Control / Workspace Isolation

Must prove:

```text
- all current Owner Mode API routes require auth
- all records are workspace-scoped where business data is involved
- cross-workspace reads are blocked
- cross-workspace writes are blocked
- role/capability checks match canonical policy
- no client-supplied workspace_id is trusted without server-side authorization
```

## M13 Demo / Seed / Smoke Data Integrity

Must prove:

```text
- demo data is clearly marked
- demo data does not mask real-data failure
- demo records are client_visible where required by dashboard
- smoke path exercises real product path where possible
- fake-only proof routes are not used as completion evidence
```

## M14 Error Handling / Fail-Closed Behaviour

Must prove:

```text
- invalid input returns clear error
- missing data does not crash silently
- conflicting data downgrades confidence or blocks conclusion
- transaction failure rolls back partial writes
- external failure does not create false success
- stale data is labelled stale, not current
```

## M15 Tests / Smoke / CI Verification

Must prove:

```text
- unit tests exist for core logic
- integration/API tests exist for data path
- smoke/e2e exists for critical journey or exact blocker is documented
- negative tests exist for unauthorized/missing/invalid/conflicting states
- commands are documented
- CI or local equivalent can run them
```

---

# 9. Hostile Audit Checklist Before and After Every Slice

A slice fails if any of these are true.

## 9.1 Mock-only success

```text
- hardcoded demo data proves production behaviour
- static fake response used in real route
- mock service is imported in production path
- placeholder recommendation is treated as diagnosis
- always-pass verification exists
- UI status changes without backend state
```

## 9.2 Data integrity failure

```text
- business data not tied to workspace/user
- diagnosis can read another workspace's data
- action completion can update wrong action
- verification can be written without valid action/diagnosis link
- evidence is not traceable to source
- partial writes can leave inconsistent state
```

## 9.3 Consultant-quality failure

```text
- recommendation is generic
- recommendation has no evidence
- recommendation ignores business context
- recommendation ignores constraints
- recommendation has no expected impact
- recommendation has no verification metric
- recommendation has no risk/trade-off
```

## 9.4 Owner usefulness failure

```text
- owner cannot see what is wrong
- owner cannot see why it matters
- owner cannot see what to do next
- owner cannot see who should do it
- owner cannot see when to do it
- owner cannot see how improvement will be verified
- owner cannot see missing data/confidence
```

## 9.5 Fail-closed failure

```text
- missing critical data produces confident recommendation
- conflicting data is hidden
- failed verification shows success
- failed import/sync shows current data
- caught error returns fake success
```

## 9.6 Security failure

```text
- workspace_id is optional where required
- user authorization is skipped
- client-supplied workspace_id is trusted blindly
- role/capability checks are inconsistent
- server-only secret reaches client
- cross-tenant data access is possible
```

---

# 10. Slice Execution Loop

Claude must execute one small slice at a time.

## 10.1 Slice size rule

A slice should normally:

```text
- target one module
- fix one behaviour
- touch the smallest practical file set
- add or update tests for that behaviour
- run targeted verification and one regression command
```

Acceptable slices:

```text
- Add evidence relation to diagnosis response and test it.
- Block cross-workspace action completion and test it.
- Add missing-data confidence downgrade and test it.
- Make dashboard display verification status from backend and test it.
```

Unacceptable slices:

```text
- Rebuild Owner Mode.
- Implement all modules.
- Rewrite diagnosis, dashboard, action flow, and verification together.
- Add external integrations or simulations before current Owner Mode is verified.
```

## 10.2 Required slice start output

Before implementation:

```text
SLICE_START:
  slice_id:
  target_module:
  defect_or_gap:
  evidence_from_repo:
  why_this_is_highest_risk_next:
  intended_change:
  files_expected_to_touch:
  tests_expected_to_add_or_update:
  commands_expected_to_run:
  rollback_risk:
```

## 10.3 Required implementation discipline

```text
1. Inspect existing implementation first.
2. Reuse existing patterns and wrappers.
3. Do not invent parallel architecture.
4. Keep response contracts compatible unless a documented contract change is required.
5. Add migrations only when required.
6. Add tests before or with implementation.
7. Do not weaken existing tests.
8. Do not remove existing guardrails.
9. Do not bypass type errors.
10. Do not hide lint/type/build failures.
11. Do not continue to a second slice until closeout is complete.
```

## 10.4 Required slice closeout output

After implementation/testing:

```text
SLICE_CLOSEOUT:
  slice_id:
  files_changed:
  implementation_summary:
  tests_added_or_updated:
  commands_run:
  command_results:
  acceptance_gate_check:
  hostile_audit_result:
  remaining_risks:
  status:
```

Status must be one of:

```text
VERIFIED_COMPLETE
IMPLEMENTED_UNTESTED
TESTED_PARTIAL
RUNTIME_DB_UNVERIFIED
BLOCKED_WITH_EVIDENCE
```

---

# 11. Required Test Command Discovery

Claude must determine actual commands from package.json and repo config.

Common possibilities only if present:

```bash
npm run typecheck
npm run lint
npm test
npm run test
npm run test:ci
npm run build
npm run smoke
npm run e2e
```

If scripts differ, use actual scripts only.

## 11.1 Minimum verification per slice

Each slice requires:

```text
- targeted test for changed behaviour
- one regression command where feasible
- typecheck/build/lint when relevant and available
```

If no relevant tests exist, the slice must add tests unless blocked by exact repo limitation.

## 11.2 DB unavailable protocol

Do not repeatedly attempt DB startup.

Required output:

```text
DB_BLOCKER:
  command_attempted:
  exact_error:
  database_expected_by_repo:
  docker_available:
  local_db_available:
  tests_that_could_run_without_db:
  tests_not_run:
  verification_status: RUNTIME_DB_UNVERIFIED
```

Allowed after DB blocker:

```text
- static analysis
- typecheck
- unit tests not requiring DB
- contract tests not requiring DB
- documentation of exact missing runtime proof
```

Forbidden after DB blocker:

```text
- claiming runtime journey complete
- repeatedly retrying same unavailable DB command
- editing tests to avoid DB without explicit test-scope reason
```

---

# 12. Mandatory Customer Journey Proof

Full Owner Mode cannot be accepted without this journey being proven by automated smoke/e2e, API-level integration test, or exact command-backed equivalent.

```text
signup/login
↓
workspace created/selected
↓
business profile created
↓
owner inputs business data
↓
diagnosis generated
↓
finding/recommendation/action/evidence persisted
↓
owner dashboard displays same records
↓
operator/action route completes an action
↓
actual outcome is recorded
↓
verification status updates
↓
owner dashboard reflects updated status
```

Required assertions:

```text
- no cross-workspace leakage
- no mock-only success
- diagnosis response includes evidence/confidence/missing data
- action has valid status transition
- verification does not auto-pass without outcome/evidence
- dashboard reads persisted records
- invalid/missing input path fails closed
```

If this cannot run, status is not `VERIFIED_COMPLETE`.

---

# 13. Documentation Requirements

Every slice must update `OWNER_MODE_STATUS_REPORT.md` if it exists. If it does not exist, create it.

Required module status entry:

```text
module:
status:
verified_by:
commands_run:
files_changed:
known_gaps:
remaining_risks:
next_slice:
```

Rules:

```text
- Do not write marketing language.
- Do not write “done” without evidence.
- Do not erase previous unresolved risks.
- Do not mark module VERIFIED_COMPLETE unless all gates are satisfied.
```

---

# 14. Final Full Owner Mode Acceptance Gate

Full Owner Mode is accepted only when every module is `VERIFIED_COMPLETE`:

```text
FINAL_OWNER_MODE_ACCEPTANCE:
  M01 Business Profile: VERIFIED_COMPLETE
  M02 Data Intake: VERIFIED_COMPLETE
  M03 Diagnosis Engine: VERIFIED_COMPLETE
  M04 Evidence Model: VERIFIED_COMPLETE
  M05 Recommendation Engine: VERIFIED_COMPLETE
  M06 Action Plan: VERIFIED_COMPLETE
  M07 Owner Dashboard: VERIFIED_COMPLETE
  M08 Operator Completion: VERIFIED_COMPLETE
  M09 Verification Tracking: VERIFIED_COMPLETE
  M10 Constraint Handling: VERIFIED_COMPLETE
  M11 Audit Logging: VERIFIED_COMPLETE
  M12 Access Control: VERIFIED_COMPLETE
  M13 Demo/Smoke Data: VERIFIED_COMPLETE
  M14 Fail-Closed Errors: VERIFIED_COMPLETE
  M15 Tests/CI: VERIFIED_COMPLETE
```

And this journey passes:

```text
signup -> workspace -> business profile -> input -> diagnosis -> dashboard -> action completion -> verification -> dashboard update
```

And this command set passes or has exact blocker evidence:

```text
typecheck
lint
unit tests
integration/API tests
build
smoke/e2e customer journey
```

If any required runtime command is blocked, the final status cannot be `VERIFIED_COMPLETE`; it must be `RUNTIME_DB_UNVERIFIED` or `BLOCKED_WITH_EVIDENCE`.

---

# 15. First Execution Instruction for Claude

```text
Read execution.md fully.

Perform the Repo Reality Scan from section 3.

Then audit all current Full Owner Mode modules using sections 5–9.

Do not implement anything until the repo-backed module audit is complete.

After the audit, select the single smallest highest-risk incomplete slice.

Output SLICE_START.

Implement only that slice.

Run targeted tests and one regression command.

Update OWNER_MODE_STATUS_REPORT.md.

Output SLICE_CLOSEOUT with command evidence.

Repeat until every module is VERIFIED_COMPLETE or blocked with exact evidence.
```

---

# 16. Mobile-Safe Short Prompt

```text
Read execution.md. Follow it exactly. Repo scan first. Audit M01–M15. No coding before audit. Then implement the smallest highest-risk incomplete slice only. Test, update OWNER_MODE_STATUS_REPORT.md, close out with evidence, repeat. No assumptions. No broad rewrites. No false COMPLETE.
```

---

# 17. Zero-Prompt Build Loop Command

Purpose: allow the owner to continue the next slice with a short command instead of pasting a full prompt.

Claude must support a repository-resident command named:

```text
/continue-build
```

## 17.1 Required command file

If the repo uses Claude Code slash commands, create this file:

```text
.claude/commands/continue-build.md
```

with this exact content:

```text
Read execution.md from repo root and follow it exactly.

Continue Full Owner Mode from the latest repo-proven state only.

Mandatory sequence:
1. Read execution.md.
2. Read OWNER_MODE_STATUS_REPORT.md if present.
3. Run a minimal repo reality check:
   - git status --short
   - git rev-parse --short HEAD
   - cat package.json
4. Determine the next incomplete M01–M15 slice from repo evidence, not chat memory.
5. Output SLICE_START using execution.md format.
6. Implement only the single smallest highest-risk incomplete slice.
7. Run the targeted test for that slice.
8. Run one relevant regression command.
9. Update OWNER_MODE_STATUS_REPORT.md.
10. Output SLICE_CLOSEOUT using execution.md format.

Rules:
- No broad rewrites.
- No future/post-owner modules.
- No CRM/API/browser import/growth/simulation/learning modules.
- No skipped audit gates.
- No false COMPLETE.
- If DB/Docker/runtime is unavailable, capture exact command and error once, mark RUNTIME_DB_UNVERIFIED or BLOCKED_WITH_EVIDENCE, then continue with non-DB-verifiable slices only.
- Do not repeatedly retry blocked infrastructure.
```

## 17.2 If Claude Code slash commands are unavailable

Create this fallback command file:

```text
opsiq-continue-build.md
```

with the same content as `.claude/commands/continue-build.md`.

Then the short command/prompt to use is:

```text
Run opsiq-continue-build.md
```

## 17.3 Required startup behaviour when `/continue-build` is used

On every `/continue-build`, Claude must not ask what to do next. It must:

```text
1. Inspect repo state.
2. Read status report.
3. Identify next incomplete slice.
4. Start SLICE_START.
5. Implement one slice.
6. Test it.
7. Update status.
8. Output SLICE_CLOSEOUT.
```

## 17.4 Required closeout behaviour

At the end of every `/continue-build` run, Claude must state one of these:

```text
NEXT_RUN_READY: /continue-build
```

or

```text
BLOCKED_NEXT_RUN_NOT_SAFE:
  reason:
  exact_command_failed:
  exact_error_summary:
  human_action_required:
```

Claude must not end with a vague question such as:

```text
What would you like me to do next?
```

## 17.5 Command must not bypass gates

The short command is only a trigger. It does not weaken any audit requirement in this execution file.

`/continue-build` must still obey:

```text
- repo evidence hierarchy
- M01–M15 module scope
- smallest-slice execution
- targeted test requirement
- regression command requirement
- status report update requirement
- no false VERIFIED_COMPLETE rule
```


---

# 18. v3 Hostile Hardening Addendum — Mandatory

This section fixes loopholes found after auditing the zero-prompt build-loop version. It overrides any weaker wording above.

## 18.1 Dirty working tree policy

Before any `/continue-build` implementation, Claude must inspect the working tree.

Required command:

```bash
git status --short
```

Rules:

```text
- If the working tree has uncommitted changes, Claude must classify them before editing.
- If changes appear to be from the previous slice and are documented in OWNER_MODE_STATUS_REPORT.md, Claude may continue.
- If changes are undocumented, unrelated, or ambiguous, Claude must stop before editing and output DIRTY_TREE_BLOCKER.
- Claude must not overwrite, delete, reformat, or silently absorb unrelated user/worktree changes.
```

Required output if blocked:

```text
DIRTY_TREE_BLOCKER:
  changed_files:
  suspected_origin:
  risk:
  safe_next_action:
```

## 18.2 Status report is not a source of truth

`OWNER_MODE_STATUS_REPORT.md` is only a navigation aid.

Rules:

```text
- Status report entries do not prove completion.
- Every claimed completed slice must be re-checked against code/tests/commands before relying on it.
- If status report and repo evidence disagree, repo evidence wins.
- If status report marks VERIFIED_COMPLETE but required tests are absent or failing, downgrade the module.
```

## 18.3 Build-loop bootstrap must be implemented as its own first slice if missing

The zero-prompt command cannot be assumed to exist.

Before normal module work, Claude must check:

```text
.claude/commands/continue-build.md
opsiq-continue-build.md
```

Rules:

```text
- If neither exists, the first permitted slice is BUILD_LOOP_BOOTSTRAP.
- BUILD_LOOP_BOOTSTRAP may create only the command file(s), not product logic.
- After bootstrap, Claude must output NEXT_RUN_READY: /continue-build.
- Bootstrap does not count as M01–M15 verification.
```

Required bootstrap closeout:

```text
BUILD_LOOP_BOOTSTRAP_CLOSEOUT:
  command_files_created:
  content_matches_execution_md: true/false
  product_files_touched: must be NONE
  next_run_command:
```

## 18.4 Full audit is not required on every continuation, but delta audit is mandatory

The first execution after installing this file must perform the full M01–M15 audit.

For later `/continue-build` runs:

```text
- Claude must not re-run the entire expensive audit unless repo evidence changed materially.
- Claude must read the prior audit/status report.
- Claude must run a delta audit for the selected next slice.
- Claude must verify that the selected module status is still supported by current repo evidence.
```

Required output on continuation:

```text
DELTA_AUDIT:
  prior_status_source:
  files_rechecked:
  commands_or_searches_rechecked:
  status_confirmed_or_downgraded:
  reason:
```

## 18.5 Evidence artifacts must be durable

Closeout cannot rely only on prose.

For every command run, Claude must capture or summarize command evidence with enough specificity to verify later.

Required:

```text
- exact command
- exit code
- pass/fail
- relevant output excerpt
- if available, log file path under logs/owner-mode/
```

Recommended log convention:

```text
logs/owner-mode/<YYYYMMDD-HHMM>-<slice_id>-<command-name>.log
```

If log files are not created, Claude must explain why and include output excerpts in SLICE_CLOSEOUT.

## 18.6 Test modification restriction

Claude must not make tests pass by weakening the test suite.

Forbidden unless explicitly justified as a test-correction slice:

```text
- deleting failing tests
- skipping tests
- replacing assertions with weaker assertions
- changing production expectations to match broken behaviour
- changing fixtures to hide real defects
- excluding failing files from test config
```

If tests are changed, closeout must include:

```text
TEST_CHANGE_JUSTIFICATION:
  tests_changed:
  why_change_was_required:
  production_behaviour_asserted:
  did_assertion_strength_increase: true/false
```

If `did_assertion_strength_increase` is false, the slice cannot be `VERIFIED_COMPLETE` without separate justification.

## 18.7 Migration and schema-change controls

Schema changes are high-risk.

Before editing Prisma/schema/migrations/database types, Claude must output:

```text
SCHEMA_CHANGE_PRECHECK:
  reason_schema_change_is_required:
  existing_models_checked:
  backward_compatibility_risk:
  migration_required: true/false
  data_backfill_required: true/false
  rollback_plan:
```

Rules:

```text
- Do not add duplicate models if an equivalent model exists.
- Do not rename/delete fields without migration/backward-compatibility analysis.
- Do not introduce nullable fields to bypass required data without documenting why.
- Do not mark schema-related module VERIFIED_COMPLETE if migration cannot be verified and runtime DB verification is required.
```

## 18.8 API contract controls

Any changed API route/service response must have a documented response contract.

Required when touching API/service outputs:

```text
API_CONTRACT_CHECK:
  route_or_function:
  request_shape:
  response_shape:
  error_shape:
  auth_required:
  workspace_scope_source:
  backward_compatibility:
  tests_covering_contract:
```

Rules:

```text
- Do not silently change response field names.
- Do not remove fields used by UI/tests without updating all consumers.
- Do not return raw internal errors to the client.
- Do not return success=true when persistence/action failed.
```

## 18.9 UI contract controls

Any changed UI path must be tied to backend data or explicitly marked as mock/demo.

Required when touching UI:

```text
UI_CONTRACT_CHECK:
  page_or_component:
  backend_source:
  loading_state:
  empty_state:
  error_state:
  unauthorized_state:
  stale_data_state_where_applicable:
  tests_or_static_proof:
```

Rules:

```text
- UI cannot be accepted if it only renders static placeholder content.
- UI must not hide backend error states as empty success states.
- Dashboard data must be traced to API/service/persistence path.
```

## 18.10 Auth and workspace isolation proof must include negative checks

For any slice touching user/business data, closeout must include one of:

```text
- automated cross-workspace negative test, or
- existing test path re-run with exact command, or
- exact blocker explaining why it could not be run.
```

Static inspection alone cannot make access-control-sensitive work `VERIFIED_COMPLETE` unless the module is purely non-runtime and no route/service writes/reads user data.

## 18.11 DB blocker does not permit indefinite avoidance of DB-required modules

If DB/runtime is unavailable:

```text
- Claude may continue only with slices whose acceptance gates do not require DB/runtime proof.
- Claude must maintain a DB_BLOCKED_QUEUE listing modules/slices that cannot be verified.
- Claude must not mark the overall Full Owner Mode as VERIFIED_COMPLETE.
- Claude must not repeatedly choose low-value non-DB slices while high-risk DB-required slices remain blocked without stating that limitation.
```

Required output when DB is blocked and work continues:

```text
DB_BLOCKED_QUEUE:
  blocked_slices:
  reason_each_requires_db:
  non_db_slice_selected:
  why_non_db_slice_is_safe_and_useful:
```

## 18.12 Slice priority must be deterministic

After audit, next slice selection must follow this priority unless a blocker exists:

```text
P0: security/workspace isolation/auth failure
P1: data integrity/persistence/transaction failure
P2: diagnosis/evidence/recommendation correctness failure
P3: action completion/verification/customer journey failure
P4: dashboard visibility/error-state failure
P5: tests/status/audit documentation hardening
```

Required in SLICE_START:

```text
priority_class:
why_no_higher_priority_slice_selected:
```

## 18.13 No hidden dependency installation

Claude must not install packages just to complete a slice unless required.

Before adding dependencies:

```text
DEPENDENCY_CHANGE_PRECHECK:
  package:
  why_needed:
  alternatives_in_repo:
  security_or_maintenance_risk:
  lockfile_to_change:
```

Rules:

```text
- Prefer existing dependencies.
- Do not add large new frameworks for a small slice.
- Do not change package manager.
```

## 18.14 Environment variable and secret handling

Claude must not require unavailable secrets for normal verification unless unavoidable.

Rules:

```text
- Do not print secrets.
- Do not add real secrets to files.
- Document required env vars with placeholder names only.
- Tests should use safe test env values or mocks where appropriate.
- Missing env vars must produce explicit fail-closed errors, not fake success.
```

## 18.15 Completion language restriction applies to final responses too

Claude must not end a slice with vague positive language.

Forbidden final phrases unless the strict status supports them:

```text
all done
fully complete
production ready
ready to launch
works perfectly
no issues
```

Required ending:

```text
NEXT_RUN_READY: /continue-build
```

or:

```text
BLOCKED_NEXT_RUN_NOT_SAFE:
  reason:
  exact_command_failed:
  exact_error_summary:
  human_action_required:
```

## 18.16 The `/continue-build` command content must include v3 hardening

If `.claude/commands/continue-build.md` or `opsiq-continue-build.md` exists but does not mention this v3 hardening section, Claude must update it before continuing product work.

Minimum command-file line required:

```text
Also obey section 18 v3 Hostile Hardening Addendum in execution.md; it overrides weaker instructions.
```

## 18.17 Final acceptance requires fresh verification, not accumulated claims

Before final Full Owner Mode acceptance, Claude must run a fresh verification pass from current repo state.

Required:

```text
FINAL_FRESH_VERIFICATION:
  branch:
  commit:
  working_tree_status:
  commands_run:
  module_statuses_rechecked:
  customer_journey_result:
  unresolved_blockers:
  final_status:
```

If any verification command is skipped, blocked, or stale, final status cannot be `VERIFIED_COMPLETE`.
