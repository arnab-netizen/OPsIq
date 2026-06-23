# OWNER MODE DECISION OS — ARCHITECTURE

Canonical architecture + capability spec for the OpsIQ Owner Mode Decision OS
minimum-code execution. Companion to `OPSIQ_OWNER_MODE_DECISION_OS_STATE_AUDIT.md`
(repo truth) and `CURRENT_WORKFLOW_STATE.md` (phase status).

Posture: **reuse-and-verify over a mature system.** This document records only
the *net-new* primitives this execution adds and how they bind to existing
OpsIQ subsystems. Capability specs are sections here (not separate files), per
the documentation-minimization rule.

---

## Layer map (existing, reused)

| Concern | Canonical location (reused) |
|---|---|
| Status vocabularies | `src/domain/constants/statuses.ts`; owner decision states in `src/domain/owner-mode/owner-decision.ts` |
| State transitions | `src/policies/state-transition.ts`; `OWNER_DECISION_STATUS_TRANSITIONS` |
| Thresholds | `src/services/thresholds/threshold-service.ts` + `src/domain/owner-*/thresholds.ts` |
| RBAC / capability | `src/policies/capability-check.ts`, `src/domain/constants/roles.ts` |
| Workspace isolation | `src/services/workspace/context.ts`, `src/middleware/workspace-enforcement.ts`, `src/lib/prisma-workspace-enforcement.ts` |
| Data quality | `src/domain/business-facts/data-quality.ts` (`scoreDataQuality`) |
| Business-facts contract | `src/domain/business-facts/contract.ts` |

---

## Capability: Source Classification (Decision-OS §1.10) — Phase 1

**Module:** `src/domain/owner-mode/source-classification.ts` (pure; no DB/IO/LLM).

**Why it exists:** §1.10 requires every important decisioning input to be
classifiable into one canonical class so confidence weighting can rank
owner-reported / inferred / assumed inputs below verified or calculated ones.
The audit found this vocabulary absent (Gap Register **G4**). No existing enum
covered it; the closest repo vocabularies (`evidence_source_type`,
`SourceDocumentKind`, `ExtractionMethod`) are lineage/capture descriptors, not a
decisioning-trust classification.

**Contract:**
- `SOURCE_CLASSIFICATIONS` — the 8 canonical classes:
  `VERIFIED_RECORD, CALCULATED, IMPORTED_FILE, OPERATOR_REPORTED, OWNER_REPORTED, SYSTEM_INFERENCE, ASSUMPTION, UNKNOWN`.
- `SOURCE_CLASS_WEIGHT` / `sourceClassWeight(cls)` — 0..1 trust weight. Invariant
  (tested): `OWNER_REPORTED`, `SYSTEM_INFERENCE`, `ASSUMPTION` rank strictly
  below `VERIFIED_RECORD` and `CALCULATED`; `UNKNOWN = 0`, `VERIFIED_RECORD = 1`.
- `classifyFactSource({extractionMethod?, sourceKind?, validationStatus?})` —
  deterministic mapping from existing business-facts vocabularies to a canonical
  class. Precedence: a `rejected` validation → `UNKNOWN`; else base class from
  extraction method, else source-document kind, else `UNKNOWN`; then validation
  overlay (`system_validated` corroborates an import/owner value up to
  `VERIFIED_RECORD`; unconfirmed authoritative records soften to `IMPORTED_FILE`).
  Never throws; no optimistic default.
- `factSourceWeight(signals)` — convenience composition of the two.

**Binding:** non-breaking, additive. It does not persist state, rename statuses,
or alter the contract. Downstream consumers (Phase 2 data-quality / evidence
confidence weighting, Phase 4 evidence bundle provenance) call it to weight
evidence strength; persisted state remains owned by those subsystems.

**Tests:** `src/__tests__/domain/owner-mode/source-classification.test.ts`
(13 cases: class set, weight bounds + ordering invariant, capture→class mapping,
validation overlay, fail-closed `UNKNOWN`, lineage fallback).

**Explicitly NOT added in Phase 1** (would be dead code / duplication):
a new decision-status enum or prompt↔repo status mapping (repo status machine is
already canonical); a new threshold config (centralized already); extraction of
`calculateFinancialSurvival` / `calculateUnitEconomics` /
`calculateAttributionConfidence` / `checkLearningEligibility` as standalone pure
functions (deferred to Phases 3/9/10 where real callers + tests exist).
