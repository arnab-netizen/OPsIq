# Phase 6B — Security dependency remediation (4 High vulnerabilities)

**Date:** 2026-07-09
**Branch:** `claude/phase-6b-security-dependency-remediation` (from `main` @ `c1efc0f`)
**Type:** Dependency remediation only. No product feature code, no schema, no secrets, no production migration.

Remediates the 4 High vulnerabilities that the now-truthful Security Baseline gate (PR #210) correctly blocks
on, so that gate can pass honestly.

## 1. Starting vulnerabilities (main @ c1efc0f)

`npm audit`: **0 critical, 4 high, 8 moderate, 2 low (14 total)**. The 4 highs:

| package | how pulled in | severity | advisory |
|---|---|---|---|
| `next` | direct dependency | high | DoS via Server Components; App Router middleware/proxy bypass |
| `hono` | transitive (prisma → @prisma/dev → @hono/node-server / hono) | high | path traversal in `serve-static` on Windows (`%5C`) |
| `undici` | transitive (jsdom → undici) | high | TLS cert validation bypass (SOCKS5 ProxyAgent); Set-Cookie header injection |
| `vite` | transitive (vitest → @vitest/mocker → vite) | high | `server.fs.deny` bypass on Windows alternate paths |

## 2. Packages updated

- `next` (direct dependency) — bumped.
- `eslint-config-next` (devDependency, versioned in lockstep with `next`) — bumped to match and avoid a peer mismatch.
- `undici`, `vite`, `hono` (transitive) — pinned to patched versions via a new `overrides` block.

## 3–4. Old → new versions

| package | old | new | kind |
|---|---|---|---|
| `next` | `16.2.3` | `16.2.10` | patch (non-major); direct |
| `eslint-config-next` | `16.2.3` | `16.2.10` | patch; devDep (paired with next) |
| `undici` | `7.25.0` | `7.28.0` | patch/minor within v7; via `overrides` |
| `vite` | `8.0.14` | `8.1.4` | minor within v8; via `overrides` |
| `hono` | `4.12.22` | `4.12.28` | patch within v4; via `overrides` |

## 5. Why these versions are minimal and safe

- Every fix stays **within the same major version** (no major bumps) — `isSemVerMajor: false` for `next`;
  undici v7→v7, vite v8→v8, hono v4→v4. This is the smallest change that clears the advisories.
- `next@16.2.10` is the exact `fixAvailable` version npm reports for the `next` high advisories.
- `undici`/`vite`/`hono` are **dev/test tooling only** (jsdom test env, vitest runner, prisma dev tooling) —
  none ship in the Next.js production bundle — so pinning them via `overrides` carries no production-runtime
  risk. `next` is the only production-runtime bump, and it is a patch-level release.
- Patched versions are exactly the lowest available that satisfy each advisory's fixed range
  (undici `>=7.28.0`, vite `>8.0.15`, hono `>=4.12.25`), pinned to the current latest in-major release
  (7.28.0 / 8.1.4 / 4.12.28).

## 6. Lockfile changes

`package-lock.json`: **+182 / −148** (~18 packages changed) — `next@16.2.10` and its lockstep `@next/*`
internal packages, `eslint-config-next`, and the three overridden transitive packages plus dedupes. No
unrelated packages were upgraded; churn is confined to what these four advisories require.

## 7. Audit result after remediation

`npm audit`: **0 critical, 0 high, 10 moderate, 2 low (12 total)**. **All 4 highs resolved.** Remaining are
non-blocking under the Phase 6B baseline policy (block critical/high; report moderate/low). The moderate count
moved 8→10 only because two advisories previously subsumed under the `next` **high** entry now surface as
moderate (`next`, `@sentry/nextjs`); no new high/critical introduced.

## 8. Validation commands

```
npm install                       # exit 0; lockfile synced; "changed 18 packages"
npm audit                         # 0 critical, 0 high (12 = 10 moderate + 2 low)
npx tsc --noEmit                  # exit 0
NODE_OPTIONS=--max-old-space-size=4096 npm run build   # next build exit 0 (all routes compiled)
npm run lint:ratchet              # PASS (errors 2081 == pre-change; changed_file_lint_errors 0)
node -e verify hono/undici/vite   # hono 4.12.28, undici 7.28.0, vite 8.1.4
```

## 9. Compatibility issues found/fixed

None. `next@16.2.10` is a patch release; `tsc --noEmit` and `next build` both pass with no source changes.
`eslint-config-next` was bumped in lockstep so the lint config matches `next` (lint:ratchet unchanged). The
three transitive overrides are test/dev tooling and required no code changes.

## 10. Rollback plan

Revert `package.json` (restore `next`/`eslint-config-next` to `16.2.3`, remove the `overrides` block) and
`package-lock.json` (or `git revert` the merge commit), then `npm install`. Reverting reintroduces the 4 high
vulnerabilities, so it is not recommended.

## 11. Next step

After this PR merges and main is green: rebase/update **PR #210** onto the remediated main, re-run the
`security-baseline-check.mjs` parser (now expected to pass honestly — 0 critical/high), confirm required gates
green, then merge PR #210 so the truthful Security Baseline gate is live and passing.
