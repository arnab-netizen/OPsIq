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

## Classification of accounts (future metrics)
Every account created after 2026-11-20T00:00:00Z falls into exactly one class. Classification is by evidence, never by an email pattern alone.

| Class | Meaning | How it is established |
|---|---|---|
| CONFIRMED_INTERNAL_TEST | Owner, team or test account | Membership of the private exclusion record `channels/internal-testing-accounts`, or the owner's written confirmation |
| CONFIRMED_GENUINE_EXTERNAL | A real external business owner or agency | Owner-confirmed, or a verified email plus corroborating evidence (a real conversation, a company identified by the person, or a reply) |
| UNVERIFIED_OR_AMBIGUOUS | Not yet classifiable | Default for any new account until evidence exists; counts as NOT genuine for commercial reporting until reviewed |

Email patterns are review indicators only. A plus-addressed email (`name+tag@domain`), or an address containing a word such as `test` or `fixture`, is flagged for manual review and is never excluded automatically: many genuine external users sign up with plus-aliases or ordinary words in their address. Only the confirmed internal exclusion record (and the owner's confirmation) establishes internal status.

Commercial measures are counted separately and each only from CONFIRMED_GENUINE_EXTERNAL accounts:
- Genuine beta requests: beta requests submitted by a confirmed genuine external person. A registration is not required to have an associated beta request unless the actual registration process requires one; count each measure independently.
- Genuine external registrations: confirmed genuine external accounts, with a verified email.
- Activated external users: a confirmed genuine external user who completes a first governed diagnosis after registering (count distinct users, never events).
- Retention: a confirmed genuine external user with product activity on at least two different days at least seven days apart.
- Paying customers: confirmed genuine external accounts with a collected payment. Payment collection is currently DISABLED, so this is 0.
- Unverified or ambiguous accounts are reported as their own count and are excluded from all of the above until reviewed.

Review query (read-only, aggregate). It lists candidates for review and does not decide status: `select count(*) from users u where u.id::text not in (<confirmed internal ids>) and u.created_at > timestamp '2026-11-20 00:00:00'` gives accounts needing classification. Narrowing by email verification or by pattern flags may be reported as separate indicator counts, never as a genuine count. Individual identifiers stay in the private evidence store; this document holds aggregate figures only.
No migration or code is required (development is frozen); a database-level flag, if ever wanted, is a separate owner-authorized change.

## Corrected historical statements
Figures elsewhere that count users, beta requests, registrations or activations before 2026-11-20 (for example in `ACQUISITION_LEDGER.md` and the Session 7 funnel record in `MASTER_REMEDIATION_LEDGER.md`) are internal testing activity, not commercial evidence.

## Historical verification (2026-11-27 snapshot, read-only counts on the production database)
These figures are a dated snapshot and are not current live metrics. Re-run the aggregate review query for a current figure.

| Measure | Value |
|---|---|
| Users in total (all internal testing) | 10 |
| Beta requests in total (all internal testing) | 4 |
| Workspaces in total (all internal testing) | 10 |
| Users created after the 2026-11-20 baseline | 0 |
| Beta requests created after the 2026-11-20 baseline | 0 |
| Confirmed genuine external registrations, genuine beta requests, paying customers | 0, 0, 0 |
| Unverified or ambiguous accounts created after the baseline | 0 |

These counts were taken with aggregate queries only; no account was read, changed or deleted. Individual identifiers stay in the private store.
