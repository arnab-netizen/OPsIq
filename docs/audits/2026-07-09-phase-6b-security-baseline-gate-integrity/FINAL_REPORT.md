# Phase 6B — Restore Security Baseline gate integrity

**Date:** 2026-07-09
**Branch:** `claude/phase-6b-security-baseline-gate-integrity`
**Type:** CI/security-gate integrity. No product code, no schema, no secrets, no production migration.

## 1. Main verification summary

Verified before branching (main @ `c1efc0f`, which includes `c1efc0f` — the Phase 5B-follow-up merge):
- ✅ `CI/CD Foundations - Phase 13 Slice 1 #1363` — success (required target)
- ✅ `CI - Build & Test #3010` — success (required target)
- ❌ `MVP Readiness Gate #1629` — non-required DB-gate flake (passed as #1628 on the PR, identical content)
- ❌ `Smoke - Production Dashboard #565` — known non-required `BLOCKED_SCHEMA_DRIFT` (owner-migration-gated)

Required target gates green → proceeded.

## 2. Branch and HEAD

`claude/phase-6b-security-baseline-gate-integrity`, branched from `c1efc0f` (working tree clean).

## 3. Verified defect

`[V]` **"Security Baseline Check" (`security-scan` job in `mvp-readiness.yml`) is structurally non-failing.**
- Job-level `continue-on-error: true` (line 120) excluded the job from the workflow conclusion.
- `npm audit --audit-level=moderate || true` (line 134) swallowed the audit exit code.
- The step even printed "npm audit failures are warnings only".
- The `summary` job's "Enforce readiness gate" step checks only `needs.readiness-check.result`, never
  `security-scan`.

Net: a critical or high dependency vulnerability passed the "Security Baseline Check" green. Confirmed by
inspection and by the fact that the current 4 high vulnerabilities have been sitting behind a green check.

## 4. Workflows inspected

- `.github/workflows/mvp-readiness.yml` (the only workflow with a security/audit gate).
- All workflows grepped for `npm audit` / `Security Baseline` / `security` / `audit` / `dependency` — no other
  dependency-vulnerability gate exists.
- `package.json` scripts (`audit:wrapped-handlers*` are internal handler-governance audits, not dependency
  scanning).
- No `SECURITY.md` or documented severity policy found.

Full detail in `SECURITY_GATE_INVENTORY.md`.

## 5. Security policy / threshold

No pre-existing repo policy was found, so an explicit baseline was chosen (owner-selected):
- **FAIL on `critical` or `high`.**
- **REPORT `moderate` / `low` / `info` (non-blocking).**
- **EXIT 2 on a tooling error** (audit couldn't run/parse) — a broken scanner must not pass as green.

This matches the honest "baseline" the job name implies and is not a lax "get to green" policy. Threshold
lives in one place (`BLOCKING_SEVERITIES` in the script) for auditable future changes.

## 6. Exact workflow/script changes

- `.github/workflows/mvp-readiness.yml` (`security-scan` job):
  - Removed job-level `continue-on-error: true`.
  - Replaced `npm audit --audit-level=moderate || true` (+ "warnings only" echo) with
    `run: node scripts/security-baseline-check.mjs`.
- `scripts/security-baseline-check.mjs` (new, 131 lines): runs `npm audit --json`, parses
  `metadata.vulnerabilities`, fails (exit 1) on critical/high with a per-package advisory list, reports
  moderate/low (non-blocking), exits 2 on tooling error. Deterministic; no network beyond the `npm audit`
  the gate already performed; no secret access; no filesystem writes.

## 7. Proof that failures are no longer hidden

- `continue-on-error` is gone from the job (`grep` confirms; YAML parse confirms the job has no such key).
- The blocking command is a script whose exit code the runner honors (no `|| true`).
- Local runs prove all three exit paths:
  - **exit 1** on the current tree (4 high vulns) — the gate now fails honestly;
  - **exit 0** on a clean fixture (no vulns);
  - **exit 2** on a tooling error (no parseable audit output).

## 8. Current vulnerabilities found

`npm audit` on `c1efc0f`: **0 critical, 4 high, 8 moderate, 2 low (14 total)**. The 4 high (all with fixes
available):
| package | severity | fix | example advisory |
|---|---|---|---|
| `next` | high | `next@16.2.10` | DoS via Server Components; App Router middleware/proxy bypass |
| `hono` | high | available | path traversal in `serve-static` on Windows (`%5C`) |
| `undici` | high | available | TLS cert validation bypass via SOCKS5 ProxyAgent; Set-Cookie header injection |
| `vite` | high | available | `server.fs.deny` bypass on Windows alternate paths |

Moderate (8): `@hono/node-server`, `@opentelemetry/{core,resources,sdk-trace-base}`, `@prisma/dev`,
`js-yaml`, `postcss`, `prisma`. Low (2): `@babel/core`, `esbuild`.

## 9. Dependency remediation needed?

**Yes.** Under the chosen (owner-approved) critical+high policy, the now-truthful gate legitimately fails on
the 4 highs. Per Phase 6B rules (14/15) and Part G, these are **not** auto-fixed in this integrity PR.
Recommended **separate dependency-remediation PR**: bump `next → 16.2.10` (verify build/runtime), and
`hono` / `undici` / `vite` to their fixed versions; re-run the baseline to green. Moderate/low can ride the
same or a later remediation pass (non-blocking).

## 10. Commands run

```
git fetch origin main; git checkout main; git pull origin main            # main @ c1efc0f
git merge-base --is-ancestor c1efc0f HEAD                                 # YES
git checkout -B claude/phase-6b-security-baseline-gate-integrity c1efc0f  # clean
npm audit --json  (severity counts + high/critical advisories)           # 0C/4H/8M/2L
python3 -c "import yaml; yaml.safe_load('.github/workflows/mvp-readiness.yml')"  # YAML valid; job has no continue-on-error
node scripts/security-baseline-check.mjs        # exit 1 (4 highs) — gate fails honestly
node scripts/security-baseline-check.mjs  (clean fixture)   # exit 0
node scripts/security-baseline-check.mjs  (no package.json) # exit 2 (tooling error)
npx eslint scripts/security-baseline-check.mjs  # 0 problems
```

## 11. CI result

To be confirmed on this PR. Expectation: the required gates (CI/CD Foundations, CI - Build & Test, lint,
branch-protection) stay green; the **now-truthful `Security Baseline Check` job legitimately FAILS on the 4
highs** (intended, not hidden). The overall (non-required) MVP Readiness Gate workflow therefore shows red —
that is the gate working. Updated post-CI in the EVIDENCE_LEDGER.

## 12. Rollback plan

Revert the two changes: restore `continue-on-error: true` on the `security-scan` job and the
`npm audit ... || true` step, and delete `scripts/security-baseline-check.mjs` (or `git revert` the merge
commit). CI-only; no product/schema/data implications. Reverting re-hides security failures (undesirable) —
prefer instead to remediate the 4 highs so the gate goes green.

## 13. Next recommended phase

**Dependency remediation PR** (bump next/hono/undici/vite) to turn the now-truthful Security Baseline gate
green. After that, **Phase 6C — placebo-test conversion** (shortlist prepared in `PHASE_6C_SHORTLIST.md`),
only on new owner instruction.
