# OpsIQ Cautious-Proceed Policy Calibration — Report

> Defines and proves a **safe 5-status action-status policy** so OpsIQ can recommend **low-risk, reversible,
> SOP-approved** action where appropriate — without over-automating, allowing autonomous high-risk action,
> faking confidence, or proceeding when critical evidence is missing. All changes are **additive and
> conservative-by-default**: with no explicit owner safe-action grant, behaviour is byte-for-byte identical to
> the pre-change runtime.

- **Branch:** `claude/cautious-proceed-policy-calibration`
- **Base:** updated `main` after PR #62 merge (`f7b3e79` — chaos replay DB + browser representative proof)
- **Classification:** `CAUTIOUS_PROCEED_POLICY_READY`
- **No AI brain added · no autonomy added · no gate weakened.**

---

## 1. What was built (additive, conservative-by-default)

| Layer | File | Change |
|---|---|---|
| Canonical policy | `src/domain/owner-mode/action-status-policy.ts` *(new)* | Pure `decideActionStatus(signals)` over typed safety/evidence/materiality signals. Order is strict: **blocked → need_more_data → (safe-action downgrade) → owner_decision_required → cautious_proceed/proceed**. No DB, no model, no `Date.now`. |
| Supervisor seam | `src/domain/owner-mode/supervisor-summary.ts` | Added optional `SupervisorInput.safeAction`; `deriveActionStatus` now delegates to `decideActionStatus`. **Behaviour-preserving**: `safeAction` absent ⇒ identical output. |
| Service | `src/services/owner-mode/owner-whole-business-plan.service.ts` | Populates `safeAction` **only** for a genuinely-safe business AND only when a DELIBERATE, explicitly-scoped owner standing instruction (`owner.safe-action-approved`) exists. Risk class `low` ⇒ proceed, `medium` ⇒ cautious_proceed. |
| Fixtures | `owner-scenario-profiles.ts`, `scripts/seed-owner-scenarios.ts` | `SAFE_ACTION_SCENARIOS` (`safe_proceed`, `safe_cautious`, `safe_needs_data`). Seed grants the SOP standing instruction; `stripCriticalData` removes finance/cash to prove need_more_data. Existing 10 scenarios untouched. |

**The downgrade lever.** `proceed`/`cautious_proceed` are reachable **only** when the owner has issued a
deliberate `owner.safe-action-approved` standing instruction for the business. Absent that explicit grant, the
disposition is exactly what it was before (owner_decision_required for a healthy `profitable_growth` business).
This is the owner's pre-granted approval — not AI autonomy, not a fabricated confidence boost.

---

## 2. Explicit criteria for each status (canonical — `action-status-policy.ts`)

- **BLOCKED** — any of: unsafe action · compliance/professional-review boundary without written review ·
  fake/disputed proof · bad contract/payment terms at high risk · cash/runway hard block · staff/customer
  safety risk · high-risk action with missing critical data · likely-bad-outcome-if-followed. Evaluated FIRST;
  a safe-action signal can **never** override it.
- **NEED_MORE_DATA** — (not blocked) any of: required data missing · confidence cannot reach threshold ·
  material assumptions · weak/one-sided source · confidence below threshold · high decision impact with
  insufficient evidence. Evaluated SECOND; a safe-action signal can **never** override it.
- **OWNER_DECISION_REQUIRED** — (not blocked/need-data, not downgraded by a fully-safe action) any of:
  financially material · changes staffing/payroll · changes pricing materially · B2B contract terms ·
  brand/compliance/legal/professional boundary · reversible-but-material · owner approval required by standing
  instruction · high-risk-financial constraint.
- **CAUTIOUS_PROCEED** — reversible, low/medium risk, **with a stop-loss threshold**, within an approved SOP,
  evidence sufficient, cash impact safe, staff capacity ok, customer-quality controlled, no material compliance
  risk, proof + reassessment defined, owner approval not required (or already granted).
- **PROCEED** — low risk, **routine**, reversible, within an approved SOP, evidence sufficient, proof +
  reassessment defined, no material cash/staff/customer/compliance risk, no owner approval required.

