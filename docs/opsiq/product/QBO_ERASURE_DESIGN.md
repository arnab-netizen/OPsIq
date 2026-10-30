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
- **RETAIN (legal / integrity)** — the erasure tombstone (ids, operator names, counts). Recoverable copies outside the database (backups, Neon history and branches, operator exports) are NOT out of scope: each is a deletion domain of the global secure-delete boundary below, and an erasure is not complete until every one is handled. Metadata-only copies (Vercel logs, Sentry) hold no QBO User Data by design (allowlists and scrubbing) and follow each provider retention.
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

## Hostile review (PR #637 second pass)

Threat model: the runtime database credential (`DATABASE_URL`) is compromised.

**Current status update (2026-10-30, corrected):** current Production runtime identity is
verified as `opsiq_app` — see the "Current Production status" section at the top of
`docs/opsiq/product/RUNTIME_ROLE_CUTOVER.md` for the cited evidence (deployment ID, source SHA,
release-gate build-log lines, GitHub acceptance run, and re-queried 24h observation window). The
historical `neondb_owner`-runtime finding below therefore no longer describes the current
runtime login.

However, that evidence is narrower than the full erasure-bypass question. The Vercel build-time
release gate (`scripts/release/production-migration-gate.mjs`) proves only: the connection
authenticates as `opsiq_app` (both `current_user` and `session_user`); the role carries none of
`rolsuper` / `rolcreaterole` / `rolcreatedb` / `rolbypassrls` / `rolreplication`; it holds the
expected table-level grants; and it can perform one no-op write with a confirmed rollback. It
does **not** query table/function/schema ownership (`pg_class.relowner` or equivalent), and this
audit did not separately connect to Neon to check it either (`NEON_RUNTIME_ROLE_METADATA
=NOT_DIRECTLY_VERIFIED`). Therefore the stronger claim
`RUNTIME_DB_ROLE_CAN_BYPASS_ERASURE_GUARDS=NO` must not be inferred solely from the release-gate
result and is corrected to `RUNTIME_DB_ROLE_CAN_BYPASS_ERASURE_GUARDS=NOT_DIRECTLY_VERIFIED`. The
paragraph below is the original hostile-review finding, preserved as-written for historical
context; it described the state at the time of PR #637, before the cutover below was executed.

