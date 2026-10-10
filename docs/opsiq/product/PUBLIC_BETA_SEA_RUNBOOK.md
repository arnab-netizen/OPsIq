# Public beta — operating runbook (written to be run from a phone)

Audience: the owner, away from a laptop, with a phone. Everything below uses only **github.com in the phone's browser** (use
"Request desktop site" for the Actions *Run workflow* form — the GitHub mobile app may not offer workflow inputs, but it can
approve a pending deployment), the **Vercel dashboard** and **Neon console** in a mobile browser, and OpsIQ's own
**Administration** pages. Verify this once, at a desk, with a harmless workflow dry run (§0 row 2) before you leave.
Nothing here needs a terminal. Nothing here is run by the engineering session that wrote it: **no step in this document has been
executed against Preview or production.** The first real execution happens after an authorised deployment.

Companion documents: `docs/deployment/PRODUCTION_RELEASE_PROCEDURE.md` (the authoritative release procedure — this runbook does
not replace it, it applies it to the one migration this release carries) and `PUBLIC_BETA_OBQ_SEA_READY.md` (design and limits).

---

## 0. Before you leave (do all of these once, at a desk)

| # | Check | Where | Done when |
|---|---|---|---|
| 1 | You can sign in to **github.com** and the **Vercel** and **Neon** dashboards on the phone you will carry, with 2FA available there | phone | each loads and shows the OpsIQ project |
| 2 | Your operator account holds the narrow `ADMINISTRATION_OPERATOR` role | GitHub → Actions → *Provision ADMINISTRATION_OPERATOR*. Inputs: `mode` (run **DRY_RUN** first, then **APPLY**), `target_email` (your account), `workspace_id` (your primary workspace UUID — Neon SQL editor: `select workspace_id from workspace_memberships m join users u on u.id=m.user_id where u.email='…'`), `expected_database_host` (bare production host, direct/non-pooled), `expected_main_sha` (the exact current `main` head, 40 hex), `confirm` (APPLY only: exactly `GRANT ADMINISTRATION OPERATOR`) | `/admin/beta-programme` opens on the phone |
| 3 | `platform_settings` is **initialised** | OpsIQ → Administration → Beta programme → *Initialize platform settings* → *Confirm initialization* | the amber "Initialize platform settings" box is gone |
| 4 | The **Stop new signups now** button has been exercised once on the phone (then re-opened) | same page | mode shows `CLOSED`, then your normal mode again |
| 5 | `NEXT_PUBLIC_APP_URL` is the real public https URL in Vercel **Production**; an email provider is configured | Vercel → Settings → Environment Variables | a test signup email arrives with a working link |
| 6 | Capacity is set to the first stage (**10**) | Beta programme → Capacity limit → Save | page shows "Places used: n of 10" |

If any row is not done, **do not leave**: rows 2–4 are what let you stop signups from a phone.

---

## 1. Applying the migration (`20261010120000_owner_first_run_evidence_quality`)

The migration is **additive**: one nullable column with a CHECK constraint, one new table, two indexes and a RESTRICT foreign key.
It contains no `DROP`, no `DELETE`, no data rewrite. It has **not** been applied anywhere yet.

### 1a. Preview first

Preview builds are **not** migration-gated (`VERCEL_ENV != production`). Which database a Preview deployment uses is decided by the
Preview-environment `DATABASE_URL` in Vercel — **confirm it is a disposable branch and not production** (Vercel → Settings →
Environment Variables → filter *Preview*; the host must differ from the production host). The repository has no dedicated
"migrate Preview" workflow; if the Preview database is the staging database, GitHub → Actions → *Migrate Staging Database* applies
pending migrations to it — and because that workflow checks out the branch you dispatch it on, choose **Use workflow from → the
PR's branch** so the PR's migration is the one applied. If the Preview database is neither, do not guess: leave Preview unmigrated
and review the PR only.

After applying to Preview: open the Preview URL, sign up with a throwaway address, verify, and walk the first run once.

### 1b. Production — `PINNED_PREDEPLOY`

