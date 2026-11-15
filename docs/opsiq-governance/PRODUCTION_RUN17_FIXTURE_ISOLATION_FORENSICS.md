# Production acceptance run #17: fixture-isolation forensics

Run `40440177882` (workflow run number 17), 2026-10-27 02:44:26Z to 02:50:32Z, main `60fc97107db2e3ff160e74607c70072c263d634f`,
deployment `dpl_3N3YkMstjTAFHQ9JiZYTJjhio9dP`. 44 passed, 8 failed, 31 did not run.

**Verdict: FIXTURE_ISOLATION_DEFECT.** The live lane mutated an ordinary (non-fixture) Production business.
`REAL_OWNER_BUSINESS_MUTATIONS=0` reported after the first run was wrong and is withdrawn.

This document is evidence only. **No cleanup was performed or is authorised by it.**

## Root cause (code-traced and reproduced)

1. `resolveOrCreateDomainBusiness()` creates a hidden fixture business (`isFixtureBusiness=true`) through
   `/api/admin/acceptance-fixtures/businesses` and proves it is absent from `/api/owner/recovery/businesses`.
2. `listBusinesses()` (the source of `GET /api/owner/businesses`) returns only `isFixtureBusiness=false`.
3. `ActiveBusinessContext` builds its selectable list from that fixture-free endpoint.
4. The specs then opened `/owner/<domain>?businessId=<fixture>`. **No owner page reads `?businessId=`** (no
   `useSearchParams` in any domain page or in the context); the only URL-parameter reader is an unrelated first-run bar.
5. Every domain page mutates `selected` (Sales, Finance, Operations) or `activeBusinessId` (Strategy, Cashflow,
   Marketing, Recovery), both derived from the fixture-free list. A fixture can never be the UI's mutation target.
6. The governance suite stayed green because it proved only: `resolveOrCreateDomainBusiness` is called, the helper
   creates through the fixture route, no `page.request` mutation mentions `trinityBusinessId`, the shared Startup file
   is not read. None relates the thing that mutates to the fixture that was created.

Local reproduction (disposable Postgres, real Next app, real browser, a decoy ordinary business "QA D9 REAUDIT 1017G"):
the run #17 Sales spec passed `21-01..21-04`, failed `21-05` with the identical 20 s `waitForResponse` timeout, and left
the ordinary business with 14 domain rows and the freshly created Sales fixtures with 0.

## Mutation ledger: ordinary Production records touched by run #17

Source: Production runtime logs (`Auth pipeline started` records carry method and pathname). Target business id
`27abc1b9-b377-427d-a1a2-32881c2d4c99`. It is not any of the fixtures created in the run: the run created a separate
fixture per domain (five `POST /api/admin/acceptance-fixtures/businesses` observed), and the Sales diagnosis POST went
to `27abc1b9` while the spec was waiting for a response from its *own* fixture id, so the spec's `acceptanceBusinessId`
is not `27abc1b9`. On Owner Home at 02:45:59Z the active ordinary business rendered as "QA D9 REAUDIT 1017G"
(PROBABLE that this is `27abc1b9`; the same-session context default, not directly proven).

| # | Time (UTC) | Domain | Request to ordinary business | Evidence |
|---|---|---|---|---|
| 1 | 02:47:36.128 | Sales | `POST .../sales/businesses/27abc1b9.../snapshots` | request CONFIRMED |
| 2 | 02:47:37.036 | Sales | `POST .../sales/businesses/27abc1b9.../diagnoses` | request CONFIRMED |
| 3 | 02:48:12.871 | Operations | `POST .../operations/businesses/27abc1b9.../snapshots` | request CONFIRMED |
| 4 | 02:48:13.870 | Operations | `POST .../operations/businesses/27abc1b9.../diagnoses` | request CONFIRMED |
| 5 | 02:48:51.669 | Strategy | `POST .../strategy/businesses/27abc1b9.../snapshots` (scenario "Acceptance test: risky expansion") | request CONFIRMED |
| 6 | 02:49:27.117 | Cashflow | `POST .../cashflow/businesses/27abc1b9.../snapshots` | request CONFIRMED |
| 7 | 02:49:28.049 | Cashflow | `POST .../cashflow/businesses/27abc1b9.../diagnoses` | request CONFIRMED |
| 8 | 02:50:03.152 | Marketing | `POST .../marketing/businesses/27abc1b9.../snapshots` | request CONFIRMED |
| 9 | 02:50:04.085 | Marketing | `POST .../marketing/businesses/27abc1b9.../diagnoses` | request CONFIRMED |

