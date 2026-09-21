# UX-05A — Actions Layer Contract

Status: READ-ONLY audit. No production, test, schema, or config code was changed to produce this
document. Every factual claim below is tagged `VERIFIED` (file:line, read directly from source or
schema by this audit or a delegated research pass whose output was reviewed), `TEST-PROVEN` (an
existing automated test asserts it), `BROWSER-PROVEN` (an existing Playwright spec asserts it),
`UNKNOWN` (searched for, not found, or genuinely ambiguous from source), or `NOT_APPLICABLE`.

## A. Mission and authority

This document is UX-05A: an audit / contract-freeze phase for the "Actions" layer — `/owner/tasks`
and `/owner/execution` — following the merged UX-04A (Money/Sales/Operations contract, PR #512) and
UX-04B (business-domain correctness fixes, PR #513). It implements no production change. Its only
output is this file. The next phase (UX-05B, if any) is issued separately and is not started here.

## B. Starting repository state

- Repository: `arnab-netizen/OPsIq`.
- Expected/actual `main` SHA at mission start: `13f323b6bc67815a1c00bc3f1df96efd736356d9` — VERIFIED
  via `git rev-parse HEAD`/`git rev-parse origin/main`, both returning this exact SHA, and
  `git log --oneline --decorate -15 origin/main` showing it as `UX-04B: harden business-domain
  correctness and owner safety (#513)` at `HEAD`.
- Working tree was clean before branch creation (`git status --short` empty).
- Audit branch created: `claude/ux-05a-actions-layer-contract`, branched directly from the verified
  `main` above (`git checkout -b`), no other branch reused.
- `UX05A_START_MAIN_SHA=13f323b6bc67815a1c00bc3f1df96efd736356d9`.

## C. Scope and explicit exclusions

In scope (read/analyze only): `/owner/tasks`, `/owner/tasks/new`, `/owner/tasks/[taskId]`,
`/owner/execution`, and every domain/service/API file those four pages call into, transitively,
far enough to answer the mission's questions.

Explicitly out of scope for modification or redesign, read only where a direct dependency required
it: `/owner/cockpit` (read for the "Continue on Home" link and the "Start Work" origin only —
Section E, F, H), `/owner/finance`, `/owner/sales`, `/owner/operations`, `/owner/trust`,
`/owner/data`, `/owner/start-here`. No file under any of those pages, no navigation file, no domain
engine, no API route, no service, no Prisma schema, and no existing test was modified. The only file
this audit creates is this document.

## D. Current owner mental model from navigation

VERIFIED — `src/ui/shell/sidebar-nav.tsx`, `NAV_SECTIONS`, self-contained inline array (lines
176–499), no external nav-config file exists (grep across `src/` for
`breadcrumb|NAV_SECTIONS|navConfig|nav-config` found no second data source).

The file's own design-intent comment (lines 54–60) states the owner's mental model as: *"Home
('what needs my attention') → Business ('what evidence/context explains it') → Priorities/Actions
('what am I doing about it') → Evidence & Trust ('why does OpsIQ say this / what can I verify') →
More from OpsIQ ('what else exists or is coming')."* This bundles "Priorities" and "Actions" as one
conceptual stage and treats "More from OpsIQ" as a further, distinct stage after Evidence & Trust —
it is not literally "Home → Business → Actions → Evidence" as a closed loop.

Structurally, "Priorities" (`id: "priorities"`, title `"Priorities"`) and "Actions" (`id: "actions"`,
title `"Actions"`) are two **separate** sidebar sections, not one section with two sub-groups (lines
293–296: *"'Priorities' — what needs the owner's attention right now. Split out of the former flat
'Actions' section so urgency (Priorities) and execution (Actions) aren't one undifferentiated
list."*). For a self-serve owner, "Priorities" renders empty in practice — its one item, "Decision
Inbox" (`/dashboard/inbox`), is gated on `CAPABILITIES.ENGAGEMENT_VIEW`, a consulting-only capability
no self-serve owner holds, and a section with zero visible items renders nothing (line 601).

The "Actions" section (lines 325–338) contains, in literal source order:
1. `{ label: "Tasks", href: "/owner/tasks", requiresOwner: true, icon: <TaskIcon /> }` (line 329)
2. `{ label: "Execution & SOP", href: "/owner/execution", requiresOwner: true }` (line 330)
3. `{ label: "Check a decision", href: "/decision", requiresCapability: CAPABILITIES.ENGAGEMENT_VIEW }`
   (line 336) — also consulting-gated, invisible to a self-serve owner.

So for the actual controlled-beta self-serve owner this mission is scoped to, "Actions" resolves to
exactly two visible items: **Tasks** and **Execution & SOP**, matching the mission's own framing
exactly — with the caveat that the section technically holds a third, hidden item. The mission's
"intended conceptual journey to TEST" (Home → Money/Sales/Operations → Tasks/governed work →
Execution & SOP → Evidence & Trust) is **not itself asserted anywhere in current source** as the
product's designed reading order; Section W/X below treat it as exactly what it is — a hypothesis to
test, not a decided hierarchy.

## E. Route and dependency map

VERIFIED, from direct reads and the five research passes below.

```
/owner/tasks/page.tsx
 ├─ GET  /api/owner/process-execution           → "My work" (ProcessExecutionTask), read-only display
 └─ GET  /api/owner/tasks                        → "Delegated work" (DelegatedTask list)

/owner/tasks/new/page.tsx
 └─ POST /api/owner/tasks                        → assignDelegatedTask (create + optional proof requirement)

/owner/tasks/[taskId]/page.tsx
 ├─ GET   /api/owner/tasks/[taskId]               → getTaskDetail
 ├─ PATCH /api/owner/tasks/[taskId]/status        → transitionTaskStatus
 ├─ POST  /api/owner/tasks/[taskId]/proof/submit  → submitProofForTask
 └─ POST  /api/owner/tasks/[taskId]/proof/review  → reviewProofForTask

/owner/execution/page.tsx
 ├─ GET   /api/owner/sop/dashboard                        → getSopDashboard
 ├─ POST  /api/owner/sop/businesses/[businessId]/snapshots → createSopSnapshot
 ├─ POST  /api/owner/sop/businesses/[businessId]/diagnoses → runSopDiagnosis
 ├─ PATCH /api/owner/sop/actions/[actionId]                → updateSopAction
 ├─ POST  /api/owner/sop/actions/[actionId]/verify         → recordSopVerification
 └─ POST  /api/owner/recovery/businesses                   → createBusiness (shared with Money/Sales/Ops)

/owner/cockpit/page.tsx  (out of scope; read only for this map)
 └─ POST  /api/owner/process-execution           → onStartWork / onAction (the ONLY writer of
                                                     ProcessExecutionTask state; /owner/tasks never
                                                     writes to this model, only reads it)
```

Three independent domain models sit behind "Actions," each with its own schema, FSM, and business/
workspace-attribution rules — established in full in Sections G, H, and M/N.

## F. `/owner/tasks` current contract

VERIFIED, direct read of `src/app/(authenticated)/owner/tasks/page.tsx` (340 lines, full file).

The page renders two independently-fetched, independently-rendered lists on one screen, with an
explicit in-source comment distinguishing them (lines 31–34): *"An owner-started governed action
(ProcessExecutionTask) -- e.g. one begun with 'Start Work' on Home. Distinct from a DelegatedTask
(work explicitly handed off to a named person/role): this is work the owner is doing themselves..."*

- **"My work"** (lines 146–172, 210–238): fetched once per active business from
  `GET /api/owner/process-execution` (no query string — VERIFIED, line 154: `apiFetch("/api/owner/
  process-execution")`, no `businessId` param appended despite the route supporting one). Filtered
  **client-side**: `(t.businessId === null || t.businessId === activeBusinessId) && t.status !==
  "PROPOSED" && t.executionRoute !== "MONITOR_ONLY"` (lines 161–165). Each row is read-only: an
  owner-visible summary, a status badge, "Who: You", an optional start date, and a single
  `Link href="/owner/cockpit"` labeled "Continue on Home →" — **no query string, hash, or state is
  passed** (VERIFIED, lines 219, 230). There is no button on this page that starts, advances,
  completes, or otherwise mutates a `ProcessExecutionTask` — see Section H/Q for what that implies.
- **"Delegated work"** (lines 240–337): fetched from `GET /api/owner/tasks` with `status`/`limit`/
  `offset` query params (lines 174–191); no `businessId` is ever sent (matches the schema fact in
  Section J — `DelegatedTask` has no business column to filter by). Each row shows title, a
  presentation-only status-group badge, assignee (role or "Not yet assigned" — never a raw UUID,
  line 288 comment), due date, and a "What happens next →" link to `/owner/tasks/{task.id}`.
- Status filter (`<select aria-label="Filter tasks by status">`, lines 244–258) sends the **exact
  raw status** to the server via the `status` query param — never the presentation group.
- Pagination (lines 324–337): `Previous`/`Next`, offset stepped by `LIMIT=25`; `Next` shown only when
  `tasks.length === LIMIT` (a full page), `Previous` only when `offset > 0`.

## G. DelegatedTask source-of-truth contract

VERIFIED, cross-confirmed by direct read (`src/domain/execution/delegated-task.ts`, full 263 lines)
and an independent research pass over the routes/services.

**Status enum** (15 states, `DelegatedTaskStatus`, lines 22–38): `DRAFT, ASSIGNED, ACKNOWLEDGED,
IN_PROGRESS, BLOCKED, NEEDS_OWNER_CLARIFICATION, ESCALATED, PROOF_REQUIRED, PROOF_SUBMITTED,
COMPLETED_PENDING_REVIEW, APPROVED_COMPLETE, REJECTED_INCOMPLETE, CANCELLED, EXPIRED, DISPUTED`.

**Transition graph** (`VALID_TASK_TRANSITIONS`, lines 43–67) — explicit, backend-enforced, terminal
states map to `[]` (`APPROVED_COMPLETE`, `CANCELLED`, `EXPIRED`):
```
DRAFT                     → ASSIGNED, CANCELLED
ASSIGNED                  → ACKNOWLEDGED, CANCELLED, EXPIRED
ACKNOWLEDGED              → IN_PROGRESS, BLOCKED, NEEDS_OWNER_CLARIFICATION, ESCALATED, CANCELLED, EXPIRED
IN_PROGRESS               → BLOCKED, NEEDS_OWNER_CLARIFICATION, ESCALATED, PROOF_REQUIRED,
                             COMPLETED_PENDING_REVIEW, CANCELLED, EXPIRED
BLOCKED                   → IN_PROGRESS, NEEDS_OWNER_CLARIFICATION, ESCALATED, CANCELLED, EXPIRED
NEEDS_OWNER_CLARIFICATION → IN_PROGRESS, BLOCKED, ESCALATED, CANCELLED, EXPIRED
ESCALATED                 → IN_PROGRESS, BLOCKED, NEEDS_OWNER_CLARIFICATION, REJECTED_INCOMPLETE,
                             CANCELLED, EXPIRED
PROOF_REQUIRED            → ACKNOWLEDGED, PROOF_SUBMITTED, BLOCKED, ESCALATED, CANCELLED, EXPIRED
PROOF_SUBMITTED           → COMPLETED_PENDING_REVIEW, REJECTED_INCOMPLETE, DISPUTED, ESCALATED
COMPLETED_PENDING_REVIEW  → APPROVED_COMPLETE, REJECTED_INCOMPLETE, DISPUTED
REJECTED_INCOMPLETE       → IN_PROGRESS, PROOF_REQUIRED, CANCELLED, EXPIRED
DISPUTED                  → APPROVED_COMPLETE, REJECTED_INCOMPLETE, ESCALATED
```

**Authorization** (`planTaskTransition`, lines 137–215): fail-closed — a transition must be both
graph-valid AND role-authorized. Owner authority is final for any graph-valid move (line 166).
`SYSTEM` may only drive `→ EXPIRED` (168–172). An employee can never reach `APPROVED_COMPLETE`
(176–183); a manager needs explicit `canApproveCompletion`. Separation-of-duty (152–163): even an
owner cannot approve completion when `actorUserId === performerUserId`, unless an audited
`ownerOverride` is supplied. Cancellation requires `canAssign` (197–202).

**List service** — `GET /api/owner/tasks` → `getTaskList` (`src/services/execution/
task-query.service.ts`), capability `OWNER_VIEW`, workspace-scoped only.
**Detail service** — `GET /api/owner/tasks/[taskId]` → `getTaskDetail`, same file, workspace-scoped
(`where: { id: taskId, workspaceId }`), no mutation.
**Create/assign** — `POST /api/owner/tasks` → `assignDelegatedTask` (`src/services/execution/
task-assignment.service.ts`, lines 63–138), capability `OWNER_MANAGE`. Creates the `delegatedTask`
row with `status: rp ? PROOF_REQUIRED : ASSIGNED` and, if `requireProof` was supplied, a
`proofRequirement` + `proof` row in the same transaction. Audit `TASK_ASSIGNED` fires **after** the
transaction commits (not atomic with the create — VERIFIED).
**Mutation behavior** — `PATCH /api/owner/tasks/[taskId]/status` → `transitionTaskStatus` →
`applyTaskTransition` (`src/services/execution/delegated-task.service.ts`, lines 94–174): DB update
via `updateMany({ where: { id, workspaceId, status: task.status }, data: { status: to, ... } })` — a
0-row match throws `TaskTransitionConflictError` (409). This is the concurrency guard: **id +
workspace (isolation) + expected-status (concurrency)** in one clause. Audit `TASK_STATUS_CHANGED`
is written in the **same transaction** as the status update (comment, lines 134–153: *"a failed
audit write rolls back the status change, so state never mutates without its audit record"*).
**Proof requirements** — `proofRequirementId`/`proofRequirement` on the task; **submission** —
`POST .../proof/submit` → `submitProofForTask` → `submitProof` (`src/services/execution/
proof.service.ts`), validated by `validateProofSubmission`, transitioned via `planProofTransition`,
guarded by the same `updateMany({..., status: fromStatus})` pattern (→ `ProofConflictError` on
conflict). **Review** — `POST .../proof/review` → `reviewProofForTask` → `reviewProof`: enforces
`ProofSelfReviewError` when `submittedByUserId === actorId` (215–217) — the separation-of-duty point
the route's own header comment names. **Completion** — `POST /api/owner/tasks/complete` →
`completeTask` (`src/services/execution/task-completion.service.ts`, 147–225): loads the latest
proof, evaluates clearance via `evaluateProofClearance`/`resolveEffectiveProofAgeDays` (a
server-governed freshness window the client may only tighten, never loosen or disable — VERIFIED
comment), blocks with `TaskCompletionBlockedError` (409) and its own audit event
(`OWNER_TASK_COMPLETION_BLOCKED`) on failure, or applies the transition with `OWNER_TASK_COMPLETED`
(and `OWNER_TASK_OVERRIDE_USED` if an emergency override was used) on success.
**Rejection** — `REJECTED_INCOMPLETE`, reachable from `PROOF_SUBMITTED`/`ESCALATED`, via the generic
status/proof-review paths; **cancellation** — `CANCELLED`, reachable from almost every non-terminal
state via the generic `PATCH .../status` route only; no dedicated cancellation service, reason code,
or distinct audit event exists beyond the generic `TASK_STATUS_CHANGED` write.
**Expiry** — defined in the FSM (`SYSTEM`-only target) but **no runtime trigger was found** after a
genuine search: the one cron-scheduler route in the repo (`src/app/api/internal/cron/scheduler/
route.ts`) and its registered producers reference email-retry, finance-learning-bridge, and
reassessment-scan jobs — none reference `DelegatedTask` or `EXPIRED`. `TaskActorRole.SYSTEM` appears
only in domain/test files, never in a scheduled handler. **This is UNKNOWN, not VERIFIED-absent** —
a caller outside the Next.js route tree (a separate worker process) cannot be ruled out from source
alone, but none was found.
**Dispute** (of a *proof*, not the task status directly) — fully implemented in
`src/services/execution/proof-dispute.service.ts` → `disputeAcceptedProof`: 8 dispute categories
(`ProofDisputeCategory`), 3 flagged `HIGH_IMPACT` (`BAD_OUTCOME`, `SUSPECTED_FAKE_OR_REUSED_PROOF`,
`CUSTOMER_COMPLAINT`) that "always require an owner-visible human-reviewed reassessment," SoD
("cannot dispute your own proof"), idempotent no-op if already disputed, dual audit write. **This
service is not called from any of the 6 `/api/owner/tasks/**` routes** — the proof-review route's
`DISPUTED` outcome instead goes through the simpler `reviewProof()` path in `proof.service.ts`,
which does not run category validation or the reassessment side effect.
**Escalation** — fully implemented in `src/services/execution/escalation.service.ts` (`raiseBlocker`,
`acknowledgeEscalation`, `resolveEscalation`, its own `Escalation` table/status, its own audit
events `ESCALATION_RAISED/ACKNOWLEDGED/RESOLVED`) — **also not called from any of the 6 `owner/tasks`
routes reviewed.** `DelegatedTaskStatus.ESCALATED` is a task-status value only; it does not create an
`Escalation` row.
**Audit events emitted**, confirmed present in `src/domain/constants/audit-events.ts`:
`TASK_ASSIGNED` ("task.assigned"), `TASK_STATUS_CHANGED` ("task.status_changed"),
`PROOF_SUBMITTED`/`PROOF_REVIEWED`/`PROOF_DISPUTED`, `OWNER_TASK_COMPLETION_BLOCKED`,
`OWNER_TASK_COMPLETED`, `OWNER_TASK_OVERRIDE_USED`, `ESCALATION_RAISED/ACKNOWLEDGED/RESOLVED`.
**Idempotency**: none of the 6 routes accepts a client-supplied idempotency key; protection against
duplicate/concurrent mutation is the `updateMany`-with-expected-status pattern throughout (a genuine
concurrency guard, not a request-idempotency-token mechanism). Duplicate-**proof-content** (not
duplicate-request) is separately caught via `isDuplicateFileHash`/`duplicateFlagged`.
**Workspace/business scoping**: every route and service reviewed scopes strictly by
`{ id, workspaceId }` — **no route, service, or the schema itself references a businessId for
`DelegatedTask`, `WorkOrder`, `TaskStatusHistory`, or `ProofRequirement` at all.** See Section J.
**Employee-facing continuation**: `EMPLOYEE_ALLOWED_TARGETS` (delegated-task.ts, 93–101) names the
statuses an assignee may drive directly (`ACKNOWLEDGED, IN_PROGRESS, BLOCKED,
NEEDS_OWNER_CLARIFICATION, ESCALATED, PROOF_SUBMITTED, COMPLETED_PENDING_REVIEW`) — this audit found
no employee-facing page under `src/app/` that exercises this path; it is BACKEND_CAPABLE only as far
as this audit's file scope reached (no employee task UI was in scope to search for exhaustively).

## H. ProcessExecutionTask source-of-truth contract

VERIFIED, cross-confirmed by direct read (schema) and a full read of
`src/services/owner-mode/process-execution-bridge.service.ts` (863 lines) and
`src/app/api/owner/process-execution/route.ts` (173 lines).

**Schema** (`ProcessExecutionTask`, schema.prisma ~5493–5558): `workspaceId` (required),
`businessId` (nullable, soft FK — the schema's own comment: *"Embedded into taskKey itself for the
PROCESS_CORRECTION/CASH_PROFIT families... so this column is defense-in-depth, not the sole
isolation mechanism. null for the PASS 23 expansion families (workload/capability/SOP/training/
effectiveness), which remain workspace-scoped only."*), `taskKey` (unique per workspace),
`sourceFamily`, `executionRoute`, `actionOwner`, `approvalLevel`, `status` (default `"PROPOSED"`),
plus evidence/outcome/reassessment/approval-binding fields. A related, append-only
`ProcessExecutionTaskProgress` table logs progress history (never mutated after creation).

**Status set** (string literals found in the bridge service, not a typed enum):
`PROPOSED, ACKNOWLEDGED, IN_PROGRESS, APPROVED, REJECTED, BLOCKED, NEEDS_DATA, COMPLETED,
OUTCOME_RECORDED, OUTCOME_DISPUTED, OUTCOME_VERIFIED, CANCELLED`. `TERMINAL_STATUSES = new
Set(["REJECTED", "OUTCOME_VERIFIED", "CANCELLED"])`. **`OUTCOME_DISPUTED` and `CANCELLED` appear only
as members of status-check sets in this file — no code path was found in it that ever assigns either
value** (flagged UNKNOWN by the research pass, not concluded absent elsewhere in the codebase).
**`DELEGATED` is not a real status**: despite appearing in the page's own `OWNER_WORK_STATUS_LABELS`
map, the `DELEGATE` action actually sets `nextStatus = "IN_PROGRESS"` (bridge service, line 784) —
the page's label map contains a dead entry for a status the backend never produces.

**13 POST actions** (`/api/owner/process-execution`, body schema): `START, APPROVE, REJECT,
DELEGATE, SUBMIT_EVIDENCE, COMPLETE, REQUEST_REASSESSMENT, MARK_BLOCKED, REQUEST_MISSING_DATA,
ACKNOWLEDGE, RECORD_PROGRESS, RECORD_OUTCOME, VERIFY_OUTCOME`. Per-action transition rules (each
independently guarded, see full detail in the underlying research report): `START` only from
`PROPOSED/ACKNOWLEDGED/NEEDS_DATA/BLOCKED`; `APPROVE`/`DELEGATE` only from `PROPOSED/IN_PROGRESS`;
`RECORD_OUTCOME` requires exactly `COMPLETED`; `VERIFY_OUTCOME` requires
`OUTCOME_RECORDED/OUTCOME_DISPUTED`; `REQUEST_REASSESSMENT` has no status restriction at all
("allowed even on a completed task" — in-source comment).

**"Start Work" origin**: rows are materialized by `persistProcessExecutionRoutes` with
`status: "PROPOSED"`, called from the POST route on *every* action before applying it; a row first
advances past `PROPOSED` only via `START`. The `/owner/cockpit` page — **not** `/owner/tasks` — is
what calls `START` (`onStartWork`, cockpit page.tsx line ~403–420); `/owner/tasks`'s "My work" list
is display-only, per Section F.

**Delegation is role-only, not a named-user assignment.** `DELEGATE`'s input is a strict
`"MANAGER" | "STAFF"` enum (`delegateToRole`); on success it just sets
`data.actionOwner = input.delegateToRole` and `nextStatus = "IN_PROGRESS"`. There is no
`assignedUserId`-equivalent column on `ProcessExecutionTask` at all — unlike `DelegatedTask`, which
has both `assignedUserId` and `assignedRole`. `actionOwner`'s type,
`"OWNER" | "MANAGER" | "STAFF" | "OPSIQ_DRAFT" | "EXTERNAL_ADVISOR" | "NO_ACTION"`, is a descriptive
role class, never a user identity.

**Approval**: requires `approvalLevel === "OWNER_APPROVAL_REQUIRED"` and an owner actor.
**Evidence/progress**: `SUBMIT_EVIDENCE` appends to `evidenceRefs`; `RECORD_PROGRESS` creates an
immutable `ProcessExecutionTaskProgress` row. **Completion** gates on evidence-count sufficiency for
routes in `EVIDENCE_REQUIRED_ROUTES` and runs `detectFakeCompletion` as a second gate.
**Outcome recording/verification**: `RECORD_OUTCOME`/`VERIFY_OUTCOME` delegate to
`recordOwnerActionOutcome`/`verifyOwnerActionOutcome` + `triggerPostVerificationSideEffects`
(`src/services/owner-mode/owner-action-outcome.service.ts` and
`owner-outcome-verification.service.ts`) — carrying a `selfVerified` flag distinguishing an
owner-verified-their-own-work case from an independent verification.
**Reassessment**: automatic on `COMPLETE` for certain source families
(`createReassessmentEvent(..., trigger: "execution_invalidation")`), or explicit via
`REQUEST_REASSESSMENT` (`trigger: "owner_dispute"`).
**Audit events**, all written inside the same transaction as their mutation:
`OWNER_PROCESS_EXECUTION_TASK_UPSERTED/COMPLETED/ACKNOWLEDGED/PROGRESS_RECORDED`,
`OWNER_PROCESS_EXECUTION_OUTCOME_RECORDED/VERIFIED`, `OWNER_PROCESS_EXECUTION_TASK_TRANSITIONED`.

**Business-scoping is enforced server-side, not merely advisory**, despite the schema's own "soft
FK" wording (verified across five independent mechanisms): (1) the read path
(`getPersistedProcessTasks`) filters by `businessId` when supplied, unioned with a fixed
`WORKSPACE_LEVEL_SOURCE_FAMILIES` allowlist for the null-businessId families; (2) every write path
validates the target business belongs to the caller's workspace via `businessInWorkspace`; (3) a
caller-supplied `businessId` that conflicts with the task's own is refused
(`NOT_FOUND_OR_FORBIDDEN`), not silently accepted; (4) `RECORD_OUTCOME` requires and re-validates a
`businessId`; (5) `persistProcessExecutionRoutes`'s change-detection explicitly re-syncs a
stale/null `businessId`, which the code's own comment identifies as the fix for a previously
confirmed cross-business leak. No path was found where a mismatch is silently ignored.

**No linkage exists between `ProcessExecutionTask` and `DelegatedTask`** in either direction —
confirmed by two independent code searches (grep for each model name inside the other's
domain/service files: zero matches) and by the historical test comment in
`start-work-priorities-actions-unification.db.test.ts`: *"Actions (/owner/tasks) read only
DelegatedTask -- a completely different model -- so an owner-started ProcessExecutionTask never
appeared there at all."* They are, and always have been, two unrelated models rendered on the same
page.

**"Continue on Home →" does not deep-link.** The link is a bare `Link href="/owner/cockpit"` with no
query string, hash, or router state (Section F). `/owner/cockpit` reads `GET /api/owner/now-view`
and renders whatever the server computes as the current Top Priority / Execution lifecycle for the
workspace/active-business context — it has no `taskKey`-based read-and-highlight mechanism in the
portion of the file inspected (no `useSearchParams` import found). If the clicked item happens to
still be the same one `now-view` currently ranks as the top item, the owner will see it; otherwise
they must find it again. **CODE-PROVEN**, not merely inferred.

## I. DelegatedTask vs ProcessExecutionTask comparison

Per the mission's 14 required questions (Section 8), answered from Sections G/H above:

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | What is a DelegatedTask? | Work explicitly handed to a named user or role, 15-state FSM, workspace-scoped only, proof-gated, owner/manager-reviewed | PROVEN — Section G |
| 2 | What is a ProcessExecutionTask? | Governed work the owner (or a role) is doing themselves, originated from a diagnosis/finding via "Start Work," ~12-state ad-hoc status set, soft business-scoped | PROVEN — Section H |
| 3 | Can one create the other? | No | PROVEN — two independent code searches found no linkage |
| 4 | Can they refer to the same piece of work? | No shared identifier, no FK; a human could describe the same real-world task via both independently, but the system has no concept that they are the same | PROVEN (schema/code level) |
| 5 | Can both exist simultaneously for the same business problem? | Yes, trivially — nothing prevents an owner from also delegating a task that overlaps a ProcessExecutionTask's subject matter; the system does not track any relationship if they do | PROVEN (absence of any cross-check) |
| 6 | Is one employee/delegation-oriented and the other owner/governance-oriented? | Yes — DelegatedTask is delegation-to-a-person-oriented (assignedUserId/assignedRole, employee-drivable states); ProcessExecutionTask is owner/role-class-oriented (actionOwner is a role class, never a person) | PROVEN — Section G/H |
| 7 | Are their status machines equivalent? | No — 15 states with an explicit typed enum and graph (DelegatedTask) vs. ~12 untyped string-literal states with per-action ad-hoc guards (ProcessExecutionTask); no shared values beyond generic English words | PROVEN |
| 8 | Are their completion concepts equivalent? | No — DelegatedTask completion is proof-gated + owner/manager review (`COMPLETED_PENDING_REVIEW` → `APPROVED_COMPLETE`); ProcessExecutionTask completion is evidence-count-gated + fake-completion detection, with a *separate* subsequent outcome-recording/verification step that DelegatedTask has no equivalent of at all | PROVEN |
| 9 | Are their proof requirements equivalent? | No — DelegatedTask has a first-class `Proof`/`ProofRequirement` model with AI precheck, dispute, risk adjudication; ProcessExecutionTask has a plain `evidenceRefs: string[]` with a count threshold and a fake-completion heuristic — no proof-type taxonomy, no AI precheck, no dispute flow | PROVEN |
| 10 | Are their outcome-verification concepts equivalent? | No — DelegatedTask has none (its lifecycle ends at APPROVED_COMPLETE); ProcessExecutionTask has a dedicated `RECORD_OUTCOME`/`VERIFY_OUTCOME` pair with a `selfVerified` distinction that has no DelegatedTask analogue | PROVEN |
| 11 | Does one have businessId while the other is workspace-only? | Yes exactly — DelegatedTask/WorkOrder have no businessId column at all (workspace-only); ProcessExecutionTask has a nullable soft-FK businessId, non-null for two source families and null (workspace-level) for the rest | PROVEN — Section G/H/J |
| 12 | Can `/owner/tasks` safely present them in one page without implying false equivalence? | Partially — the page uses two visually distinct headed sections ("My work" / "Delegated work") with an explanatory code comment, but no on-screen owner-facing copy explains the distinction; a reader sees two lists with similar-looking rows and no stated reason they're different systems | PARTIAL |
| 13 | Does the page clearly explain the distinction to an ordinary owner today? | No — the distinguishing explanation exists only as a source-code comment (page.tsx lines 31-34), never rendered to the owner | PROVEN (absence) |
| 14 | Does "My work" vs "Delegated work" accurately represent the real model distinction? | Broadly yes as a *label* (self vs. others), but "My work" rows are entirely read-only (no actions), which a first-time owner has no way to know without clicking through to Home — the label doesn't communicate that this list can't be acted on here | PARTIAL |

## J. `/owner/tasks` business/workspace attribution

VERIFIED directly from `prisma/schema.prisma`.

**`DelegatedTask`** (~5061–5096): fields are `id, workspaceId, workOrderId, assignedUserId,
assignedRole, title, description, status, priority, dueAt, workStartedAt, estimatedDurationMin,
effortLevel, requiresTravel, requiresCustomerInteraction, requiresManagerReview,
approvedBoundaryId, approvedBoundaryVersion, boundaryContentHash, proofRequirementId,
expectedOutcomeId, financialBoundaryId, createdByUserId, sourceOperatorItemId, createdAt,
updatedAt`. **No `businessId` field exists.** Its optional parent, `WorkOrder` (~5047–5059), also has
no `businessId`. The only production code path that creates a `DelegatedTask`
(`assignDelegatedTask`) has no `businessId` parameter and never derives one. `sourceOperatorItemId`
is stored as an opaque string and is never actually set by `assignDelegatedTask` today (its input
type has no such field, despite the column existing and being read elsewhere).

**Classification: UNATTRIBUTED.** This is not a bug in the sense of a forgotten column — the
model's entire domain (assignment to a named person or role, workspace-wide) has no concept of
"which business," and no code path anywhere attempts to derive one. The consequence for a
multi-business owner is direct and observable in the page itself (Section F): the "Delegated work"
list shows **every** delegated task in the workspace regardless of the currently active business,
with **no per-row business label** and **no way to filter by business** — an owner cannot tell,
from this page, which business a given delegated task belongs to, because the system itself does not
know. This is `CROSS_BUSINESS_RISK` in the sense the mission defines it (ambiguous, not provably
wrong by the model's own contract, but genuinely confusing for a multi-business owner) — it is not
`KNOWN_WRONG`, because there is no missing filter to apply; there is no data to filter by.

**`Proof`** (~5300–5331), the row created alongside a `DelegatedTask` when proof is required, *does*
have a nullable `businessId String? @map("business_id")`, indexed (`[workspaceId, businessId]`), and
is read by the dispute/risk-adjudication services. **However, the only production write path for a
`Proof` row originating from `/owner/tasks`'s creation flow (`assignDelegatedTask`'s
`proof.create`) does not set `businessId`** — verified by reading its exact `data` object (id,
workspaceId, taskId, proofRequirementId, proofType, status, updatedAt only). Net effect: a proof
created through task assignment is itself unattributed too, so the dispute service's
business-scoped reassessment step is a silent no-op for any proof reaching it via this flow. This
was not exhaustively checked for a later `proof.update` backfill anywhere in the repo (flagged
UNKNOWN by the research pass, not concluded absent).

**"My work" (ProcessExecutionTask)** is filtered client-side by `businessId` as described in
Section F/H — `CORRECT_BY_MODEL` in the sense that the model does carry (nullable) business
attribution and the page does apply it, though the filter is client-side rather than sent as a
query parameter the route already supports server-side (Section H).

No test file was found (after a genuine grep for "DelegatedTask" combined with "businessId" across
`src/__tests__`) that asserts either the presence or the deliberate absence of business-scoping for
`DelegatedTask`/`Proof` — only workspace-isolation is tested (Section AA).

## K. `/owner/tasks` status and lifecycle matrix

The page's `STATUS_GROUPS` (lines 86–110) bucket the full 15-state `DelegatedTaskStatus` enum into
four owner-facing labels:

| Group | Raw states |
|---|---|
| To do | DRAFT, ASSIGNED, ACKNOWLEDGED |
| In progress | IN_PROGRESS |
| Waiting | BLOCKED, NEEDS_OWNER_CLARIFICATION, ESCALATED, PROOF_REQUIRED, PROOF_SUBMITTED, COMPLETED_PENDING_REVIEW, DISPUTED |
| Done | APPROVED_COMPLETE, REJECTED_INCOMPLETE, CANCELLED, EXPIRED |

**Every one of the 15 states is represented exactly once, and no state appears in two groups** —
verified by direct enumeration against Section G's authoritative enum; 3+1+7+4 = 15. Filtering
sends the raw status, not the group (Section F). Raw internal states do not leak through the
`STATUS_LABELS[s] ?? s` fallback map, because that map (lines 62–78) also has exactly 15 entries,
one per enum value.

**However: "Done" does incorrectly imply successful completion for three of its four members.** The
list-page row badge renders `<Badge variant={GROUP_VARIANT[group]}>{group}</Badge>` — the *group
name*, colored by `GROUP_VARIANT["Done"] = "success-accessible"` (a green badge) — for
`APPROVED_COMPLETE`, `REJECTED_INCOMPLETE`, `CANCELLED`, and `EXPIRED` alike. A rejected, cancelled,
or expired task renders an identical green "Done" badge to a genuinely approved-complete one on the
list page. **This is CODE-PROVEN**, verified directly from `page.tsx` lines 120–125 (`GROUP_VARIANT`)
and 284/295 (the row render). The **detail page does not have this defect** — `[taskId]/page.tsx`'s
`STATUS_VARIANT` map (lines 67–79) assigns `destructive-accessible` (red) to `REJECTED_INCOMPLETE`,
`CANCELLED`, and `EXPIRED` individually, and renders the raw status label, not a group name. The
truthfulness gap exists only on the list page's collapsed group-badge, not the underlying data or
the detail view.

## L. Task creation/detail/proof/completion surfaces

**Creation** (`/owner/tasks/new`, `POST /api/owner/tasks`, `assignSchema`):

| Capability | Backend | Owner UI |
|---|---|---|
| Assign to a named user (`assignedUserId: z.string().uuid().optional()`) | BACKEND_CAPABLE | NOT EXPOSED — no user picker exists on the form |
| Assign to a role (`assignedRole`) | BACKEND_CAPABLE | OWNER_UI_EXPOSED — a `<Select>` of Manager/Staff/none |
| Attach business context | NOT BACKEND_CAPABLE (no field exists on `DelegatedTask` or the create schema) | NOT EXPOSED |
| Require proof, with a proof type | BACKEND_CAPABLE | OWNER_UI_EXPOSED — checkbox + proof-type `<Select>` |
| Due date | BACKEND_CAPABLE | OWNER_UI_EXPOSED |
| Priority | BACKEND_CAPABLE (schema column exists) | NOT EXPOSED — no priority field on the create form |
| Creation is audited | BACKEND_CAPABLE (`TASK_ASSIGNED`) | N/A (server-side) |

VERIFIED — `assignSchema` (`src/app/api/owner/tasks/route.ts`, lines 43–50) accepts `assignedUserId`;
the create-form page (`src/app/(authenticated)/owner/tasks/new/page.tsx`, full 151-line read)
exposes only `title, description, assignedRole (role dropdown), dueAt, requireProof, proofType`. On
success the owner is routed to `/owner/tasks/{data.taskId}` (the detail page).

**Detail / proof / completion** (`/owner/tasks/[taskId]`, full 459-line read):

The owner can, from this one surface: view task metadata (title, description, assignee, priority,
due date, work-started time, and — if present — the source recommendation id, shown in monospace,
not humanized); view the full proof requirement (type, risk level) and proof status; submit proof
(type + required note) when `status === PROOF_REQUIRED`; review a submitted proof (Accept / Reject
[reason required] / Request Resubmission / Route to Human Review / Dispute) when the proof is in a
reviewable state; transition status directly via buttons (`Mark In Progress`, `Require Proof`,
`Cancel Task`, and a link to a separate `/owner/tasks/{id}/complete` route when
`COMPLETED_PENDING_REVIEW` — that route was not read, being outside this audit's four in-scope
files); and read the full status-history timeline (from-status, to-status, actor role, timestamp).

The owner **cannot**, from either surface: see or set a business attribution (none exists); assign
by name (no UI); see escalation state as a first-class object (only as a task status); see the
proof's AI-precheck outcome/reasoning distinctly (only its resulting `ProofStatus`, e.g.
`AI_PRECHECK_FAILED`, shown as a badge — the *why* is not surfaced); or invoke the dedicated
dispute-category flow (`disputeAcceptedProof`) — the review form's "Dispute" option reaches
`ProofStatus.DISPUTED` via the simpler generic path (Section G), not the category-driven service.
**A task list is not "complete task management" merely because deeper routes exist** — per the
mission's own framing, this audit records exactly what each of the two surfaces exposes above,
rather than asserting completeness.

## M. `/owner/execution` current contract

VERIFIED, direct read of `src/app/(authenticated)/owner/execution/page.tsx` (514 lines, full file).

The page's own route name and the mission's caution both apply: this page is **not** primarily task
or action management in the sense of Section F/L. It renders one business's SOP/execution
**diagnosis workspace** — a snapshot-in, diagnosis-out, action-plan-out cycle, structurally
identical in shape to Money/Sales/Operations (UX-04A/B), not to `/owner/tasks`.

Business selection: `BusinessContextSelector` bound to the shared `ActiveBusinessContext`;
`createBusiness` posts to `/api/owner/recovery/businesses` (the same shared route Money/Sales/
Operations use) and then calls `setActiveBusinessId` + `refreshBusinesses` + a forced `load
(created.id)` with **no re-check of intent between them** (see Section O). Snapshot creation
(`+ Add execution snapshot`) posts the 11 `SOP_FIELDS` (actionsAssigned, actionsCompleted,
actionsVerified, actionsOverdue, actionsDisputed, actionsReassigned, repeatedFailures,
proofRequired, proofProvided, recurringProcesses, documentedSops) to
`/api/owner/sop/businesses/{id}/snapshots`. Diagnosis (`Run execution diagnosis`) posts to
`.../diagnoses`. Each rendered action offers `Assign` (proposed→assigned), `Start`
(assigned→in_progress), `Complete` (in_progress→completed, via two sequential `window.prompt()`
calls for notes/evidence), `Block` (in_progress→blocked), and `Verify outcome` (three sequential
`window.prompt()` calls for before/after/direction) — every mutation calls
`/api/owner/sop/actions/{id}` (PATCH) or `.../verify` (POST) and then unconditionally reloads via
`load(selected)`.

## N. Execution & SOP source-of-truth matrix

VERIFIED, from a full read of `src/domain/owner-sop/{diagnosis,types,metrics,data-confidence,
recommendations,risk-rules,thresholds}.ts` and the seven `/api/owner/sop/**` route files plus the
three services (`dashboard`, `snapshot`, `diagnosis`, `action`, `verification`) behind them.

**Inputs** — the 11 `SOP_FIELDS` above, all optional numeric counts, plus `businessModel`,
`industryTemplate`, `currency`, `periodStart/End`, `notes`. Missing fields are never invented: every
ratio metric in `metrics.ts` (`completionRatePct`, `verificationRatePct`, etc.) returns `null`, not
a fabricated value, when its inputs are absent or its denominator is `≤ 0` (file header, explicit:
*"Ratio metrics return `null` when not computable from the provided inputs; nothing is invented."*).

**Diagnosis / `ExecutionState`** — `EXECUTION_STATES = ["DISCIPLINED", "ON_TRACK", "SLIPPING",
"UNRELIABLE", "BREAKDOWN"]` (`src/domain/owner-sop/types.ts:17`). **Complete match** with the page's
`STATE_LABEL` map — no gap here, unlike the action-status map below. Computed by `executionState()`
(`metrics.ts:186–213`) in strict severity order: `BREAKDOWN` (critical completion AND (critical
overdue OR critical repeated-failure)) → `UNRELIABLE` (any single critical signal) → `SLIPPING`
(data confidence `< 50`, OR any "low/high" secondary signal) → `DISCIPLINED`/`ON_TRACK` (a coin-flip
on the healthy-completion threshold, defaulting to `DISCIPLINED` when completion itself is
uncomputable — i.e. an execution with literally no completion data defaults to the *most favorable*
label once no worse signal fired, which is worth noting as a real, if narrow, "nothing invented"
tension: the state itself is never invented from nothing, but the specific choice between
`DISCIPLINED` and `ON_TRACK` when completion is `null` favors the calmer label rather than declaring
`ON_TRACK` as a safer default).

**Health / Risk / Opportunity / Confidence scores** — `executionRiskScore` (weighted sum of eight
boolean risk-signal flags, clamped 0–100), `executionHealthScore` (`0.6×(100−risk) + 0.4×throughput`,
throughput defaulting to 50 when uncomputable), `executionOpportunityScore` (sum of capped
recoverable-gap terms), `dataConfidenceScore` (starts at 100; −30 per missing *critical* input
[`actionsAssigned`, `actionsCompleted`, `verifiedOrOverdue`], −5 per missing "important" field [9
named], −10 for invalid currency, −15 if the snapshot is stale beyond a default 45-day window,
clamped 0–100).

**Findings** — exactly two types, `"risk"` and `"opportunity"` (matching the page's
`FINDING_TYPE_LABEL`). Ten risk-finding codes emitted only when their underlying metric is
computable and crosses a threshold (`SOP_INVALID_CURRENCY`, `SOP_MISSING_CRITICAL_DATA`,
`SOP_LOW_COMPLETION`, `SOP_LOW_VERIFICATION`, `SOP_HIGH_OVERDUE`, `SOP_REPEATED_FAILURES`,
`SOP_HIGH_DISPUTE`, `SOP_HIGH_REASSIGNMENT`, `SOP_LOW_PROOF_COMPLIANCE`, `SOP_LOW_COVERAGE`); five
opportunity recommendation templates exist (`SOP_OPP_CLEAR_OVERDUE`, `SOP_OPP_CONVERT_TO_SOP`,
`SOP_OPP_CLOSE_COVERAGE_GAP`, `SOP_OPP_RAISE_VERIFICATION`, `SOP_OPP_DATA_QUALITY`) — their emission
*conditions* (`opportunity-rules.ts`) were **not read** by the delegated research pass and are
UNKNOWN by this audit. A finding with no matching recommendation template produces no action
("nothing is invented" — file header). Evidence and owner-facing wording are copied verbatim from
the finding, never re-derived.

**Actions** — created by `planSopActionsFromDiagnosis` (`src/domain/owner-sop/actions.ts` — this
audit confirmed it is imported and used by `runSopDiagnosis`, but did **not** open the file itself;
its internal use of `recommendations.ts` is UNKNOWN, not independently re-traced). Ranked via the
shared Spine ranker (priority desc → impact → confidence → findingCode → title → id, a fully
deterministic tie-break). Status lifecycle: **shares the exact same 6-state machine as Money/Sales/
Operations' recovery actions** — `RECOVERY_ACTION_STATUSES = ["proposed", "assigned", "in_progress",
"blocked", "completed", "cancelled"]` (`src/domain/founder-recovery/action-status.ts:8–15`), reused
by `owner-spine/contracts.ts`'s `OWNER_ACTION_STATUSES` and directly by
`sopActionUpdateSchema.status: z.enum(RECOVERY_ACTION_STATUSES).optional()`
(`src/domain/owner-sop/validation.ts:54`). **The page's own `ACTION_STATUS_LABEL` map has only 5
entries — `proposed, assigned, in_progress, completed, blocked` — and is missing `cancelled`**,
verified directly (page.tsx lines 43–49). This is the exact same defect class UX-04B already fixed
on Money, Sales, and Operations' *own* recovery-action label maps, using the *same* shared source of
truth — just never applied here. Assignment is `assignedTo: String? @db.Uuid` (a bare column, no UI
control on this page to set it was found in the 514-line read — the page's action cards show no
assignment control at all, only status-transition buttons). Blocking is a status value
(`in_progress → blocked`, no reason/note captured by the page's own `updateAction` call). Completion
requires a `window.prompt()`-collected note + evidence array (Section O).

**Verification** — a distinct `OwnerSopVerification` row per action, with `beforeValue`,
`afterValue`, `targetDirection`, `status` drawn from `OWNER_VERIFICATION_STATUSES = ["unverified",
"verified_improved", "verified_not_improved", "inconclusive", "disputed"]` — **complete match** with
the page's `VERIFY_LABEL` map, no gap. `recordSopVerification` requires a `beforeValue` (fails
closed with a `ValidationError` otherwise) and delegates classification to the shared
`verifyOutcome` logic in `src/domain/founder-recovery/verification.ts` — "never hardcoded" (file
header).

**SOP/process concepts** ("recurring processes," "documented SOPs," proof required/provided) are
**plain numeric snapshot fields** (`recurringProcesses`, `documentedSops`, `proofRequired`,
`proofProvided`) feeding the risk/opportunity engine above — they are **not** connected to the
separate, fully-built "documented SOP lifecycle" product (`sop-document.service.ts`,
`ownerSopDocument` model, its own `/api/owner/sop-documents` route namespace) or the "SOP training/
compliance intelligence" product (`sop-process-intelligence.service.ts`, `ownerSopTrainingAssignment/
NonComplianceAlert` models, `/api/owner/sop-intelligence`). **Confirmed via direct grep of
`execution/page.tsx` for either service's identifiers or model names: zero matches**, and both
services live under an entirely different URL prefix than the page's own `/api/owner/sop/...` calls.
This is a genuine, source-proven case of the *same English words* ("SOP") describing three unrelated
product concepts in this codebase — Section AE addresses this explicitly as an unsafe equivalence to
reject.

**History** — `cycleHistory` (sequence number, execution state, finding/action counts, date) is
rendered; `latestSnapshot`'s own field values (raw input numbers) are **not** rendered anywhere on
this page after creation — the page shows only the derived cycle, never the raw snapshot back to the
owner. `ProcessExecutionTaskProgress`-equivalent granular history does not exist for SOP actions at
all (no `OwnerSopAction`-history table was found in the schema — unlike `TaskStatusHistory` for
`DelegatedTask`).

## O. `/owner/execution` correctness and race audit

All six sub-items **CODE-PROVEN** by direct read of the 514-line page file (Section M).

**A. Stale load-response race — present, unguarded.** `load()` (lines 101–119) has no generation
counter, no `AbortController`, and no "is this still current?" check before `setDashboard`/
`setSelected`/`setActiveBusinessId`. A `load(A)` started, then `load(B)` after a business switch,
whose `A` response resolves after `B`'s, will overwrite `B`'s rendered dashboard and — critically —
call `setActiveBusinessId(data.selectedBusinessId)` (line 113), re-anchoring the *shared,
cross-page* active-business context back to `A`. This is the exact defect class UX-03/UX-04B fixed
on Home/Finance/Sales/Operations via `loadGenerationRef` — never applied here.

**B. Stale mutation-intent race — present, unguarded.** Every mutation (`addSnapshot`, `runDiagnosis`,
`updateAction`, `verifyAction`) captures `selected` by closure and, on success, unconditionally calls
`await load(selected)` (lines 182, 199, 221, 247) with no check that the owner hasn't since switched
business. No `activeBusinessIdRef`-equivalent exists on this page at all. A slow mutation for
business A resolving after a switch to B will reload/re-anchor A over B's already-rendered state —
the exact race UX-04B's amendment closed on Finance/Sales/Operations, absent here.

**C. Create-business continuation race — present, unguarded.** `createBusiness` (lines 130–157)
calls `setShowBusinessForm(false); setActiveBusinessId(created.id); await refreshBusinesses(); await
load(created.id);` with **no re-check of intent between `refreshBusinesses()` and the forced
`load(created.id)`** — if the owner switches to a different business during that `await`, this
unconditional `load(created.id)` will still force the newly created business back into view. This is
exactly the race UX-04B's `createBusiness` fix guarded against on the other three pages; absent here.

**D. Raw owner-facing errors — present on every catch path.** All five catch blocks
(`load`, `createBusiness`, `addSnapshot`, `runDiagnosis`, `updateAction`, `verifyAction` — six, not
five) use `setError(e instanceof Error ? e.message : "Failed to ...")`, rendering the raw
`Error.message` text directly (lines 115, 153, 184, 201, 223, 249). **None** of the six call
`classifyOperatorError`, the governed helper Money/Sales/Operations route every catch through
(confirmed present in this codebase and imported by all three of those pages, per UX-04B). This page
never imports it at all.

**E. Raw enum leakage — one confirmed gap, one confirmed clean.** `ACTION_STATUS_LABEL[a.status] ??
a.status` (line 470) will render the literal lowercase string `"cancelled"` verbatim if any
`OwnerSopAction` ever reaches this page in that status (Section N) — `BACKEND_CAPABLE` and
schema-legal today, just never produced by this page's own UI (no cancel button exists on any action
card). `STATE_LABEL`/`VERIFY_LABEL` fallbacks have no such gap (Section N — both maps are complete).

**F. Error-vs-empty confusion — present.** On a failed **initial** load, `dashboard` stays `null`;
render falls through to `businesses = dashboard?.businesses ?? [] = []`, which renders the "No
businesses yet. Create your first business..." empty state **at the same time** the error banner
(`{error && <div>...}`, lines 273–277) is also rendered above it — an owner sees both "something went
wrong" and "you have no businesses" simultaneously on the identical failure. This is the same known
residual documented in UX-04B's PR body for Money/Operations, confirmed present here too, never
fixed on this page.

**G. Responsive risks — SOURCE-RISK, not rendered-tested.** The business-creation form uses a fixed
`grid grid-cols-2 gap-3` (line 282) and the snapshot form a fixed `grid grid-cols-4 gap-3` (line
338) for its 11 numeric fields — neither has any responsive breakpoint class (`sm:`/`md:`), which is
a real source-level narrow-viewport risk (four number inputs across one row at 390px) but this
audit has no rendered/browser evidence for or against actual overflow, so it is classified
`SOURCE-RISK`, not `PROVEN`.

## P. `/owner/tasks` correctness and race audit

**OwnerWork request race** — `useEffect` for "My work" (lines 149–172) uses the standard
`let cancelled = false; ... return () => { cancelled = true; }` cleanup pattern, checked before
every `setOwnerWork`/`setOwnerWorkError` call. **This correctly prevents a stale response from a
previous `activeBusinessId` from rendering after a switch** — CODE-PROVEN, no defect found here.
This is a different (and correct) mechanism from `loadGenerationRef`, but achieves the same
protection for this specific effect.

**Delegated task load race** — `load(status, off)` (lines 174–187) has **no** cancellation flag,
generation counter, or abort logic at all. A `load("A", 0)` (filter A) followed quickly by
`load("B", 0)` (filter B) whose first response resolves *after* the second's would overwrite the
correctly-displayed filter-B results with stale filter-A data — **CODE-PROVEN possible**, since both
requests are ordinary unguarded `fetch` calls inside a `useCallback` with no de-duplication. This is
a genuine race, though of a different flavor than the "business switch" races audited elsewhere
(this page's delegated-task list has no business dimension to switch at all — Section J) — it can
only be triggered by rapid filter/pagination changes, not by switching business.

**Pagination/filter consistency** — `handleStatusChange` (lines 193–196) resets `offset` to `0`
before setting the new filter — VERIFIED correct. `Next` is shown only when a full page was
returned (`tasks.length === LIMIT`), and `Previous` only when `offset > 0` — both are simple,
correct guards against an impossible offset, though neither reads a server-provided "hasMore"/total
count (the route returns `{ tasks, count: tasks.length }` — `count` is just the current page's
length, not a total, so "Next" existing is inferred from a full page, which is correct but not
provably exhaustive if `tasks.length` could equal `LIMIT` by coincidence on the very last page with
exactly 25 remaining items — a benign, cosmetic edge case, not a data-safety issue). Loading state
(`{loading && <TableListSkeleton .../>}`) replaces the list entirely rather than overlaying stale
data, so no misleading old data is shown during a reload. Empty-state text (`No tasks match this
filter` vs. `No tasks delegated yet`) correctly corresponds to whether a filter is active.

**OwnerWork errors vs. DelegatedTask errors — represented independently, correctly.** The two
sections have entirely separate error states (`ownerWorkError` vs. `error`), rendered independently
(lines 209, 263) — a failure in one does not hide or falsely imply failure in the other. This is a
genuine point of correctness: the page truthfully communicates partial availability rather than an
all-or-nothing failure, unlike the error-vs-empty confusion found on `/owner/execution` (Section O.F).

**Raw status fallback** — checked for both systems: `STATUS_LABELS[s] ?? s` (DelegatedTask, complete
15/15 map, Section K) and `OWNER_WORK_STATUS_LABELS[item.status] ?? item.status`
(ProcessExecutionTask-derived "My work," 12 entries: PROPOSED, ACKNOWLEDGED, IN_PROGRESS, BLOCKED,
NEEDS_DATA, APPROVED, DELEGATED, COMPLETED, REJECTED, OUTCOME_RECORDED, OUTCOME_DISPUTED,
OUTCOME_VERIFIED). Against Section H's confirmed status set (`PROPOSED, ACKNOWLEDGED, IN_PROGRESS,
APPROVED, REJECTED, BLOCKED, NEEDS_DATA, COMPLETED, OUTCOME_RECORDED, OUTCOME_DISPUTED,
OUTCOME_VERIFIED, CANCELLED`), the page's map is missing **`CANCELLED`** — a raw uppercase
`"CANCELLED"` badge would render verbatim if a `ProcessExecutionTask` ever reached that status (no
code path was found that sets it — Section H — so this is a latent gap, not an observed failure).
The map also contains **`DELEGATED`**, a status the backend never actually produces (Section H) —
a harmless dead entry, not a leak.

**Unsafe date rendering** — every date field (`item.workStartedAt`, `task.dueAt`) is guarded with a
truthiness check before `new Date(...).toLocaleDateString()` (e.g. line 228, 299) — no unguarded
`new Date(null)` call was found; a missing date renders as literal absence ("No due date set"), not
an invented date or "Invalid Date" string.

**Broken navigation** — "What happens next →" (delegated tasks) correctly routes to the specific
task's own detail page (`/owner/tasks/{task.id}`) — genuinely continues that item. "Continue on Home
→" (My work) does **not** — it routes to the general `/owner/cockpit` with no item-specific
parameter (Section H) — this is the one confirmed broken/weak navigation link on this page.

## Q. Tasks vs Execution vs Home overlap matrix

`YES` / `NO` / `PARTIAL` / `BACKEND_ONLY` / `UNKNOWN`, each cell VERIFIED against Sections F–P and
the Home/cockpit grep described in Section H.

| Capability | /owner/tasks | /owner/execution | /owner/cockpit (Home) |
|---|---|---|---|
| Shows work to do | YES (both lists) | PARTIAL (shows actions only after a diagnosis exists) | YES (Top Priority) |
| Starts work | NO (My work is read-only; task creation ≠ starting existing work) | PARTIAL (Assign/Start buttons on SOP actions) | YES (`onStartWork`, the only writer of ProcessExecutionTask START) |
| Assigns work | YES (DelegatedTask, role or — BACKEND_ONLY — named user) | NO (no assignment control found on the page) | NO |
| Delegates work | YES (DelegatedTask, to role/BACKEND_ONLY named user) | NO | PARTIAL (`DELEGATE` action, role-only, no named user) |
| Tracks status | YES (both models, full history for DelegatedTask) | YES (action status + cycle history) | YES (ProcessExecutionTask status via now-view) |
| Records progress | PARTIAL (proof submission only) | NO (no progress-log concept on SOP actions) | YES (`RECORD_PROGRESS`, append-only log) |
| Blocks work | YES (DelegatedTask BLOCKED, with escalation) | YES (SOP action "Block" button, no reason captured) | YES (`MARK_BLOCKED`, reason required) |
| Requests data | PARTIAL (`NEEDS_OWNER_CLARIFICATION` state exists, no explicit UI trigger found) | NO | YES (`REQUEST_MISSING_DATA`) |
| Captures evidence | YES (Proof model, rich taxonomy) | YES (`window.prompt()`-collected notes/evidence array, no taxonomy) | YES (`evidenceRefs`, `SUBMIT_EVIDENCE`) |
| Requires proof | YES (first-class, AI-prechecked) | NO (no proof-requirement concept on SOP actions) | NO (evidence-count threshold, not a "proof" object) |
| Marks completion | YES (proof-gated, owner-reviewed) | YES (`window.prompt()` notes/evidence, no review step) | YES (evidence-count + fake-completion gate) |
| Records outcome | NO | NO (verification records before/after directly, no separate "outcome" step) | YES (`RECORD_OUTCOME`, distinct from completion) |
| Verifies outcome | NO | YES (`OwnerSopVerification`, before/after/target-direction) | YES (`VERIFY_OUTCOME`, with `selfVerified` distinction) |
| Requests reassessment | NO | PARTIAL (inline `runSopDiagnosis` re-trigger on completion/verification-success, no `OwnerReassessmentEvent`) | YES (`REQUEST_REASSESSMENT`, `OwnerReassessmentEvent`) |
| Shows diagnosis | NO | YES (the page's entire purpose) | PARTIAL (now-view surfaces a computed top route, not a full diagnosis view) |
| Shows findings | NO | YES | NO |
| Shows SOP/process metrics | NO | YES (the 11 snapshot fields + derived scores) | NO |
| Creates business | NO | YES (shared `/api/owner/recovery/businesses`, same as Money/Sales/Ops) | UNKNOWN (not read in this audit's scope) |
| Switches business | NO (DelegatedTask has none; ProcessExecutionTask filter is read-only, driven by the shared context) | YES (`BusinessContextSelector`, shared context) | YES (drives the shared context every other page reads) |
| Contains domain scores | NO | YES (health/risk/opportunity/confidence) | PARTIAL (now-view aggregates across domains, not this domain's own score triad) |
| Contains action recommendations | NO | YES (ranked, deterministic) | YES (Top Priority is itself a ranked recommendation) |

**What is uniquely owned by each page**: `/owner/tasks` uniquely owns named-person/role delegation
with a first-class, AI-prechecked, disputable proof system. `/owner/execution` uniquely owns the
SOP/process-diagnosis engine (snapshots, findings, health/risk/opportunity scoring, before/after
verification). `/owner/cockpit` uniquely owns *starting* a `ProcessExecutionTask` and its full
progress/outcome/reassessment lifecycle — `/owner/tasks` only ever displays what Home already
started.

**What is intentional overlap**: "tracks status," "blocks work," and "captures evidence" are
legitimately present in more than one system because each governs genuinely different work
(delegated-to-a-person vs. owner-started-governed-action vs. SOP-diagnosis-action) — this is not
duplication, per the model distinctions proven in Sections G/H/I.

**What is accidental duplication**: none was found that rises to true duplication — no two systems
were found doing the *same* thing to the *same* data.

**What is merely the same word used for different models**: "status," "proof"/"evidence" (rich
taxonomy on DelegatedTask vs. a bare string array on ProcessExecutionTask and SOP actions),
"completion" (proof+review vs. evidence-count+heuristic vs. evidence+no-review), "verification"
(exists richly on ProcessExecutionTask and SOP actions, does not exist at all on DelegatedTask), and
— most significantly — **"SOP"** itself, which names three entirely separate product concepts in
this codebase (Section N): the execution-diagnosis snapshot fields this page reads, the fully-built
document-lifecycle service (`sop-document.service.ts`), and the training/compliance-intelligence
service (`sop-process-intelligence.service.ts`) — confirmed disconnected from each other and from
this page by direct grep.

**No merge of Tasks and Execution is recommended or implied by any finding above** — the two pages
govern three structurally distinct systems (DelegatedTask, ProcessExecutionTask, OwnerSopAction),
not one system rendered twice.

## R. Owner-language leak register

| Surface | Current text/token | Source | Owner-visible? | Risk | Safe label exists? | Future fix type |
|---|---|---|---|---|---|---|
| `/owner/execution` action badge | literal `"cancelled"` (lowercase) if ever reached | page.tsx:470, `ACTION_STATUS_LABEL` gap | YES (latent — not reachable via this page's own UI today) | Low today, real once reachable | Yes — `"Cancelled"` used identically on Money/Sales/Operations post-UX-04B | CORRECTNESS |
| `/owner/tasks` "My work" badge | literal `"CANCELLED"`/`"DELEGATED"` if ever reached | page.tsx:46-59, `OWNER_WORK_STATUS_LABELS` gap/dead-entry | YES (latent for CANCELLED; DELEGATED is a harmless dead entry, never produced) | Low (no code path sets CANCELLED today — Section H) | Not yet defined for this map | CORRECTNESS |
| `/owner/tasks/[taskId]` source recommendation | raw UUID, monospace, unlabeled beyond "Source recommendation:" | page.tsx:304-309 | YES | Low — clearly framed as a reference id, not presented as meaningful text | N/A — a raw id, not an enum | PRESENTATION |
| `/owner/execution` error banner | raw `Error.message` (whatever the server/fetch layer produced) | page.tsx lines 115/153/184/201/223/249 | YES | Medium — could surface a technical/internal string on any failure | Yes — `classifyOperatorError`, used by Money/Sales/Operations | OWNER-SAFETY |
| `/owner/execution` finding/action panels | already humanized via `humanizeMetricKey`/`humanizeEvidenceLine` | page.tsx:9, 413/443/446/449/474 | YES | None found | Already applied | NO CHANGE |
| `/owner/execution` verification prompts | `window.prompt()` native browser dialogs for notes/evidence/before/after/direction | page.tsx 213-214, 233-244 | YES | Presentation, not a language leak per se — bypasses the design system entirely | N/A | PRESENTATION (explicitly out of this audit's fix authority — Section 4/32) |
| `/owner/tasks` assignee fallback | already safe: role, or "Assigned", or "Not yet assigned" — never a raw UUID (explicit in-source fix comment, line 285-288) | page.tsx:288 | YES | None found | Already applied | NO CHANGE |

No `BusinessConditionProfile`/`InterventionMode`/`InterventionPhase`/raw-capability-id/UUID-as-primary-
text leaks were found on either page beyond the one recommendation-id reference above, which is
explicitly labeled and monospaced, not presented as prose.

## S. Loading/empty/error/partial-state matrix

Each independent data source is a separate row, per the mission's explicit instruction not to
collapse `/owner/tasks`'s two models into one.

| Data source | Initial loading | Success+data | Success+empty | Partial | Error | Retry | Business switch | Filter/pagination change | Mutation in-flight | Mutation success | Mutation failure |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/owner/tasks` DelegatedTask list | `TableListSkeleton` | list rendered | `EmptyState` (filtered vs. unfiltered copy differs) | N/A (single source) | inline error text, governed via `classifyOperatorError` | no explicit retry button; changing filter/offset re-triggers `load` | N/A (model has no business dimension) | **RACE** — no generation guard (Section P) | N/A (no page-level mutation here; task actions live on the detail page) | N/A | N/A |
| `/owner/tasks` "My work" (ProcessExecutionTask) | no dedicated skeleton — section simply doesn't render until the effect resolves | list rendered | section omitted entirely (`ownerWork.length > 0 &&`) — no explicit "nothing here" copy for this list | independent of the DelegatedTask list's own state (Section P, correctly) | separate inline error (`ownerWorkError`), governed via `classifyOperatorError` | none (re-fires only on `activeBusinessId` change) | **correctly cancelled** via effect cleanup (Section P) | N/A (no filter/pagination on this list) | N/A (read-only display) | N/A | N/A |
| `/owner/tasks/[taskId]` detail | `DetailPageSkeleton` | full detail rendered | N/A (a task either exists or 404s) | N/A | `"Task not found."` (task null) vs. governed error text (fetch failure) — two distinct paths | none explicit | N/A | N/A | `actionLoading` disables buttons, shows "…" verb suffixes | `actionSuccess` green text + re-`load()` | `actionError` red text, governed via `classifyOperatorError` |
| `/owner/execution` dashboard | `CardDashboardSkeleton` | `SopCycleView` rendered | "No businesses yet..." / "No execution snapshot yet..." (two distinct copy variants, correctly differentiated by whether a snapshot exists) | **not represented — see Section O.F, error and empty can render simultaneously** | raw `e.message` (Section O.D) | none explicit; only re-triggered by another action | **RACE** — no generation guard, no intent guard (Section O.A/B/C) | N/A (this page has no filter/pagination) | `busy` disables the relevant button, shows "Saving…"/etc. | implicit — a full `load()` re-render, no distinct success toast | same `error` banner as load failure — a failed mutation and a failed load are visually identical to the owner |

## T. Proof/evidence/outcome glossary

Source-backed, per model, no term normalized unless its underlying semantics are actually the same.

| Term | DelegatedTask | ProcessExecutionTask | SOP/Execution action (OwnerSopAction) | Home (cockpit) |
|---|---|---|---|---|
| evidence | `Proof.fileHash` + typed `ProofType` payload | `evidenceRefs: string[]` (opaque refs, no type taxonomy) | `completionEvidence: Json?` (free-form, page collects via `window.prompt`) | reads/writes the same `evidenceRefs` as ProcessExecutionTask (same model) |
| proof | first-class `Proof`/`ProofRequirement` model, AI-prechecked, disputable, risk-adjudicated | does not exist as a distinct concept — evidence-count threshold substitutes for it | does not exist — no `ProofRequirement`-equivalent on `OwnerSopAction` | N/A (same model as ProcessExecutionTask) |
| proof requirement | `ProofRequirement` (proofType, riskLevel, reviewerRole, ownerOverrideAllowed) | N/A | N/A | N/A |
| completion evidence | the accepted `Proof` itself | `evidenceRefs` array meeting `requiredEvidence.length` (or 1) | `completionEvidence: Json?`, free text/refs, no minimum enforced in the read code | same as ProcessExecutionTask |
| outcome | does not exist as a distinct step — the lifecycle ends at `APPROVED_COMPLETE` | `OwnerActionOutcome` row, `RECORD_OUTCOME`/`recordOwnerActionOutcome`, with classification (PARTIAL_SUCCESS/FAILURE/NEGATIVE_IMPACT/INCONCLUSIVE/NO_MEASURABLE_IMPACT — Section AA) | does not exist as a separate step — `OwnerSopVerification` records before/after directly, no intermediate "outcome" object | same model as ProcessExecutionTask |
| verification | does not exist | `verifyOwnerActionOutcome` + `triggerPostVerificationSideEffects`, with an explicit `selfVerified` flag | `OwnerSopVerification` (beforeValue/afterValue/targetDirection/status), classified via the shared `verifyOutcome` logic — the same underlying classifier Money/Sales/Operations use for their own recovery actions | same as ProcessExecutionTask |
| approval | `COMPLETED_PENDING_REVIEW → APPROVED_COMPLETE`, owner/manager only, SoD-enforced | `APPROVE` action, requires `OWNER_APPROVAL_REQUIRED` + owner actor | does not exist as a distinct step | `APPROVE` action (same model) |
| review | `reviewProof`/`reviewProofForTask`, SoD-enforced (reviewer ≠ submitter) | does not exist as a distinct concept | does not exist | does not exist |
| reassessment | does not exist | `OwnerReassessmentEvent`, two triggers (`execution_invalidation`, `owner_dispute`) | inline `runSopDiagnosis` re-run on completion/verification-success, its own audit events (`OWNER_SOP_REASSESSMENT_TRIGGERED`/`...VERIFICATION_REASSESSMENT_TRIGGERED`) — **does not use `OwnerReassessmentEvent` at all** | same as ProcessExecutionTask |
| status history | `TaskStatusHistory` (from/to/actor/role/timestamp), rendered on the detail page | `ProcessExecutionTaskProgress` (append-only, richer: progress%, stage, blocker, next step, revised due date) — a genuinely different, more structured concept than a status log | does not exist as a stored/rendered history — only the current `status` and `cycleHistory` (cycle-level, not action-level) | reads ProcessExecutionTaskProgress |
| audit event | `TASK_ASSIGNED`, `TASK_STATUS_CHANGED`, `PROOF_*`, `OWNER_TASK_*`, `ESCALATION_*` | `OWNER_PROCESS_EXECUTION_TASK_*`, `OWNER_PROCESS_EXECUTION_OUTCOME_*` | `OWNER_SOP_REASSESSMENT_TRIGGERED` and its verification-triggered sibling (only ones confirmed by name; general action-update audit events were not independently enumerated in this pass) | shares ProcessExecutionTask's events |

**"reassessment" is confirmed NOT a normalized term** — ProcessExecutionTask's reassessment is a
first-class, queryable `OwnerReassessmentEvent` row with two named triggers; the SOP action's
"reassessment" is just calling the diagnosis function again inline, with no persisted event record
of its own. Treating these as the same concept in any future copy or code would be a false
equivalence (Section AE).

## U. Business/workspace attribution matrix

| Model | workspaceId? | businessId? | assignee? | source record? | owner-visible attribution? | Multi-business safety |
|---|---|---|---|---|---|---|
| DelegatedTask | required | **none** | `assignedUserId`/`assignedRole` | `sourceOperatorItemId` (opaque, never actually set today) | none shown | UNATTRIBUTED (Section J) |
| WorkOrder | required | **none** | N/A | N/A | N/A | UNATTRIBUTED |
| Proof (task-originated) | required | nullable, **never set by the owner/tasks creation flow** | `submittedByUserId` | `taskId` | none shown | UNATTRIBUTED in practice, though the column exists |
| ProofRequirement | required | **none** | N/A | `taskId` | N/A | WORKSPACE_SCOPED |
| TaskStatusHistory | required | **none** | `actorId`/`actorRole` | `taskId` | rendered on detail page (no business dimension to show) | WORKSPACE_SCOPED |
| ProcessExecutionTask | required | nullable soft-FK, real relation to OwnerBusiness (no formal Prisma `@relation`, defense-in-depth) | none (role-class `actionOwner` only) | `sourceFindingKey`, `taskKey` (embeds businessId for two families) | client-filtered on `/owner/tasks`, not server-labeled per row | BUSINESS_SCOPED for PROCESS_CORRECTION/CASH_PROFIT families; WORKSPACE_SCOPED (deliberately, by design) for the PASS 23 expansion families |
| ProcessExecutionTaskProgress | required | **none** (inherits via `taskId`) | `actorId` | `taskId` | not rendered on any in-scope page | inherits parent's scoping |
| OwnerSopSnapshot | required | **required**, real `@relation` to OwnerBusiness, cascade delete | N/A | N/A | via the page's business selector | BUSINESS_SCOPED (hard FK) |
| OwnerSopCycle | required | **required**, real `@relation` | N/A | `snapshotId` | via the page's business selector | BUSINESS_SCOPED (hard FK) |
| OwnerSopAction | required | **required**, real `@relation` | `assignedTo` (bare uuid column, no UI control found) | `cycleId`, `findingId` | via the page's business selector | BUSINESS_SCOPED (hard FK) |
| OwnerSopVerification | required | **required**, real `@relation` | N/A | `actionId` | via the page's business selector | BUSINESS_SCOPED (hard FK) |

`OpportunityExecutionTask` (a sibling model, not used by either in-scope page — mentioned for
completeness since it shares the "execution task" naming) is workspace-scoped only, no businessId,
per direct schema read.

## V. Existing-feature preservation inventory

`MUST_PRESERVE` unless noted otherwise. This inventory covers every UI-exposed and API-present
capability established in Sections F–T; it is not a re-derivation of the mechanical
`verify-owner-feature-preservation.mjs` baseline (Section W), which remains the authoritative
automated regression gate.

**MUST_PRESERVE**: the full 15-state DelegatedTask FSM and its role-based authorization; the
proof lifecycle (submit/AI-precheck/review/accept/reject/resubmit/dispute) and its SoD
enforcement; task creation (title/description/role/due-date/proof-requirement); the task detail
page's full metadata, proof panel, and status-history rendering; the "My work" vs. "Delegated work"
split and its underlying two-model independence; the full ProcessExecutionTask FSM and its 13
actions, including the owner-approval gate and the STARTUP_MODE-specific authorization layer; the
outcome-recording/verification/`selfVerified` distinction; the reassessment-event mechanism and its
two triggers; the full SOP diagnosis engine (11 snapshot fields, 5-state `ExecutionState`, the
health/risk/opportunity/confidence scoring formulas, the 10 risk-finding codes and 5 opportunity
templates, the deterministic action-ranking tie-break chain); the 6-state shared
`RECOVERY_ACTION_STATUSES` machine as applied to SOP actions; the `OwnerSopVerification`
before/after/target-direction model and its shared `verifyOutcome` classifier; every audit event
named in Sections G/H/N; every business/workspace-scoping guard named in Section U, especially the
five independent ProcessExecutionTask business-isolation mechanisms (Section H) and the SOP models'
hard-FK scoping.

**CAN_REPRESENT_DIFFERENTLY**: the `/owner/tasks` list page's group-badge presentation (Section K —
the underlying data/labels must survive, the *color* of the "Done" bucket for non-approved terminal
states does not need to stay as-is); the execution page's `window.prompt()`-based data collection for
completion notes/evidence and verification before/after/direction (the underlying fields and their
requiredness must survive; the *mechanism* of collecting them does not); the "Continue on Home"
link's lack of a deep-link parameter (the destination page and its content must survive; a future
deep-link parameter would be additive, not a removal).

**BACKEND_ONLY_MUST_PRESERVE**: named-user assignment on `DelegatedTask` creation
(`assignedUserId`, accepted by the schema/route today, exposed nowhere in the owner UI); the
escalation service (`raiseBlocker`/`acknowledgeEscalation`/`resolveEscalation`) and its `Escalation`
table, entirely unreferenced by any of the six `/owner/tasks` routes today; the proof-dispute
service's category taxonomy and high-impact flagging, unreferenced by the proof-review route's
simpler DISPUTED path; `sop-document.service.ts` and `sop-process-intelligence.service.ts`, both
fully built and unconnected to `/owner/execution`; automated task expiry's FSM definition, with no
confirmed runtime trigger (Section G).

**UNKNOWN**: whether `OperatorItem` (the model `DelegatedTask.sourceOperatorItemId` optionally
references) itself carries a businessId — not conclusively verified by this audit's research pass
(flagged explicitly by that pass); whether any `proof.update`/`updateMany` call elsewhere in the
repo backfills a `businessId` onto a task-originated `Proof` row after creation — not exhaustively
checked.

## W. Current render order

**`/owner/tasks`** (as coded, page.tsx lines 198–337): page header ("Actions" + "+ New Task") → "My
work" section (only if non-empty) → "Delegated work" heading → status filter → loading/error/empty
states → the delegated-task list → a closing "that's every task" line (only when unfiltered,
unpaginated, and short) → pagination controls.

**`/owner/execution`** (page.tsx lines 263–371, mirroring the exact Money/Sales/Operations order
established in UX-04A): page header ("Owner Execution & SOP" + "+ New business") → error banner (if
any) → business-creation form (if toggled) → business selector + snapshot/diagnosis action buttons
→ snapshot form (if toggled) → empty-diagnosis state, OR: score/state row → missing-data banner (if
any) → recommended-next-action card → findings section → actions section → diagnosis-history
section.

This is a factual description of what each page shows first **today**. It is not a recommendation,
and — per Section X — it is explicitly not treated as evidence of the correct order.

## X. Future first-read hierarchy — USER-EVIDENCE boundary

Default classification for every hierarchy/IA/presentation question in this document:
**`USER-EVIDENCE NEEDED`**. This section does not decide, and does not pre-authorize, any change to
render order, section prominence, the "My work" vs. "Delegated work" split's visual weight, the
Tasks/Execution page split itself, or any layout/density/table-vs-list decision.

Per the governing precedent established in UX-04A (Section O of that document, carried forward
unchanged): `MUST_PRESERVE` (Section V above) is not the same claim as `MUST_SHOW_FIRST` —
preserving a capability says nothing about where in a render order it belongs. The fact that
`/owner/execution` currently shows a score triad before findings, or that `/owner/tasks` currently
shows "My work" above "Delegated work," is not by itself evidence that either order is the *right*
one for a non-technical owner — it may equally be an un-examined default. Whether the current order
is correct is real-user-evidence territory and is explicitly left undecided here, exactly as UX-04A
left it undecided for Money/Sales/Operations.

## Y. Responsive/mobile evidence

No rendered/browser evidence exists for either page at 390px or 768px — the browser journey spec
that visits `/owner/tasks` (Section AA) checks only for raw-token leakage and non-dead links, not
layout/overflow, and no browser spec visits `/owner/execution` at all. All classifications below are
therefore `SOURCE SIGNAL ONLY` or `SOURCE RISK`, never `PROVEN`.

| Pattern | Location | Classification |
|---|---|---|
| `flex flex-wrap` on task-list rows | `/owner/tasks` page.tsx:218, 226 | SOURCE-SAFE-SIGNAL (explicit wrap behavior coded) |
| `flex gap-2` **without** `flex-wrap` on status-history rows | `/owner/tasks/[taskId]` page.tsx:446 | SOURCE RISK (long labels/timestamps could overflow rather than wrap, unlike the list page's own rows) |
| fixed `grid grid-cols-2` on task metadata | `/owner/tasks/[taskId]` page.tsx:299 | SOURCE RISK (no responsive breakpoint) |
| fixed `grid grid-cols-2` (business form) / `grid grid-cols-4` (11 snapshot fields) | `/owner/execution` page.tsx:282, 338 | SOURCE RISK (no responsive breakpoint; the 4-column snapshot grid is the more severe of the two) |
| placeholder-only text inputs (no visible `<label>`) | `/owner/tasks/[taskId]` proof-note and rejection-reason inputs, page.tsx:356, 388 | SOURCE RISK (a11y/mobile-usability pattern, see Section Z) |

No claim of "mobile-safe," "works at 390px," or "fully responsive" is made anywhere in this
document for either page.

## Z. Accessibility evidence

Source-audit only; no WCAG-conformance claim is made.

- `/owner/tasks`'s status filter has `aria-label="Filter tasks by status"` (page.tsx:245) but no
  visible `<label>` element — screen-reader-accessible, but a sighted user has no visible label text
  next to the control. SOURCE RISK (partial).
- Status is communicated via badge **text**, not color alone, on every surface read
  (`{group}`/`{STATUS_LABELS[...]}`/`{ACTION_STATUS_LABEL[...]}` all render inside the `<Badge>`,
  never a bare color swatch) — PROVEN by direct inspection, no color-only-status violation found on
  either page.
- `/owner/tasks/[taskId]`'s proof-submission note (`page.tsx:354-361`) and rejection-reason
  (`page.tsx:386-393`) inputs, and the proof-type/review-outcome `<select>` elements, rely on
  placeholder text and adjacent `<h3>` headings rather than a programmatic `<label for=...>`
  association — a known accessibility anti-pattern (placeholder text disappears on input and is not
  reliably announced as a label by all screen readers). SOURCE RISK.
- `/owner/execution`'s data-collection via `window.prompt()` uses the browser's own native dialog,
  which has its own OS-level accessibility semantics independent of this app's design system —
  SOURCE SIGNAL ONLY (native dialogs are generally screen-reader-accessible, but this bypasses the
  app's own accessible-component library entirely, which is a presentation/consistency concern
  addressed in Section R, not strictly an accessibility defect).
- No heading-level (`h1`/`h2`) structural audit was completed beyond what's visible in the two page
  files themselves (`PageHeader` component internals were not read) — UNKNOWN for overall heading
  hierarchy.
- Touch-target sizing was not verified — the shared `Button`/`Badge`/`Select` primitive
  implementations were not read in this audit's scope — UNKNOWN.

## AA. Existing test/browser evidence

Full survey conducted by a delegated research pass; summarized and cross-checked here.

**TEST-PROVEN, well covered**: the DelegatedTask FSM and service-layer transitions
(`src/__tests__/domain/execution/delegated-task.test.ts`,
`src/__tests__/services/execution/delegated-task.service.test.ts`), workspace isolation and
concurrency guards, audit-write rollback; the full proof lifecycle including AI-precheck/tamper/
duplicate detection and dispute (`src/__tests__/execution/proof-dispute*.test.ts`,
`src/__tests__/services/execution/proof-intake.service.db.test.ts`,
`src/__tests__/api/owner/tasks/task-workflow.db.test.ts`); the full ProcessExecutionTask lifecycle
PROPOSED→...→OUTCOME_VERIFIED including outcome-classification variants, idempotency, and
business-identity guardrails (`src/__tests__/owner-mode/phase3-execution-lifecycle.db.test.ts`,
`process-execution-affordances.db.test.ts`); the Start-Work/Home/Priorities/Actions unification and
its businessId-embedded-taskKey collision fix
(`src/__tests__/owner-mode/start-work-priorities-actions-unification.db.test.ts`, read in full — its
11 lettered assertions (A–K) are the strongest single piece of TEST-PROVEN evidence in this whole
audit for the businessId-in-taskKey mechanism); the task-creation form component
(`src/__tests__/components/owner-new-task-page.test.tsx`); SOP dashboard/diagnosis persistence and
route-capability wiring at the API/service layer (`src/__tests__/owner-sop/{routes,services.db,
validation}.test.ts`); business-scoping for ProcessExecutionTask reads across businesses within one
workspace (`src/__tests__/execution/process-execution-business-isolation.db.test.ts`,
`cockpit-business-scoping.db.test.ts`).

**BROWSER-PROVEN**: `tests/browser/populated-domain-journey.spec.ts` (read in full) visits
`/owner/tasks` once (its step 7 of 7) and asserts no raw tokens/fixture-business names leak into the
rendered body, and every visible "What happens next" link has a real `href`. It does **not** click
any action, does not submit or review proof, does not visit `/owner/execution` at all, and does not
check the active-business indicator on either page — confirmed the thinnest of the seven page visits
in that journey.

**Genuine gaps, confirmed absent after real search, not silently omitted**:
1. No component/page-level test renders `/owner/tasks/[taskId]` — only API-route-level coverage.
2. No component/page-level test renders `/owner/execution` at all — only its underlying
   `/api/owner/sop/**` routes/services are tested.
3. **No business-switch-race test exists for `/owner/tasks` or `/owner/execution`**, despite the
   established precedent (`owner-{cockpit,finance,sales,operations}-business-switch-race.test.tsx`)
   — directly relevant to the races proven in Section O.
4. **No owner-safe-errors (raw-enum/raw-error-fallback) test exists for `/owner/tasks` or
   `/owner/execution`**, despite the established precedent
   (`{finance,sales,operations}-page-owner-safe-errors.test.tsx`) — directly relevant to Section
   O.D and Section R.
5. No browser/e2e spec visits `/owner/execution` under any filename.
6. No dedicated status-history **read/render** test for DelegatedTask — only "exactly one audit
   event is emitted" (write-side) is proven.
7. No dedicated escalation-flow test for DelegatedTask/ProcessExecutionTask under that name.
8. No multi-business-within-one-workspace scoping test for `/owner/sop/**` beyond plain
   workspace-level isolation — unlike the explicit multi-business tests that exist for
   ProcessExecutionTask.
9. No concurrent/simultaneous-update (race-condition) test exists for `OwnerSopAction.status`
   transitions — and, consistent with that gap, `updateSopAction`'s own DB write uses a plain
   `.update()`, not the `updateMany`-with-expected-status guard pattern used by both
   `applyTaskTransition` (DelegatedTask) and the ProcessExecutionTask outcome-verification path —
   a genuine, source-proven asymmetry in concurrency protection across the three models.
10. No test asserts business-scoping (as opposed to workspace-scoping) for `DelegatedTask`/`Proof`
    — consistent with Section J's finding that no such scoping exists to test.

## AB. Open-PR collision report

Checked directly against GitHub (`arnab-netizen/OPsIq`) at mission time, 30 open PRs total.

| PR | Title | Files | Semantic overlap | Collision? | Action taken |
|---|---|---|---|---|---|
| #496 | PR E — Re-verify recommendation-safety gate scoping (cash/margin/capacity) is not cross-business | `src/services/owner-finance/recommendation-{cash,margin}-safety.service.ts`, `src/services/owner-mode/recommendation-capacity-safety.service.ts`, 2 new `.db.test.ts` files | None — unrelated `owner-finance`/legacy-recommendation-gate scoping, doc-comment-only changes to the third file | NO | NONE |
| #452–479 (24 Dependabot PRs) | dependency version bumps (npm/yarn packages, GitHub Actions) | `package.json`/`package-lock.json`/workflow YAML only | None | NO | NONE |
| #412–428 (7 `stage7-evidence` PRs) | auto-generated evidence artifacts | evidence JSON only | None | NO | NONE |

No open PR touches any file under `src/app/(authenticated)/owner/{tasks,execution}/**`,
`src/domain/execution/**`, `src/services/execution/**`, `src/services/owner-sop/**`,
`src/domain/owner-sop/**`, `src/services/owner-mode/process-execution-bridge.service.ts`, or
`src/app/api/owner/{tasks,process-execution,sop}/**`. **No collision found.**

## AC. Evidence-backed UX-05B candidates

Per Section 32's rule, only candidates with `USER-EVIDENCE NEEDED: NO` may enter the concrete future
manifest (Section AD). Each candidate below follows the required template.

**Candidate 1 — stale-response and stale-mutation-intent race guards on `/owner/execution`**
- CURRENT: no `loadGenerationRef`, no `activeBusinessIdRef`, no create-business intent re-check (Section O.A/B/C).
- PROBLEM: a business switch mid-flight can silently overwrite the correctly-displayed business's diagnosis with a stale one and re-anchor the shared `activeBusinessId` — the identical defect class UX-03/UX-04B already fixed on Home/Finance/Sales/Operations.
- PROPOSED CHANGE: apply the exact same `loadGenerationRef` + `activeBusinessIdRef` + `handleBusinessSelect` pattern used by UX-04B, mechanically, to this page's `load`/`createBusiness`/`addSnapshot`/`runDiagnosis`/`updateAction`/`verifyAction`.
- SOURCE OF TRUTH: `src/app/(authenticated)/owner/finance/page.tsx` (post-UX-04B) as the proven template; this contract's Section O as the defect proof.
- FILES LIKELY TO CHANGE: `src/app/(authenticated)/owner/execution/page.tsx`.
- FEATURES PRESERVED: all — the fix is additive guard logic only, no field/label/order change.
- DOMAIN SEMANTICS CHANGE: NO. OWNER-VISIBLE CHANGE: NO (except that a stale race no longer visibly corrupts state — a correctness improvement, not a new behavior). USER-EVIDENCE NEEDED: NO.
- TESTS REQUIRED: a new `owner-execution-business-switch-race.test.tsx`, mirroring the 5 existing scenarios plus the 2 stale-mutation-intent scenarios UX-04B's amendment added, per the established template.

**Candidate 2 — operator-safe error governance on `/owner/execution`**
- CURRENT: all six catch paths render raw `Error.message` (Section O.D).
- PROBLEM: a technical/internal error string can reach the owner verbatim.
- PROPOSED CHANGE: route every catch through `classifyOperatorError`, exactly as Money/Sales/Operations already do.
- SOURCE OF TRUTH: `src/lib/operator-error-governance.ts` (already exists, already imported by the other three pages).
- FILES LIKELY TO CHANGE: `src/app/(authenticated)/owner/execution/page.tsx`.
- FEATURES PRESERVED: all. DOMAIN SEMANTICS CHANGE: NO. OWNER-VISIBLE CHANGE: YES (error text becomes governed/calmer, not raw) but this is the exact established precedent, not a new design decision. USER-EVIDENCE NEEDED: NO.
- TESTS REQUIRED: a new `execution-page-owner-safe-errors.test.tsx`, mirroring the three existing `{finance,sales,operations}-page-owner-safe-errors.test.tsx` files.

**Candidate 3 — `cancelled` label gap on `/owner/execution`'s `ACTION_STATUS_LABEL`**
- CURRENT: 5 of 6 `RECOVERY_ACTION_STATUSES` values are labeled; `cancelled` is missing (Section N/E).
- PROBLEM: a literal lowercase `"cancelled"` would render verbatim if ever reached — the exact defect UX-04B fixed on Money/Sales/Operations' own recovery-action label maps, same shared source of truth.
- PROPOSED CHANGE: add `cancelled: "Cancelled"` to the map. No lifecycle/transition/button/API change (no cancel button is being added — only the label for a value the backend can already produce).
- SOURCE OF TRUTH: `src/domain/founder-recovery/action-status.ts`'s `RECOVERY_ACTION_STATUSES`.
- FILES LIKELY TO CHANGE: `src/app/(authenticated)/owner/execution/page.tsx`.
- FEATURES PRESERVED: all. DOMAIN SEMANTICS CHANGE: NO. OWNER-VISIBLE CHANGE: NO (until/unless a cancelled action ever reaches this page — currently unreachable via this page's own UI). USER-EVIDENCE NEEDED: NO.
- TESTS REQUIRED: a real-component regression test asserting the label, added to the same new race-test file as Candidate 1 (mirroring UX-04B's own pattern of bundling the label-parity test into the race-test file).

**Candidate 4 — `/owner/tasks` list-page "Done" badge color falsely implies success for non-approved terminal states**
- CURRENT: `REJECTED_INCOMPLETE`, `CANCELLED`, and `EXPIRED` all render the identical green
  `success-accessible` "Done" badge as `APPROVED_COMPLETE` on the list page (Section K); the detail
  page already renders each correctly.
- PROBLEM: a lay owner scanning the list cannot distinguish a genuinely successful task from a
  rejected/cancelled/expired one by color, violating the design direction's "calm urgency"/
  "nothing invented" color-semantics rule (no severity/success color should render without real
  supporting evidence that the outcome was actually positive).
- PROPOSED CHANGE: make the badge's **color** (not its label text, not the bucket grouping, not the
  bucket's name "Done") depend on which underlying status produced it — e.g. keep rendering the text
  "Done" but use the destructive/warning variant for `REJECTED_INCOMPLETE`/`CANCELLED`/`EXPIRED` and
  reserve the success variant for `APPROVED_COMPLETE` alone. No renaming of the bucket, no
  restructuring of `STATUS_GROUPS`, no change to which raw statuses belong to "Done."
- SOURCE OF TRUTH: this contract's Section K; the detail page's own already-correct
  `STATUS_VARIANT` map as the color precedent to reuse.
- FILES LIKELY TO CHANGE: `src/app/(authenticated)/owner/tasks/page.tsx`.
- FEATURES PRESERVED: all — grouping, labels, and filtering are untouched; only a color mapping changes.
- DOMAIN SEMANTICS CHANGE: NO. OWNER-VISIBLE CHANGE: YES (a color, not a layout/hierarchy/wording change). USER-EVIDENCE NEEDED: NO — this is a correctness fix against the design direction's own explicit, already-adopted color-semantics rule, not a new hierarchy/IA decision.
- TESTS REQUIRED: extend the existing test coverage (or add a new small component test) asserting the "Done" badge is not rendered in the success variant for any of the three non-approved terminal statuses.

**Explicitly NOT proposed** (would require user evidence per Section 32, or touch out-of-scope
pages): fixing "Continue on Home"'s missing deep-link (touches `/owner/cockpit`, out of scope for
this audit); replacing `window.prompt()` on `/owner/execution` (explicitly barred — Section 4/32);
adding a concurrency guard to `updateSopAction` (a service-layer change, not a page-level fix
matching this contract's own established page-only precedent — flagged as a residual instead,
Section AF); fixing `/owner/tasks`'s filter/pagination race (Section P) — a genuine but
lower-severity, differently-shaped race with no established fix template to point to yet; adding
per-row business labels to the "Delegated work" list (would require a schema change — `DelegatedTask`
has no businessId to label with at all, per Section J — out of scope for a page-only fix).

## AD. Exact future file manifest, if safely knowable

**UX-05B EXACT FILE MANIFEST: FROZEN** (Outcome 1) — for Candidates 1–4 only, all four sharing the
same page-level, precedent-matching, zero-hierarchy-change shape already proven safe by UX-04B:

Production files:
1. `src/app/(authenticated)/owner/execution/page.tsx` — Candidates 1, 2, 3 (race guards, error
   governance, cancelled label — bundled, exactly as UX-04B bundled its own equivalent fixes into
   one file per page).
2. `src/app/(authenticated)/owner/tasks/page.tsx` — Candidate 4 (badge-color correctness only).

Test files (new, mirroring established templates exactly):
3. `src/__tests__/components/owner-execution-business-switch-race.test.tsx` (new).
4. `src/__tests__/owner-execution/execution-page-owner-safe-errors.test.tsx` (new).

Everything else this contract discusses — the OwnerSopAction concurrency-guard gap, the "Continue on
Home" deep-link gap, the `/owner/tasks` filter-race gap, `window.prompt()` replacement, any IA/
hierarchy change — is explicitly **NOT** part of this frozen manifest, per Section AC's exclusions.

## AE. Unsafe abstractions explicitly rejected

Per Section 33, each tested and rejected as `NOT proven equivalent`:

- **`DelegatedTask == ProcessExecutionTask`** — REJECTED. Distinct schemas (one has businessId, one
  never can), distinct status machines (15 typed states with a graph vs. ~12 ad-hoc string
  literals), distinct completion models (proof+review vs. evidence-count+heuristic), distinct
  delegation models (named person/role vs. role-class only). Section I.
- **`ProcessExecutionTask == SOP action (OwnerSopAction)`** — REJECTED. Different schema (nullable
  soft-FK vs. required hard-FK), different status vocabulary entirely (ProcessExecutionTask's ~12
  ad-hoc states vs. OwnerSopAction's 6-state `RECOVERY_ACTION_STATUSES`), different verification
  model (outcome-then-verify two-step vs. direct before/after verification), different reassessment
  mechanism (first-class event record vs. inline re-diagnosis call). Section H/N/T.
- **`proof == completion evidence`** — REJECTED. "Proof" is a rich, typed, AI-prechecked,
  disputable, risk-adjudicated first-class model that exists *only* for DelegatedTask. "Completion
  evidence" elsewhere is a bare string array or JSON blob with no type taxonomy, no AI check, no
  dispute path. Section T.
- **`completion == verified outcome`** — REJECTED. For DelegatedTask, completion (`APPROVED_COMPLETE`)
  is the end of the lifecycle — no "outcome" or "verification" concept exists afterward at all. For
  ProcessExecutionTask, completion and outcome-verification are two separate, sequential steps with
  their own distinct statuses and audit events. Conflating them anywhere would misdescribe both
  models. Section T.
- **`task status == action status`** — REJECTED. Three genuinely different vocabularies exist in
  this codebase under the general name "status": `DelegatedTaskStatus` (15 typed enum values,
  domain-owned), the ProcessExecutionTask ad-hoc string set (~12 values, no typed enum found), and
  `RECOVERY_ACTION_STATUSES` (6 values, shared across founder-recovery and SOP actions only). No two
  of the three are the same set. Section G/H/N.
- **`Execution page == Tasks page`** — REJECTED. `/owner/execution` is a diagnosis-engine workspace
  (Money/Sales/Operations-shaped); `/owner/tasks` is a two-model work-tracking list (delegation +
  read-only display of owner-started work). Section Q's overlap matrix shows no cell where the two
  pages do the identical thing to the identical data. No merge of these two pages is proposed or
  implied anywhere in this document.

No new shared component or hook is proposed anywhere in this document, consistent with Section 33's
default-no rule; Candidates 1–2 in Section AC explicitly reuse an *existing* pattern
(`loadGenerationRef`/`activeBusinessIdRef`/`classifyOperatorError`) already proven on four other
pages, not a new abstraction.

## AF. Residual unknowns

- **UNKNOWN**: whether `OperatorItem` carries its own `businessId`. WHY UNKNOWN: the delegated
  research pass read only a partial region of that model's schema definition before stopping.
  WHAT WOULD RESOLVE IT: reading the full `OperatorItem` model in `prisma/schema.prisma`. DOES IT
  BLOCK UX-05B: NO — none of the four frozen candidates depend on this.
- **UNKNOWN**: whether any code path backfills a `businessId` onto a task-originated `Proof` row
  after creation (only `.create` call sites were checked, not every `.update`/`.updateMany`).
  WHAT WOULD RESOLVE IT: an exhaustive grep of every `proof.update`/`proof.updateMany` call site.
  DOES IT BLOCK UX-05B: NO.
- **UNKNOWN**: whether `DelegatedTaskStatus.EXPIRED` has any runtime trigger anywhere outside the
  Next.js route tree (e.g. a standalone worker process). WHY UNKNOWN: only the one registered
  cron-scheduler route and its direct producers were checked; a worker outside that tree cannot be
  ruled out from source alone. WHAT WOULD RESOLVE IT: a repo-wide search for any process/deployment
  config referencing a task-expiry job, or asking the team directly. DOES IT BLOCK UX-05B: NO.
- **UNKNOWN**: the emission conditions for the five SOP opportunity-finding codes
  (`opportunity-rules.ts` was not read by this audit). WHAT WOULD RESOLVE IT: reading that file.
  DOES IT BLOCK UX-05B: NO — no candidate depends on opportunity-finding logic.
- **UNKNOWN**: whether `src/domain/owner-sop/actions.ts`'s `planSopActionsFromDiagnosis` internally
  calls `buildSopRecommendations`/`SOP_REC_TEMPLATES` exactly as this document assumes (established
  as background fact from the mission framing, not independently re-traced line-by-line). WHAT WOULD
  RESOLVE IT: reading `actions.ts` directly. DOES IT BLOCK UX-05B: NO.
- **UNKNOWN, and explicitly `USER-EVIDENCE NEEDED`, not resolvable by source reading**: whether a
  low-digital-literacy owner can currently distinguish "My work," "Delegated work," and "Execution &
  SOP" from each other — Section AG addresses this directly and does not guess an answer.
- **PARTIALLY BLOCKS a hypothetical future UX-05C**, not UX-05B: the "Continue on Home" deep-link
  gap (Section H/P/Q) is a confirmed, real defect, but fixing it requires touching `/owner/cockpit`,
  which is out of this audit's modification scope entirely — it is recorded here as a defect, not
  folded into Section AC's candidates, and would need its own scoped mission naming Home as in-scope.

## AG. Hostile self-audit

1. **Did I assume `/owner/tasks` contains one task model when it actually contains two?** No — the
   two-model structure (DelegatedTask, ProcessExecutionTask) was established from the page's own
   source and comments before any analysis proceeded, and is the organizing structure of Sections
   F–L.
2. **Did I falsely equate DelegatedTask and ProcessExecutionTask?** No — see Section I's 14-question
   table and Section AE's explicit rejection.
3. **Did I assume `/owner/execution` is action management because of its route name?** No — Section
   M/N derive its actual responsibility (a diagnosis-engine workspace, SOP/Money/Sales/Operations-
   shaped) from `/api/owner/sop/**` source, not the route name.
4. **Did I inspect the actual `/api/owner/sop` implementation?** Yes — all 9 route files and their 5
   backing services were read in full (Section N, M).
5. **Did I read authoritative status sources rather than only page label maps?** Yes — every status
   claim in this document traces to a domain/schema/validation-schema source
   (`delegated-task.ts`, `process-execution-bridge.service.ts`, `founder-recovery/action-status.ts`,
   `owner-sop/types.ts`), not merely to a page's own label object.
6. **Did I prove delegated-task business attribution rather than infer it?** Yes — directly from
   `prisma/schema.prisma`'s `DelegatedTask`/`WorkOrder` model definitions (Section J), confirmed by
   an independent research pass reading the same schema region separately.
7. **Did I inspect task creation and task detail surfaces?** Yes — both files read in full (Section
   L), cross-checked against the actual `assignSchema`/`sopActionUpdateSchema` server contracts.
8. **Did I distinguish proof, evidence, completion, outcome and verification?** Yes — Section T's
   glossary treats each as a per-model term, explicitly refusing to normalize across models where
   the underlying semantics differ.
9. **Did I inspect stale load races?** Yes, for both pages independently (Section O.A, Section P).
10. **Did I inspect stale mutation-intent races?** Yes (Section O.B).
11. **Did I inspect create-business async continuation on `/owner/execution`?** Yes (Section O.C).
12. **Did I inspect raw owner-visible error paths?** Yes, on both pages (Section O.D, and Section P
    confirmed `/owner/tasks` already routes its errors through `classifyOperatorError` correctly).
13. **Did I inspect raw-enum fallback paths?** Yes, on both pages, for every label map found (Section
    O.E, Section P, Section R).
14. **Did I mistake current render order for a future hierarchy recommendation?** No — Section W is
    explicitly descriptive-only, and Section X explicitly defaults every hierarchy question to
    `USER-EVIDENCE NEEDED`, following UX-04A's own precedent verbatim.
15. **Did I recommend visual changes without user evidence?** No new visual/hierarchy/layout change
    is recommended anywhere; Candidate 4 (Section AC) is a color-correctness fix justified by the
    design direction's own already-adopted "no invented positive signal" rule, not a new visual
    preference, and is explicitly framed as such.
16. **Did I accidentally propose deleting backend-only functionality?** No — Section V's
    `BACKEND_ONLY_MUST_PRESERVE` list explicitly protects named-user assignment, the escalation
    service, the proof-dispute category taxonomy, and both separate SOP-adjacent services, none of
    which any candidate in Section AC touches.
17. **Did I preserve all existing task/action/proof/verification capabilities?** Yes — Section V is
    exhaustive against Sections F–T, and none of the four frozen candidates removes any capability;
    all are additive guards or a color fix.
18. **Did I treat historical audit docs as current truth without revalidation?** No — every claim
    sourced from UX-04A or the design direction doc was independently re-verified against current
    `main` by this audit's own reads (e.g. re-confirming UX-04A's Section D/E exclusion of Tasks/
    Execution directly from that file's current text, not from memory of it).
19. **Did I overclaim responsive/mobile safety from CSS alone?** No — Section Y uses only
    `SOURCE-RISK`/`SOURCE-SAFE-SIGNAL` classifications, and Section 38's strong-claim sweep (below)
    confirms no "mobile-safe"/"fully responsive" claim was made.
20. **Did I check current open PR collisions?** Yes (Section AB) — 30 open PRs enumerated, one
    (#496) checked file-by-file, confirmed no overlap; the remaining 29 confirmed non-overlapping by
    category (Dependabot, stage7-evidence).
21. **Did I modify any file other than the one authorized markdown contract?** No — Section 39
    documents the exact validation confirming this.
22. **Did I weaken or update the feature-preservation baseline?** No — the verifier was run
    read-only, twice, against the unmodified baseline; it was not regenerated or edited.
23. **Did I invent an exact UX-05B manifest where evidence was insufficient?** No — Section AD froze
    a manifest only for the four candidates with genuinely sufficient, precedent-matching evidence
    and `USER-EVIDENCE NEEDED: NO`; every other defect found (the SOP-action concurrency gap, the
    Home deep-link gap, the Tasks filter-race gap) was explicitly excluded from the manifest and
    recorded as a residual instead (Section AF).
24. **Could a low-digital-literacy owner currently distinguish "My work," "Delegated work," and
    "Execution & SOP"?** **UNKNOWN — not guessed.** Section I item 13 already establishes that the
    distinction between "My work" and "Delegated work" exists only as a source-code comment, never
    rendered copy; Section D notes "Execution & SOP" itself is an unexplained compound label whose
    accuracy this document does not evaluate against real-user comprehension. No claim of clarity or
    confusion is made — this is recorded as a `USER-EVIDENCE NEEDED` question, not answered from
    source.

No self-audit failure requiring correction was found; all 24 questions above were answered directly
against sourced sections of this same document, not asserted freshly.

## Revision record

None — this is the initial version of UX-05A. No prior revision exists to record.
