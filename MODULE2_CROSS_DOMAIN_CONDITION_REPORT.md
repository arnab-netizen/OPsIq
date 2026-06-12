# Owner Command Center — Cross-Domain Condition (recovery wired) — Report

Status: **Built + locally verified.** Deployed cross-domain proof requires a re-run of
the finance runtime-proof workflow (it now seeds a recovery cycle and asserts the
command center reflects **both** finance and recovery). No public/SaaS, no billing, no
marketing, no Module 3. **No Prisma/migration change. Module 1 not modified (read-only
recovery reads).** Public/SaaS frozen.

## 1. Item executed

**Wire the recovery domain into the Business Condition Profile** — making the owner
command center genuinely cross-domain (finance + recovery), per the audit addendum's
"domains plug in as they adopt the spine DomainScore."

## 2. Why it was next

Module 2 Finance + the command-center read API + the `/owner` home shell are all
deployed-runtime-proven (runs 27404358424 / 27406156168 / 27407345728 / 27411312442).
The command center, however, was single-domain (finance only). The repo state
(`OWNER_MODE_STATUS_REPORT.md`) named "wire a second domain into the Business Condition
Profile" as next — and it avoids starting a new module (Module 3) while delivering the
command center's actual cross-domain purpose.

## 3. What was implemented (read-only on Module 1)

`src/services/owner-condition/business-condition.service.ts`:
- New pure mappers `recoveryCycleToDomainScore(cycle, snapshot)` and
  `recoveryActionRowToOwnerAction(action)` — **deterministic transforms of REAL
  recovery fields** (nothing invented):
  - `healthScore` = recovery cycle's real `healthScore`.
  - `riskScore` from the real `healthStatus` (critical 85 / at_risk 55 / healthy 20),
    falling back to `100 − healthScore`.
  - `opportunityScore` = 0 (recovery does not score opportunity — honest 0).
  - `dataConfidenceScore` from real snapshot completeness of the recovery critical
    metrics (revenue / totalCosts / orderCount): `100 − 30·missing`.
  - actions: `priorityScore`/`effortScore` from the real `priority`/`effort` enums,
    `confidence`/`verificationMetric`(metricToMove)/`expectedTimeframeDays`
    (verificationWindowDays) from real fields.
- `getBusinessCondition` now **read-only**-fetches the latest `RecoveryCycle`
  (workspace-scoped, `include` snapshot + actions) and contributes its DomainScore +
  actions to the spine `buildBusinessConditionProfile`. No recovery table/route/code
  is modified.

Result: the Business Condition Profile aggregates finance + recovery into one
condition, and `recommendedNextAction` is the single highest-priority action **across
both domains**.

## 4. Files changed

- `src/services/owner-condition/business-condition.service.ts` (recovery mappers + read)
- `src/__tests__/owner-condition/business-condition.test.ts` (recovery mappers + cross-domain assembly; 9 tests)
- `src/__tests__/owner-condition/business-condition.db.test.ts` (`[db]`: both domains roll up)
- `scripts/smoke-owner-finance-runtime-proof.ts` (steps 13b/13c: seed recovery cycle → command center reflects finance + recovery)
- `MODULE2_CROSS_DOMAIN_CONDITION_REPORT.md` (this report)
- `MODULE2_OWNER_COMMAND_CENTER_SHELL_REPORT.md` + `OWNER_MODE_STATUS_REPORT.md`
  (recorded the passed `/owner` shell deployed proof — run #4)

## 5. Verification results (local)

| Command | Result |
|---|---|
| `npm run build` | Compiled successfully |
| `npx vitest run .../business-condition.test.ts` | 9 passed |
| `DRY_RUN=true` smoke script | exit 0 (lists steps 13b/13c) |
| `npx eslint` (changed files) | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 (no schema change) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed (Module 1 unchanged) |
| `npm test` | 202 files passed, **0 failed**; 5583 passed (+4) |

## 6. Runtime-proof requirement (not skipped)

The deployed cross-domain proof was **added** to
`scripts/smoke-owner-finance-runtime-proof.ts` (steps 13b/13c: seed a recovery cycle
via Module 1 routes, then assert `domainsWired` includes both `finance` and
`recovery`). The finance runtime-proof workflow must be **re-run** to prove
cross-domain on the deployed app; it is **not** claimed deployed-proven until that
re-run is green.

## 7. Module 1 / public-SaaS

Module 1 green/unchanged — recovery is only **read** (no recovery table/route/code
change); founder-recovery 38 passed. Public/SaaS frozen.

## 8. Next single action

Re-run **"Module 2 Finance Runtime Proof"** (`confirm = RUN_MODULE2_FINANCE_RUNTIME_PROOF`)
— it now seeds a recovery cycle and proves the command center reflects finance +
recovery. After it passes, record cross-domain proof; the next item is real-business
validation, or the next domain module per execution.md.