Not performed (CONFIRMED by targeted log queries over the whole window): no Finance POST; no action `PATCH`/verify on any
business (the lifecycle tests never ran); no Strategy evaluation POST; no Recovery request; no Trinity request.

**Persisted effect.** The log records the request *start*, not the HTTP status, so:

- the five diagnosis POSTs create a cycle, findings and proposed actions on the ordinary business: PROBABLE (a diagnosis
  needs an existing snapshot; the page sends `dashboard.latestSnapshot.id`, which may predate this run);
- the five snapshot POSTs persisted a new snapshot: PROBABLE (status codes are in the sanitized
  `production-acceptance-evidence` network log, which this investigation could not download);
- the owner-visible effect (diagnosis findings and recommended next actions on "QA D9 REAUDIT 1017G"): UNPROVEN.

Incidental, not business data: the app's own `POST /api/owner/first-run/cockpit-visit` on every Owner Home load, session
rows, and append-only audit events.

Startup spec (10): every mutation was bound to the fixture session `a9771723-1ece-49a2-bb57-d03700dd628d`, created through
the fixture route (`PATCH` x10, `analysis`, `decision`, blueprint, `activate`). The hand-off business is a fixture. **No
ordinary Startup data was touched.** `13-06` failed because it looked for that hidden fixture's name on Owner Home, which
deliberately lists only ordinary businesses: a test defect (fixture visibility contract mismatch), not a product defect.

## Per-failure classification

| Test | Class | Cause |
|---|---|---|
| 10 `13-06` | TEST_DEFECT / FIXTURE_VISIBILITY_CONTRACT_MISMATCH | expected a hidden fixture on a fixture-free surface |
| 20 `01-05` | TEST_DEFECT caused by FIXTURE_TARGET_MISMATCH | the page showed an ordinary business, not the fixture; `+ Add financial snapshot` was not present for it |
| 21, 22, 24, 25 diagnosis waits | TEST_SYNCHRONIZATION_SYMPTOM_CAUSED_BY_FIXTURE_TARGET_MISMATCH | the POST went to `27abc1b9` while the test waited for its own fixture id; not latency |
| 23 evaluation wait | same class (PROBABLE) | no evaluation POST was observed |
| 26 `26-01` | ENVIRONMENT/INFRA: login limiter | 14 logins in about three minutes against a token bucket of 10 refilling one per 90 s |

Login attempts: spec 10 once; specs 20 to 25 twice each (initial `beforeAll` plus the re-run Playwright performs in a fresh
worker after a failed test); spec 26 once, refused with 429.

## What this change does

See `PRODUCTION_ACCEPTANCE_SAFE_LANE.md`, section "Mutation targeting and login". Summary: Option A. The Production UI is
read-only against ordinary businesses; every mutation is a governed API call that is refused unless every id in it is a
verified hidden fixture or an action proven to belong to it; the suite logs in once.

## Remediation of the ordinary data

Out of scope and **not** authorised. Safest path for the owner to decide: identify the exact rows by id and timestamp from
the table above, review the sanitized network log for status codes, and use a governed, audited, reversible mechanism
(archive/supersede with exact row identity and restoration proof). No direct Production deletes and no generic admin
deletion API.