Use this because the new application code reads the new column/table and **must not be promoted before the schema exists**. The
production build gate (`scripts/release/production-migration-gate.mjs`) refuses to promote a build while a migration is pending.

**Preconditions the workflow enforces (it refuses otherwise):** the PR is **open**, its base is `main`, and it lives in this
repository (a merged PR must use `MAIN` mode instead); the migration folder does **not** yet exist on `main`; it sorts **after**
`main`'s latest migration (if another migration merges first, re-issue); it is the **only** pending migration.

GitHub → Actions → **Migrate Production Database** → *Run workflow* (branch `main`):

| Input | Value | Notes |
|---|---|---|
| `environment` | `production` | the only option |
| `mode` | `PINNED_PREDEPLOY` | one owner-authorised migration from an unmerged PR |
| `confirm` | `MIGRATE PRODUCTION PINNED PREDEPLOY` | exact phrase, case-sensitive |
| `source_pr` | the PR number, digits only | e.g. `4242` |
| `source_sha` | the PR's **current head** commit, 40 lowercase hex | PR → *Commits* tab → newest commit → copy the full SHA. It must equal the PR head **at run time**; any later push makes it refuse |
| `migration_name` | `20261010120000_owner_first_run_evidence_quality` | must be the *only* pending migration |
| `migration_sha256` | the SHA-256 of that exact `migration.sql`, 64 lowercase hex | issued in the engineering report / PR description **for the final pushed PR head** (any hash quoted for an earlier commit is stale). The workflow recomputes it from the commit and refuses on a difference |
| `expected_database_host` | the **bare, direct** production DB hostname | Neon console → project → *Connection details* → turn **pooling OFF** → copy the host (no `-pooler`). It is compared with the `PRODUCTION_DATABASE_URL` GitHub secret, which must be the direct URL — the pooled host Vercel uses at runtime will be refused (a safe failure). Never a URL, `@`, path or credentials |

Worked example (fictional values — do not paste these):

```
mode                   PINNED_PREDEPLOY
confirm                MIGRATE PRODUCTION PINNED PREDEPLOY
source_pr              4242
source_sha             0123456789abcdef0123456789abcdef01234567
migration_name         20261010120000_owner_first_run_evidence_quality
migration_sha256       <64 hex characters from the engineering report>
expected_database_host ep-example-123456.us-east-2.aws.neon.tech
```

What the workflow does, in order (read the run log top to bottom): validate inputs → confirm the PR (open, base `main`, same
repo) and that `source_sha` is its head (GitHub API provenance) → fetch that commit and extract **only** the one `migration.sql`
with `git show` (the PR's code is never checked out or executed while the production secret is present) → recompute and compare the
checksum → verify the migration chain (not already on `main`, sorts last, sole pending) → install `main`'s own dependencies →
compare the database **host** to `expected_database_host` → check migration status (the first database connection) → `prisma migrate
deploy` only (no seed, no reset) → post-deploy status check → a final pinned-migration verification step.

The `production` environment may require a **reviewer approval** before the job starts: the GitHub mobile app can approve it.

### 1c. Stop conditions — stop and do not re-run

* **Checksum mismatch** (`migration_sha256` ≠ computed): stop. Do not "fix" the input by copying the computed value. A mismatch
  means the file you authorised is not the file in the PR. Ask engineering which is right; only the owner re-authorises a hash.
* **`source_sha` no longer the PR head**: stop; the authorisation is for one exact commit. Re-authorise the new head.
* **Host mismatch**: stop. This is the guard against the wrong Neon project/branch. Re-read the direct host from Neon; do not guess.
* **PR not open / wrong base / migration already on `main` / does not sort last / more than one pending migration / a failed
  migration row**: stop. Do not run *resolve-failed-migration* from a phone.
* **The run fails after "prisma migrate deploy" started, or the final verification step is red although the deploy step passed**:
  the schema may already be applied. Stop. Check `/api/startup` (§3). If `migration_failed` > 0 the database needs a manual review
  — the app keeps serving the previous deployment because the build gate refuses to promote.

### 1d. After a successful run

Redeploy / promote: if `VERCEL_PRODUCTION_DEPLOY_HOOK_URL` is configured, MAIN-mode runs redeploy for you; for `PINNED_PREDEPLOY`
the PR is not merged yet, so merging (a separate, owner-authorised step at an exact SHA) triggers the build, and the gate then
passes because the migration is applied. Verify with §3.

---

## 2. Emergency stop, from a phone

1. Open OpsIQ → Administration → **Beta programme** (`/admin/beta-programme`).
2. Read **Right now**: it shows the signup mode (OPEN / invite only / waitlist / CLOSED) and **Places used n of limit**
   (with how many are verified and how many are waiting to verify; a waiting place lapses after 24 hours).
3. Tap **Stop new signups now** (red box). It sends *only* `admissionMode: CLOSED` — it can never overwrite a newer capacity.
4. The page flips to **CLOSED** and the button reads **Signups are closed**. This is the server's confirmation (it is the saved
   setting, not an optimistic label).