- RUNTIME_DB_ROLE_CAN_BYPASS_ERASURE_GUARDS=YES today. Production runs as `neondb_owner`, which owns every table and function and holds CREATEROLE and BYPASSRLS, so it can drop triggers, rewrite SECURITY DEFINER functions or edit the tombstone. The guards are only as strong as the role split below.
- Required topology: `neondb_owner` becomes migrator only (CI/operator). A SQL-created `opsiq_app` runtime role owns nothing and has DML only. At least two named operator logins are members of NOLOGIN `opsiq_privacy_eraser`. Roles must be created with SQL, never the Neon console/API (those inherit neon_superuser). Verify on a throwaway Neon project first, then switch the Vercel DATABASE_URL to opsiq_app and rotate the owner credentials. Drop the leftover `qbo_sandbox_601_app`. (Historical note: as of PR #637 this had not yet run against Production; it has since been applied — see the status update above.)
- DB-enforced authorisation: `qbo_erasure_authorized` is SECURITY DEFINER with pinned search_path. It needs session_user in the eraser role, the GUC `opsiq.erasure_request_id`, a request EXECUTING with `executing_xid` equal to the current transaction, an approver and manifest hash, and approver login different from requester login.
- LEAST_PRIVILEGE_ROLE_TEST=PASS on disposable PG 18 with a non-superuser schema owner.

### Derived data, authorship and revocation

- Every classified derived family has a direct DB fixture test (Finance, Cashflow, decisions, outcomes, approvals, learning, budget reassessments/plan snapshots/owner budget actions, soft links). A reference from an unregistered table is a BLOCKER (UNREGISTERED_REFERENCE).
- Mixed authorship: Finance is decided per field from changed_fields and fails closed; Cashflow fails closed on any QBO column of a row written after the last QuickBooks stamp. Owner-completed budget actions and promoted learning candidates block for manual review.
- Revocation policy B: the Intuit revoke runs before the erasing transaction, any outcome (REVOKED, ALREADY_INVALID, FAILED, SKIPPED, NOT_NEEDED) never blocks deletion, tokens are deleted inside the transaction, no retry loop exists because no token is kept, and only the outcome code is recorded in the tombstone.
- Tombstone minimisation: no realm id, company name, token or report value; counts and the revocation code only.

### External retention (what erasure does and does not reach)

| System | QBO data can enter | Retention | Deletion control | Intuit user data impact |
| --- | --- | --- | --- | --- |
| Neon primary DB | YES | until erased | this erasure | removed by erasure |
| Neon PITR / branches | YES | plan dependent (see backup runbook) | none; expires | persists until the window ends; a restore must re-run erasure |
| GitHub Actions pg_dump artifacts (scheduled-backup.yml) | YES | 35 days (backup), 14 days (secondary artifact) | none per request; expires | persists up to 35 days; owner decision: exclude QBO tables with --exclude-table-data, or accept and disclose |
| Vercel runtime logs | NO row data (ids and counts only) | Vercel plan retention | log retention | none by design |
| Sentry | NO by design (scrubbed, redacted) | Sentry plan | project retention | residual risk: raw exception text |
| Resend | NO | n/a | n/a | none |
| Paddle | NO | n/a | n/a | none |
| Clarity / Vercel Analytics | NO (public pages only, allowlists) | n/a | n/a | none |
| AI providers | NO (structural exclusion, and no Production AI key) | n/a | n/a | none |
| Console logs | NO (tested) | n/a | n/a | none |
| User exports | to the user only | user's control | n/a | n/a |

A bounded backup window is not secure deletion. Until every domain in the global secure-delete boundary below is handled, the tool reports DATABASE_ERASURE=PASS with GLOBAL_SECURE_DELETE=INCOMPLETE, which is not total erasure success. This supersedes any earlier wording that treated backups as outside the tool.

### Data-sale boundary

Code-level verdict: no path sends QuickBooks-derived data to analytics, advertising, replay, mail, billing or AI services (tests in qbo-data-sale-boundary.test.ts). The exact Intuit data-sale clause text could not be retrieved programmatically, so the owner must confirm the clause and vendor contracts before the public statement is made.

## Global secure-delete boundary (infrastructure pass)

Intuit's Developer Terms define "Securely Delete" as permanent sanitisation so that the data is unrecoverable from any and all media. Backup and recovery copies are therefore a compliance gate for Production QuickBooks enablement, not a privacy-policy disclosure. The compliance boundary is: live database, recoverable backups, point-in-time history, branches, and any operator-made copy that contains QuickBooks / Intuit User Data. Metadata-only copies are not User Data.

Result vocabulary (printed by the erasure tool, `execute` and `verify`):

- `DATABASE_ERASURE=PASS|FAIL` is the structural proof of the live database only.
- `GLOBAL_SECURE_DELETE=COMPLETE|INCOMPLETE` is COMPLETE only when the database passed AND every external domain is attested. `DATABASE_ERASURE=PASS` with `GLOBAL_SECURE_DELETE=INCOMPLETE` must never be reported as total erasure success. `verify` exits 2 while incomplete.
- `PENDING_DELETION_DOMAINS` names what is still open. An attestation that predates the database erasure, is not an ISO timestamp, or is in the future is rejected (`deletion-domains.ts`).

| Domain | Copy | Holds QBO User Data once QBO is live | How it is deleted | Evidence |
|---|---|---|---|---|
| DATABASE | Neon production branch | yes | governed erasure transaction | tool (`DATABASE_ERASURE`) |
| GITHUB_BACKUP_ARTIFACTS | full `pg_dump` of the whole database, uploaded daily, 35 day retention | yes (whole database, including derived Finance/Cashflow/budget values, which cannot be excluded without dropping the owner's own data from recovery) | delete the whole artifact set, then take a fresh backup: `scripts/privacy/purge-backup-artifacts.ts` (refuses while a backup run is queued or in progress; selection is by name, never by date) | `--attest-github-backup-artifacts` |
| NEON_HISTORY_WINDOW | point-in-time history | yes | not row-purgeable; leaves only when the window elapses (documented maximum 6 hours on the Free plan, 7 days Launch, 30 days Scale, configurable down, 0 disables it); no restore or branch from a pre-erasure point during the window | `--attest-neon-history-window`, accepted only at or after erasure time plus the window |
| NEON_BRANCHES | branches created from a pre-erasure point | yes if created while QBO data existed | delete (or recreate from a post-erasure point) | `--attest-neon-branches` |
| OPERATOR_EXPORTS | any dump, export or restore copy an operator made | yes | operator deletes; none are created by automation | `--attest-operator-exports` |

Branch policy (`NEON_BRANCH_ERASURE_POLICY`): while Production holds QuickBooks data, branches from Production are limited to schema-only branches, or data-bearing branches that expire (branch TTL) within the history window and are listed. Any data-bearing branch that exists at erasure time is deleted or recreated before NEON_BRANCHES is attested. A branch never propagates a later erasure: it is an independent copy.

Crypto-erasure (per-connection data-encryption key destroyed on erasure) was evaluated and is not required for V1. Reasons: canonical Finance and Cashflow values are indexed, aggregated and mixed with owner-authored fields, so payload encryption would break SQL aggregation and provenance joins; derived analyses, decisions and budget values would still hold plaintext QuickBooks-derived figures, so it would not cover them without re-architecting them too; and nothing verified says Intuit regards unrecoverable ciphertext as Securely Deleted. The bounded, deterministic controls above cover the same copies. Revisit only if backup retention can no longer be bounded (for example a long history window).

Production enablement gate (all must hold before any Production QuickBooks credential is added): the runtime login holds no ownership and cannot bypass the guards (role cutover, `RUNTIME_ROLE_LEAST_PRIVILEGE=PASS` on Production); the backup artifact purge control is adopted and rehearsed; the Neon plan and history window are decided and the branch policy is followed; written processor terms are confirmed for every processor that receives QuickBooks User Data (Neon, Vercel; GitHub for backup artifacts); and the Privacy Policy deletion wording is deployed only after these hold.


## Owner decisions in principle (backup and recovery copies)

These decisions are recorded here so the design matches the enablement gate. They do not authorize any Production change by themselves.

- GitHub whole-database backups are prohibited while Production QuickBooks is enabled (Option B). A `qbo_*`-only exclusion is not sufficient, because Intuit-derived values also sit in `audit_events.payload`, snapshots, diagnoses, decisions and budgets. The GitHub backup artifact row above is therefore a domain that must be empty (`QBO_CONTAINING_GITHUB_ARTIFACTS=0`) before the first connection. The fail-closed gate is delivered separately (PR #642).
- Neon history retention target is 0 seconds for Production. Until it is set and verified (API reports 0, point-in-time restore to a pre-change timestamp is refused), the history window stays a deletion domain and `GLOBAL_SECURE_DELETE` stays INCOMPLETE.
- No Production Neon branch or snapshot may contain QuickBooks data that has been erased. Branches and snapshots remain deletion domains in the verifier.
- `GLOBAL_SECURE_DELETE` is INCOMPLETE until every domain attests clean; a database-only erasure is never reported as complete.
- The least-privilege runtime role (`opsiq_app`, not an owner, no DDL, read-only migration ledger, no access to the erasure ledger) is mandatory before the first QuickBooks connection. The Production cutover is a separate, owner-approved, witnessed change.
