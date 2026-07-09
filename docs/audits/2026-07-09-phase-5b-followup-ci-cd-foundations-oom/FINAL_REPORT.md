# Phase 5B follow-up — harden CI/CD Foundations Next build OOM (required gate)

**Date:** 2026-07-09
**Branch:** `claude/phase-5b-followup-ci-cd-foundations-oom`
**Base:** `origin/main` @ `0db6397` (Phase 6A, PR #208 merged)
**Type:** CI hardening only. No product change, no test change, no schema change, no production migration.

---

## 1. Main failure summary

On the Phase 6A merge commit `0db6397`, the required **`CI/CD Foundations - Phase 13 Slice 1`** workflow
run **#1361** failed in its `Build + Type + Prisma Verify` job at the **`Next.js build`** step:

```
✓ Compiled successfully in 35.8s
  Running TypeScript ...
<--- Last few GCs --->
[2395:...]  Scavenge 2027.6 (2085.0) -> 2020.0 (2085.0) MB ... allocation failure
<--- JS stacktrace --->
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
Next.js build worker exited with code: null and signal: SIGABRT
##[error]Process completed with exit code 1.
```

Every prior step passed: `npm ci`, `npx prisma validate`, and the standalone `npx tsc --noEmit`. The build
also **compiled successfully**; the process only died in `next build`'s internal TypeScript pass when the
Node heap hit its default ~2 GB ceiling (`2085 MB`).

## 2. Why this is infra/OOM, not a Phase 6A product regression

- **Identical content passed on the PR.** The exact squashed tree ran green as `CI/CD Foundations #1360`
  (event `pull_request`, head `9d3008a`) and failed only as the main-push `#1361` (head `0db6397`). Same
  tree, opposite outcome ⇒ nondeterministic.
- **The failure class is memory, not code.** The build **compiled successfully** and the standalone
  `tsc --noEmit` step passed at the default heap. The crash is a `FATAL ERROR: ... JavaScript heap out of
  memory / SIGABRT` — a resource ceiling, not a type or build error.
- **Phase 6A's diff cannot systematically add ~GB of build memory.** Phase 6A changed one product file
  (`src/services/findings.ts`, a bounded service refactor) and added two `*.db.test.ts` files. Test files
  are **not** part of `next build`. There is no plausible mechanism by which that diff pushes the production
  build's type-checker over a 2 GB heap on every run — and empirically it did not (it passed on #1360).
- **The required functional gate was green on the same commit.** `CI - Build & Test #3007` (the required
  `ci.yml` lane, `TEST_WITH_DB=true`, real `postgres:16`) passed on `0db6397`, executing the two new Phase 6A
  DB tests against a real database. The product change is proven correct on main independently of this OOM.

This is the exact "NEXT BUILD flake" class Phase 5B was chartered to harden, and `ci.yml`'s `build-and-test`
job already carries the identical fix (`NODE_OPTIONS=--max-old-space-size=4096`, ci.yml:22) — `ci-cd-foundations.yml`
was simply never given the same headroom.

## 3. Workflow file changed

`.github/workflows/ci-cd-foundations.yml` — the `verify` job's `Next.js build` step only.

## 4. Exact hardening applied

Added a **step-scoped** `env` block to the `Next.js build` step (narrowest possible scope):

```yaml
      - name: Next.js build
        run: npm run build
        env:
          NODE_OPTIONS: "--max-old-space-size=4096"
```

(with an explanatory comment). This raises the Node old-space heap from the default ~2 GB to 4 GB for that
single step, mirroring the proven fix in `ci.yml`. It does **not** touch `npm ci`, `prisma validate`, or
`tsc --noEmit`, and does not alter any other job.

## 5. Proof that tests are not weakened

- No file under `src/**`, `**/__tests__/**`, or any `*.test.ts` is modified in this branch.
- No test is skipped, quarantined, deleted, or rewritten. No assertion changed.
- No `continue-on-error` added; no job made non-required; no branch-protection change.
- Failure behavior is preserved: a genuine build/type error still fails the `Next.js build` step and, via the
  `branch-protection` job's `needs.verify.result` check, still fails the gate.
- `git diff --stat` shows only `.github/workflows/ci-cd-foundations.yml` plus the two audit docs.

## 6. Commands run

```
git fetch origin main                       # e42539b..0db6397
git merge-base --is-ancestor 0db6397 origin/main   # YES
git checkout -B claude/phase-5b-followup-ci-cd-foundations-oom origin/main   # HEAD 0db6397
# edit .github/workflows/ci-cd-foundations.yml (scoped NODE_OPTIONS on Next.js build step)
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-foundations.yml'))"   # YAML valid
git diff .github/workflows/ci-cd-foundations.yml   # scoped env only
```

Local YAML parse: **PASS** (step env = `{NODE_OPTIONS: --max-old-space-size=4096}`).
`actionlint`/repo workflow linter: **not installed locally** → workflow-runtime validation deferred to CI on
this PR (reported as such, not claimed as a local PASS).

## 7. CI result

To be confirmed on this PR. Expectation: `CI/CD Foundations` `verify` passes with the 4 GB heap; required
gates green. (Updated post-merge in the EVIDENCE_LEDGER and below.)

## 8. Rollback plan

Single-hunk, self-contained revert: delete the `env:` block added to the `Next.js build` step in
`.github/workflows/ci-cd-foundations.yml` (or `git revert` the merge commit). No product, test, schema, or
data implications — the change only sets an environment variable for one CI step. Reverting simply restores
the prior ~2 GB heap (and the intermittent OOM).

## 9. Next recommended phase

**Phase 6B — Security Baseline gate integrity** — after main is verified green and this required-gate flake
is closed. (Deferred until then per the stop condition.)
