# OpsIQ: consolidated owner setup (only what cannot be done through existing authorized mechanisms)

Created 2026-11-18. Every item says what it unblocks and how completion is verified. Nothing here asks you to paste a secret
into chat or to guess a hostname. "Inspect" = read only; "Mutate" = changes a setting or secret.

## 1. Let the pipeline run the production reconcile (UNBLOCKS: production deploys, which have failed since #678)
Why: `workflow_dispatch` returns `403 Resource not accessible by integration` for this session's GitHub integration (also for a harmless rerun). Cause not yet proven: the Claude GitHub App requests Actions read/write per Anthropic docs, but the session's effective token does not have it.
Option A (one-time, no integration change). **Mutate.** GitHub, `arnab-netizen/OPsIq` -> Actions -> "Reconcile Runtime Role" -> Run workflow, three times in order, `ref=main`:
1. `mode=DISCOVER`, `expected_main_sha=<current main SHA>`, `expected_database_host=ep-empty-sky-ay1e6c27.c-5.us-east-2.aws.neon.tech`
2. `mode=DRY_RUN`, same inputs
3. `mode=APPLY`, same inputs, `confirm=APPLY PRODUCTION RUNTIME ROLE TOPOLOGY`
Approve the `production-operator` environment prompt each time. The host is the repo-recorded candidate (`CURRENT_MAIN_CLOSURE_REGISTER.md` plus Neon's default branch); the workflow's own exact-host gate proves or refuses it, so a wrong host fails closed. After APPLY succeeds, Vercel -> o-ps-iq -> Deployments -> Redeploy main.
Verify: the APPLY run summary shows pre/post verification with an empty grant gap; the next production deployment is `READY` at the main SHA.
Option B (permanent). **Inspect first**: github.com/settings/installations -> Claude -> check for a pending "updated permissions" request and accept it only if Actions: Read and write is listed. If nothing is pending, do not reinstall until Option A shows whether it is needed.

## 2. Independent approval of PRs #682 and #683 (UNBLOCKS: merge)
Why: the PR author and this session share the identity `arnab-netizen`, so GitHub cannot take an approval from it, and the repository has no `.github/CODEOWNERS` file. **Mutate.** Review and approve (or request changes) in GitHub. Decision for you: add a `.github/CODEOWNERS` covering `.github/workflows/**`, `scripts/release/**`, `scripts/db/**`, `src/__tests__/ci-cd/**` and require code-owner review in branch protection. One-time. Verify: the PR shows an approving review and the merge button is enabled.

## 3. Search Console ingestion (UNBLOCKS: GSC data)
Why: run `44257904842` fails because secret `GSC_INGESTION_DATABASE_URL` in environment `gsc-ingestion` is empty. **Mutate (needs the database owner login, which this automation must not hold).**
1. `psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/gsc/opsiq-gsc-ingestion-role.sql` (creates `opsiq_gsc_ingestion`, SELECT/INSERT/UPDATE on `search_console_metrics` only; first check it does not already exist: `\du opsiq_gsc_ingestion`).
2. Set its password interactively (`\password opsiq_gsc_ingestion`); never in a file or chat.
3. GitHub -> Settings -> Environments -> `gsc-ingestion` -> Add secret `GSC_INGESTION_DATABASE_URL` = the DIRECT (non-pooler) connection string for that role.
4. Run `scripts/gsc-credential-check.sh` with that URL. One-time. Verify: the next `Google Search Console - Scheduled Ingestion` run passes preflight and writes rows.

## 4. Encrypted backups (UNBLOCKS: any real backup; none exists today)
Why: run `44120603677` (2026-11-17) failed at the preflight with ALL eight required values empty: `DATABASE_URL` (secret `BACKUP_DATABASE_URL`), `AGE_RECIPIENT`, `AGE_ESCROW_RECIPIENT`, `R2_ENDPOINT`, `R2_BUCKET`, `AWS_ACCESS_KEY_ID` (secret `R2_ACCESS_KEY_ID`), `AWS_SECRET_ACCESS_KEY` (secret `R2_SECRET_ACCESS_KEY`), `MANIFEST_SIGNING_KEY`. Nothing in the backup environment is provisioned. **Mutate.** Follow `docs/opsiq/product/R2_BACKUP_RUNBOOK.md` steps 1-9 in order (private bucket, 35-day lifecycle, 7-day Bucket Lock, writer and recovery tokens, two offline `age` keypairs, `opsiq_backup` role from `scripts/backup/opsiq-backup-role.sql`), then store them in GitHub environments `backup-write` (secrets `BACKUP_DATABASE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `MANIFEST_SIGNING_KEY`; variables `AGE_RECIPIENT`, `AGE_ESCROW_RECIPIENT`, `R2_ENDPOINT`, `R2_BUCKET`, `PRODUCTION_QBO_ENABLED`) and `backup-recovery` (secrets `R2_READONLY_ACCESS_KEY_ID`, `R2_READONLY_SECRET_ACCESS_KEY`; variables `R2_ENDPOINT`, `R2_BUCKET`). No incremental cost is expected if the bucket stays within Cloudflare R2's free allowance (unverified here). One-time. Verify: a supervised run of `scheduled-backup-r2.yml` succeeds, then a local restore (runbook "Local restore") into a disposable PostgreSQL 18.
Decision for you: the QuickBooks backup gate refuses whole-database dumps while `qbo_*` rows exist. Choose the compliant design in `docs/opsiq/product/QBO_BACKUP_GATE.md`; do not remove the gate.

## 5. Neon (UNBLOCKS: cost clarity; nothing is deleted without you)
Inspect: org `Arnab` is on the paid Launch plan. Review Neon console -> Billing for the real monthly charge (this session cannot read billing). Opsiq1 (`raspy-violet-59550732`) had a 07:33Z compute burst on 2026-11-18 from an unknown caller: Neon console -> that project -> Monitoring/Operations. No project is authorized for deletion; the evidence table is in the ledger.

## 6. `production-operator` environment (UNBLOCKS: knowing whether routine approvals exist)
Inspect: GitHub -> Settings -> Environments -> `production-operator`: required reviewers, deployment branch rule. This session's proxy cannot read it. Do not change it until the independently reviewed release pipeline exists; a main-only branch rule is not a replacement for independent approval.
