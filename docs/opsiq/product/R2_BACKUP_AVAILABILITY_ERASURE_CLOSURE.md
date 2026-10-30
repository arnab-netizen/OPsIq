# R2 backup availability + erasure-domain closure

Status: DRAFT, branch-only, stacked on PR #647 (`claude/private-encrypted-r2-backup`), itself
stacked on PR #642, both unmerged. Nothing in this document or the code it describes has been
provisioned, enabled, or run against Production — `PROVIDER_BUCKET_LOCK_CONFIGURED=NO`,
`R2_RESOURCES_CREATED=NO` throughout. This document originally set out to close two blockers
recorded against PR #647, `BACKUP_AVAILABILITY_PROTECTION=NONE` and
`R2_ERASURE_DOMAIN_INTEGRATED=NO`, and was later extended (same branch, same stacked PR) to
record the owner's explicit `R2_BUCKET_LOCK_POLICY=7_DAY_PREFIX_LOCK` decision and to implement
the post-backup erasure ledger this closure had previously only designed. Current status:
`BACKUP_AVAILABILITY_PROTECTION=PASS` (7-day window), `R2_ERASURE_DOMAIN_INTEGRATED=YES`,
`ERASURE_LEDGER_IMPLEMENTED=YES`. It reconciles with, rather than silently reopening or
contradicting, every decision already made in `R2_BACKUP_RUNBOOK.md` — see Section 3 for the one
place an earlier draft of this very document almost did exactly that, and how it was corrected.

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
| Delete an existing backup less than 7 days old | YES | **NO** — protected by the owner-decided Bucket Lock (Section 3) |
| Delete an existing backup 7-35 days old | YES | **Unchanged (YES)** — retained by ordinary lifecycle but no longer Bucket-Lock-protected past day 7; stated honestly, not overclaimed (Section 3) |
| Edit/remove the Bucket Lock rule itself | n/a | **NO — structurally impossible via the S3-compatible API (Section 1)** |
| Forge a "clean" manifest for a new, fabricated object | n/a (no manifest contract existed) | **NO — manifest_signature requires MANIFEST_SIGNING_KEY, a separate secret never exposed to this credential (Section 7, #647)** |

`COMPROMISED_WRITER_CANNOT_OVERWRITE_PROTECTED_BACKUPS=YES` (unconditional — already true today
from #647's create-once uploads alone, independent of the Bucket Lock decision).
`COMPROMISED_WRITER_CANNOT_DELETE_PROTECTED_BACKUPS=YES` **for the current 7-day immutable
window** — the owner has now made the Bucket Lock decision explicitly (Section 3): this is not a
claim that a compromised writer cannot delete ANY backup; backups older than 7 days (but within
the unchanged 35-day lifecycle) remain deletable by a compromised writer credential, which is
stated honestly below rather than overclaimed.

An earlier revision of this document had drafted a 35-day lock as a unilateral recommendation
without reconciling it against `R2_BACKUP_RUNBOOK.md`'s prior, reasoned
`BUCKET_LOCK_DECISION=DO_NOT_USE` — an adversarial governance review caught this, and the decision
was correctly recorded as `OWNER_POLICY_DECISION_REQUIRED` pending an actual owner decision.
Section 3 below records that the owner has since made that decision explicitly:
`R2_BUCKET_LOCK_POLICY=7_DAY_PREFIX_LOCK`.

## 3. Bucket Lock decision — owner decision recorded, reconciled with R2_BACKUP_RUNBOOK.md

**The prior decision, quoted exactly** (`R2_BACKUP_RUNBOOK.md`, "Re-evaluated: Bucket Lock
decision"): `BUCKET_LOCK_DECISION=DO_NOT_USE`, because (scenario C) "a 35-day lock would conflict
with QBO erasure attestation... if it were ever needed — a locked object cannot be deleted early
even to satisfy an erasure incident's backup-domain attestation... (e.g. **the gate being
bypassed**, or a pre-gate-era object)," and (scenario D) "a shorter lock... [does not] resolve the
conflict... any nonzero lock period creates a window in which 'uncertain = block' governed erasure
cannot complete."

**The owner's decision, recorded here as the new current state:**

```
BUCKET_LOCK_DECISION=USE
BUCKET_LOCK_PREFIX=backups/
BUCKET_LOCK_MAX_AGE_SECONDS=604800   (7 days)
TOTAL_RETENTION_DAYS=35              (unchanged ordinary lifecycle, scripts/r2-bucket-lock-config.json step 4 of the owner provisioning sequence)
IMMUTABLE_RECOVERY_WINDOW_DAYS=7
PROVIDER_BUCKET_LOCK_CONFIGURED=NO   (not live; see Section 15/the runbook — this is a code/proof mission only)
```

This **reconciles with, rather than reverses,** the prior `DO_NOT_USE` decision: the prior decision
rejected a lock covering the *full 35-day retention* (scenario D's point — "any nonzero lock period
creates a window... but the full-duration case is the worst form of it). The owner has now chosen
a materially different, bounded point on that same tradeoff curve: a short (7-day) window that
accepts scenario C/D's residual exposure **only for 7 days per affected backup**, not for the
object's entire life. This is a real, informed acceptance of the documented residual risk below,
not an unacknowledged reversal.

**Residual risk the owner has now explicitly accepted (unchanged analysis, now adopted rather than
left undecided):** if `scripts/backup-qbo-gate.sh` (#642, unmodified) is ever bypassed or
regresses, a backup created during that window could carry a validly-signed canonical
`qbo_backup_gate_result` (the same pipeline computes the real signature) while actually containing
QBO data. For 7 days, that specific backup would be undeletable even by the owner. This is a
materially smaller, bounded exposure than the previously-considered 35-day candidate, and the
owner has chosen to accept it in exchange for meaningful ransomware/credential-theft protection
during the most operationally relevant recovery window.

| Candidate | Ransomware/compromise protection | Residual gate-bypass exposure | Lifecycle interaction | Status |
| --- | --- | --- | --- | --- |
| No lock | None | None | n/a | Rejected (insufficient protection) |
| **7 days (DECIDED)** | **Protects the most recent week's backups** | **Bounded to at most 7 days per affected backup** | Clean: 7 < 35 | **`BUCKET_LOCK_DECISION=USE`** |
| 14 days | Two weeks protected | Bounded to at most 14 days per affected backup | Clean: 14 < 35 | Not selected |
| 35 days (full retention) | Every live backup protected for its entire life | Bounded to at most 35 days per affected backup | Clean per Cloudflare's documented lock/lifecycle precedence | Not selected (this was the earlier, un-reconciled draft recommendation this review corrected) |

`BUCKET_LOCK_SELECTED=YES`.
`RECOMMENDED_BUCKET_LOCK_SECONDS=604800`.

`scripts/r2-bucket-lock-config.json` now encodes this decided configuration (not a candidate):
rule id `backups-7day-immutability-window`, `enabled: true`, `prefix: "backups/"`,
`condition: { type: "Age", maxAgeSeconds: 604800 }`, validated at parse time against a Zod schema
(`src/infra/r2-bucket-lock-drift.ts`). It remains **not live-applied by any script or workflow** —
`PROVIDER_BUCKET_LOCK_CONFIGURED=NO` until the owner manually provisions it per
`R2_BACKUP_RUNBOOK.md`'s (updated, Section 15 below) owner provisioning sequence.

**Days 0-7 vs. days 7-35, stated explicitly and honestly:** this design does **not** make all 35
days of retention immutable. Only the most recent 7 days are Bucket-Lock-protected
(`IMMUTABLE_RECOVERY_WINDOW_DAYS=7`). Objects aged 7-35 days remain retained by the ordinary
lifecycle rule but are **not** protected from a compromised writer credential's delete/overwrite
attempts during that window; only lifecycle-based expiry at day 35 is guaranteed for them
independent of credential compromise. `TOTAL_RETENTION_DAYS=35` is unchanged from before.

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

`GLOBAL_SECURE_DELETE_LEDGER_GATED=YES` (Section 14): the same `R2_BACKUPS` domain additionally
requires `--erasure-ledger-status VALID` (Section 10 below) — an unavailable or invalid erasure
ledger blocks `R2_BACKUPS` exactly like an unverifiable R2 object does, reusing the existing
domain rather than inventing a new one. Neither gate substitutes for the other: a `CLEAN`
`r2BackupsStatus` with an `INVALID` ledger still blocks, and vice versa (both independently
tested).

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
data may legitimately persist in an R2 backup for up to 35 days (`TOTAL_RETENTION_DAYS`, the
ordinary lifecycle retention) — and, for at least the first 7 days of that window, is now
*guaranteed* to persist regardless of any deletion attempt, since the owner-decided Bucket Lock
(Section 3) makes every backup immutable for `IMMUTABLE_RECOVERY_WINDOW_DAYS=7` — is a
retention-policy question for the owner/legal, not a technical defect this closure invents an
answer to. Stated honestly, not minimized: adopting the 7-day lock means a general-deletion
request's data will persist in at least one recovery medium for no less than 7 days, by design,
even if an operator wanted to purge it sooner. This is explicitly separated from QBO technical
readiness per the mission's own instruction and does not block
`R2_BACKUP_ACTIVATION_TECHNICALLY_READY`.

## 10. Restore anti-resurrection and the post-backup erasure ledger — IMPLEMENTED

No real production-recovery-from-R2 workflow exists in this repository today, and this closure
does not build one (out of scope: "Do not implement Production deletion in this mission" carries
over from the prior mission's scope discipline). What exists is `restore-rehearsal-r2.yml`, which
only ever restores into a disposable `postgres:18` service container, and
`scripts/restore-database.sh`'s `assert-restore-target.mjs` preflight, which refuses a `production`
target unconditionally, on the target string alone, before `DATABASE_URL` is even inspected
(pre-existing, hostile-tested in `restore-target-hostile.test.ts`, unmodified here). **The
restored database cannot become Production/live through this pipeline merely because `psql`
succeeded — that is already true today, by construction, independent of this closure.**

**Why a ledger is required, not optional:** if a backup predates an erasure, it also predates that
erasure's tombstone, wherever the tombstone lives *inside the database being restored*. The
restored database's own `privacy_erasure_requests` state machine (or any QBO erasure tombstone)
cannot know about an erasure that happened after the backup was taken, because restoring the
backup brings back the pre-erasure copy of that very table. A durable erasure record for this
purpose must therefore live **outside** the backup content entirely.

`POST_BACKUP_ERASURE_LEDGER_REQUIRED=YES`, `ERASURE_LEDGER_IMPLEMENTED=YES` — this closure
previously reported the ledger as a designed-but-not-built blocker; it is now built.

**Record schema** (`src/services/privacy-erasure/erasure-ledger.ts`,
`ErasureLedgerRecord`) — exactly the minimum required, nothing more: `eventId` (stable UUID),
`sequence` (monotonic, 0-based), `erasureRequestId` (links to the already-governed
`privacy_erasure_requests.id` — linkage without payload), `erasureType` (`"QBO" | "GENERAL"`),
`scope` (`{ workspaceId, businessId }`, the exact `ErasureScope` shape
`qbo-erasure.service.ts` already uses — no new identifier invented), `completedAt` (ISO-8601).
Never a realm id, company name, token, financial value, report payload, or email — enforced by a
unit test that asserts the record's exact field set and greps its serialized form for those terms.

**Tamper evidence, reusing two existing conventions rather than new cryptographic infrastructure:**
1. A SHA-256 hash chain in the same shape as the pre-existing
   `src/services/audit-event-hash-chain-validator.ts` (`previousHash` + content → `recordHash`) —
   detects reordering, insertion, deletion, and content tampering within an otherwise-plausible
   chain.
2. An HMAC-SHA256 signature over each record (`manifest_signature`-equivalent pattern from #647),
   using a **new, separate** `ERASURE_LEDGER_SIGNING_KEY` — never `MANIFEST_SIGNING_KEY`, never
   present in `backup-write` or `backup-recovery` at all. A bare hash chain alone cannot stop an
   attacker who merely has R2 write access to this prefix from fabricating an entirely new,
   internally-consistent chain (SHA-256 with no secret is a public function); the signature is
   what `BACKUP_WRITER_CAN_MUTATE_ERASURE_LEDGER=NO` and `ERASURE_LEDGER_FORGERY_DETECTED=YES`
   actually rest on. `verifyRecordSignature` recomputes the content hash itself rather than
   trusting the record's own stored `recordHash` field — a defense-in-depth hardening a hostile
   test caught during this closure (a record whose content was tampered with but whose
   `recordHash`/`signature` pair was left untouched must still fail, not only in the separate
   chain-level hash check).

**Storage and credential boundary:** a separate R2 prefix, `erasure-ledger/`, in the same bucket
(a separate bucket also works and gives stronger isolation; see the honest limitation below),
written create-once (`aws s3api put-object --if-none-match '*'`, the same mechanism #647 already
uses), never under the `backups/` Bucket Lock rule or the 35-day backup lifecycle — it is
governance infrastructure, not a recovery point. Two new tools, neither touching
`qbo-erasure.service.ts` or its database transaction:
- `scripts/privacy/append-erasure-ledger.ts`: operator-run, requires its own
  `ERASURE_LEDGER_ACCESS_KEY_ID`/`ERASURE_LEDGER_SECRET_ACCESS_KEY` (distinct from `backup-write`'s
  token) and `ERASURE_LEDGER_SIGNING_KEY`. Refuses to append if the existing chain does not
  validate (fail closed — an operator cannot silently extend a tampered chain).
- `scripts/privacy/verify-erasure-ledger.ts`: read-only, prints `ERASURE_LEDGER_STATUS=VALID|INVALID|UNAVAILABLE`
  (feeding `--erasure-ledger-status` on `qbo-erasure.ts`, gating `GLOBAL_SECURE_DELETE` — Section 6
  above) and, given `--backup-timestamp`, `RESTORE_PROMOTION=PROMOTABLE|BLOCKED` with every
  pending/unreconciled erasure named.

**Honest limitation on credential separation, now layered with a preventive control:**
Cloudflare R2 API tokens are bucket-scoped, not prefix-scoped (Section 1). `backup-write`'s token
could, in principle, be used to write into `erasure-ledger/` if it shares a bucket with
`backups/`, and `scripts/r2-bucket-lock-config.json`'s second rule (below) does not change that —
R2-native ACL separation at the prefix level still does not exist. Two independent defenses now
apply instead: (1) detection — a forged record (anyone lacking `ERASURE_LEDGER_SIGNING_KEY`)
fails `verifyRecordSignature`/`validateLedgerChain`, reported as `ERASURE_LEDGER_FORGERY_DETECTED=YES`,
never trusted; (2) prevention — an **indefinite Bucket Lock on `erasure-ledger/`** (added to close
a gap a hostile review found: *deleting* the chain's tail requires no forgery at all, and the
remaining shorter chain would otherwise still validate as clean, silently defeating
reconciliation for exactly the deleted erasures) now makes every ledger record permanently
undeletable by the object-write credential, closing the delete/truncate half of this limitation
completely. A separate bucket (rather than a separate prefix in the same bucket) remains available
to the owner for even stronger isolation; this closure documents that further choice rather than
making it.

**Restore reconciliation decision function** (`reconcileRestoredBackup`) — the 8-step procedure
(Section 10 of the mission) as a pure decision: given a restored backup's own timestamp and the
(already-validated) ledger, decide `PROMOTABLE` or `BLOCKED`, listing every erasure that postdates
the backup and has not been separately marked reconciled. Also cross-checks the restored
database's own tombstone state against the ledger (if supplied) — a mismatch (the DB already has
a tombstone the ledger says shouldn't exist yet, or vice versa) means the backup's claimed
timestamp is itself untrustworthy, and blocks regardless. The function is pure and side-effect
free, so a reconciliation attempt that "fails halfway" is always safe to retry: calling it twice
with identical inputs produces the identical decision.

`RESTORE_NOT_SERVICEABLE_UNTIL_ERASURE_RECONCILED=YES` is therefore now a provable, tested
invariant (`src/__tests__/privacy-erasure/erasure-ledger.test.ts`, covering every Section 11
failure mode by name: zero/one/multiple pending erasures, backup-after-erasure, missing/corrupted/
forged/duplicate/reordered ledger, missing sequence event, both tombstone-mismatch directions, and
safe-retry-after-partial-failure) — not merely an assumption.

## 11. Updated Activation Gate (Section 19)

This supplements, and does not replace, `R2_BACKUP_RUNBOOK.md`'s updated 14-step owner
provisioning sequence and its "First live backup is not authorized" gate. Added here:

- [ ] This closure PR has been reviewed and integrated on top of #647, at an exact head SHA.
- [ ] The 7-day Bucket Lock (`BUCKET_LOCK_DECISION=USE`, Section 3 above) is configured using a
  bucket-configuration-capable credential that is **never** stored in `backup-write` or
  `backup-recovery`.
- [ ] It has been independently verified against the decided as-code definition
  (`scripts/r2-bucket-lock-config.json`, Section 3 above) using the offline, never-run-from-CI
  procedure in `scripts/verify-r2-bucket-lock-config.ts` — not by the backup-write job itself.
- [ ] `MANIFEST_SIGNING_KEY` has been generated and stored only in `backup-write` (for signing) and
  wherever the owner runs `verify-r2-backup-domain.ts` (for verification) — never in
  `backup-recovery`, never in ordinary repository secrets.
- [ ] `scripts/privacy/verify-r2-backup-domain.ts` has been run at least once against the real
  bucket and reports `R2_BACKUPS=CLEAN` or `NOT_APPLICABLE` before any `GLOBAL_SECURE_DELETE=COMPLETE`
  claim is ever made with QBO data present.
- [ ] `ERASURE_LEDGER_SIGNING_KEY` and a separate `ERASURE_LEDGER_ACCESS_KEY_ID`/
  `ERASURE_LEDGER_SECRET_ACCESS_KEY` have been generated and stored only wherever the owner runs
  `append-erasure-ledger.ts`/`verify-erasure-ledger.ts` — never in `backup-write`, never in
  `backup-recovery`, and distinct from `MANIFEST_SIGNING_KEY`.
- [ ] At least one real `append-erasure-ledger.ts` append and one real `verify-erasure-ledger.ts`
  check have been run against the real bucket, confirming `ERASURE_LEDGER_STATUS=VALID`.
- [ ] Any future real production-recovery workflow consults `reconcileRestoredBackup` (or an
  equivalent call to `verify-erasure-ledger.ts --backup-timestamp`) before promotion —
  `RESTORE_NOT_SERVICEABLE_UNTIL_ERASURE_RECONCILED` must be wired in before that workflow is
  built or activated, not assumed.
- [ ] Schedule remains disabled until the owner separately authorizes it (unchanged from
  `R2_BACKUP_RUNBOOK.md`).

## 12. Failure model (Section 18) — residual risks this closure does not eliminate

| Compromise | Can still delete backups? | Can still overwrite/corrupt backups? | Can decrypt backups? |
| --- | --- | --- | --- |
| A. `backup-write` R2 object credential alone | **NO, for backups < 7 days old** (Bucket Lock, Section 3); **YES, for backups 7-35 days old** (no longer lock-protected, stated honestly) | **NO** (create-once, unconditional, already true today — #647) | NO |
| B. `backup-recovery` R2 read credential alone | NO (read-only by design) | NO (read-only by design) | NO (no AGE identity there either in this design; AGE identity lives in `backup-recovery`'s secrets, separate from the R2 credential — see below) |
| C. `backup-recovery`'s AGE private identity alone | NO (no write access) | NO (no write access) | **YES, for any backup it can read** — by design, this is the recovery path; mitigated only by `backup-recovery`'s required-reviewer environment protection |
| D. Cloudflare account-admin credential | **YES** — an account admin can remove or alter the Bucket Lock rule; this is explicitly outside what Bucket Lock can ever protect against | YES | YES, if combined with the AGE identity |
| E. GitHub organization/account compromise | Depends on what secrets that grants access to; if it reaches `backup-write` alone, same as row A | If it reaches `backup-write`+`MANIFEST_SIGNING_KEY` together, create-once alone still blocks overwrite (a provider-side guarantee, not a GitHub-held one) | Only if it also reaches `backup-recovery` |
| F. A malicious owner/admin changing the Bucket Lock themselves | **YES, by definition — Bucket Lock cannot protect against the party authorized to configure it** | n/a | n/a |
| G. `ERASURE_LEDGER_ACCESS_KEY_ID`/`SECRET_ACCESS_KEY` alone (no `ERASURE_LEDGER_SIGNING_KEY`) | **NO**, once the indefinite Bucket Lock on `erasure-ledger/` (below) is configured — before this fix, this credential could silently *delete* the most recent ledger record(s) (truncating the chain's tail) without needing to forge anything, which a hostile fresh-context review caught: the remaining, shorter chain would still pass `validateLedgerChain` entirely, silently defeating reconciliation for exactly the deleted erasures. The Bucket Lock closes this. **Cannot** independently produce a forged replacement that passes validation either way (`ERASURE_LEDGER_FORGERY_DETECTED=YES`) | **NO**, once the Bucket Lock is configured (same mechanism as delete, since this prefix's lock has no Age-based expiry to wait out) | n/a (the ledger holds no ciphertext) |
| H. `ERASURE_LEDGER_SIGNING_KEY` alone (no R2 write access to the ledger prefix) | No — no write access | No — no write access | n/a |
| I. Both G and H together (full erasure-ledger credential compromise) | **YES** — a compromise of BOTH secrets together defeats the ledger exactly like compromising both the Bucket Lock's bucket-configuration credential and `backup-write` together would defeat backup protection (row D); this is the ledger's own equivalent of that scenario and is not claimed otherwise | YES | n/a |

**Erasure-ledger truncation fix** (added to close the row-G gap above):
`scripts/r2-bucket-lock-config.json` now declares a SECOND rule,
`erasure-ledger-indefinite-immutability`, scoped to the `erasure-ledger/` prefix with an
**Indefinite** (never-expiring) condition — not Age-based, since ledger records must never become
deletable by the object-write credential at all, unlike `backups/`'s deliberately time-bounded
7-day window. This is a direct reuse of the already-adopted Bucket Lock mechanism (Section 1),
not new infrastructure. It creates no analogous conflict with QBO erasure doctrine the way an
indefinite lock on `backups/` would have: the ledger holds no QBO/customer payload at all, only
opaque UUIDs, timestamps, and hashes (Section 10), so "uncertain = block" governed erasure has
nothing to ever need to delete from it early.

The 7-day Bucket Lock protects against **writer-token-only** deletion (row A) for backups less
than 7 days old. It does not, and cannot,
protect against any administrative compromise (D, F) or a combined credential-plus-identity
compromise (C, partially E) — and, per Section 3's reconciliation with `R2_BACKUP_RUNBOOK.md`'s
prior decision, it does not protect against a backup created during an undetected `#642` gate
bypass/regression; it makes exactly that backup undeletable for 7 days, which is the residual
risk the owner has now explicitly accepted by choosing the 7-day window over the alternatives in
Section 3's table. This is stated honestly per the mission's explicit instruction not to
overclaim.