Common safety floor for proceed/cautious (`safeFloor`): `reversible && withinApprovedSOP &&
ownerApprovalNotRequiredOrGranted && evidenceSufficient && cashImpactSafe && staffCapacityOk &&
customerQualityControlled && noMaterialComplianceRisk && hasProofReassessment`.

---

## 3. Policy tests (the 10 required) — `src/__tests__/owner-mode/action-status-policy.test.ts`

1. high-risk case cannot proceed → `owner_decision_required`.
2. missing-data case cannot proceed (safe action cannot override `need_more_data`).
3. owner-approval case cannot proceed without approval; proceeds only once granted.
4. professional-review boundary cannot proceed (`blocked`, even with a safe action).
5. low-risk routine SOP case can `proceed`.
6. reversible medium-risk case can `cautious_proceed`.
7. cautious_proceed requires proof/reassessment.
8. cautious_proceed requires a stop-loss threshold.
9. proceed requires proof/reassessment.
10. blocked / need_more_data never render as proceed (7 blocked + 5 need-data sub-cases).

Plus a runtime-seam suite proving `buildSupervisorSummary` reaches all 5 statuses and that a `safeAction`
**never** overrides blocked/need_more_data. **26/26 in-process policy+coverage tests pass.**

---

## 4. Chaos cases (≥5 per status) — `src/__tests__/behavioral-validation/chaos-replay/status-coverage.test.ts`

Each status array carries ≥5 realistic cases through the real `buildSupervisorSummary` seam:

- **proceed (5):** reorder approved consumables within budget · send already-approved customer recovery
  message · assign staff retraining checklist after proof of a repeated minor error · add proof checklist to
  existing SOP · approve small reversible local fix within standing instruction.
- **cautious_proceed (5):** test a vendor sample before switching supplier · follow up an overdue B2B invoice
  via the approved script · schedule preventive maintenance within approved budget · run a low-cost retention
  WhatsApp within an approved template · update task assignment by verified capacity.
- **owner_decision_required (5):** cash survival · below margin · profitable growth · standing-instruction
  approval · safe action but owner approval NOT granted.
- **need_more_data (5):** missing finance records · no confidence · missing capacity · missing customer data ·
  missing data even with a safe action (cannot override).
- **blocked (5):** compliance/professional-review without review · fake/disputed proof · unsafe action ·
  compliance grey area · unverifiable vendor report.

Invariants asserted: every proceed is low-risk + reversible + routine; every cautious_proceed has
proof/reassessment + a stop-loss; no proceed/cautious case has missing critical data or violates owner/
professional approval; blocked/need_more_data never read as proceed. **10/10 tests pass.**

---

## 5. Dashboard / browser proof distinguishing all 5 — `tests/browser/20-action-status-spectrum.spec.ts`

Five seeded businesses in the E2E owner workspace, rendered in a REAL browser (Chromium) + mobile viewport:

| Business | Dominant | Badge | canProceed |
|---|---|---|---|
| `safe_proceed` (healthy + SOP low) | `profitable_growth` | **Proceed** (success) | ✓ |
| `safe_cautious` (healthy + SOP medium) | `profitable_growth` | **Proceed with caution** (warning) | ✓ |
| `growth_scale` (healthy, NO SOP) | `profitable_growth` | **Owner decision required** (warning) | ✗ |
| `safe_needs_data` (healthy + SOP, evidence stripped) | `profitable_growth` | **Need more data** (muted) | ✗ |
| `vendor_compliance` (compliance boundary) | `compliance_block` | **Blocked** (destructive) | ✗ |

Asserts all five distinct labels render in one session; that the SOP grant is the **only** difference between
the proceed and owner-decision businesses (identical dominant constraint); that proof + reassessment surface
even for proceed/cautious; and that non-proceeding businesses never read as "Proceed". **10/10 browser tests
pass locally** (chromium @ `/opt/pw-browsers`), wired into `owner-pilot-e2e.yml`. Specs 18 & 19 re-run green
(15/15) — no browser regression.

