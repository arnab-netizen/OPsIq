# OpsIQ Wave 9 — Scheduled Reassessment Infrastructure Decision (Plan-First)

> Final follow-up wave. Standard: `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 1** (a decision
> + a test-gap closure on an existing, already-proven seam; no production behaviour change). Branch
> `claude/runtime-readiness-wave9-scheduled-reassessment`, base `main @ 920afc6a`. **CI is NOT triggered by this plan.**

## Situation (recon-verified)
Time-based/cadence reassessment is **already implemented and proven**, except for the external trigger:
- `scanDueReassessments` + `POST /api/internal/reassessment-scan` (fail-closed token seam) are done, idempotent,
  DB-proven (merged #87); event-driven reassessment is fully wired.
- The **only** open item is what invokes the seam on a schedule. Wave 3 deliberately left this as an infrastructure
  decision and explicitly rejected building an in-process/fake scheduler (which would never fire in serverless).
- Recon found **one real gap**: the route had only fail-closed (401) tests — **no authorized 200 / wiring test**.

## Wave 9 scope (minimum, honest — no scheduler built)
1. **Decision memo** (`OPSIQ_RUNTIME_READINESS_WAVE9_SCHEDULED_REASSESSMENT_DECISION.md`): the external-trigger
   infrastructure decision — options (Vercel Cron / GitHub Actions / hosted pinger / durable queue), recommendation
   (Vercel Cron primary, GitHub Actions fallback — both hit the same token-gated seam), risks, tests. The trigger is
   an owner-controlled deployment/ops decision (host, secret, cadence, URL), so it is documented as a recipe, **not**
   committed as a workflow that pings a production URL (out-of-scope external-integration/deployment action).
2. **Close the seam-verification gap**: extend `reassessment-scan.test.ts` with the authorized happy-path — a
   correctly-tokened caller gets 200, the scanner is invoked exactly once with a real `Date`, and the result is
   returned; a scanner error yields a **governed 500** (operator-safe, no raw leak). The scanner is mocked at this
   layer so the route auth/wiring test does not invoke the global scanner against a shared DB (the scan behaviour is
   DB-proven separately in `due-reassessment.service.db.test.ts`).

No production code changes. No migration. No scheduler engine. No workflow committed. No gate weakened.

## Proof
`reassessment-scan.test.ts` (unit): 3 fail-closed (401 no/short/wrong token, scanner never called) + authorized 200
(scanner invoked once, honest result) + governed-500-on-scanner-error (no raw leak). `due-reassessment.service.db.test.ts`
(unchanged, DB) still proves the scan behaviour. tsc + ratchet + governance + auth gates.

## Classification (candidate)
**`SCHEDULED_REASSESSMENT_TRIGGER_DECISION_RECORDED`** — the seam is complete and now fully verified at both ends;
the external trigger is an explicit, documented owner deployment decision (Vercel Cron / GitHub Actions), non-blocking
for the owner shadow-pilot runtime path (event-driven reassessment wired; owner surface honest; no fake scheduler).

## Out of scope
Building any scheduler/cron engine; committing a workflow that calls a production URL; public SaaS / billing / launch
/ external integrations. No migration, no gate weakening.
