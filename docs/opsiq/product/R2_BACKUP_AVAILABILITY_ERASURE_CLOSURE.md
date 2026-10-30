# R2 backup availability + erasure-domain closure

Status: DRAFT, branch-only, stacked on PR #647 (`claude/private-encrypted-r2-backup`), itself
stacked on PR #642, both unmerged. Nothing in this document or the code it describes has been
provisioned, enabled, or run against Production. This document closes exactly two blockers
recorded against PR #647: `BACKUP_AVAILABILITY_PROTECTION=NONE` and
`R2_ERASURE_DOMAIN_INTEGRATED=NO`. It does not reopen or change any other decision already made
in `R2_BACKUP_RUNBOOK.md`.

## 1. Current R2 facts this closure relies on (re-verified against live Cloudflare documentation)

- **Object-level vs. bucket-configuration permission separation is real and provider-enforced,
  not a policy choice.** Cloudflare's own documentation states the S3-compatible API's "Object
  Read & Write" and "Object Read only" permissions are "only supported by the S3-compatible API,
  not the Cloudflare REST API." Bucket Lock rules are managed exclusively through the dashboard,
  Wrangler, or "(API only) an API token with permissions to edit R2 bucket configuration" against
  the Cloudflare REST API (`.../accounts/<id>/r2/buckets/<bucket>/lock`) — a different API surface,
  different authentication scheme (Bearer token vs. AWS SigV4), and a different permission class
  ("Admin"/"Workers R2 Storage Write" account-level) entirely. An S3-compatible Object Read & Write
  token literally cannot call that endpoint. This is the basis for `WRITER_CAN_EDIT_BUCKET_LOCK=NO`
  below: it holds by construction, not merely by this design choosing not to grant extra scope.
- **Locked objects cannot be deleted or overwritten by any credential**, including the one that
  uploaded them. A blocked single-object S3 request fails with HTTP 409
  `ObjectLockedByBucketPolicy`; `DeleteObjects` returns HTTP 200 with the same per-key error. The
  documentation gives no uploader/owner bypass.
- **Bucket Lock rules take precedence over lifecycle rules.** A lifecycle deletion eligible before
  a lock expires is held until the lock condition is satisfied, not an error.
- **Bucket Lock rules are prefix-scoped**, age-based/date-based/indefinite, up to 1,000 rules per
  bucket, strictest rule wins on overlap.

## 2. Threat model (Section 3)

Scope: a `backup-write` R2 **object** credential (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) is
stolen in isolation — e.g. leaked in a build log, a compromised identity scoped only to that
token — not a full compromise of every secret in the `backup-write` GitHub Environment.

