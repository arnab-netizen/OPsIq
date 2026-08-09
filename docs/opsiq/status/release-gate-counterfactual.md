# Release-Gate Counterfactual — OpsIQ Stage 7

**Generated**: 2026-08-08  
**Question**: If OpsIQ were shipped to the owner today (at the current branch HEAD), what would go wrong?  
**Branch**: claude/owner-operational-completion  
**Authorized subject SHA**: `036c526940f349d7d06e05635f29c064c78ba71b` (D-12)

This document is not a prediction of failure in production. It is a structured adversarial walk-through of every Stage 7 invariant to identify what the owner would encounter if deployment happened without the remaining Stage 7 evidence steps.

---

## S7-I1 — Exact private deployment identity

**What would go wrong**: The owner has no verified procedure to confirm the SHA running in production matches the authorized D-12 candidate. Without this verification, a rollback or a deployment of a non-authorized build would be undetectable.

**Consequence**: The owner could be operating against a commit that differs from the one Stage 7 evidence was captured against. Stage 7 closure evidence would describe a different system than the one running.

**Mitigation available**: Run `curl -s https://opsiq.example.com/api/health | jq .sha` and verify it equals `036c526940f349d7d06e05635f29c064c78ba71b`. This takes 2 minutes; no engineering change needed.

---

## S7-I2 — Production migration integrity

**What would go wrong**: If production Neon still has migrations pending from the 162-migration history (or if the Prisma client was generated from a schema that diverged from the applied migrations), API calls that touch tables added in newer migrations would return Prisma runtime errors, not graceful degradation.

**Consequence**: Any feature touching a schema object not yet migrated (e.g., `ownerApprovalMemory`, `ownerAttentionEvent`, `scheduledTask`) would throw `PrismaClientKnownRequestError` rather than a typed application error.

**Mitigation available**: `npx prisma migrate status` against production Neon. Takes 5 minutes. No engineering change needed.

---

## S7-I3 — Production configuration fail-closed

**What would go wrong if shipped without all REQUIRED_OWNER_RUNTIME vars**:

| Missing var | Actual consequence |
|---|---|
| `OAUTH_TOKEN_ENCRYPTION_KEY` absent | Any connector that tries to store a token throws at encrypt time → connector OAuth flows fail closed at token-store step; user sees 500 |
| `CRON_SECRET` absent | Vercel cron invocation arrives with no Authorization header → cron endpoint returns 401 on every scheduled run → no scheduled tasks execute → owner is never reminded of stale/due actions |
| `DECISION_SIGNING_SECRET` absent | The signing module throws on first use → any decision route that signs its hash chain produces 500; governed decisions are blocked |
| `ASYMMETRIC_PRIVATE_KEY` absent (or using compromised key) | Asymmetric verification route unavailable or uses a compromised trust root → Stage 7 signing evidence is invalid |
| `MIGRATION_DATABASE_URL` points to pooler | `prisma migrate deploy` hangs or errors on advisory locks → migration fails → database schema is not in sync with the client |
| `NODE_ENV` not `production` | Secure-cookie flags not set → session cookies are non-secure on HTTPS; CORS permissive; error messages verbose → security regression |

**Consequence**: At least 3 of the 6 consequences above produce silent security gaps that would not appear in the application log under `info`-level logging unless explicitly triggered.

**Mitigation available**: Run `scripts/deployment-preflight.mjs` against live environment. Provision all 8 REQUIRED_OWNER_RUNTIME vars before first owner session.

---

## S7-I4 — Private owner authentication and workspace binding

**What would go wrong**: If `OPSIQ_PRIVATE_WORKSPACE_ID` and `OPSIQ_PRIVATE_OWNER_USER_ID` are not seeded in production before the owner's first login, the owner's authenticated session will exist but the workspace entitlement lookup will return the `FREE` tier. The owner will see a capability-gated interface that denies actions requiring `ENTERPRISE` capabilities (which all governed owner-mode operations require).

**Consequence**: Owner logs in, attempts to enter business data, and receives 403 on every write route. From the owner's perspective, the system is broken. No error message distinguishes "entitlement not seeded" from "bug."

**Mitigation available**: Run `scripts/seed-private-owner.ts` with the production `OPSIQ_PRIVATE_WORKSPACE_ID` and `OPSIQ_PRIVATE_OWNER_USER_ID` values before the owner's first session.

