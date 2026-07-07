# Owner Shadow Pilot — Runbook (PASS 42)

**Date:** 2026-07-07 · **Data:** `OWNER_STYLE_SYNTHETIC_SHADOW_FIXTURES` (no real owner data).

This runbook explains how to run the shadow pilot pack and, later, how to run it with real **redacted** owner data.

## What the pack is
A controlled, non-live evaluation of the governed owner decision loop over anonymized owner-style fixtures.
It exercises the SAME production substrate the owner cockpit uses — the PASS 32 survival planner → the
process-execution bridge → persisted `ProcessExecutionTask`s → the PASS 22 interactive action service — plus
the read-only recovery-status (PASS 37) and public-signals (PASS 39) projections.

## How the harness runs (deterministic, no live importer)
The harness is a DB simulation, not a live data importer:
`src/__tests__/execution/private-owner-shadow-pilot-pack.db.test.ts`.

For each scenario it:
1. creates a shadow workspace + `OWNER_BUSINESS_A` (anonymized);
2. builds the survival/recovery plan from the scenario's `crisisInput` (`planAndValidateSurvival`);
3. maps it to governed corrections and persists `ProcessExecutionTask`s (`buildProcessExecutionBridge` →
   `persistProcessExecutionRoutes`);
4. reads the top action (`getPersistedProcessTasks`), recovery status (`getOwnerRecoveryStatus`), and — for the
   opportunity scenario — the outside-signal summary (`getOwnerPublicSignals`);
5. drives the owner journey through `applyProcessExecutionAction`: owner-approval gate, evidence-gated
   completion, reassessment;
6. asserts every safety gate and the no-overload / no-fabrication invariants.

### Run it
```
# throwaway Postgres 16 (CI does this automatically in LANE_B)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/opsiq_e2e?schema=public"
export TEST_WITH_DB=true
npx prisma migrate deploy
npx vitest run src/__tests__/execution/private-owner-shadow-pilot-pack.db.test.ts
```
It is wired into `.github/workflows/db-verification.yml` LANE_B (required) and LANE_A. In CI, confirm the log
line shows `private-owner-shadow-pilot-pack.db.test.ts` executed — do not accept a generic green DB lane.

## Cockpit journey (browser)
`tests/browser/48-private-owner-shadow-pilot.spec.ts` walks a real OWNER through `/owner/cockpit` over the
seeded synthetic owner-style workspace: one top action, why-this-first, recovery/outside-signals collapsed,
evidence + approval requirements, unsafe actions blocked, no forbidden claims, and the clean-state contract.
It runs in the `owner-pilot-e2e` lane. If a browser environment is unavailable, the journey is proven by the
DB simulation + the PASS 40 cockpit no-overload proof (do not claim browser-proven in that case).

## Scenarios (see `OWNER_SHADOW_PILOT_FIXTURES.json` / `OWNER_SHADOW_PILOT_EXPECTATIONS.json`)
A normal · B cash/discount · C quality/rework · D owner overload · E growth-under-weak-capacity (+ adversarial
public review) · F survival/recovery · G clean control · H unrecoverable/restructure review.

## Running with REAL redacted owner data (later, explicitly authorized only)
1. Collect data using `docs/audits/2026-07-07-private-owner-shadow-pilot-readiness/SHADOW_PILOT_DATA_TEMPLATE.json`.
2. **Redact first** per `SHADOW_PILOT_DATA_REDACTION_GUIDE.md` — remove/placeholder/aggregate; run the §7
   verification checklist. If redaction is uncertain, do not ingest.
3. Map the redacted snapshot to the same `crisisInput` shape (pressures + constraints + missingData) and the
   same public-signal intake shape. Do **not** build a live importer or connector.
4. Re-run the harness; record results in `OWNER_SHADOW_PILOT_RESULTS_TEMPLATE.md`; if any stop condition
   fires (`SHADOW_PILOT_STOP_CONDITIONS.md`), the pilot is BLOCKED until fixed.
5. Real-data outcomes may only be *claimed* if real redacted data was actually used — clearly documented.

## Hard rules (unchanged)
Non-live · no external action · no customer/vendor/staff contact · no money moved · no tender submission · no
live integration · owner remains decision-maker · OpsIQ routes/gates/verifies · implementation stays manual.
