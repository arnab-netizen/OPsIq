# PASS 17 — Repo Cleanup / Obsolete Audit & Artifact Hygiene

## 1. Main HEAD before
`a5c2d929de1938ec80cf9cf805eff75cb6a11d83` — `Level 3 hostile audit acceptance gate (#149)`.
Verified equal to `origin/main` (`git rev-list --left-right --count origin/main...HEAD` → `0 0`), working tree clean.
Contains PR #147 (multi-actor throughput), PASS 15 (#148 full adversarial), PASS 16 (#149 Level 3 acceptance gate).

## 2. Branch
`claude/opsiq-post-level3-hygiene-da04y4` (the session's designated branch).

> **Branch-strategy note.** The pass text prescribes a separate branch per pass with a merge-to-main gate
> between passes. This environment's hard rule pins all work to the single designated branch
> `claude/opsiq-post-level3-hygiene-da04y4`, and this agent cannot merge to `main` or re-pull between passes.
> PASSES 17–19 are therefore executed as sequential, clearly-delimited commits on the designated branch off the
> fully-merged `main` HEAD above. This is disclosed rather than silently diverging from the prescribed workflow.

## 3. Approach
Controlled, non-destructive hygiene. Every candidate was reference-checked against live code, tests, workflows,
scripts, and canonical docs before any action. Anything entangled with a live consumer, or uncertain, was
**kept** (with a ledger entry), never deleted. Deletions were restricted to files with **zero** live and
**zero** canonical-doc references that are unambiguously generated output or scratch tooling.

## 4. Files deleted (18)
| File | Why safe |
|---|---|
| `full-test-output.log` | Committed vitest console dump (70 KB); generated; 0 refs. |
| `test-full-output.log` | Committed vitest console dump (47 KB); generated; 0 refs. |
| `check_schema.cjs` | Ad-hoc DB schema-check scratch script; 0 refs. |
| `check_schema.mjs` | ESM duplicate of the above; 0 refs. |
| `list_tables.cjs` | Ad-hoc table-listing scratch script; 0 refs. |
| `list_tables.js` | Duplicate of the above; 0 refs. |
| `dev.db` | 0-byte SQLite, already gitignored (`*.db`); 0 refs. |
| `tmp/` (11 files) | Stale wrapped-response remediation working notes incl. one 0-byte file; 0 live and 0 doc refs. |

All 18 confirmed to have **no** reference in `docs/ reports/ audit/ audits/ audit_artifacts/ qa/` and **no**
reference in `src/ scripts/ tests/ e2e/ .github/ simulation_runner/`.

## 5. Files moved
None. Root→docs relocation of the many referenced root artifacts/runbooks would require code-path and link
updates (risk) and is deferred to a dedicated, owner-approved docs-reorg pass.

## 6. Files archived
None (no MOVE_TO_ARCHIVE performed this pass; see §9 for archive candidates flagged to owner).

## 7. `.gitignore` update
Added `full-test-output.log`, `test-full-output.log`, `*-test-output.log` under a new "Generated test/vitest
console output logs" section so the removed generated logs are not re-committed. (`UPDATE_REFERENCE`.)

## 8. Files kept — canonical / test-entangled (not deleted despite matching a cleanup signal)
- **`OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_{LEDGER,DESKTOP,MOBILE_FULL}.run.json`** — committed **golden fixtures**.
  `gate-protection.test.ts` asserts each **exists** (`.not.toBeNull()`) and validates every scenario id. Deleting
  them fails the suite. They match `.gitignore` `*.run.json` but are test-consumed, not disposable.
- **14 other `OPSIQ_*_PACK.run.json` / corpus-audit `.run.json`** — each written by its
  `src/__tests__/scenarios/*-db.db.test.ts` and consumed by its `.github/workflows/*.yml` step within the same CI
  run. Entangled with live tests/workflows; kept.
- **Root evidence JSON read by live code** — `OPSIQ_AI_SUPERVISOR_INVENTORY.json`, `OPSIQ_EXPERT_BENCHMARK.json`,
  `OPSIQ_MAX_RELIABILITY_BASELINE.json`, `OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.json`, `shadow_read_*.json`,
  `ROUND_1_INTAKE_VALIDATION_RESULTS.json`, `ROUND_2_CASE_PACK_MANIFEST.json` — read at cwd by services,
  governance gates, tests, and `simulation_runner/*`. Kept.
- **`logs/runtime-harness/*`** — referenced by `scripts/phase-e-runtime-harness.sh` + workflow uploads. Kept.
- **All `docs/audits/*` current audit folders, `prisma/migrations/*`, `.github/workflows/*`, `src/__tests__/**`,
  `tests/**`, `e2e/**`, root runbooks/guides/README** — explicitly protected; untouched.

## 9. Files kept for owner review (5 — NEEDS_OWNER_REVIEW)
1. **`v8/` (277 tracked files)** — `.gitignore` declares `/v8` "not for production" yet the tree is tracked. Large
   gitignore/tracking inconsistency; bulk untrack/removal is out of scope for a safe pass. Owner decides archive vs untrack.
2. **`opsiq_claude_low_usage_pack_v2_checked.zip` + `opsiq_claude_low_usage_pack/`** — genesis bootstrap pack; the
   zip is a binary duplicate of the extracted dir but is referenced by historical `audit_artifacts/final_integration/*`.
3. **`OPSIQ_REAL_WORLD_CHAOS_REPLAY_SCENARIO_MANIFEST.json`** — 233 KB, zero references; likely archivable, but a
   large evidence manifest — owner should confirm archive vs delete.
4. **`OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_MOBILE.run.json`** — zero references; likely superseded by the `*_MOBILE_FULL`
   artifact (naming collision makes this easy to misjudge — not deleted).
5. **~30 empty `src/**/*.ts` stub files** (e.g. `src/api-handler.ts`, `src/db.ts`, `src/logger.ts`,
   `src/validation.ts`, `src/constants/*.ts`) — source, not audit/build artifacts; deletion could break imports and
   belongs in a dedicated source-hygiene review.

## 10. Cleanup ledger path
`docs/audits/2026-07-06-repo-cleanup/CLEANUP_LEDGER.json`

## 11. Commands run (all from clean install of deps via `npm ci`)
| Command | Result |
|---|---|
| `git status` / `git rev-parse HEAD` / `git log --oneline -n 20` | clean; HEAD `a5c2d929`; PR #147/#148/#149 present |
| `git rev-list --left-right --count origin/main...HEAD` | `0 0` (branch == origin/main) |
| reference inventory (`git grep` per candidate across code/workflows/docs) | complete; drove every keep/delete |
| `npx prisma validate` | **valid** |
| `npx prisma generate` | **Generated Prisma Client 7.8.0** |
| `npx tsc --noEmit` | **exit 0 (clean)** |
| `npm run governance:scan:strict` | **31 frozen / 31 matched / 0 new → exit 0** |
| `npm run lint:ratchet` | **LINT_RATCHET_PASS** (2104 err ≤ 2155 baseline; 0 changed files) |
| `npm run build` (`next build`) | **exit 0** (all routes compiled) |

## 12. Commands failed / blocked
None. (`npm ci` reported pre-existing audit vulnerabilities — unrelated to this pass, not introduced here.)

## 13. CI status
Verification run locally and green (see §11). No source or workflow files were modified, so CI behaviour is
unchanged by this pass; the removed files are not consumed by any CI job (the entangled `*.run.json` fixtures
were deliberately kept).

## 14. PR / merge status
Committed to `claude/opsiq-post-level3-hygiene-da04y4`. PR creation/merge is an owner action (see §2 note). No
merge to `main` performed by this agent.

## 15. Main HEAD after merge
Not merged by this agent. Post-PASS-17 branch HEAD is recorded in the final loop report.

## 16. Classification
**REPO_CLEANUP_PARTIAL_OWNER_REVIEW_REQUIRED** — every deletion is safe, zero-reference, and ledgered; no
canonical evidence, migration, test, workflow, or current audit report was touched; all verification passes.
`SAFE_COMPLETE` is deliberately **not** claimed because five real hygiene items (v8/ tracking inconsistency, the
genesis pack zip/dir duplicate, the orphaned manifest, the superseded mobile artifact, and ~30 empty src stubs)
require an owner decision and were intentionally left in place rather than removed on assumption.

## 17. Continuing to PASS 18?
**Yes.** Cleanup is safe and verified; PASS 18 (execution-first Level 3 hostile audit) proceeds on the same
fully-merged main state as sequential commits on this branch.
