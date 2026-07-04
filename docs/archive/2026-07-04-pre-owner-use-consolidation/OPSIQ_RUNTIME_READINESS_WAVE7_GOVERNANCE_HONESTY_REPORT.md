# OpsIQ Wave 7 — M1/M4 Governance Honesty Report + Tier-2 Hostile Audit

> Standard: `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 2** (auth-path + governed-alert
> honesty). **CI was NOT triggered by this work.** Branch `claude/runtime-readiness-wave7-governance-honesty`;
> base `main @ de782756`. Migration-free; no gate weakened.

## 1. What changed (diff scope — §9)
| File | Class | Change |
|---|---|---|
| `src/lib/canonical-verified-session.ts` | production (auth) | Builder stops fabricating: takes real `workspaceName/workspaceIsActive/membershipIsActive/membershipJoinedAt`; `EntitlementSnapshot` gains `resolved`+nullable `planId` (honest unresolved); `RoleSnapshot.grantedAt`/`EngagementMembershipSnapshot.joinedAt` widened to nullable and set `null` (no fabricated `now`) |
| `src/lib/canonical-route-enforcement.ts` | production (auth) | New exported `resolveWorkspaceSnapshotFacts(workspaceId,userId)` (one indexed lookup of real `workspace{name,isActive}` + membership `{isActive,addedAt}`); STEP 6 fetches it and passes real facts into the builder |
| `src/services/escalation.ts` | production | `EscalationAlert` gains `delivery:"log_only"`; both alerts + both audit payloads carry it |
| `src/app/api/engagements/[engagementId]/escalation-checks/route.ts` | route | POST response carries `delivery:"log_only"` + honest `deliveryNote` |
| `src/__tests__/phase-e/verified-session-real-facts.db.test.ts` | test | 4 M1 DB proofs |
| `src/__tests__/services/escalation/overdue-escalation.db.test.ts` | test | +1 M4 delivery-label proof |
| `src/__tests__/phase-e/canonical-session-adversarial.test.ts` | test | 16 builder call sites pass the new real facts (immutability/isActive assertions preserved) |
| `.claude/governance-baseline.json` | gate baseline | 4 line-number **re-keys** only (357→401, 681→734, 698→751, 764→817) for pre-existing `raw-error-message` findings shifted by the inserted helper — 32 frozen unchanged, 0 new |
| `*_PLAN.md`, `*_DECISION.md`, this report, `*_EVIDENCE_LEDGER.json` | docs | plan + decision memo + audit |
No schema/migration/workflow file touched. No threshold/rule change (§9.3): the baseline delta is purely line-number
re-keys of existing findings (same 32), the documented pattern used in Wave M6/#95.

## 2. Claim-to-proof matrix (§10)
| Claim | Required layer | Actual | Evidence | Verdict |
|---|---|---|---|---|
| M1: an ACTIVE workspace → snapshot `workspace.isActive===true` + real name (not the id) | real DB | **DB** | `verified-session-real-facts.db.test.ts` #1 | PASS |
| M1: a DEACTIVATED workspace → `workspace.isActive===false` (no longer hardcoded `true`) | DB | **DB** | test #2 | PASS |
| M1: `membership.joinedAt` = real `addedAt`; entitlements honestly `resolved:false`/`planId:null`; role grants `null` (no fabricated `now`/`"default"`) | DB | **DB** | test #3 | PASS |
| M1: missing membership → honest throw (no fabricated defaults) | DB | **DB** | test #4 | PASS |
| M4: escalation alert + its audit event carry `delivery:"log_only"` | DB | **DB** | `overdue-escalation.db.test.ts` M4 case (asserts alert + `escalation.high_priority_overdue` audit payload) | PASS |
| Per-request entitlement resolution wired into the hot path | — | **NOT DONE (decision)** | decision memo D1 (fails-closed → unsafe) | HONEST NON-CLAIM |
| Real notification/email/push delivery built | — | **NOT DONE (out of scope)** | plan §M4 | HONEST NON-CLAIM |

## 3. Reachability (§11)
`CanonicalVerifiedSessionBuilder` is built once per request by `withCanonicalEnforcement` (STEP 6) — the single
production caller; the new `resolveWorkspaceSnapshotFacts` runs on that path. The escalation detectors are reached
by the Phase-7 re-eval loop (`re-evaluation.ts:793`) and `POST /escalation-checks`; both now carry the honest
delivery label. The fabricated snapshot fields were previously **unconsumed** by any gate (recon-proven), so this
is honesty hardening on a live path, not a behaviour change to an enforced decision.

## 4. Honesty / no-overclaim (§20, §22, §34)
- No fabricated authz facts remain in the snapshot: workspace/membership state is DB-real; entitlements + role/eng
  timestamps are explicit "unresolved/null", never invented values.
- Entitlements are **not** force-resolved per request (would 500 every unbilled workspace — decision memo D1);
  real limit checks stay on the on-demand fail-closed `entitlement.service` path.
- Escalations honestly declare `log_only`; **no** delivery channel is claimed or built.
- Adjacent honesty debt (phantom `db.alert` model; `notification-service` `Math.random()` "sent";
  `handleEmailAction` `success:true`) is **documented, not buried** (decision memo D2) — each is non-functional or
  off the owner escalation path, flagged for the owner as follow-up with a recommendation.
- No gate weakened: `lint:ratchet` PASS (2083 ≤ 2155, 0 changed-file errors); `governance:scan:strict` 32 frozen /
  **0 new** (4 line-number re-keys only); `governance:scan:auth` comply.

## 5. Local proof (§4, no CI triggered)
- `tsc --noEmit` ✓ (0).
- **DB (local Postgres 16)**: M1 `verified-session-real-facts.db.test.ts` **4/4**; M4 `overdue-escalation.db.test.ts`
  **8/8** (incl. the new delivery-label proof).
- **No-regression**: `phase-e` + `phase-g` + `lib/__tests__` **459/459**; `api/actions.test.ts` **128/128**.
  The single failure in `p2a-production-path.test.ts` is **pre-existing** (its own `clientAccount.create` seed omits
  the required `updatedAt`; fails identically on clean `main` with Wave 7 stashed) — not a Wave 7 regression and
  out of scope.

## 6. CI status (§1.1 / §35)
**CI was not triggered by this work.** PR opened after local proof; required CI evaluated only after it opens.
Until then: `CI_REQUIRED_BUT_NOT_TRIGGERED_BY_AUDIT`.

## 7. Classification
**`GOVERNANCE_HONESTY_M1_M4_DB_PROVEN`** — the verified-session snapshot reads real workspace/membership state
(DB-proven) and stops fabricating entitlements/timestamps; governed escalations honestly label their non-delivery.
The entitlement-hot-path and adjacent alert-honesty questions are resolved by an explicit decision memo (no guess,
no migration). Merge gated on required CI green + a final hostile audit after the PR opens.
