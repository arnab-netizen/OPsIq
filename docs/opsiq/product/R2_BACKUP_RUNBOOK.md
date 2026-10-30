# Private, encrypted Production backup (Cloudflare R2) — runbook

Status: DRAFT, branch-only. Stacked on PR #642 (`claude/qbo-backup-gate`), itself unmerged.
Nothing in this document or the code it describes has been provisioned, enabled, or run against
Production. `FIRST_LIVE_BACKUP_AUTHORIZED=NO`.

## What this replaces

`scheduled-backup.yml` (whole-database `pg_dump` → gzip → GitHub Actions artifact) is
`disabled_manually` and stays that way. This runbook's workflows
(`scheduled-backup-r2.yml`, `restore-rehearsal-r2.yml`) are a **new, separate** backup path:
Production Neon → `pg_dump` → `gzip` → **client-side `age` encryption** → private Cloudflare R2
bucket. GitHub never receives the dump payload in any form (no artifact, no release, no repo
file, no log).

## Design summary (see the scripts/workflows themselves for full detail)

- `scripts/backup-qbo-gate.sh` (from #642, called unmodified) runs **first**. Uncertain = block,
  always, before `pg_dump` or anything downstream even starts.
- `scripts/backup-database-r2.sh`: `pg_dump | gzip | age` streamed directly to the final encrypted
  file (`opsiq_backup_<timestamp>_<unique-suffix>.sql.gz.age`, where `<unique-suffix>` is
  `GITHUB_RUN_ID` when present, else a random hex value — never customer data, a DB host/username,
  or a secret, and always present so two runs starting in the same second cannot collide); no
  plaintext SQL and no unencrypted gzip ever touch disk. SHA-256 over the encrypted object.
  Uploads the encrypted object + checksum + a non-sensitive manifest to R2 using
  `aws s3api put-object --if-none-match '*'` (Cloudflare-confirmed conditional-write support —
  create-once, overwrite-proof: a second write to an existing key is rejected by R2 itself with
  `412 PreconditionFailed`, not by a racy check in this script). Verifies the upload via `HEAD`
  only, for all three objects including the manifest (never downloads to verify). Secure
  `mktemp -d` workdir with an `EXIT` trap that removes everything, on success, on failure, or on
  cancellation.
- `scripts/restore-database-r2.sh`: R2 download → checksum verification (of the ciphertext as
  downloaded) → `age` decrypt → hands off to the **existing, unmodified**
  `scripts/restore-database.sh`, whose own `assert-restore-target.mjs` preflight is the single
  authoritative target check (refuses anything but a proven local-loopback or approved-staging
  target; this script does not duplicate or weaken it).
- Two independent GitHub Environments (designed here, **not created by this PR**):
  - `backup-write`: Production DB backup credential, R2 **Object Read & Write** token scoped to
    one bucket, the **AGE PUBLIC recipient**, and `MANIFEST_SIGNING_KEY` (manifest HMAC signing).
    Never holds the AGE private identity, the bucket-configuration (Bucket Lock) credential, or
    `ERASURE_LEDGER_SIGNING_KEY` — the scheduled writer can never decrypt anything it has ever
    uploaded, edit the Bucket Lock, or forge an erasure-ledger record.
  - `backup-recovery`: AGE **PRIVATE** identity and an R2 **read-only** credential. Designed to
    require manual reviewer approval before a job in this environment runs.
- A 7-day **Bucket Lock** on the `backups/` prefix (owner-decided, `BUCKET_LOCK_DECISION=USE` —
  see below) sits underneath the unchanged 35-day lifecycle: the most recent 7 days of backups are
  immutable against the writer credential, in addition to the create-once overwrite protection
  above. Configured and verified entirely outside any GitHub Environment (see the provisioning
  steps below) — never via a credential this repo's CI ever holds.
- A **post-backup erasure ledger** (`erasure-ledger/` prefix, separate credential and signing key
  from `backup-write`; `src/services/privacy-erasure/erasure-ledger.ts`,
  `scripts/privacy/append-erasure-ledger.ts`/`verify-erasure-ledger.ts`) records every erasure
  event outside the database and outside any backup, so a future restore of an older backup can
  know which erasures happened after it.
- No `schedule:` trigger yet on either new workflow — `workflow_dispatch` only, until the owner
  provisioning steps below are complete and a supervised first backup + restore rehearsal has
  passed.

## Owner provisioning steps (not done by this PR — exact order)

No step below has been executed. This is a code/proof mission only.

1. **Create the private R2 bucket.** Cloudflare dashboard → R2 → Create bucket. Leave it private
   (the default): no `r2.dev` public URL, no custom public domain, no anonymous access.
2. **Verify public access is disabled.** Bucket → Settings → confirm "Public Access" is off and no
   custom domain is attached.
3. **Configure the 35-day lifecycle rule** (`TOTAL_RETENTION_DAYS=35`, unchanged): expire objects
   after 35 days, and expire incomplete multipart uploads promptly. Scope the rule to the shared
   `backups/` prefix (not to a single suffix): the encrypted backup (`.sql.gz.age`), its checksum
   sidecar (`.sha256`), and the manifest (`.manifest.json`) all share that one prefix, so a single
   prefix-scoped rule covers all three with no orphaned object type.
   `RETENTION_SCOPE_ALL_BACKUP_OBJECTS=YES` by construction. Do **not** scope this rule to
   `erasure-ledger/` (step 8) — that prefix is governance infrastructure, not backup payload, and
   is not subject to this 35-day decision.
4. **Configure BOTH Bucket Lock rules**, exactly as declared in `scripts/r2-bucket-lock-config.json`:
   (a) `BUCKET_LOCK_DECISION=USE`, owner-decided: id `backups-7day-immutability-window`, prefix
   `backups/`, Age condition, `maxAgeSeconds: 604800`; (b) id
   `erasure-ledger-indefinite-immutability`, prefix `erasure-ledger/`, **Indefinite** condition
   (never expires) — this second rule closes a real gap found during review: without it, a
   credential holding only `erasure-ledger/` write/delete access could silently delete the most
   recent ledger record(s), and the remaining chain would still validate as clean. Use a
   Cloudflare API token (or the dashboard) with bucket-configuration-edit permission — never an
   S3-compatible object token, and never a credential later placed in `backup-write`,
   `backup-recovery`, or wherever the erasure-ledger tools run (step 8 below).
5. **Independently verify both locks**, before relying on either, using a *separate*
   bucket-configuration-**read** credential (ideally distinct from the edit credential used in
   step 4) and `scripts/verify-r2-bucket-lock-config.ts` (`CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET` env vars) — run from the owner's own machine, **never**
   from CI. Confirm `BUCKET_LOCK_DRIFT_DETECTION` reports no drift against the as-code file.
6. **Create the writer and recovery R2 API tokens**: a bucket-scoped "Object Read & Write" token
   for `backup-write` (record Access Key ID / Secret Access Key and the R2 S3-compatible endpoint,
   `https://<account-id>.r2.cloudflarestorage.com`), and a **separate**, bucket-scoped
   "Object Read only" token for `backup-recovery`. Neither is the bucket-configuration token from
   step 4/5 — the S3-compatible object API cannot reach the bucket-configuration REST API at all
   (`WRITER_CAN_EDIT_BUCKET_LOCK=NO`, structurally).
7. **Generate an `age` keypair offline** (e.g. `age-keygen -o production-backup-identity.key`), on
   a machine that is not this CI system. Record the public recipient line it prints (`age1...`) —
   this is **not secret**.
8. **Create the erasure-ledger trust material**: generate `ERASURE_LEDGER_SIGNING_KEY` (32+
   random characters, e.g. `openssl rand -hex 32`) and a **separate**, bucket-scoped
   "Object Read & Write" R2 token for `ERASURE_LEDGER_ACCESS_KEY_ID`/`ERASURE_LEDGER_SECRET_ACCESS_KEY`
   — distinct from `backup-write`'s token (see `scripts/privacy/append-erasure-ledger.ts`). The
   ledger lives under the `erasure-ledger/` prefix of the **same** bucket (a separate bucket is
   also acceptable and gives stronger isolation, since R2 tokens are bucket-scoped, not
   prefix-scoped — this is a genuine, documented limitation, not an oversight; see the closure
   doc's failure model).
9. **Verify credential separation** before storing anything: `MANIFEST_SIGNING_KEY` (backup
   manifest signing, #647), `ERASURE_LEDGER_SIGNING_KEY` (step 8), the writer R2 token, the
   recovery R2 token, and the erasure-ledger R2 token must be five genuinely distinct secret
   values — confirm none were accidentally reused before proceeding. Store: `backup-write` gets
   secret `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, secret `MANIFEST_SIGNING_KEY`, variable
   `R2_ENDPOINT`, variable `R2_BUCKET`, variable `AGE_RECIPIENT` (reuse the existing repo secret
   `PRODUCTION_DATABASE_URL` for the DB credential — no new DB secret is needed). `backup-recovery`
   gets secret `AGE_PRIVATE_IDENTITY`, secret `R2_READONLY_ACCESS_KEY_ID`/`R2_READONLY_SECRET_ACCESS_KEY`,
   plus the same `R2_ENDPOINT`/`R2_BUCKET` variables. `ERASURE_LEDGER_SIGNING_KEY` and the
   erasure-ledger R2 token are stored only where the owner runs `append-erasure-ledger.ts`/
   `verify-erasure-ledger.ts` — **never** in `backup-write` or `backup-recovery`.
10. **Execute a supervised first backup**: manually dispatch `scheduled-backup-r2.yml` and watch
    it run. Confirm the Summary step's printed object name, and confirm in the Cloudflare
    dashboard that exactly one new object (plus its checksum and manifest) exists in the bucket.
11. **Execute a supervised restore rehearsal**: manually dispatch `restore-rehearsal-r2.yml` with
    that object's name, approve the `backup-recovery` environment gate when prompted, and confirm
    it passes.
12. **Hostile delete/overwrite test against a disposable, non-Production object, while locked, if
    safe to do so**: upload a throwaway test object under `backups/` (not a real backup), confirm
    it is immediately locked, and confirm a direct delete/overwrite attempt against it with the
    writer token fails with `ObjectLockedByBucketPolicy` — proving `LOCKED_DELETE_REFUSED`/
    `LOCKED_OVERWRITE_REFUSED` against the real provider, not only the fake-provider simulation in
    this repo's tests. Delete the throwaway object only after its own lock expires (do not attempt
    to force it).
13. **Verify lock drift** once more after steps 10-12 (re-run `verify-r2-bucket-lock-config.ts`) —
    confirm nothing in the rehearsal/hostile-test steps altered the live configuration.
14. **Only then**, in a separate, owner-authorized change, consider adding a `schedule:` trigger to
    `scheduled-backup-r2.yml` (same cadence as the disabled workflow, `17 6 * * *`, or a cadence
    the owner chooses) to re-enable automated backups.

Every step above requires owner action; this PR/mission executes none of them (`PROVIDER_BUCKET_LOCK_CONFIGURED=NO`,
`R2_RESOURCES_CREATED=NO`).

## Bucket Lock decision: USE, 7-day window (owner decision — supersedes the history below)

**Current state, authoritative:** `BUCKET_LOCK_DECISION=USE`, `BUCKET_LOCK_PREFIX=backups/`,
`BUCKET_LOCK_MAX_AGE_SECONDS=604800` (7 days), layered under the unchanged 35-day ordinary
lifecycle (step 4 above). Full reasoning, the prior `DO_NOT_USE` analysis this reconciles with
(not silently reverses), the residual risk the owner has explicitly accepted, and the full
provider-fact citations live in
`docs/opsiq/product/R2_BACKUP_AVAILABILITY_ERASURE_CLOSURE.md` (sections 1-3) — this section only
states the current decision so this runbook never contradicts it. **Do not re-derive or restate
the Bucket Lock decision anywhere else; treat the closure doc as the single source of truth and
link to it.**

Two earlier analyses are kept below **only as historical record**, each now superseded:

<details>
<summary>Historical: original "why no Bucket Lock" rationale (#647) — superseded</summary>

OpsIQ's Intuit secure-delete model (`docs/opsiq/product/QBO_ERASURE_DESIGN.md`) may require a
recoverable copy — including a backup — to be deletable early, as part of an erasure incident or
the governed erasure process's own backup-domain attestation. A retention lock that prevents
deletion before its own expiry would make that secure deletion step impossible to complete until
the lock expires, which is incompatible with "uncertain = block" for privacy requests. Ordinary
lifecycle-based expiry (step 3 above) achieves the retention goal (35 days) without that conflict.

*(Superseded: the R2_BACKUPS structural proof — a correctly-functioning #642 gate makes an R2
backup structurally incapable of containing QBO data — removes the normal-case version of this
conflict; see the closure doc for the residual edge case the owner has now explicitly accepted.)*
</details>

<details>
<summary>Historical: "re-evaluated" DO_NOT_USE analysis (prior R2 hardening pass) — superseded</summary>

`BUCKET_LOCK_DECISION=DO_NOT_USE` was the conclusion of a re-check against Cloudflare's Bucket
Lock documentation: locks have no admin-bypass or early-release path once active, which strengthens
rather than weakens the original conflict with "uncertain = block" governed erasure. Five
sub-questions (A-E) were reasoned through; (C) a lock conflicts with QBO erasure attestation if
ever needed (e.g. the gate being bypassed); (D) a shorter lock does not cleanly resolve this,
only shrinks the window.

*(Superseded: the owner has since reviewed this exact analysis — including the gate-bypass
residual risk named in (C)/(D) — and explicitly chosen to accept a bounded 7-day version of it in
exchange for real ransomware/credential-theft protection. See the closure doc section 3 for the
full, reconciled reasoning.)*
</details>

## Threat model: writer-credential compromise (partially resolved — see closure doc)

`WRITER_CREDENTIAL_COMPROMISE_CAN_DELETE=NO, for backups younger than 7 days` (protected by the
now-decided Bucket Lock) `; YES, for backups 7-35 days old` (retained by lifecycle but no longer
lock-protected — stated honestly, not overclaimed). Cloudflare's R2 API token permission tiers are
only "Object Read & Write" and "Object Read only"; there is still no write-without-delete tier, so
this remains the mechanism by which a compromised writer credential could delete an unlocked
object.

`WRITER_CREDENTIAL_COMPROMISE_CAN_OVERWRITE=NO`, unconditionally: the create-once upload mechanism
(`aws s3api put-object --if-none-match '*'`, see `backup-database-r2.sh`) makes R2 itself reject
any write to an already-existing key with `412 PreconditionFailed`, independent of the Bucket Lock
decision.

`BACKUP_AVAILABILITY_PROTECTION=PASS` (for the 7-day immutable window; **not** for the full 35-day
retention — see the closure doc's failure-model table for every compromise scenario Bucket Lock
does and does not protect against, including administrative compromise, which no token-tier
change or lock can ever cover).

## R2 endpoint policy

`R2_ENDPOINT_POLICY=DEFAULT_ONLY`. Cloudflare documents jurisdiction-specific endpoints
(`https://<account-id>.eu.r2.cloudflarestorage.com`, `...fedramp...`) for EU and FedRAMP data
residency, immutable once a bucket is created. OpsIQ has no stated data-residency requirement in
any existing doc, and FedRAMP access additionally requires an Enterprise Cloudflare plan this repo
has no evidence of. The scripts' existing `R2_ENDPOINT` regex
(`^https://[a-z0-9]+\.r2\.cloudflarestorage\.com/?$`) therefore intentionally accepts only the
default-jurisdiction endpoint and rejects jurisdiction-suffixed hostnames; this is current policy,
not an oversight. If the owner later adopts a data-residency requirement, that is a new,
owner-authorized change to the endpoint regex in both `backup-database-r2.sh` and
`restore-database-r2.sh`, not a change made silently alongside unrelated hardening.

## R2 erasure-domain integration

`R2_ERASURE_DOMAIN_INTEGRATED=YES`. `docs/opsiq/product/QBO_ERASURE_DESIGN.md`'s external-retention
domain table now includes an `R2_BACKUPS` row, wired into `src/services/privacy-erasure/deletion-domains.ts`
and `scripts/privacy/qbo-erasure.ts` (`--r2-backups-status`), additionally gated by the post-backup
erasure ledger's own integrity (`--erasure-ledger-status`, `GLOBAL_SECURE_DELETE_LEDGER_GATED=YES`
— see the closure doc sections 6-7). A `GLOBAL_SECURE_DELETE=COMPLETE` attestation now cannot be
produced while any R2 backup object is unverifiable/unclassifiable, or while the erasure ledger
itself is unavailable or fails integrity validation.

## Large-backup / multipart limitation (stated, not silently absorbed)

`MULTIPART_BACKUP_SAFE=FAIL_CLOSED_NOT_SUPPORTED`. The create-once upload mechanism
(`aws s3api put-object --if-none-match '*'`) is a single, non-multipart PUT. Cloudflare's own R2
multipart-upload documentation states single-PUT uploads are capped at 5 GiB; multipart uploads
(needed above that size) do not carry the same simple, Cloudflare-confirmed conditional-write
guarantee this design relies on. If the encrypted backup ever exceeds 5 GiB, the upload fails
closed (a non-zero `aws` exit under `set -euo pipefail` aborts the script before any partial or
unprotected upload completes) rather than silently falling back to an unprotected multipart
upload. Do not "fix" that failure by reverting to the higher-level `aws s3 cp` (which
auto-multiparts transparently) without an explicit, owner-reviewed design change: that would
silently drop create-once protection for exactly the backups large enough to need it most.

## First live backup is not authorized by this document

Even once the code is green and reviewed, do not create the real bucket, create real credentials,
add live secrets, enable the schedule, or dispatch a Production backup until: the `opsiq_app`
24-hour observation window has closed, the #642 merge decision has been made by the owner, this
PR chain (#647/#655 and this closure) has been hostile-audited and has green CI at an exact head
SHA, and the owner has personally completed all 14 provisioning steps above — including
configuring and independently verifying the 7-day Bucket Lock (steps 4-5) and the erasure-ledger
trust material (steps 8-9). `R2_ERASURE_DOMAIN_INTEGRATED=YES` in code; `PROVIDER_BUCKET_LOCK_CONFIGURED=NO`
and `R2_RESOURCES_CREATED=NO` remain true until the owner actually performs the steps above —
code readiness is not the same as live provisioning.
