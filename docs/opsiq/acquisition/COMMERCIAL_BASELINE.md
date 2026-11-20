# OpsIQ commercial baseline (reset 2026-11-20)

Authority: owner directive of 2026-11-20 confirming that ALL previous user accounts were created by the owner for testing. The runtime copy of the exclusion set is the Content Desk record `channels/internal-testing-accounts`; this file is the repository copy.

## Baseline
| Metric | Value |
|---|---|
| GENUINE_CUSTOMERS | 0 |
| GENUINE_CUSTOMER_ACTIVATIONS | 0 |
| GENUINE_CUSTOMER_RETENTION | 0 |
| CUSTOMER_MARKET_VALIDATION | NOT_ESTABLISHED |
| PRODUCT_MARKET_FIT | NOT_ESTABLISHED |
| PADDLE_ACTIVATION | DEFERRED |
| PAYMENT_COLLECTION | DISABLED |

Milestones: first genuine external business owner, then 10, 25, 50 and 100 genuine users. Internal testing is never counted as commercial success.

## Classification of existing data
All 10 user accounts, all 4 beta requests and all 10 workspaces that existed on 2026-11-20 are `INTERNAL_TESTING` for commercial reporting: excluded from acquisition, activation, retention and market-validation metrics. Nothing is deleted, restored, contacted or modified; audit records and history are untouched. The proposed existing-user feedback campaign is cancelled and no previous user is to be contacted.

Excluded user accounts: 10 (identifiers are held only in the private Content Desk record `channels/internal-testing-accounts`; they are deliberately not published here).
Excluded beta requests: 4 (identifiers held only in the same private record).

## Definition of a genuine external user (future metrics)
A user (with its workspace and beta request) that is not in the excluded sets, was created after 2026-11-20T00:00:00Z, whose email domain is not `opsiq.solutions`, is not a plus-alias of an owner address, is not an obvious test or fixture pattern, and whose email is verified. Anything ambiguous counts as NOT genuine until the owner confirms it.
- Activation: a genuine external user who completes a first governed diagnosis after registering (count distinct users, never events).
- Retention: a genuine external user with product activity on at least two different days at least seven days apart.
- Read-only count: `select count(*) from users u where u.id::text not in (<excluded ids>) and u.created_at > timestamp '2026-11-20 00:00:00' and u.email_verified_at is not null and u.email !~* '(@opsiq\.solutions$|\+|test|fixture|example\.com)'`.
No migration or code is required (development is frozen); a database-level flag, if ever wanted, is a separate owner-authorized change.

## Corrected historical statements
Figures elsewhere that count users, beta requests, registrations or activations before 2026-11-20 (for example in `ACQUISITION_LEDGER.md` and the Session 7 funnel record in `MASTER_REMEDIATION_LEDGER.md`) are internal testing activity, not commercial evidence.

## Verification (2026-11-27, read-only counts on the production database)
| Measure | Value |
|---|---|
| Users in total (all internal testing) | 10 |
| Beta requests in total (all internal testing) | 4 |
| Workspaces in total (all internal testing) | 10 |
| Users created after the 2026-11-20 baseline | 0 |
| Beta requests created after the 2026-11-20 baseline | 0 |
| Genuine external users, genuine beta requests, paying customers | 0, 0, 0 |

These counts were taken with aggregate queries only; no account was read, changed or deleted. Individual identifiers stay in the private store.
