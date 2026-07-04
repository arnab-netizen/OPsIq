# Module 11 — Trust, Audit & Explainability — Slice 2 (API + Service)

Read-only slice. Exposes the deterministic explainability engine (Slice 1) and the
governed audit log over two workspace-scoped, OWNER_VIEW GET routes. Owns no table;
no migration gate (read-only module).

## A. Files created
- `src/domain/owner-trust/validation.ts` — `TRUST_DOMAINS` (the 7 spine domains that
  emit findings/actions) + `explanationsQuerySchema` (domain + uuid cycleId).
- `src/services/owner-trust/trust.service.ts` — `getCycleExplanations(domain, cycleId,
  workspaceId)` and `getEntityAuditTrail(entityId, workspaceId, {limit})`.
- `src/app/api/owner/trust/explanations/route.ts` — GET, OWNER_VIEW, validated.
- `src/app/api/owner/trust/audit-trail/route.ts` — GET, OWNER_VIEW, validated.
- `src/__tests__/owner-trust/routes.test.ts` — route enforcement wiring proof.
- `src/__tests__/owner-trust/services.db.test.ts` — `[db]`-gated service proof.

## B. Files changed
- `src/domain/owner-trust/index.ts` — re-export `./validation`.
- `src/domain/owner-trust/types.ts` — derive `OwnerFindingType` from
  `OwnerFinding["findingType"]` (contracts exports no standalone `OwnerFindingType`).

## C. Schema changes
None. Read-only module; reads existing per-domain cycles and `audit_events`.

## D. Backend logic implemented
- `DIAGNOSIS_READERS`: dispatch table mapping each `TrustDomain` to its proven
  `get<Domain>Diagnosis(cycleId, workspaceId)` reader (finance, sales, cashflow,
  operations, sop, marketing, strategy). The reader enforces workspace ownership and
  throws NotFound on cross-workspace / absent cycles.
- `rowToFinding` / `rowToAction`: map persisted rows to spine `OwnerFinding` /
  `OwnerAction` (attach domain, coerce evidence/missingData to arrays, fail-closed
  confidence).
- `getCycleExplanations`: reads the cycle, builds spine findings/actions, runs the
  deterministic `buildExplanations`, returns `{domain, cycleId, generatedAt,
  explanations}`. Nothing is invented (anti-hallucination invariant from Slice 1).
- `getEntityAuditTrail`: workspace-scoped `queryAuditEvents({workspaceId, entityId})`,
  projected to `{id, eventName, entityType, entityId, actorId, occurredAt, payload}`.

## E. Frontend logic implemented
None (Slice 3).

## F. Acceptance criteria checklist
- [x] Explanations available per diagnosis cycle, carrying the eight §18 fields.
- [x] Audit trail readable per entity (who changed what, when).
- [x] Both routes OWNER_VIEW, workspace-required, canonical, read-only.
- [x] Inputs validated (domain enum + uuid cycleId; uuid entityId).
- [x] No invented values (structural invariant proven in `[db]` test).
- [x] No new table / no migration (read-only module).

## G. Known limitations
- Explanations cover the 7 diagnosis-emitting domains; recovery/portfolio/intake have
  no per-cycle findings to explain and are intentionally excluded from `TRUST_DOMAINS`.

## H. Manual verification steps
1. `GET /api/owner/trust/explanations?domain=finance&cycleId=<uuid>` → JSON cards.
2. `GET /api/owner/trust/audit-trail?entityId=<cycleId>` → governed events.
3. Unauthenticated calls return canonical JSON 401/403 (not an HTML shell).

## I. Trigger map
Read-only; emits no events and triggers no re-evaluation.

## J. Failure modes covered
- Cross-workspace / absent cycle → NotFound (underlying reader).
- Invalid/unknown domain or non-uuid id → 422 via Zod parse.
- Missing source value → labeled "missing" + surfaced as data gap, never fabricated.

## K. Events emitted
None (read-only).

## L. Automated tests added
- `routes.test.ts` — 4 wiring assertions (canonical/workspace/OWNER_VIEW, read-only,
  reads through trust.service, explanations validates domain+cycleId).
- `services.db.test.ts` — 3 `[db]` tests: §18 cards over a real finance cycle with the
  invented-values invariant; diagnosis-run event in the entity audit trail; workspace
  isolation.

## Verification run
- `npx vitest run src/__tests__/owner-trust/` → 14 passed, 3 `[db]` skipped.
- eslint (changed files) → clean.
- `npm run build` → compiled + type-checked, BUILD_ID present.
- `npm run lint:ratchet` → PASS (baseline 1500/1153; changed files 0 errors/0 warnings).
- Full suite (sharded 1–4/4) → 5,965 passed, 0 failed.
