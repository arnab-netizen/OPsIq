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
    one bucket, and the **AGE PUBLIC recipient**. Never holds the AGE private identity — the
    scheduled writer can never decrypt anything it has ever uploaded.
  - `backup-recovery`: AGE **PRIVATE** identity and an R2 **read-only** credential. Designed to
    require manual reviewer approval before a job in this environment runs.
- No `schedule:` trigger yet on either new workflow — `workflow_dispatch` only, until the owner
  provisioning steps below are complete and a supervised first backup + restore rehearsal has
  passed.

## Owner provisioning steps (not done by this PR — exact order)

1. **Create the private R2 bucket.** Cloudflare dashboard → R2 → Create bucket. Leave it private
   (the default): no `r2.dev` public URL, no custom public domain, no anonymous access.
2. **Verify public access is disabled.** Bucket → Settings → confirm "Public Access" is off and no
   custom domain is attached.
3. **Create a bucket-scoped R2 API token for the writer**, type "Object Read & Write", scoped to
   this ONE bucket only (not account-wide R2 Admin). Record the Access Key ID / Secret Access Key
   and the account's R2 S3-compatible endpoint (`https://<account-id>.r2.cloudflarestorage.com`).
4. **Configure a 35-day lifecycle rule** on the bucket: expire objects after 35 days, and expire
   incomplete multipart uploads promptly (same intent as the existing GitHub-artifact retention,
   `RETENTION_DAYS=35`). Scope the rule to the shared `backups/` prefix (not to a single suffix):
   all three object types the backup script writes — the encrypted backup (`.sql.gz.age`), its
   checksum sidecar (`.sha256`), and the manifest (`.manifest.json`) — share that one prefix, so a
   single prefix-scoped rule covers all three with no orphaned object type.
   `RETENTION_SCOPE_ALL_BACKUP_OBJECTS=YES` (by construction: one rule, one shared prefix, three
   suffixes). Do **not** enable Object Lock / Bucket Lock on this bucket — see
   "Why no Bucket Lock" below.
5. **Generate an `age` keypair offline** (e.g. `age-keygen -o production-backup-identity.key`),
   on a machine that is not this CI system. Record the public recipient line it prints
   (`age1...`) — this is **not secret**.