DB-backed proof (`cautious-proceed-policy.db.test.ts`): the same 5 statuses resolve through the real
`getOwnerWholeBusinessPlan` over persisted rows, and the hard gates hold — an SOP grant on a
compliance-boundary business stays **blocked**, on a cash-crisis business stays **owner_decision_required**, and
on a business with stripped finance/cash stays **need_more_data**. **8/8 DB tests pass.**

---

## 6. No-regression gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ clean (exit 0) |
| ESLint (changed files) | ✅ clean (exit 0) |
| `prisma validate` | ✅ valid |
| `lint:ratchet` | ✅ pass (errors 2155 = baseline 2155; warnings 1261 ≤ 1263; changed-file errors 0) |
| Policy + status-coverage (in-process) | ✅ 26/26 |
| Owner-mode + services + behavioral-validation (incl. DB) | ✅ 1048/1048 |
| DB chaos replay + isolation + WBP service + business isolation | ✅ 15/15 |
| Cautious-proceed DB proof | ✅ 8/8 |
| Browser specs 18 + 19 (regression) | ✅ 15/15 |
| Browser spec 20 (new spectrum) | ✅ 10/10 |
| Full non-DB vitest suite | ✅ (see §8) |

Two mock-DB tests were updated to stub the new `ownerStandingInstruction.findFirst` (returns `null` ⇒ no SOP
grant ⇒ unchanged behaviour). No production gate was weakened.

---

## 7. Status distribution (proven reachable, gated)

```
blocked                 ← unsafe / compliance / proof / cash-hard-block / safety / bad-contract / likely-bad
need_more_data          ← missing data / low or no confidence / weak source / material assumptions
owner_decision_required ← financially/structurally material OR healthy growth WITHOUT an explicit SOP grant   (DEFAULT for healthy data)
cautious_proceed        ← reversible low/medium-risk + proof/reassessment + stop-loss + explicit SOP (medium)
proceed                 ← low-risk routine reversible + proof/reassessment + explicit SOP (low)
```

`cautious_proceed`/`proceed` remain **unreachable** for any business without an explicit owner
`owner.safe-action-approved` standing instruction — the conservative default is preserved.

---

## 8. Known limitations

- `proceed`/`cautious_proceed` require a deliberate, explicitly-scoped owner standing instruction
  (`owner.safe-action-approved`). This is intentional: the owner pre-grants the safe action class; OpsIQ never
  self-authorises. The riskClass on that instruction (`low`/`medium`) selects proceed vs cautious_proceed.
- The runtime does not yet derive a stop-loss *amount* per action; `hasStopLoss` is asserted structurally and
  the reassessment trigger + proof requirement carry the stop condition. A future slice can attach a numeric
  stop-loss to the safe-action signal.
- `safe_needs_data` proves need_more_data in the browser by stripping persisted finance/cash after seeding;
  this is a fixture device, not a production data path.

---

## 9. Files

**Created**
- `src/domain/owner-mode/action-status-policy.ts`
- `src/__tests__/owner-mode/action-status-policy.test.ts`
- `src/__tests__/behavioral-validation/chaos-replay/status-coverage.test.ts`
- `src/__tests__/behavioral-validation/chaos-replay/cautious-proceed-policy.db.test.ts`
- `tests/browser/20-action-status-spectrum.spec.ts`
- `OPSIQ_CAUTIOUS_PROCEED_POLICY_PLAN.md`, `OPSIQ_CAUTIOUS_PROCEED_POLICY_REPORT.md`

**Changed**
- `src/domain/owner-mode/supervisor-summary.ts`
- `src/services/owner-mode/owner-whole-business-plan.service.ts`
- `src/services/owner-mode/owner-scenario-profiles.ts`
- `scripts/seed-owner-scenarios.ts`
- `src/__tests__/services/owner-mode/owner-whole-business-plan.service.test.ts` (mock stub)
- `src/__tests__/services/owner-mode/owner-scenario-constraints.test.ts` (mock stub)
- `.github/workflows/owner-pilot-e2e.yml` (runs spec 20)
