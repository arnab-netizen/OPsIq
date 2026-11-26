# GSC ingestion credential provisioning (runbook, threat assessment, recovery)

Workflow: `.github/workflows/provision-gsc-ingestion-credential.yml` (dispatch-only, `production-operator`, main-only).
Script: `scripts/gsc-provision/provision.ts`. Audit: `scripts/gsc-provision/audit.sql`.
Target (verified inside the database before any write): Neon project `patient-lake-61323111`, branch `br-purple-boat-ayjn6zl6`,
endpoint `ep-empty-sky-ay1e6c27`, database `neondb`. Role `opsiq_gsc_ingestion`; table `public.search_console_metrics`;
GitHub environment `gsc-ingestion`; secret `GSC_INGESTION_DATABASE_URL`.

## Why this shape
- Neon's control plane accepts only **plaintext** passwords in `CREATE/ALTER ROLE ... PASSWORD` (a SCRAM verifier is rejected), so a trusted
  process that holds the privileged connection must generate the password. That process is this protected workflow.
- `GITHUB_TOKEN` cannot write environment secrets and no token is created, so the connection string leaves the process **only as a libsodium
  sealed box** to the pinned `gsc-ingestion` environment key. It is stored with the approved Composio action
  `GITHUB_CREATE_OR_UPDATE_AN_ENVIRONMENT_SECRET`; Composio never sees plaintext.

## State machine (recorded in the database as the role comment `GSCPROV1 {json}`)
```
(absent) --CREATE--> PROVISIONED (NOLOGIN) --ACTIVATE--> ACTIVATED (LOGIN) --DEACTIVATE--> DEACTIVATED (NOLOGIN)
PROVISIONED/DEACTIVATED (NOLOGIN) --RECOVER_NOLOGIN--> PROVISIONED (generation + 1)      RECOVER refuses any LOGIN role
```
The record holds `gen`, the CREATE/RECOVER `run` id, the exact commit `sha`, a 16-hex tag of the pinned-key digest, the sealed-artifact `art` sha256
(`PENDING` until sealed) and, once active, the activation run. **ACTIVATE is mechanically bound to this record**: it requires the supplied
`expected_run_id` and `expected_artifact_sha256` to equal the record, the record commit to equal the dispatched main SHA, and the key tag to equal
the pinned key. A recovery bumps the generation and replaces `run`/`art`, so any earlier artifact is refused (stale-artifact rejection).

## Recipient-key provenance (finding 1)
- `PINNED_KEY` (key id, public key, sha256 of `keyId\npublicKey`) is a constant in `provision.ts`, taken from GitHub's *get an environment public key*
  API through the approved Composio connection (fetched twice, 2026-11-26, identical) and checked by a unit test. There is **no key input**: the workflow has none,
  and any `GSC_ENV_PUBLIC_KEY`/`GSC_ENV_KEY_ID`/`GSC_PUBLIC_KEY`/`GSC_KEY_ID` in the environment is refused before any database contact or password generation.
- **Rotation** requires a reviewed PR that updates the key id, public key and digest together, and the rotation-checkpoint unit test. Before any CREATE/RECOVER, re-fetch the key through
  Composio and confirm it equals the pin (procedural). Mechanical backstop: GitHub rejects a write whose `key_id` is not the latest (HTTP 422, observed 2026-11-26), so a stale pin
  cannot silently store a secret. GitHub cannot tell whether a value was sealed to the *right* key under the right id, which is why the key is pinned in reviewed code.

