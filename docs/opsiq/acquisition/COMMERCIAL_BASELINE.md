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

Excluded user ids: `ec150ea6-2f43-4630-96fe-76cc66f946d1`, `81509647-2d9e-4313-a996-3978087de1e0`, `d7d68026-83fa-429d-8002-93ffef2c19b3`, `7d9a1c60-08cd-4b00-a194-89c6948bc7da`, `247cc5d6-fc3e-4762-baf1-37e9bdac4b9b`, `9b4eb697-459c-466f-86b5-e23011bae3b3`, `0df08536-e22a-4d19-9521-bc2ff3c0bf80`, `f3820808-8b18-4647-b272-4ed23612f37f`, `02e9da83-969c-4cdb-a6f4-6443e36bdc23`, `3b856aa4-5713-4c91-960a-0d9ab7ed7683`.
Excluded beta request ids: `29fbbb47-b3ae-4c54-974f-be23d2c88346`, `ffba1d80-b419-4908-8e28-8915455feead`, `d2120aa0-1c86-464a-a692-6e4da84ca452`, `39a5e788-e4f0-4a13-bd3c-1799e6ef411e`.

## Definition of a genuine external user (future metrics)
A user (with its workspace and beta request) that is not in the excluded sets, was created after 2026-11-20T00:00:00Z, whose email domain is not `opsiq.solutions`, is not a plus-alias of an owner address, is not an obvious test or fixture pattern, and whose email is verified. Anything ambiguous counts as NOT genuine until the owner confirms it.
- Activation: a genuine external user who completes a first governed diagnosis after registering (count distinct users, never events).
- Retention: a genuine external user with product activity on at least two different days at least seven days apart.
- Read-only count: `select count(*) from users u where u.id::text not in (<excluded ids>) and u.created_at > timestamp '2026-11-20 00:00:00' and u.email_verified_at is not null and u.email !~* '(@opsiq\.solutions$|\+|test|fixture|example\.com)'`.
No migration or code is required (development is frozen); a database-level flag, if ever wanted, is a separate owner-authorized change.

## Corrected historical statements
Figures elsewhere that count users, beta requests, registrations or activations before 2026-11-20 (for example in `ACQUISITION_LEDGER.md` and the Session 7 funnel record in `MASTER_REMEDIATION_LEDGER.md`) are internal testing activity, not commercial evidence.