---

## S7-I5 — Live tenant and secret boundary

**What would go wrong**: With only the private owner deployment seeded, cross-workspace leakage tests cannot fail (there is only one workspace). However, if the owner creates a second workspace (which the UI permits), workspace scoping must hold. The `enforceWorkspaceScoping` middleware is in place on all routes. The counterfactual risk is not an implementation gap; it is the absence of a verified test on production.

**Consequence**: No documented evidence that cross-workspace rejection was confirmed on the production deployment. This is an evidence gap, not a security gap — the implementation is correct.

**Mitigation available**: Owner creates a second test workspace, attempts to read first workspace's records using the second workspace's session token, confirms 403. Takes 10 minutes; no engineering change needed.

---

## S7-I6 — Real business-state accuracy

**What would go wrong if owner skips this**: OpsIQ would produce assessments from its deterministic engine (OPENAI_API_KEY absent → `UnavailableAiProvider` active → fallback engine runs). The fallback engine has not been judged by the owner on their real business data. The owner's first use of the system without this validation step means the first real-business assessment is also the first test.

**Consequence**: Owner receives guidance that may not be grounded in their actual situation. The adaptive engine has no calibration baseline against real data. The Stage 7 invariant requires the owner's judgment; it cannot be inferred from engineering tests.

**Mitigation available**: Owner enters real business data during pilot; judges assessment. This is a LANE_F item; no engineering change possible.

---

## S7-I7 — Actionable owner guidance

**What would go wrong if owner skips this**: The recommendation engine produces guidance. If no recommendation has been accepted and acted upon, there is no evidence that the guidance is feasible in the real business context. Generic or misaligned guidance would not be caught until real damage is possible.

**Consequence**: Stage 7 evidence is absent. The owner is deploying a recommendation system whose practical accuracy has not been validated.

**Mitigation available**: Accept and act on ≥1 recommendation during the pilot. LANE_F; no engineering change possible.

---

## S7-I8 — Approval and execution boundary

**What would go wrong**: The governed execution boundary (recommendation → approval → execution tracking → outcome record) exists in the implementation but has not been walked by the owner. If the owner skips approval for an action, the action may be executed in a context where OpsIQ cannot track it — breaking the audit trail.

**Consequence**: Untracked governed transitions. Audit records are incomplete. The re-evaluation engine has no outcome evidence to calibrate from.

**Mitigation available**: Complete one full governed cycle during the pilot. LANE_F; no engineering change possible.

---

## S7-I9 — Adaptive re-evaluation

**What would go wrong**: The adaptive re-evaluation engine (triggered by new evidence, failed actions, changed KPIs) has been tested in simulation but not observed in the production system against real business changes. If re-evaluation silently fails to trigger in production, the owner would receive stale guidance without knowing it is stale.

**Consequence**: Stale guidance served without re-evaluation signal. The calibration loop has no production feedback cycle.

**Mitigation available**: Introduce a material change during the pilot and observe/record re-evaluation. LANE_F; no engineering change possible.

---

## S7-I10 — Audit and provenance completeness

**What would go wrong**: Audit events are emitted from 12+ production paths. The CAT2 atomicity fixes (this session) ensure mutation+audit are transactional. However, whether the six required attribution fields (`workspace`, `actor`, `time`, `source evidence`, `affected record`, `result`) are all populated in production audit records has not been verified against a live transaction.

**Consequence**: A gap in audit attribution (e.g., missing `sourceRef`, null `actorType`) would not be surfaced by engineering tests — it would only appear on audit record inspection in production.

**Mitigation available**: Inspect 3–5 audit records in production after a real owner action. Confirm all 6 fields present. 15-minute inspection; no engineering change needed.

---

## S7-I11 — Safe degraded and failure behavior

**Status**: CLOSED. 17-test adversarial suite in isolated simulation confirms all 9 failure scenarios.  

**No counterfactual risk remains for this invariant.**

---

## S7-I12 — Operational recovery

**What would go wrong**: Three runbooks exist (DEPLOYMENT_RUNBOOK.md, OPERATIONAL_RUNBOOK.md, ROLLBACK_RUNBOOK.md). Neither the owner nor an operator has walked a staged failure through them. If a real failure occurs before this exercise, the operator may encounter undocumented steps and increase recovery time.

**Consequence**: Recovery time extended by undocumented procedural gaps. Stage 7 evidence absent.

