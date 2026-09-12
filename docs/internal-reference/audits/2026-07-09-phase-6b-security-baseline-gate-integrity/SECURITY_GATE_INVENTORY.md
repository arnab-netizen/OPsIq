# Phase 6B — Security gate inventory

**Date:** 2026-07-09
**Base:** `main` @ `c1efc0f`

Inventory of every CI job/command that claims to enforce dependency-security, with its real failure
behavior. Only one gate matches: the `security-scan` job (display name **"Security Baseline Check"**) in
`mvp-readiness.yml`.

## Gate 1 — "Security Baseline Check" (`security-scan` job, `mvp-readiness.yml`)

| # | Field | Before (defect) | After (this PR) |
|---|-------|-----------------|-----------------|
| 1 | Workflow file | `.github/workflows/mvp-readiness.yml` | same |
| 2 | Job name | `security-scan` → "Security Baseline Check" | same |
| 3 | Command | `npm audit --audit-level=moderate \|\| true` + `echo "npm audit failures are warnings only"` | `node scripts/security-baseline-check.mjs` |
| 4 | Job has `continue-on-error` | **YES** (`continue-on-error: true` at job level, line 120) | **NO** (removed) |
| 5 | Command has `\|\| true` | **YES** — audit exit code swallowed | **NO** — script exit code enforced |
| 6 | Required / trusted? | Job lives in the **non-required** MVP Readiness Gate workflow (established Phase 5D via `mergeable_state=unstable`). Named "Security Baseline Check", so it is presented as a trusted security gate. | same wiring (branch protection NOT changed); job is now *capable* of failing honestly |
| 7 | Current failure behavior | **Cannot fail.** `\|\| true` swallows the audit exit; `continue-on-error: true` excludes the job from the workflow conclusion; the `summary` job's "Enforce readiness gate" step checks only `needs.readiness-check.result`, never `security-scan`. A critical/high vuln passes green. | Fails (exit 1) on any critical/high; reports moderate/low; exits 2 on a tooling error |
| 8 | What failure should mean | A critical or high dependency vulnerability is present and must be remediated before the baseline is considered met. | implemented exactly |
| 9 | Output machine-readable? | No — raw `npm audit` text, discarded. | Yes — `npm audit --json` parsed by the script |
| 10 | Recommended correction | Remove job-level `continue-on-error`; remove `\|\| true`; parse `npm audit --json` and fail on critical/high; report moderate/low. | done |
| 11 | Risk of false positives | Low — npm audit severity is authoritative; the gate blocks only on critical/high (not moderate/low), so routine moderate advisories don't flap CI. Tooling error → exit 2 (visible), not a spurious "vuln". | — |
| 12 | Risk of false green | **Was HIGH** (structurally impossible to fail). Now: a critical/high cannot pass, and a broken scanner exits 2 instead of silently passing. | eliminated |

## Adjacent items reviewed (NOT security gates — left unchanged)

- `validate-branch` job → "Check for TODO comments" step uses `continue-on-error: true` (line 107). This is
  a **non-security** informational check (counts TODO/FIXME); its `continue-on-error` is appropriate and out
  of scope. Not modified.
- `readiness-check` job → `continue-on-error: false` on the readiness script (correct; already gating).
- `package.json` scripts: `audit:wrapped-handlers*` are **governance/handler** audits (internal wrapped-route
  audit), unrelated to dependency-vulnerability scanning. No `npm audit` script exists elsewhere.
- No standalone `Security Baseline Check` **workflow** exists — it is only this job. No other workflow runs
  `npm audit`.
- No `SECURITY.md` / documented vulnerability-severity policy found in the repo → Phase 6B defines the
  baseline threshold explicitly (critical + high block; moderate/low report). Owner-selected.