5. **Verify the server state** (a real signup refusal cannot be exercised from a phone — under CLOSED the form is hidden): open
   `https://<your-domain>/api/auth/beta-status` in the phone browser. It must read `"enabled":false` and `"admissionMode":"CLOSED"`.
   That endpoint reads the same saved setting the signup route re-checks (before validation **and again inside the transaction under
   the capacity lock**, failing closed if it cannot read it). Also open `/signup`: it shows the closed notice, not the form. The
   homepage wording ("Start free" gone) is display only and proves nothing by itself.
6. Accounts that already exist (pending or verified) keep working. To reopen: choose the mode in *Admission mode & capacity* → **Save**.

If the page does not load: `/api/admin/platform-settings` is the same control. If both are down, the fallback is Vercel →
Settings → Environment Variables → set `PUBLIC_BETA_ENABLED` to `false` **and redeploy** (env changes apply only to a new deployment;
if you rolled back, promote that new deployment manually). It only works while `platform_settings` is **not** initialised (once
initialised the database row is authoritative — which is why §0 rows 3–4 matter) and it only closes *public* signup: it maps to
invite-only, so addresses with a live invitation can still sign up.

---

## 3. Seeing what is happening (no SQL needed)

**Administration → Overview** (`/admin/overview`) now shows, for the last 7 days: taps on *Start free* and opens of the signup form
(**anonymous and approximate** — raw counts from a public, rate-capped beacon that can be inflated), then the people-level steps
(distinct accounts): signed up, verified, started first run, set up the business, saved numbers, got a first diagnosis, saw the
first read, were **activated** (acted on it) and reached the Cockpit; plus **things that went wrong** (signup refused because
registration is closed / waitlist / not invited, signup refused because the beta is full, verification email could not be sent).
It is a rolling 7-day window, not a cohort, so compare steps as rough ratios only. It also shows capacity: verified + waiting-to-verify against the limit.
Counts only — no names, emails or financial figures appear anywhere on that page.

How to read it:

| You see | It means | Do |
|---|---|---|
| "Verification email could not be sent" > 0 | email provider or `NEXT_PUBLIC_APP_URL` is wrong; people are stuck at "check your email" | **Stop signups** (§2), fix the Vercel env var / provider, **redeploy and promote** (env changes only reach a new deployment; an Instant Rollback keeps the old env), send yourself a test signup, then reopen |
| Signed up ≫ Verified | emails not arriving or being ignored | check spam/provider; do not raise capacity yet |
| Verified ≫ Saw the first read | something breaks in first run | open Vercel → Logs, filter for `/api/owner/first-run`; stop signups if errors are widespread |
| "Signup refused: beta full" > 0 while verified places are well below the limit | unverified signups are holding places (see §5) | they lapse after 24 h; stop signups (§2) if it keeps repeating |

Deeper checks (optional, Neon console → SQL Editor, read-only): the funnel queries in `PUBLIC_BETA_OBQ_SEA_READY.md` §6.