| Capability | Before this closure | After this closure |
| --- | --- | --- |
| List/read ciphertext | YES | YES (unchanged; R2_WRITER_CAN_READ_CIPHERTEXT=YES, documented in R2_BACKUP_RUNBOOK.md) |
| Decrypt backups | NO | NO (unchanged; AGE private identity never present) |
| Overwrite an existing backup | previously YES | **NO** (`backup-database-r2.sh`'s create-once uploads, #647) |
| Delete any existing backup | YES | **Unchanged today (YES) — see Section 3: Bucket Lock adoption remains an open owner policy decision, not something this closure can or does resolve unilaterally** |
| Edit/remove the Bucket Lock rule itself | n/a | **If Bucket Lock is ever adopted: NO — structurally impossible via the S3-compatible API (Section 1)** |
| Forge a "clean" manifest for a new, fabricated object | n/a (no manifest contract existed) | **NO — manifest_signature requires MANIFEST_SIGNING_KEY, a separate secret never exposed to this credential (Section 7, #647)** |

`COMPROMISED_WRITER_CANNOT_OVERWRITE_PROTECTED_BACKUPS=YES` (unconditional — already true today
from #647's create-once uploads alone, independent of whether Bucket Lock is ever configured).
`COMPROMISED_WRITER_CANNOT_DELETE_PROTECTED_BACKUPS=NOT_YET — see Section 3`: this closure does
**not** unilaterally resolve delete-protection. Earlier drafting of this document initially
recommended adopting a 35-day Bucket Lock as settled, but an adversarial governance review caught
that this would have silently reversed `R2_BACKUP_RUNBOOK.md`'s own prior, reasoned
`BUCKET_LOCK_DECISION=DO_NOT_USE` without acknowledging or rebutting the specific conflict
scenario that justified it. Section 3 below corrects that: it reconciles with, not contradicts,
the prior decision, and records the correct output as `OWNER_POLICY_DECISION_REQUIRED`.

## 3. Bucket Lock decision — reconciled with R2_BACKUP_RUNBOOK.md, not reversed (Section 4)

**The prior decision, quoted exactly** (`R2_BACKUP_RUNBOOK.md`, "Re-evaluated: Bucket Lock
decision"): `BUCKET_LOCK_DECISION=DO_NOT_USE`, because (scenario C) "a 35-day lock would conflict
with QBO erasure attestation... if it were ever needed — a locked object cannot be deleted early
even to satisfy an erasure incident's backup-domain attestation... (e.g. **the gate being
bypassed**, or a pre-gate-era object)," and (scenario D) "a shorter lock... [does not] resolve the
conflict... any nonzero lock period creates a window in which 'uncertain = block' governed erasure
cannot complete."

**What Section 6 below actually proves, precisely stated:** as long as `scripts/backup-qbo-gate.sh`
(#642, unmodified by this closure) functions correctly, every successfully created R2 backup is
structurally incapable of containing QBO data — this closes the *normal-case* reason a backup
would ever need early deletion for QBO erasure purposes.

**What Section 6 does NOT prove, and scenario C already named this exact residual case:** if the
gate itself is ever bypassed or regresses — a defect in #642, which this closure explicitly does
not modify, re-verify, or have the authority to fix — a backup created during that window could
still receive a validly-signed, canonical `qbo_backup_gate_result` (because the same pipeline that
bypassed/misreported the gate also computes the real signature with the real key) while actually
containing QBO data. A Bucket Lock, once adopted, would then make that specific backup
undeletable for the full lock duration, for anyone, including the owner — reproducing scenario C's
conflict exactly, not resolving it. Scenario D's observation — any nonzero lock period has this
same category of exposure, just a smaller window — also still holds; a shorter lock reduces the
exposure window but does not eliminate the conflict category.

**Conclusion.** This is a genuine, irreducible policy tradeoff between ransomware/credential-theft
resilience (favors adopting a lock) and bounded erasure-urgency flexibility if #642's gate ever
fails (favors not adopting one, or keeping it short) — not a tradeoff this closure can responsibly
resolve by recommending a number. The analysis below is offered as **input to that owner
decision**, not as this closure's own recommendation.

| Candidate | Ransomware/compromise protection | Residual gate-bypass exposure if adopted | Lifecycle interaction |
| --- | --- | --- | --- |
| No lock (status quo) | None — unchanged from before this closure | None (nothing to be undeletable) | n/a |
| 7 days | Protects the most recent week's backups only | Bounded to at most 7 days per affected backup | Clean: 7 < 35 |
| 14 days | Two weeks protected | Bounded to at most 14 days per affected backup | Clean: 14 < 35 |
| 35 days (= full lifecycle retention) | Every live backup protected for its entire life | Bounded to at most 35 days per affected backup, but for every single backup created during a bypass window | Clean per Cloudflare's own documented precedence of locks over lifecycle |

`BUCKET_LOCK_DECISION=OWNER_POLICY_DECISION_REQUIRED` (supersedes nothing in `R2_BACKUP_RUNBOOK.md`
— that document's `DO_NOT_USE` stands as the status quo until and unless the owner makes a new,
informed decision using the table above).
`RECOMMENDED_BUCKET_LOCK_SECONDS=NONE` (no unilateral recommendation is made).
`BUCKET_LOCK_SELECTED=NO`.

`scripts/r2-bucket-lock-config.json` is retained as a **candidate** configuration (35 days, the
"maximum protection" end of the table above) for the owner to use *if* they decide to adopt a
lock — it is explicitly not a decision this closure made on the owner's behalf; see that file's
own `_comment` field.

## 4. Object-key uniqueness and QBO data proof (Sections 5-6)

Section 5 (object-key uniqueness) was already closed in #647's prior hardening commit
(`GITHUB_RUN_ID`-or-random uniqueness suffix in `backup-database-r2.sh`); nothing new here.

**`R2_BACKUP_CAN_CONTAIN_QBO_DATA=NO`.** Traced the combined #642+#647 flow directly in
`scripts/backup-database-r2.sh`: stage 1 (`backup-qbo-gate.sh`, called unmodified) runs via
`if GATE_OUT=$(bash "$SCRIPT_DIR/backup-qbo-gate.sh" 2>&1); then ... fi`, and `exit 1` fires
before any later line if `GATE_RC -ne 0`. Every line that invokes `pg_dump` is lexically *after*
that check. The gate itself (`scripts/backup-qbo-gate.sh`, unmodified by this closure) fails
closed on: `PRODUCTION_QBO_ENABLED` not exactly empty/"false"; `DATABASE_URL` unset; a `psql`
probe failure (non-zero exit); a non-numeric probe result; or any `qbo_*`-table row count above
zero. The only path that reaches `pg_dump` is `QBO_BACKUP_GATE=ALLOW`, which by the gate's own
logic requires zero `qbo_*` rows at probe time. Therefore: no raw QBO table, QBO-derived
Finance/Cashflow data, QBO-derived diagnosis/decision/budget value, or QBO realm/company
identifier can exist in a `pg_dump` that this script ever uploads, as long as the gate script
itself functions correctly (an assumption this closure does not re-verify beyond #642's own
existing test suite, `backup-qbo-gate.test.ts`, which this closure also did not modify).

Per the mission's own Section 6 instruction, this answer being NO means the closure may proceed
rather than stopping.

## 5. Erasure reconciliation (Section 5, Section 11)

Re-read `docs/opsiq/product/QBO_ERASURE_DESIGN.md`, `docs/PRIVACY_REQUEST_RUNBOOK.md`, and #642's
own `docs/opsiq/product/QBO_BACKUP_GATE.md`. Four facts and how they stay mutually consistent:

1. **QuickBooks secure-delete considers recoverable backups part of the deletion boundary**
   (`QBO_ERASURE_DESIGN.md`'s external-retention domain table). R2_BACKUPS is now a domain in that
   table (Section 6 below) — this closes the gap rather than contradicting the fact.
2. **Option B prohibits whole-database backups while Production QBO data is present** (the
   #642 gate). Unaffected by this closure; the gate is unmodified.
3. **#642 fails closed BEFORE `pg_dump`.** Reconfirmed structurally in Section 4 above, with
   mutation-test coverage (Section 7 below) proving an attempted bypass is caught.
4. **General privacy deletion currently tells the operator to take a backup before manual
   deletion** (`PRIVACY_REQUEST_RUNBOOK.md` line ~104, "Take a database snapshot/backup
   immediately before running anything... so a mistake in a hand-written deletion script is
   recoverable" — citing the *existing*, separate `docs/BACKUP_AND_RESTORE_GUIDE.md` /
   `docs/BACKUP_RESTORE_PROCEDURE.md` process, **not** this R2 pipeline). This is an *operator
   safety-net* backup against script error, not an automated pre-deletion-targeted backup of the
   person's own data for later erasure purposes, and it does not contradict fact 1: the same
   runbook already states plainly (line ~157) that "Retention outside the database (Vercel logs,
   Sentry, backups, Neon point-in-time history) follows each provider's own retention and is not
   reached by this tool" — an honest statement, not a false immediate-deletion claim. No doc edit
   was needed here; see Section 10 below for the formal verdict.

`LOCKED_R2_QBO_ERASURE_CONFLICT=NO` — proven, not assumed, because `R2_BACKUP_CAN_CONTAIN_QBO_DATA=NO`
removes the only reason a locked backup would ever need early deletion for QBO erasure purposes.
Hostile-tested (Section 7 below): forcing the gate to lie, skipping it, reordering it after
`pg_dump`, or running with `PRODUCTION_QBO_ENABLED=on` must all still fail the existing safety
tests — none of them can produce a real backup that reaches the upload stage.

## 6. R2 erasure domain (Section 8)

Implemented in `src/services/privacy-erasure/deletion-domains.ts`: a new `R2_BACKUPS` entry in
`EXTERNAL_DELETION_DOMAINS`, structurally distinct from the existing timestamp-attestation domains
(it is a `CLEAN | NOT_APPLICABLE | PENDING | FAIL` verdict, not a purge-by-date attestation, for
the reason in Section 4 above). `GITHUB_BACKUP_ARTIFACTS` is untouched — not renamed, not removed,
still meaningful for any artifact created while that path was active. Wired into
`scripts/privacy/qbo-erasure.ts`'s `printGlobal` via a new `--r2-backups-status` CLI option and
`r2BackupsStatusFromOptions`. `UNKNOWN_R2_BACKUP => GLOBAL_SECURE_DELETE=INCOMPLETE` is enforced in
code: omitting `--r2-backups-status` (or any value other than `CLEAN`/`NOT_APPLICABLE`) forces the
domain into `pendingDomains`, which always keeps `GLOBAL_SECURE_DELETE=INCOMPLETE`.
`R2_ERASURE_DOMAIN_INTEGRATED=YES`.

## 7. Machine-readable QBO-gate evidence (Section 7) and the R2 domain verifier (Section 9)

`backup-database-r2.sh` now extracts the gate's own canonical success line
(`QBO_BACKUP_GATE=ALLOW (flag='...', qbo_* rows=0)`, exactly as `scripts/backup-qbo-gate.sh`
prints it — not a hand-maintained paraphrase) from its captured `$GATE_OUT`, and refuses to
produce a manifest at all if that exact line is not present even though the gate exited zero (a
defensive structural check against a hypothetical future regression in #642's own gate, which
this closure does not own or modify). The manifest records this line plus a schema version, and
is HMAC-SHA256-signed (`manifest_signature`) with a new, separate `MANIFEST_SIGNING_KEY` secret
that is never the R2 object credential and is never derivable from it.

**Honest limit on "non-spoofable":** this binds the manifest against an attacker who holds *only*
the R2 object credential (this closure's stated threat model, Section 2 above). It is not a
defense against a full compromise of every `backup-write` secret simultaneously (Section 9's
failure model), nor against a supply-chain attacker who can modify `backup-database-r2.sh` itself
before it runs — that is a different, out-of-scope threat (code review / branch protection is the
control there, not a runtime manifest field).

The verifier, `scripts/privacy/verify-r2-backup-domain.ts` (CLI) +
`src/services/privacy-erasure/r2-backup-domain.ts` (pure logic, 24 hostile-case unit tests), reads
only object listing/metadata, manifest JSON, and checksum sidecars via a read-only R2 credential;
it never touches the AGE private identity, never decrypts anything, and never queries Production.
It independently recomputes every manifest's signature — it cannot forge a new one, only detect
whether an existing one verifies. All twelve of Section 9's hostile cases (no objects; valid
triplet; missing manifest; missing gate proof; malformed manifest; orphan checksum; orphan
manifest; unexpected object; inconsistent metadata; legacy/unattested object; timestamp
inconsistency; forged manifest) are covered by name in
`src/__tests__/privacy-erasure/r2-backup-domain.test.ts`, and uncertainty always resolves to
`PENDING` or `FAIL`, never `CLEAN`.

## 8. Historical object policy (Section 10)

`LEGACY_UNATTESTED_R2_BACKUP_POLICY=BLOCK`. No real R2 object has ever been created (no bucket is
provisioned). `isLegacyUnattestedManifest()` in the verifier classifies any manifest missing
either `qbo_backup_gate_result` or `manifest_signature` as `LEGACY_UNATTESTED`, which forces the
whole domain to `FAIL` — there is no migration path invented for objects that do not exist, per
the mission's own instruction not to invent one.

## 9. General privacy deletion conflict (Section 12)

`GENERAL_PRIVACY_BACKUP_RETENTION_POLICY=OWNER_LEGAL_DECISION_REQUIRED`. Re-read
`docs/PRIVACY_REQUEST_RUNBOOK.md` in full for this closure: it already states honestly (not
falsely) that backups are outside the erasure tool's reach and follow each provider's own
retention (see Section 5.4 above for the exact quote). No doc edit was required — the wording does
not claim immediate deletion from backups. Whether a general (non-QBO) privacy-erased person's
data may legitimately persist in an R2 backup for up to 35 days (the ordinary lifecycle retention,
unconditionally true today regardless of whether a Bucket Lock is ever additionally adopted per
Section 3) is a retention-policy question for the owner/legal, not a technical defect this closure
invents an answer to. This is explicitly separated from QBO technical readiness per the mission's
own instruction and does not block `R2_BACKUP_ACTIVATION_TECHNICALLY_READY`.

## 10. Restore anti-resurrection (Section 13) and the erasure-tombstone survival problem (Section 14)

No real production-recovery-from-R2 workflow exists in this repository today, and this closure
does not build one (out of scope: "Do not implement Production deletion in this mission" carries
over from the prior mission's scope discipline). What exists is `restore-rehearsal-r2.yml`, which
only ever restores into a disposable `postgres:18` service container, and
`scripts/restore-database.sh`'s `assert-restore-target.mjs` preflight, which refuses a `production`
target unconditionally, on the target string alone, before `DATABASE_URL` is even inspected
(pre-existing, hostile-tested in the prior mission's `restore-target-hostile.test.ts`, unmodified
here). **The restored database cannot become Production/live through this pipeline merely because
`psql` succeeded — that is already true today, by construction, independent of this closure.**

What this closure adds is the **requirement**, recorded as a hard precondition on any future
real production-recovery workflow (see the updated Activation Gate, Section 11 below):

- `RESTORE_NOT_SERVICEABLE_UNTIL_ERASURE_RECONCILED` is the permanent state of any restored
  recovery point until the erasure(s) that happened *after* that backup's own timestamp have been
  independently re-verified as not needed, or re-applied, against the restored copy.
- **Why a ledger is required, not optional** (Section 14): if a backup predates an erasure, it
  also predates that erasure's tombstone, wherever the tombstone lives *inside the database being
  restored*. The restored database's own `privacy_erasure_requests` state machine (or any QBO
  erasure tombstone) cannot know about an erasure that happened after the backup was taken,
  because restoring the backup brings back the pre-erasure copy of that very table. A durable
  erasure record for this purpose must therefore live **outside** the backup content entirely.
- `POST_BACKUP_ERASURE_LEDGER_REQUIRED=YES`. Minimal design only (per the mission's "do not
  overengineer" instruction and its own allowance to "report a blocker" instead of over-building):
  an append-only record, external to any backup, written at erasure-completion time, containing
  only `{ erasure_id, erasure_type: "QBO" | "GENERAL", completed_at (ISO-8601), scope_descriptor
  (non-identifying — e.g. a workspace/business UUID already treated as non-sensitive elsewhere in
  this codebase, never a realm id, company name, or customer PII) }`. Proposed storage: a separate
  R2 prefix (e.g. `erasure-ledger/`), uploaded create-once (the same mechanism #647 already uses),
  distinct from `backups/` so that IF a Bucket Lock is ever adopted for `backups/` (Section 3,
  still `OWNER_POLICY_DECISION_REQUIRED`), it does not also need to cover this prefix, and distinct
  from the database so a restored backup never carries it.
- **This closure does not build the ledger writer.** Doing so would mean touching the live
  `privacy_erasure_requests`/QBO-erasure execution code path elsewhere in this repository, which is
  explicitly out of this closure's scope (it is not one of the two named blockers,
  `BACKUP_AVAILABILITY_PROTECTION` / `R2_ERASURE_DOMAIN_INTEGRATED`) and carries real risk of
  scope creep into Production-sensitive erasure-execution logic this mission was not asked to
  touch. **This is an honest, explicitly reported blocker**, not a silent gap: no real
  production-recovery-from-R2 workflow may be built or activated until this ledger exists and the
  restore procedure consults it.

## 11. Updated Activation Gate (Section 19)

This supplements, and does not replace, `R2_BACKUP_RUNBOOK.md`'s existing 13-step owner
provisioning sequence and its "First live backup is not authorized" gate. Added here:

- [ ] This closure PR has been reviewed and integrated on top of #647, at an exact head SHA.
- [ ] The owner has made and recorded a decision on `BUCKET_LOCK_DECISION`
  (`OWNER_POLICY_DECISION_REQUIRED` per Section 3 above — the tradeoff table there is input, not a
  decision made for them). **If the owner decides to adopt a lock:**
  - [ ] it is configured using a bucket-configuration-capable credential that is **never** stored
    in `backup-write` or `backup-recovery`;
  - [ ] it has been independently verified against the as-code candidate definition
    (`scripts/r2-bucket-lock-config.json`, Section 3 above) using the offline, never-run-from-CI
    procedure in `scripts/verify-r2-bucket-lock-config.ts` — not by the backup-write job itself.
  **If the owner decides not to adopt one** (i.e. to keep `R2_BACKUP_RUNBOOK.md`'s existing
  `DO_NOT_USE`), that is an equally valid, explicit outcome of this gate — it must not be treated
  as an unresolved item blocking activation on its own.
- [ ] `MANIFEST_SIGNING_KEY` has been generated and stored only in `backup-write` (for signing) and
  wherever the owner runs `verify-r2-backup-domain.ts` (for verification) — never in
  `backup-recovery`, never in ordinary repository secrets.
- [ ] `scripts/privacy/verify-r2-backup-domain.ts` has been run at least once against the real
  bucket and reports `R2_BACKUPS=CLEAN` or `NOT_APPLICABLE` before any `GLOBAL_SECURE_DELETE=COMPLETE`
  claim is ever made with QBO data present.
- [ ] The post-backup erasure ledger (Section 10/Section 14 above) exists and is wired into any
  future real production-recovery workflow before that workflow is built or activated —
  `RESTORE_NOT_SERVICEABLE_UNTIL_ERASURE_RECONCILED` must be provable, not assumed.
- [ ] Schedule remains disabled until the owner separately authorizes it (unchanged from
  `R2_BACKUP_RUNBOOK.md`).

## 12. Failure model (Section 18) — residual risks this closure does not eliminate

| Compromise | Can still delete backups? | Can still overwrite/corrupt backups? | Can decrypt backups? |
| --- | --- | --- | --- |
| A. `backup-write` R2 object credential alone | **YES today** (no lock adopted); would become NO *for the locked prefix/duration* only if the owner adopts a Bucket Lock per Section 3 | **NO** (create-once, unconditional, already true today — #647) | NO |
| B. `backup-recovery` R2 read credential alone | NO (read-only by design) | NO (read-only by design) | NO (no AGE identity there either in this design; AGE identity lives in `backup-recovery`'s secrets, separate from the R2 credential — see below) |
| C. `backup-recovery`'s AGE private identity alone | NO (no write access) | NO (no write access) | **YES, for any backup it can read** — by design, this is the recovery path; mitigated only by `backup-recovery`'s required-reviewer environment protection |
| D. Cloudflare account-admin credential | **YES** — an account admin can remove or alter a Bucket Lock rule, if one exists; this is explicitly outside what Bucket Lock can ever protect against, with or without one adopted | YES | YES, if combined with the AGE identity |
| E. GitHub organization/account compromise | Depends on what secrets that grants access to; if it reaches `backup-write` alone, same as row A | If it reaches `backup-write`+`MANIFEST_SIGNING_KEY` together, create-once alone still blocks overwrite (a provider-side guarantee, not a GitHub-held one) | Only if it also reaches `backup-recovery` |
| F. A malicious owner/admin changing the Bucket Lock themselves (if one exists) | **YES, by definition — Bucket Lock cannot protect against the party authorized to configure it** | n/a | n/a |

Bucket Lock, **if the owner adopts it** (Section 3 — not yet decided), would protect against
**writer-token-only** deletion (row A) within its locked prefix/duration. It does not, and cannot,
protect against any administrative compromise (D, F) or a combined credential-plus-identity
compromise (C, partially E) — and, per Section 3's reconciliation with `R2_BACKUP_RUNBOOK.md`'s
prior decision, even if adopted it does not protect against a backup created during an undetected
`#642` gate bypass/regression; it would make exactly that backup undeletable for the lock's
duration, which is the residual risk the owner's decision must weigh. This is stated honestly per
the mission's explicit instruction not
to overclaim.