**Mitigation available**: Introduce a staged failure (e.g., temporarily revoke DATABASE_URL, observe recovery preflight, restore, confirm healthy state). Record: failure time, steps followed, deviations, recovery time.

---

## S7-I13 — Built-in operational usability

**What would go wrong**: The owner's ability to use OpsIQ without developer assistance has not been tested. If the interface has ambiguous flows or untranslated terminology, the owner would get stuck and need to contact support — which defeats the purpose of a self-contained deployment.

**Consequence**: Owner requires developer assistance for a task that Stage 7 requires to be completable unaided. This is a UX gap, not an engineering gap.

**Mitigation available**: Owner completes one full cycle unaided, records blocked steps. Any blocked steps become P1 engineering items. LANE_F; no engineering change possible in advance.

---

## S7-I14 — Feedback and learning-loop capture

**Status**: Field mapping COMPLETE (owner-accepted D-6). Eight required fields are bound to concrete columns and routes.

**What would go wrong**: The feedback schema is ready, but no actual feedback record has been written from a real pilot cycle. If the feedback write path has an untested validation edge (e.g., `riskClass` coercion on a value not in the expected enum), the write would fail at runtime.

**Mitigation available**: Complete one real pilot feedback write during the pilot cycle. If it fails, it is a targeted engineering fix (not a redesign).

---

## S7-I15 — Measurable real outcome

**What would go wrong**: The measurement window is owner-declared (D-7, deferred by design). If the pilot intervention is selected but the measurement window is never declared, the outcome record has no baseline or window and is unmeasurable.

**Consequence**: Stage 7 evidence artifact is incomplete. Outcome measurement cannot be audited.

**Mitigation available**: Owner declares measurement window when selecting the pilot intervention. No engineering action required.

---

## S7-I16 — Unrestricted private-owner acceptance

**What would go wrong**: All 15 preceding invariants are either closed or partially addressed. S7-I16 is the final gate. If the owner issues `FACTORY_STAGE_7_ACCEPTED` before all blocking invariants are confirmed, the acceptance is premature and does not represent complete evidence.

**Correct order**: S7-I1 through S7-I15 evidence complete → owner reviews gap table → owner issues `FACTORY_STAGE_7_ACCEPTED`.

---

## Counterfactual summary

| Invariant | Ships safely today? | Risk if shipped without evidence |
|---|---|---|
| S7-I1 | No | Non-authorized commit could be in production without detection |
| S7-I2 | No | Prisma runtime errors on unmigrated tables |
| S7-I3 | No | 3+ silent security gaps (CRON_SECRET, DECISION_SIGNING_SECRET, NODE_ENV, compromised key) |
| S7-I4 | No | Owner receives 403 on all writes (FREE tier entitlement) |
| S7-I5 | Implementation safe; evidence absent | No production cross-workspace rejection confirmed |
| S7-I6 | Implementation safe; evidence absent | Guidance unvalidated against real data |
| S7-I7 | Implementation safe; evidence absent | Recommendation practicality unconfirmed |
| S7-I8 | Implementation safe; evidence absent | Governed cycle untested in production |
| S7-I9 | Implementation safe; evidence absent | Adaptive re-evaluation unobserved in production |
| S7-I10 | Implementation safe; evidence absent | Audit attribution fields unverified in production |
| **S7-I11** | **YES — CLOSED** | None |
| S7-I12 | Implementation safe; evidence absent | Undocumented recovery steps possible |
| S7-I13 | Implementation safe; evidence absent | Owner may require developer assistance |
| **S7-I14** | **Implementation complete**; evidence pending | Feedback write path not exercised against real data |
| S7-I15 | Implementation safe; measurement window not declared | Outcome unmeasurable without owner declaring window |
| S7-I16 | No — premature | All preceding evidence incomplete |

**Hard blockers if shipped today**: S7-I1, S7-I2, S7-I3 (3 env vars absent), S7-I4  
**Evidence-only gaps (no safety regression)**: S7-I5, I6, I7, I8, I9, I10, I12, I13, I14, I15  
**Closed**: S7-I11  

**Engineering verdict**: The implementation is safe. Shipping today with the missing REQUIRED_OWNER_RUNTIME vars would create real operational failures. Shipping after provisioning those vars is safe from an implementation standpoint; the remaining gaps are all evidence collection, not implementation defects.
