# Module 12 — Owner UI & Mobile Usability — Slice 1 (Owner Home Summary engine)

Pure, deterministic engine that produces the exact §19 owner-home payload from the
already-proven per-domain spine data. No DB/API/UI in this slice. Read-only module
(no schema, no migration).

## A. Files created
- `src/domain/owner-home/types.ts` — `OwnerHomeSummary` and its parts (`DomainDanger`,
  `DangerLevel`, `OwnerHomeRisk`, `OwnerHomeOpportunity`, `RequiredAction`,
  `VerifiedImprovement`).
- `src/domain/owner-home/summary.ts` — `buildOwnerHomeSummary(input)` + `dangerLevel`,
  `OPEN_ACTION_STATUSES`, `MAX_REQUIRED_ACTIONS`, `OwnerHomeVerificationInput`.
- `src/domain/owner-home/index.ts` — public surface.
- `src/__tests__/owner-home/summary.test.ts` — 8 unit tests.

## B. Files changed
None.

## C. Schema changes
None (read-only module).

## D. Backend logic implemented
`buildOwnerHomeSummary({ domainScores, findings, actions, verifications, now? })` →
the §19 owner-home payload, deterministic and honest:
- **business health** = clamped average of domain health scores.
- **cash / sales / operations danger** = that domain's risk score, banded; a domain
  with no diagnosis is `unknown` (null risk), never 0.
- **execution danger** = max risk across the execution domains present (operations, sop).
- **top 3 risks** = real `risk` findings, worst-first (severity → impact → confidence
  → domain → code).
- **top 3 opportunities** = real `opportunity` findings, best-first (impact →
  confidence → domain → code).
- **today's required actions** = open actions only (`proposed/assigned/in_progress/
  blocked`), ranked by the proven spine priority, capped at `MAX_REQUIRED_ACTIONS` (5).
- **last verified improvement** = the most recent verification with status
  `verified_improved`, else null.
Reuses spine `clampScore`/`clampConfidence`/`rankOwnerActions`/`EXECUTION_DOMAINS`.

## E. Frontend logic implemented
None (Slice 3).

## F. Acceptance criteria checklist
- [x] Produces every field the §19 owner home must show.
- [x] Deterministic (injectable clock; identical output for identical input).
- [x] Never invents values (missing domain → `unknown`; empty business → zeros/empties).
- [x] Risks/opportunities/actions are real spine findings/actions, correctly ordered.
- [x] Pure domain logic (no DB/API/UI).

## G. Known limitations
- The engine consumes pre-fetched spine data; gathering it (cross-domain findings,
  actions, and verifications) is the next slice's service work.

## H. Manual verification steps
1. `npx vitest run src/__tests__/owner-home/` → 8 passing.
2. Inspect ordering/banding assertions in the test for the documented rules.

## I. Trigger map
Read-only; emits no events, triggers no re-evaluation.

## J. Failure modes covered
- No domain data → all dangers `unknown`, health 0, empty lists, null improvement.
- Non-finite/invalid scores → clamped (fail-closed to 0), never inflated.
- Closed actions (completed/cancelled) excluded from required actions.

## K. Events emitted
None.

## L. Automated tests added
`summary.test.ts` (8): danger banding incl. null→unknown; missing-domain unknown;
per-domain dangers + health from real scores; top-3 risk ordering; top-3 opportunity
ordering; required-actions open-only/ranked/capped; last verified improvement
selection; determinism + no-invention on an empty business.

## Verification run
- `npx vitest run src/__tests__/owner-home/` → 8 passed.
- eslint (changed files) → clean.
- `npm run build` → compiled + type-checked, BUILD_ID present.
- `npm run lint:ratchet` → PASS (baseline 1500/1153; 0 changed-file lint errors).
- Full suite (sharded 1–4/4) → 5,978 passed, 0 failed.