6. **Store only the public recipient** as the `backup-write` environment's `AGE_RECIPIENT`
   variable (a GitHub Environment **variable**, not secret — it isn't sensitive).
7. **Store the private identity file's contents only in `backup-recovery`**, as the
   `AGE_PRIVATE_IDENTITY` **secret**. Never commit it, never place it in `backup-write`, the
   Production environment, or ordinary repository secrets.
8. **Configure GitHub environment protection**: create both `backup-write` and `backup-recovery`
   environments (Settings → Environments). On `backup-recovery`, add a required-reviewers
   protection rule so no restore rehearsal runs without a human approving it first.
9. **Configure `backup-write` secrets/variables**: secret `R2_ACCESS_KEY_ID`, secret
   `R2_SECRET_ACCESS_KEY`, variable `R2_ENDPOINT`, variable `R2_BUCKET`, variable `AGE_RECIPIENT`.
   Reuse the existing repo secret `PRODUCTION_DATABASE_URL` for the DB credential — no new DB
   secret is needed (same reuse the existing `scheduled-backup.yml` already documents).
10. **Configure `backup-recovery` secrets/variables**: secret `AGE_PRIVATE_IDENTITY`, secret
    `R2_READONLY_ACCESS_KEY_ID`, secret `R2_READONLY_SECRET_ACCESS_KEY` (a **separate**,
    read-only-scoped R2 API token — not the writer's Read & Write token), plus the same
    `R2_ENDPOINT` / `R2_BUCKET` variables.
11. **Execute a supervised first backup**: manually dispatch `scheduled-backup-r2.yml` and watch
    it run. Confirm the Summary step's printed object name, and confirm in the Cloudflare
    dashboard that exactly one new object (plus its checksum and manifest) exists in the bucket.
12. **Execute a supervised restore rehearsal**: manually dispatch `restore-rehearsal-r2.yml` with
    that object's name, approve the `backup-recovery` environment gate when prompted, and confirm
    it passes.
13. **Only then**, in a separate, owner-authorized change, add a `schedule:` trigger to
    `scheduled-backup-r2.yml` (same cadence as the disabled workflow, `17 6 * * *`, or a cadence
    the owner chooses) to re-enable automated backups.

Steps 1-10 and the decision to add a schedule in step 13 require owner action; this PR does none
of them.

## Why no Bucket Lock / Object Lock

OpsIQ's Intuit secure-delete model (`docs/opsiq/product/QBO_ERASURE_DESIGN.md`) may require a
recoverable copy — including a backup — to be deletable early, as part of an erasure incident or
the governed erasure process's own backup-domain attestation
(`--attest-github-backup-artifacts`-equivalent for R2, once that domain is retargeted here). A
retention lock that prevents deletion before its own expiry would make that secure deletion step
impossible to complete until the lock expires, which is incompatible with "uncertain = block" for
privacy requests. Ordinary lifecycle-based expiry (step 4 above) achieves the retention goal
(35 days) without that conflict.

## Re-evaluated: Bucket Lock decision (confirmed against current R2 capabilities)

`BUCKET_LOCK_DECISION=DO_NOT_USE`. Re-checked against Cloudflare's current, official Bucket Locks
documentation (not re-derived from AWS S3 Object Lock, which R2 does not mirror exactly): R2
Bucket Locks are bucket-level, prefix-scoped retention rules (age-based, date-based, or
indefinite) that "prevent the deletion and overwriting of R2 objects for a set period or
indefinitely," apply to existing and future objects under the rule's prefix, and — critically —
the documentation describes no admin-bypass or early-release path once a rule is active; a bucket
cannot even be emptied while lock rules exist. This *strengthens* rather than weakens the original
rationale: a lock would make an object genuinely undeletable by anyone, including the owner, until
expiry. That is incompatible with OpsIQ's own "uncertain = block" governed-erasure doctrine
(`docs/opsiq/product/QBO_ERASURE_DESIGN.md`), which requires the ability to delete a backup copy
on demand as part of an erasure incident or the (not-yet-built, see below) R2 backup-domain
attestation. Ordinary lifecycle-based expiry (35 days, see step 4) achieves the stated retention
goal without creating an undeletable copy.

- A: does the QBO backup gate already protect new backups from containing QuickBooks/Intuit User
  Data? YES — `scripts/backup-qbo-gate.sh` (#642) fails closed before any backup this script
  produces, independent of Bucket Lock.
- B: is there a general (non-QBO) requirement to purge a backup before its 35-day lifecycle
  expiry? NO — `docs/PRIVACY_REQUEST_RUNBOOK.md` states plainly that "retention outside the
  database ... follows each provider's own retention and is not reached by this tool"; there is no
  general early-purge requirement today.
- C: would a 35-day lock conflict with QBO erasure attestation? YES, if it were ever needed — a
  locked object cannot be deleted early even to satisfy an erasure incident's backup-domain
  attestation, which is exactly the scenario B says does not exist today but could in a future
  incident (e.g. the gate being bypassed, or a pre-gate-era object).
- D: would a shorter lock (e.g. 7 days) resolve the conflict? NO, not cleanly — any nonzero lock
  period creates a window in which "uncertain = block" governed erasure cannot complete, which is
  the same category of conflict at a smaller scale, not a different one.
- E: see the threat-model section immediately below — ruling out Bucket Lock has a real
  availability cost that must be stated honestly, not minimized.

## Threat model: writer-credential compromise (stated blocker, not resolved by this document)

`WRITER_CREDENTIAL_COMPROMISE_CAN_DELETE=YES`. Cloudflare's current R2 API token permission tiers
are only "Object Read & Write" (read + write + list) and "Object Read only" (read + list); the
official token-permissions documentation does not describe a write-without-delete tier. A
compromised `backup-write` R2 Object-Read-&-Write credential must therefore be assumed able to
delete every object it can see in the bucket, including all historical backups, checksums, and
manifests — the same credential class this workflow already uses, with no narrower alternative
currently offered by R2.

`WRITER_CREDENTIAL_COMPROMISE_CAN_OVERWRITE=NO` as of this change: the create-once upload
mechanism (`aws s3api put-object --if-none-match '*'`, see `backup-database-r2.sh`) makes R2
itself reject any write to an already-existing key with `412 PreconditionFailed`. A compromised
writer credential can still *delete-then-recreate* a given key (a different, still-live attack:
deletion, not silent overwrite), but it can no longer silently corrupt an existing object in place.

`BACKUP_AVAILABILITY_PROTECTION=NONE`. With Bucket Lock ruled out (above) and no narrower
delete-excluding token tier available from R2 today, nothing in this design currently prevents a
compromised writer credential from deleting the entire backup history. **This is an honest,
unresolved blocker, not a gap this mission's scope permits fixing**: a durable fix would require
either a Cloudflare-side capability this token model does not yet offer, or a separate
write-once/delete-never architecture (e.g., a second, narrowly-scoped auditor credential that
periodically copies new objects to a bucket the writer credential cannot reach) that is a real
design change outside "code/architecture hardening of the existing PR." Flagged here for the
owner's provisioning decision, not implemented.

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

## R2 erasure-domain integration (activation blocker)

`R2_ERASURE_DOMAIN_INTEGRATED=NO`. `docs/opsiq/product/QBO_ERASURE_DESIGN.md`'s external-retention
domain table lists `DATABASE`, `GITHUB_BACKUP_ARTIFACTS`, `NEON_HISTORY_WINDOW`, `NEON_BRANCHES`,
and `OPERATOR_EXPORTS`, each with its own attestation flag — there is no R2 entry. A
`GLOBAL_SECURE_DELETE=COMPLETE` attestation produced today would not account for any object this
R2 backup path ever creates. **This is an explicit activation blocker in addition to the owner
provisioning steps above**: even after the bucket is provisioned and a schedule is enabled, R2
must be added to that domain table (with its own attestation mechanism, mirroring
`--attest-github-backup-artifacts`) before Production QuickBooks data may ever legitimately exist
in a backup this path produces. This mission does not implement that addition or any Production
deletion mechanism — it only records the gap so it cannot be missed.

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
new PR has been hostile-audited and has green CI at an exact head SHA, the owner has personally
completed the provisioning steps above, **and** R2 has been added to
`QBO_ERASURE_DESIGN.md`'s external-retention domain table with its own attestation mechanism (see
"R2 erasure-domain integration" above — `R2_ERASURE_DOMAIN_INTEGRATED=NO` today). The availability
exposure described in "Threat model: writer-credential compromise" above is also not resolved by
any step in this document and should be reviewed by the owner before authorizing live use.