## ACTIVATE failure handling (finding 2)
Neon honours transactional role DDL (tested 2026-11-26 on the existing disposable branch, PostgreSQL 18.7, same as production): `ALTER ROLE ... LOGIN` inside a failed
transaction rolls back; a committed one persists; `COMMENT ON ROLE` round-trips via `shobj_description`. ACTIVATE therefore runs in ONE transaction:
`BEGIN; ALTER ROLE LOGIN; COMMENT ...; <audit with login expected>; COMMIT` and commits only if the audit passes. Consequences:
| Failure | Outcome |
|---|---|
| Before BEGIN / any audit violation before activation | role stays NOLOGIN (nothing changed) |
| Exception or audit violation after `ALTER ... LOGIN` (before COMMIT) | ROLLBACK (or the server aborts the transaction when the connection dies); role NOLOGIN; a fresh connection verifies it |
| Connection killed / process SIGKILL before COMMIT | uncommitted transaction is aborted by PostgreSQL; role NOLOGIN (proved with real kills) |
| COMMIT sent but the response is lost | UNCERTAIN until observed: a fresh connection reads the role; LOGIN + passing audit + ACTIVATED record = verified active (exit 0); NOLOGIN = verified NOLOGIN (exit 1); LOGIN with a failing audit = exit 3, run DEACTIVATE; cannot connect = exit 3 UNCERTAIN |
| Unhandled error object | a last-resort handler prints a fixed, sanitized line and exits 3 (UNCERTAIN, run DRY_RUN) |
Limits: a process termination at or after COMMIT is **not** described as safe; it is UNCERTAIN until `DRY_RUN` reports the state. The audit runs inside the transaction, so
LOGIN is only ever committed after the audit passed; a concurrent out-of-band privilege change between audit and commit is not excluded (the concurrency group and the
ingestion workflow's own credential preflight are the remaining controls).

## Operator and role-creator membership (finding 3)
PostgreSQL 16+ gives a `CREATEROLE` (non-superuser) creator `ADMIN OPTION` on the role it creates, without `INHERIT` or `SET`. Production confirms the pattern: `neondb_owner`
(non-superuser, CREATEROLE, member of `neon_superuser`) holds `admin=true inherit=false set=false` on `opsiq_app`, `opsiq_privacy_eraser` and `qbo_sandbox_601_app`; the same was observed on a
role created via Neon SQL. That row is **legitimate and required for recovery** (`ALTER ROLE ... PASSWORD/LOGIN`, `COMMENT ON ROLE`). The audit allows exactly that row and flags anything else:
another member, the creator with `INHERIT` or `SET`, any membership of the role in another role, or `SET` grants held by the role. The audit also requires the operator to retain administration authority.
Note: because the creator has no `INHERIT`, it cannot run `DROP OWNED BY` for the role; fully removing the role needs explicit `REVOKE`s by the table/database owner first.

## DRY_RUN is fail-closed (finding 5)
Read-only (`default_transaction_read_only = on`). Exit 0 only for: `CREATE_READY` (absent), `ACTIVATE_READY` (NOLOGIN, record valid, artifact sealed, audit passes),
`RECOVER_CANDIDATE` (NOLOGIN, audit passes), `HEALTHY_ACTIVE` (LOGIN, record ACTIVATED, audit passes). Exit 1 for `UNEXPECTED_PRIVILEGES` and `UNKNOWN_STATE` (no valid record, login/record disagree, operator lacks capability, identity mismatch).

## Concurrency (finding 6)
The workflow joins the **existing** `migrate-production` concurrency group, already shared by `migrate-production.yml` and `reconcile-runtime-role.yml` ("production-writing database
operations never overlap"). A session advisory lock additionally refuses overlapping runs of this workflow only; it does **not** protect workflows that do not take it. Caveat inherited from GitHub:
only one run may be pending per group, so a queued run can be superseded by a newer queued run in the same group, as already applies to reconcile.

## Logging (finding 7), as verified on production (read-only `SHOW`/catalog queries, 2026-11-26)
`log_statement = none`, `log_min_error_statement = panic` (failed statements are not logged), `log_min_duration_statement = -1`, `pg_stat_statements` is **not installed** (extensions: `pgcrypto`, `plpgsql`),
so the `CREATE/ALTER ROLE ... PASSWORD` text is not retained by server logging or statement statistics. This corrects the earlier claim that a failing statement is logged. Unavoidable platform-side exposure:
Neon requires the plaintext password in the statement, so the Neon control plane / compute management path necessarily receives it over TLS; its access boundary is Neon's systems and staff. No global logging
setting is changed. On the runner: no password or URL in any input, argument, expression, tool argument, artifact or file (only the sealed ciphertext), fixed status tokens only, sanitized error codes, no shell tracing, `pg` has no
query logging, `.env` files removed, a final `rm -f` of the sealed file, and the connection string never touches the filesystem.

## Procedure (each step is its own `production-operator` approval)
1. `DRY_RUN` (expect `CREATE_READY`). 2. Re-fetch the key via Composio and confirm it equals the pin. 3. `CREATE` (phrase `CREATE GSC INGESTION ROLE`): record the printed `PROVISION_RUN_ID` and `SEALED_ARTIFACT_SHA256`.
4. Download the run's artifact (Composio `GITHUB_DOWNLOAD_AN_ARTIFACT`), verify `run_id`, `sha`, `key_sha256`, `key_id` and that sha256(`encrypted_value`) equals `sealed_sha256` and the printed digest; store `encrypted_value` via
`GITHUB_CREATE_OR_UPDATE_AN_ENVIRONMENT_SECRET`; verify secret metadata; delete the artifact (`GITHUB_DELETE_ARTIFACT`) and verify it is gone.
5. `DRY_RUN` (expect `ACTIVATE_READY`). 6. `ACTIVATE` with `expected_run_id` and `expected_artifact_sha256`. 7. Dispatch `scheduled-gsc-ingestion.yml`: its credential preflight authenticates as the restricted role and re-verifies least privilege
(**this is the final proof that the stored secret works**). If it fails: `DEACTIVATE`, then `RECOVER_NOLOGIN` and repeat from step 4.

## Controls: mechanical vs procedural (stated plainly)
Mechanical: pinned recipient key and refusal of any override; GitHub 422 on a stale `key_id`; ACTIVATE bound to the database record (run, artifact digest, commit, key tag); audit-before-commit in one transaction; RECOVER refusing LOGIN roles;
fail-closed DRY_RUN; sanitized output; `production-operator` reviewer approval and `main`-only branch policy; the shared concurrency group; main-only `gsc-ingestion` environment.
**Procedural (not unbypassable):** that the `encrypted_value` written as the secret is the artifact whose digest is passed to ACTIVATE; secret metadata (name and timestamps) proves existence only, never the value; the key re-fetch before CREATE;
artifact deletion after transfer. The only proof of the stored value is the restricted-role authentication in the ingestion preflight, which happens after ACTIVATE. A mistake there leaves an active login whose password exists only inside GitHub's sealed
storage (nobody, including operators, knows it); the fix is `DEACTIVATE` then `RECOVER_NOLOGIN`.

## Sealed-artifact hand-off: threat assessment (exception conditions)
Scope: CREATE and RECOVER_NOLOGIN only; libsodium sealed ciphertext to the pinned key; `run_id`, `sha`, `gen`, `key_id`, `key_sha256`, `sealed_sha256` only; `retention-days: 1`; deleted after a verified transfer.
| Risk | Assessment | Control |
|---|---|---|
| Confidentiality | Public repo, so the artifact is downloadable by signed-in users while retained; it is a sealed box only GitHub's private key opens | pinned key, no plaintext anywhere |
| Key substitution | A caller cannot choose the recipient key (no input, override refused); a stale key id is rejected by GitHub | pin + 422 |
| Artifact authenticity | A sealed box has no sender authentication; an outsider cannot add files to a run, and metadata is checked against the dispatched run, SHA and the database record | run/sha/digest checks, DB record |
| Replay / stale | Recovery bumps the generation and invalidates the earlier digest; ACTIVATE refuses mismatches | state machine |
| Cleanup / recovery | `always()` runner `rm`; 1-day expiry; explicit delete; failed transfer leaves a NOLOGIN role and `RECOVER_NOLOGIN` re-seals | see above |
| Outer encryption to an ephemeral key | adds no confidentiality, adds private-key handling | not used |
| Residual | plaintext password exists in one runner process and one TLS statement to Neon | accepted |

## Not covered
- Process termination at or after COMMIT is UNCERTAIN until observed. - Concurrent out-of-band role changes between audit and commit are not mechanically excluded.
- The workflow does not change any global production database setting, other roles, PUBLIC privileges, deployment settings or the release hold.
