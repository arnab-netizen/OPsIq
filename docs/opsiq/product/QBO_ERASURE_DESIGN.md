# QuickBooks / Intuit User Data — Governed Erasure (design and evidence)

Status: implemented on a draft branch, proven on a **disposable local PostgreSQL only**. Not executed against Production. Production QuickBooks stays disabled. Owner review of any user-facing legal text is required (`LEGAL_TEXT_CHANGE_REQUIRES_OWNER_REVIEW=YES`).

## Why
Intuit's developer terms require an app to stop processing when a user revokes consent or ends use, and — subject to legally required recordkeeping — to securely delete User Data on the user's request. OpsIQ deliberately makes its QuickBooks evidence tables append-only (`qbo_report_snapshots`, `qbo_canonical_provenance`, the owner decision and assessment tables). Ordinary operation must stay that way, so erasure is a **separate, governed escape hatch**, not a weakening of the guards.

## Two frozen contracts (`DISCONNECT_ERASURE_CONTRACT_SEPARATED=YES`)
| | Disconnect (existing, user-facing) | Erasure (this work, operator-run) |
|---|---|---|
| Stops processing | yes | yes (also disconnects first) |
| Revokes at Intuit | best effort | best effort; deletion proceeds if Intuit is unreachable |
| Token ciphertext | deleted | deleted |
| Imported history, provenance, derived diagnosis | **kept** | **deleted** |
| Who can trigger | the owner in the product | two operators, outside the product |

## Authorization boundary (enforced in the database, migration `20261025090000_qbo_governed_privacy_erasure`)
A DELETE on guarded evidence is allowed only when ALL hold: the session user is a member of role `opsiq_privacy_eraser` (NOLOGIN; granted to a separate operator login); transaction-local setting `opsiq.erasure_request_id` names a `privacy_erasure_requests` row; that row is `EXECUTING`, was approved by a **different** person (a CHECK constraint, not just application code) against a recorded manifest hash, and is for exactly the row's own workspace and business. UPDATE of provenance and observations stays impossible even when authorized. Only the two decision tables allow a scoped pointer detach. Superusers get no free pass without the request. The tombstone table forbids delete and reopening and stores counts only.

Operator flow: `request` -> `dry-run` (manifest hash, counts, blockers, confirmation token) -> `approve` (second operator; refused on drift or blockers) -> `execute` (token required; ONE transaction: revoke hook, lock, re-plan and compare manifest, claim, delete, scrub, verify, tombstone, commit; any failure rolls everything back) -> `verify`. There is no HTTP endpoint. The CLI reads `ERASURE_DATABASE_URL`, never `DATABASE_URL`, and refuses any database not named `opsiq_erasure_test*` unless `--production-authorization=<request id>` is passed.

## Data classification
- **DELETE** — `qbo_connections`, `qbo_connection_tokens`, `qbo_resource_locks`, `qbo_sync_state` (incl. webhook-pending marker and company name), `qbo_oauth_states`, `qbo_report_snapshots` (raw provider payloads), `qbo_canonical_provenance`; every Finance/Cashflow cycle, finding, action, verification and Finance outcome signal derived from affected snapshots; soft-linked derived rows: owner decision records, outcome assessments, action assignments, approval requests and evidences, self-evaluations, action outcomes, controlled-learning candidates (+ children), operating-memory entries, first-result interactions; pending `qbo-sync` scheduled tasks.
- **ANONYMIZE** — `audit_events` rows are kept (hash chain covers id|workspace|event|timestamp only, so it is unaffected); the `realmId` payload key is removed from `qbo.*` events.
- **SCRUB** — owner-amended Finance/Cashflow periods (see below).
- **RETAIN (legal / integrity)** — the erasure tombstone (ids, operator names, counts). External retention (Vercel logs, Sentry, provider backups, Neon history) is outside the database and follows each provider; it is not claimed to be erased.
- **NOT QBO DATA** — owner-entered snapshots, other tenants, businesses themselves.
- **BLOCKER (fail closed)** — a learning record promoted or admitted from QuickBooks-derived outcomes; an unrecognized Finance chain shape; and any reference to an erased id, realm id or company name found in a table the registry does not know (generic residue scan across every workspace-scoped table).

## Finance / Cashflow control (`QBO-controlled / owner-controlled / mixed`)
Finance: QuickBooks writes only revenue, cost of goods, receivables, overdue receivables, payables, overdue payables. A chain whose every version has provenance is QuickBooks-controlled and is deleted whole. After an owner amendment (a new version without provenance), authorship is read per field from the version's `changed_fields`: figures the owner re-stated are kept; every other QuickBooks figure and the import note are nulled; older versions are deleted; if nothing owner-authored remains the version is deleted too; data-confidence is recomputed. Unreadable lineage fails closed (QuickBooks figures removed). Cashflow: rows untouched since QuickBooks' last compare-and-set stamp are deleted; rows written since keep only non-QuickBooks columns (the five QuickBooks columns are nulled, conservatively including an owner edit of those same five). Periods the owner entered before QuickBooks have no provenance and are never touched.

## Preventing recreation (`QBO_ERASED_DATA_CAN_REAPPEAR_WITHOUT_NEW_OAUTH=NO`)
Erasure disconnects, deletes the connection, token, locks, sync state and pending tasks inside the same transaction. A stale webhook finds no connection and triggers nothing; the daily producer enqueues nothing; a task that still arrives for the deleted connection id is a no-op with zero provider calls (all proven in the hostile tests). New data requires a fresh OAuth connection.

## Evidence (disposable DB; `GOVERNED_PRIVACY_ERASURE=PASS`, `NORMAL_IMMUTABILITY_REMAINS_ENFORCED=YES`)
10 hostile database tests: full history + diagnosis + decision family erased with another tenant byte-identical and audit chain columns unchanged; disconnected business; owner-amended and manual-first periods; pending webhook/daily tasks and no reappearance; idempotency; unregistered-reference blocker; manifest drift; unauthorized attempts (wrong token, not approved, same-person, ordinary role forging the setting, wrong business, UPDATE, non-disposable target); ordinary Prisma and raw sessions still cannot delete or rewrite evidence (even a superuser naming a random request); standalone verifier FAIL before / PASS after. Static registry test fails if any new model with a foreign key into the QuickBooks/diagnosis family is not handled. 121 existing QBO / enforcement / append-only / owner-finance / owner-cashflow test files (1879 tests) pass.

Known gaps (honest): action outcomes and learning candidates need a client-account row and are exercised by plan queries and the registry, not by the DB test; a table-owner runtime credential can still alter triggers, so least-privilege roles are a Production prerequisite below; backups and provider logs are outside this tool.

## Production prerequisites (owner action — none done)
1. Apply the migration through the governed migration workflow; create role `opsiq_privacy_eraser` as an administrator (the migration fails closed if it cannot) and grant it only to a dedicated operator login, never to the application login.
2. Run the application with a least-privilege role that does not own the tables or triggers.
3. Keep `ERASURE_DATABASE_URL` out of Vercel; use it only from an operator machine.
4. Production execution needs separate explicit owner authorization per request.
5. Production QuickBooks remains disabled; no Production credentials or webhook verifier exist.
