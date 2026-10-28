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
  file (`opsiq_backup_<timestamp>.sql.gz.age`); no plaintext SQL and no unencrypted gzip ever
  touch disk. SHA-256 over the encrypted object. Uploads the encrypted object + checksum + a
  non-sensitive manifest to R2. Verifies the upload via `HEAD` only (never downloads to verify).
  Secure `mktemp -d` workdir with an `EXIT` trap that removes everything, on success, on failure,
  or on cancellation.
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
   `RETENTION_DAYS=35`). Do **not** enable Object Lock / Bucket Lock on this bucket — see
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

## First live backup is not authorized by this document

Even once the code is green and reviewed, do not create the real bucket, create real credentials,
add live secrets, enable the schedule, or dispatch a Production backup until: the `opsiq_app`
24-hour observation window has closed, the #642 merge decision has been made by the owner, this
new PR has been hostile-audited and has green CI at an exact head SHA, and the owner has
personally completed the provisioning steps above.