Health endpoints: `https://<your-domain>/api/startup` (`migration_pending: 0`, `migration_failed: 0`, `startup_status: READY`) and
`/api/readiness` (200).

---

## 4. Rolling back

### 4a. Application rollback (Vercel Instant Rollback) — safe, takes about a minute

1. Vercel → the OpsIQ project → **Deployments**.
2. Find the last deployment marked **Production** that you know was good (the one before the release).
3. Tap **⋯** → **Instant Rollback** → confirm. Production traffic moves immediately; no rebuild runs.
4. Vercel will show that automatic promotion of new builds is paused until you promote a deployment or re-enable it — that is
   intended while you investigate. Do not re-enable it until the cause is understood.
5. Verify: `/api/readiness` returns 200 and the homepage loads.

### 4b. Database — **do not roll the migration back**

* The migration is additive (nullable column + new table). The previous application version never references them, so it runs
  correctly against the new schema. Nothing needs to be undone for the old app to work.
* Do **not** drop the column or table, and do not run any "down" SQL from a phone: dropping would destroy evidence-quality
  provenance and first-result interactions recorded since release, and there is no governed workflow for it.
* The production build gate compares *committed* migrations with the database; an applied migration whose file is still in the
  repository is the normal state. A rollback to an older **deployment** does not rebuild, so the gate does not run.

### 4c. When rollback is enough, and when it is not

| Situation | Action |
|---|---|
| New code misbehaves (errors, wrong screens) | 4a, then investigate |
| Signups misbehave (spam, emails) | §2 first (stop signups) — a rollback is rarely needed |
| Migration run failed or `migration_failed` > 0 | **Manual database review required.** Do not roll back the app to "fix" it and do not re-run the workflow. Stop signups, leave production on the last good deployment (the gate keeps it there), and review with engineering |
| Data looks wrong (numbers, ownership) | stop signups, take a Neon branch/backup point, escalate — do not edit data from a phone |

---

## 5. Decision record — what "capacity" counts (and why unverified signups do not exhaust it)

**Question.** Does the cap mean (A) accounts created, or (B) verified active customers?
**Finding.** Before this release it was (A) in the strongest form: *every* external beta workspace ever created, forever, including
signups never verified. With open registration anyone can submit signups for addresses they do not own. A cap of 10 could be filled by
ten requests from one address (the per-IP limiter allows 10 per 15 minutes) and **stayed full permanently**, because nothing ever
frees a slot short of raising the limit. That is cheap, permanent exhaustion of the beta by an anonymous party — repaired.

**Decision.** The cap protects the cost and attention spent on **real** customers, so it counts:

* **verified** accounts — they hold a place permanently (suspension never frees one);
* plus **unverified** signups that are still inside a **24-hour pending hold** — so a real person about to click their link is
  guaranteed room.

A lapsed unverified signup stops holding a place **without any row being deleted or rewritten** (governed records are never
removed). In addition, one source address may hold at most **3** pending places at once, so occupying the pending hold takes many
addresses rather than one.

**Late verification.** A person who verifies *after* their hold lapsed must take a place: verification re-checks capacity under the
same advisory lock as signup and admin changes, so the limit cannot be exceeded by a late verifier. If the beta is full they see
"The beta is full right now… open this link again in a day or two" and the link is **not** consumed. Verifying *inside* the hold
needs nothing extra. Admin "capacity below current usage" and the 80/90/100% alerts use the same definition (verified + pending).

**Residual risk (stated).** An attacker with many source addresses can still occupy pending places for 24 hours, during which new
signups are refused ("beta full"). It is a temporary slowdown that must be re-done every day, never a permanent exhaustion, and it is
visible: *Administration → Overview* shows verified vs waiting-to-verify places and the count of "Signup refused: beta full" events.
Response: **Stop new signups now** (§2) if it persists; nothing needs data surgery.

**Behaviour change to know about.** Several people behind one shared address (an office, a mobile carrier) who all sign up before
verifying will be told to open their email link first once three are waiting; each verification releases that address's allowance.
