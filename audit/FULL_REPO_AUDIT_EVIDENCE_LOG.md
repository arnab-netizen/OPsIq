# Audit Evidence Log

Audit commit: `fab9ecfff32515be93356d8d16d0f4b77d31d8d1` · branch `main` · tree clean at start.

## Commands Run
| Command | Exit | Result Summary |
|---|---|---|
| `git status --short` | 0 | clean (before audit-file creation) |
| `git branch --show-current` | 0 | `main` |
| `git rev-parse HEAD` | 0 | `fab9ecf...` |
| `git log --oneline -n 20` | 0 | PR #37/#38/#39 merges present (cd00877, 2dc42b5, fab9ecf) |
| `npx tsc --noEmit` | **0** | whole-repo typecheck clean |
| `npx prisma validate` | 0 | "schema is valid 🚀" (warns: driverAdapters preview deprecated) |
| `npx prisma migrate status` | n/a | **P1001 — DB unreachable** (Neon host); applied-state/drift UNVERIFIABLE locally |
| `npm run lint` (raw eslint) | n/a | **3415 problems: 2152 errors, 1263 warnings** repo-wide (CI uses lint-ratchet) |
| `npx vitest run` (full) | n/a | **time-boxed, did not complete in-session** (690 test files); suite-green rests on CI |
| 3-layer scoped vitest (prior) | 0 | 442 tests pass (domain 174 + collective 106 + remote-ops 162) |
| `find src/app -name route.ts \| wc -l` | 0 | 275 API routes |
| `grep -rln remote-operations/collective-training/domain-training src/app src/services src/engines` | 1 | **none** — new layers not referenced by runtime |
| `grep -rln locationId src/app src/services` | 0 | **0 files** — no multi-location runtime |
| `grep -cE '^model ' prisma/schema.prisma` | 0 | 170 models; none named Location/Site/Property |

## Files Inspected
| File | Why Inspected | Key Finding |
|---|---|---|
| `package.json` scripts | command discovery | vitest/lint/build/prisma scripts; `test:db` DB-gated; many per-module workflows |
| `src/app/api/owner/sales/dashboard/route.ts` | runtime wiring proof | `withCanonicalEnforcement(...requireCapabilities:[OWNER_VIEW],requireWorkspace:true)` → service; genuinely auth+workspace gated |
| `src/app/(authenticated)/owner/sales/page.tsx` | UI→API wiring | fetches `/api/owner/sales/dashboard`, `/api/owner/recovery/businesses`, snapshots/diagnoses — real UI path |
| `prisma/schema.prisma` | model inventory | 170 models, 77 migrations; only `location String?` (line 1354), no Location entity |
| `src/domain/` listing | module inventory | owner-finance/sales/operations/cashflow/marketing/sop/strategy/portfolio (runtime product) + domain-training/collective-training/remote-operations (logic library) |
| `src/domain/remote-operations/*` | new layer reality | 28 pure-logic modules; LocationScope is a TS type only; no persistence |
| `.github/workflows/` listing | CI coverage | 60+ workflows incl. per-module `*-runtime-proof.yml` (DB-gated) + `ci.yml` |
| `.github/workflows/ci.yml` (lines 109/126) | suite execution | `npx vitest run --maxWorkers 1` runs the unit suite (covers the 3 new layers as unit tests) |

## Tests Inspected
| Test File(s) | What It Claims | What It Actually Proves | Gap |
|---|---|---|---|
| `src/__tests__/domain/domain-training/*` (21 files) | F0–F15 + 24 domains trained, 504 scored cases | governed scoring logic correct in isolation | no runtime/DB/UI; not wired |
| `src/__tests__/domain/collective-training/*` (9 files) | command-and-control, 360 scored cases | `runCollective` packet logic correct in isolation | not invoked by any route/service |
| `src/__tests__/domain/remote-operations/*` (13 files, 162 tests) | remote/location ops governed | dispatch/proof/veto/state-machine rules correct in-memory | no persistence/concurrency-at-DB; no model/route/UI |
| `tests/owner-mode/real-world-*` (workflows exist) | owner real-world simulation | not reproduced in-session | DB/CI-gated |

## Workflows Inspected
| Workflow | What It Runs | Gap |
|---|---|---|
| `ci.yml` | vitest + lint(ratchet) + build + type + prisma verify | green even with unwired new layers + 2152 lint errors |
| `module-*-runtime-proof.yml` (×11) | per-function DB-backed runtime proof | DB-gated; pass-state not reproduced locally |
| `db-verification.yml`, `*-db-verification.yml` | `[db]` test lanes | require reachable Postgres (P1001 here) |
| `owner-real-world-simulation.yml`, `owner-real-world-smb-cases.yml` | owner simulations | not reproduced locally |

## Migrations / DB Inspected
| File/Command | Finding |
|---|---|
| `prisma/schema.prisma` | valid; 170 models; no Location entity; new layers add 0 models |
| `prisma/migrations` (77 dirs) | present; applied-state UNVERIFIABLE (P1001) |
| `npx prisma migrate status` | P1001 cannot reach Neon DB host |

## Unverified Areas
| Area | Why Unverified | Required Proof |
|---|---|---|
| All DB-backed persistence / isolation / drift | DB unreachable (P1001) in this env | reachable test DB + reproduce `migrate status` + `[db]` tests |
| Full repo test suite locally | 690 files, time-boxed run did not finish | longer window or documented CI run id |
| Per-module runtime-proof workflows pass-state | DB-gated, not run here | rerun in CI / staging |
| Runtime behavior of the 3 new layers | nothing imports them | wire one route + E2E (see NEXT_IMPLEMENTATION_ORDER) |
| Lint true-clean state | ratchet masks 2152 errors | full eslint zero-error pass |
