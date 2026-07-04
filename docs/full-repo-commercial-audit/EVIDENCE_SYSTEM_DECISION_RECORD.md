# Evidence System Decision Record (GAP-EVIDENCE-DRIFT-01)

## Two evidence/proof systems
| System | Location | Status |
|---|---|---|
| **Delegated-task Proof FSM** (canonical for execution proof) | `src/domain/execution/proof.ts`, `src/services/execution/proof.service.ts`, `task-completion.service.ts`; routes `POST /api/proof/submit`, `POST /api/proof/review` | STRONG — SoD enforced (reviewer ≠ submitter), duplicate/stale/fake resisted, transactional audit; DB-tested. Unchanged. |
| **Legacy Evidence** (engagement diagnostic evidence) | `src/services/evidence.ts`; routes `src/app/api/evidence/**`, `src/app/api/evidence-bundles/**`; models `Evidence`, `EvidenceBundle`, `EvidenceBundleItem`, `EvidenceItem` | Core evidence: **REPAIRED** (this slice). Bundles: **drifted, owner-decision-required** (GAP-EVIDENCE-DRIFT-02). |

These are **distinct entities** (Proof = execution proof for a delegated task; Evidence = diagnostic evidence attached to an engagement), so bridging Evidence → Proof is not semantically correct. Repair (not deprecate, not bridge) was the right closure for the core.

## What was broken (proven at runtime)
`db` is an untyped Proxy, so tsc never caught it. Every legacy Evidence call threw `PrismaClientValidationError`:
- `Evidence` has **no** `workspaceId`, `severity`, `sourceReference`, `visibility` columns and **no** `submitter`/`validator` relations; `create` also omitted required `id`/`updatedAt` and used the scalar `engagementId` where Prisma requires the `engagement` relation.
- Consequence: all `evidence/**` routes 500'd, and `recommendation.ts:281` (`evaluateEngagementEvidence` → `listEvidence`) silently degraded to "0 evidence / low reliability" every call (a silent adaptive-rule violation).

## CLOSED (core) — CLOSED_PROVEN
Repaired the 5 core functions in `src/services/evidence.ts`:
`createEvidence`, `getEvidenceById`, `updateEvidence`, `listEvidence`, `validateEvidence`.
- Scope via the `engagement` relation (`where: { id, engagement: { workspaceId } }`).
- Map `sourceReference`→`source` (non-null, defaulted `""`), `severity`→`severityRating`; connect `engagement`; supply `id`/`updatedAt`.
- `validateEvidence`: added separation-of-duties (`submittedBy !== actor`), an optimistic version guard, and honors `isValid` (`false` → `rejected`).
- Proof: `src/__tests__/services/evidence-repair.db.test.ts` — create → get → list → validate + SoD + workspace isolation (5/5 pass). The `recommendation.ts` silent-degradation path is fixed as a side effect (listEvidence now returns real data).

## OPEN — GAP-EVIDENCE-DRIFT-02 (evidence bundles) — BLOCKED_OWNER_DECISION_REQUIRED
The bundle sub-feature (`evidence-bundles/**`, `createEvidenceBundle`/`addEvidenceToBundle`/…) is **doubly drifted around a different entity**:
- `EvidenceBundle` has no `workspaceId` (scoped via `engagement`), and its relation is `evidenceBundleItems`, not `items`.
- `EvidenceBundleItem` keys on `evidenceItemId` and FK-relates to **`EvidenceItem`** (a richer, enum-typed model) — **not** `Evidence`. But `addEvidenceToBundle` passes `evidenceId` (an `Evidence` id) with `include:{evidence}`.

The service and the schema disagree on the canonical bundled entity. Repairing correctly requires an **owner/architecture decision** (below), not a mechanical field remap. The `evidence-bundles/**` route handlers are wrapped by `withCanonicalEnforcement`, so a drift error is **sanitized/classified** by the wrapper (no raw DB error leaks to the client) — this is a broken feature, not a data-leak.

### Owner decision required
Which model is the canonical bundled entity?
- **(A) `Evidence`** — then `EvidenceBundleItem` must be re-pointed from `EvidenceItem` to `Evidence` (a migration), and the service repaired like the core (scope via engagement, drop `workspaceId`).
- **(B) `EvidenceItem`** — then the bundle service must be rewritten to create/read `EvidenceItem` (enum fields: category/sourceType/captureMethod/validationStatus/traceabilityStatus/visibility) and drop the `Evidence`-shaped calls.

### Acceptance criteria to close GAP-EVIDENCE-DRIFT-02
1. Decision recorded (A or B) in `COMMERCIALIZATION_DECISION_REGISTER.md`.
2. `evidence-bundles/**` routes no longer 500; bundle create/list/add/remove succeed against the real schema.
3. Workspace isolation via engagement + capability gates preserved.
4. DB-backed test covering bundle create → add item → list → remove.
5. No duplicate evidence entity introduced.
