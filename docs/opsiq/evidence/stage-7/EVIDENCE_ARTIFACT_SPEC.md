# Factory Stage 7 — Evidence Capture Framework (design)

**Status:** infrastructure only. This document and the code it describes generate **no
evidence**, change **no invariant status**, and create **no waiver**.
**Authority:** `docs/opsiq/bundles/factory-stage-7-closure.yaml` is the contract.
`docs/opsiq/evidence/stage-7/README.md` is the frozen evidence standard (PR-1A). This
document specifies the *machine-checkable* form of that standard and nothing else.

---

## 1. The problem this closes

The Stage 7 evidence standard (PR-1A) states the producer rule in prose:

> LANE_C and LANE_E artifacts must be produced by a CI run and must carry that run id.
> **An artifact produced by an interactive agent session is not valid evidence.**

Prose is not enforcement. Two gaps followed from that.

**Gap 1 — no artifact form.** The standard lists thirteen fields in a markdown table. No
file format, no schema, no validator. Any file an agent chose to write could be called an
artifact, and nothing could contradict it.

**Gap 2 — `proof_artifacts` accepts any non-empty string.** PR-1B's
`scripts/lib/invariant-closure.mjs` requires each invariant to carry
`status: PROVEN` plus at least one non-empty `proof_artifacts` entry. It deliberately does
not interpret those entries — that was correct for PR-1B's scope, but it means the string
`"proved it"` currently satisfies the same test as a real captured observation.

This framework supplies the missing form: a canonical artifact, a schema, a validator that
computes an acceptance level, and a CI helper that is the only supported producer. Wiring
`proof_artifacts` to require an `ACCEPTED` artifact is a separate change (§9, gap G-1) and
is deliberately **not** made here — PR-1B is not yet merged and mixing the two would put
two root-cause classes in one PR.

---

## 2. Threat model

The adversary is **a well-intentioned agent under pressure to show progress**, with full
write access to the working tree and the ability to open a PR. It cannot read GitHub
Actions secrets, cannot execute a GitHub Actions run on a protected workflow without a
merge, and cannot post as the owner's GitHub account.

Everything below follows from that boundary. Anything the agent can write unaided must not
reach `ACCEPTED`.

| Attack | Defeated by |
|---|---|
| Hand-written artifact | `producer.type` must be `github_actions`; signature required |
| Fabricated `run_id` | Signature (§5) + GitHub API cross-check (§6) |
| Real `run_id`, invented observation | Signature covers `content_hash` and `run_id` together |
| Edited `raw` observation | `content_hash` mismatch, then signature mismatch |
| Edited `content_hash` | Signature mismatch |
| Edited `captured_at_utc` | Signature mismatch; run-window cross-check |
| Copied artifact re-filed under another invariant | `artifact_id` is derived from content; id/filename/duplicate checks |
| Copied artifact verbatim | Still bound to its original invariant and observation; duplicate id rejected |
| Missing `replay.command` | Schema requires it on replayable lanes |
| Wrong producer (`interactive_agent`, `local`, `owner` on a CI lane) | Lane→producer table (§4) |
| Secret pasted into the observation | Redaction scan runs in both the capture helper and the validator |
| Artifact captured against an unmerged SHA | Ancestry check under `--require-provenance` |
| Forged owner attestation | Comment-author cross-check against the owner allowlist (§6.2) |

**Not defeated, stated plainly:** an agent that can get a workflow of its own authorship
merged onto a protected branch can make CI sign whatever that workflow computes. The
mitigation is procedural and already exists — the exact-SHA merge policy in `CLAUDE.md`
plus scoping the signing key to a GitHub environment with required reviewers (§9, gap G-3).

---

## 3. Artifact shape

One artifact = one invariant × one observation × one attempt. Stored as JSON at
`docs/opsiq/evidence/stage-7/artifacts/<artifact_id>.json`, committed to git. Git is the
retention layer, because production runtime-log retention is ~1h (PR-1A README §1).

Artifacts are **append-only**. A correction is a new artifact with `supersedes` set to the
id it replaces. Never edit an artifact in place.

```jsonc
{
  "evidence_version": "1.0.0",          // schema version of this artifact
  "artifact_id": "evd_<32 hex>",        // derived from content — never chosen
  "invariant_id": "S7-I11",             // S7-I1 … S7-I16
  "lane": "LANE_E",                     // LANE_C | LANE_D | LANE_E | LANE_F | OWNER_ACCEPTANCE
  "proof_type": "simulation_adversarial",
  "artifact_classification": "INTERNAL_ONLY",   // INTERNAL_ONLY | OWNER_VISIBLE | CLIENT_VISIBLE
  "environment": "ci",                  // production | isolated_simulation | ci
  "method": "test_run",                 // http_probe | db_query | test_run | migration_check | preflight | owner_attestation
  "captured_at_utc": "2026-08-03T11:04:07.000Z",
  "subject_sha": "<40 hex>",            // the commit the observation was made against
  "deployment_id": null,                // required for LANE_C, null elsewhere
  "producer": {
    "type": "github_actions",           // github_actions | owner
    "repository": "arnab-netizen/OPsIq",
    "workflow": "Stage 7 Evidence Capture",
    "workflow_ref": "arnab-netizen/OPsIq/.github/workflows/stage7-evidence-capture.yml@refs/heads/main",
    "job": "capture",
    "run_id": "30763043671",
    "run_number": 412,
    "run_attempt": 1,
    "run_started_at": "2026-08-03T11:03:55.000Z",
    "actor": "arnab-netizen",
    "event_name": "workflow_dispatch",
    "owner_identity": null,             // owner lanes only
    "owner_attestation_ref": null       // owner lanes only — GitHub comment URL
  },
  "replay": {
    "replayable": true,
    "command": "npx vitest run src/__tests__/... --reporter=basic"
  },
  "observation": {
    "raw": "…verbatim output, never paraphrased…",
    "content_hash": "sha256:<64 hex>",
    "byte_length": 4211,
    "truncated": false
  },
  "assertion": "Nine adversarial failure scenarios each fail safely, visibly and recoverably.",
  "result": "PASS",                     // PASS | FAIL | BLOCKED | NOT_TESTED
  "redaction_attestation": {
    "attested": true,
    "statement": "No secret, token, credential value or connection string appears in this artifact.",
    "scanner": "evidence-redaction-scan@1",
    "patterns_checked": 14
  },
  "supersedes": null,
  "signature": {
    "algorithm": "HMAC-SHA256",
    "key_id": "stage7-evidence-v1",
    "value": "<64 hex>"
  }
}
```

Field-by-field constraints are in `schema/evidence-artifact.v1.schema.json`; that file and
`scripts/lib/evidence-artifact.mjs` are the two places the rules live, and the schema is
the documented one — the library is executable and is what CI runs.

### 3.1 Mapping to the frozen standard

Every field of the PR-1A table is present. Nothing was dropped, three were made structured:

| PR-1A field | Here |
|---|---|
| `invariant_id`, `lane`, `captured_at_utc`, `subject_sha`, `deployment_id`, `environment`, `method`, `assertion`, `result`, `supersedes` | identical |
| `producer` | `producer` object — a bare string cannot carry a run id, workflow, job and attempt |
| `raw_observation` | `observation.raw` |
| `content_hash` | `observation.content_hash`, prefixed with its algorithm |
| `redaction_attestation` | `redaction_attestation` object — a claim plus the scanner that backs it |
| (new) `replay` | the standard requires a replay command in prose; it is now a field |
| (new) `artifact_id`, `evidence_version`, `artifact_classification`, `proof_type`, `signature` | required by this framework |

---

## 4. Lane → producer binding

The producer rule is a table, not prose, and the validator reads the table.

| Lane | `producer.type` | run id | `replay.replayable` | `deployment_id` |
|---|---|---|---|---|
| `LANE_C` | `github_actions` | required | `true`, command required | **required** |
| `LANE_D` | `github_actions` | required | `true`, command required | optional |
| `LANE_E` | `github_actions` | required | `true`, command required | must be null |
| `LANE_F` | `owner` | must be absent | `false`, command must be absent | optional |
| `OWNER_ACCEPTANCE` | `owner` | must be absent | `false`, command must be absent | must be null |

`producer.type` has exactly two legal values. There is no `interactive_agent` value: an
agent session has no representable producer identity, which is the point. An artifact
without a legal producer is `REJECTED` before any other check runs.

---

## 5. Identity, hashing and signature

**Canonical form.** Keys sorted, no whitespace, recursive. Identical to the convention in
`src/services/integrity/hash.ts` (`canonicalStringify`). It is restated in
`scripts/lib/evidence-artifact.mjs` rather than imported because the validator is a plain
`.mjs` script that CI runs without a TypeScript build; the two are covered by a test that
asserts they agree.

**Content hash.** `sha256:<hex>` over the UTF-8 bytes of `observation.raw` exactly. Not
over a normalised, trimmed or re-serialised copy.

**Artifact id.** `evd_` + the first 32 hex of the sha256 of the canonical envelope with
`artifact_id` and `signature` removed. The id is therefore a function of the content: it
cannot be chosen, and two artifacts differing in any field cannot share one. The file must
be named `<artifact_id>.json`, and a duplicate id anywhere under the artifacts tree is a
violation — that is what makes "copy a valid artifact and re-file it" fail.

**Signature.** `HMAC-SHA256(canonical(envelope minus signature), EVIDENCE_SIGNING_KEY)`,
compared with `timingSafeEqual`. The key exists only as a GitHub Actions secret. It is
never written to an artifact, never logged, and never passed on a command line.

Because the signature covers the whole envelope, the run id, the subject SHA, the capture
timestamp, the content hash and the assertion are bound to each other. Changing any one of
them invalidates the artifact, and re-deriving a valid signature requires the key.

**If the key is not provisioned** the capture helper still produces a structurally valid
artifact with `signature: null`, and the validator classifies it `UNVERIFIED`. Unverified
evidence is not evidence: it may never back a `PROVEN` invariant. Fail-closed by default.

---

## 6. Provenance cross-check (online)

Signature proves *something in CI with the key* produced the artifact. Provenance proves
*that specific run happened, on that commit*. Both are required for `ACCEPTED`. Provenance
runs only under `--require-provenance` because it needs `GH_TOKEN` and network.

### 6.1 CI lanes

`GET /repos/{repository}/actions/runs/{run_id}` must return a run where:

- `head_sha` === `subject_sha`
- `name` === `producer.workflow`
- `run_attempt` === `producer.run_attempt`
- `run_number` === `producer.run_number`
- `event` === `producer.event_name`
- `run_started_at` === `producer.run_started_at`
- `captured_at_utc` lies between `run_started_at` and `updated_at`, inclusive
- the run's repository is `producer.repository`

A fabricated run id fails at the request. A real run id borrowed from another workflow
fails on `name`, `head_sha` or the timestamp window.

### 6.2 Owner lanes

`producer.owner_attestation_ref` must be a GitHub issue- or PR-comment URL in this
repository. The comment is fetched and must satisfy:

- comment author login ∈ the owner allowlist (`EVIDENCE_OWNER_LOGINS`, default: the
  repository owner)
- the comment body contains the exact `artifact_id`
- the comment body contains the exact `subject_sha`

An agent cannot post a comment as the owner's account, so it cannot manufacture this.

### 6.3 Ancestry

Under `--require-provenance`, `subject_sha` must be known to the local clone and must be an
ancestor of `origin/main`. The frozen standard requires it ("an artifact whose
`subject_sha` is not an ancestor of `main` is invalid"), and it is why capture is intended
to run on `main`, not on a PR branch. Unchanged by control-plane mode (§6.4): a
control-plane artifact's `subject_sha` is still required to be an ancestor of `main`,
exactly as for a legacy artifact.

### 6.4 Control-plane capture mode (additive, optional)

`workflow_dispatch --ref <immutable-subject-tag>` checks out the **entire** workflow/
action/script tree from that tag — not just the triggering event. That means a fix landed
on `main` to this repository's *own* evidence tooling (the validator, the capture action,
this library) never takes effect for a dispatch against a frozen historical subject tag:
the frozen tag's own old copies of that tooling run instead. For a legacy capture this is
by design — the job's own checkout **is** the subject, so running the subject's own tooling
against the subject's own code is exactly the point. It becomes a problem only when the
tooling itself needs a fix that a frozen historical subject can never carry.

Control-plane mode is a second, additive way to produce an artifact: the job dispatches
from `refs/heads/main` (never a tag), so its own checkout — and every composite action and
script it calls via `uses: ./...` or `node scripts/...` — is current main's tooling. The
commit actually being *observed* is checked out separately, read-only, into an isolated
`./subject` path, and only the governed probe script itself runs from there. The two
identities are recorded separately in `producer` and are never conflated:

| Field | Meaning |
|---|---|
| `capture_mode` (top-level, optional) | absent = legacy; `"control_plane"` = this mode |
| `producer.control_plane_sha` | the commit whose tooling actually executed (must equal the run's own `head_sha`, and must be an ancestor-of-main tip — enforced as exactly `refs/heads/main` at capture time) |
| `producer.control_plane_ref` | must be exactly `"refs/heads/main"` |
| `producer.subject_tag` | the immutable subject tag naming the observed commit (must equal the one currently authorized — `CONTROL_PLANE_AUTHORIZED_SUBJECT_TAG` in `scripts/lib/evidence-artifact.mjs`) |
| `subject_sha` | unchanged in meaning — the commit actually observed — but now *derived* from the governance manifest cross-checked against the immutable tag, never read from `GITHUB_SHA` |

**Two independent gates, not one relaxed gate.** OPTION A (§ above, unchanged) asks "is the
commit this job checked itself out at the one commit currently authorized to be observed" —
true by construction when the job's own checkout is the subject. The CONTROL-PLANE
authorization gate (`resolveControlPlaneSubject` in `scripts/lib/evidence-artifact.mjs`)
asks a different question — "does the one subject tag this build is allowed to trust
currently resolve to exactly the commit the governance manifest names as authorized" —
because a control-plane job's own checkout is main, not the subject, so OPTION A's question
no longer applies. Neither gate is a caller input: `fetchMainManifest` and `resolveTagSha`
are injected I/O (real `git`/GitHub calls at runtime, fixtures in tests), and the subject
tag name is a reviewed source constant, never a workflow input or CLI flag.

**Re-verified on every future validation, not only at capture time.** Because a
control-plane run's own `head_sha` proves nothing about the subject (they are, by design,
different commits), `evaluateRunProvenance` independently re-resolves `producer.subject_tag`
via the GitHub API on every `--require-provenance` run and refuses if it no longer matches
`subject_sha` — catching a subject tag that moved *after* capture, not just a mismatch at
capture time.

**Backward compatibility.** `capture_mode` is the only new top-level field, and it is
optional: every artifact ever captured, and every call site that never sets it, is governed
by exactly the same code paths as before this mode existed. `evidence_version` is not
bumped. The documented JSON schema (`schema/evidence-artifact.v1.schema.json`) continues to
describe only the base (legacy) shape; `capture_mode` and the three `producer.control_plane_*`
/ `producer.subject_tag` fields are validated by the executable library only. OPTION A
(`resolveCaptureAuthorization`) is untouched — it is not shared code with
`resolveControlPlaneSubject`, on purpose, so nothing about this mode's existence can affect
OPTION A's exact behavior or the artifacts it has already authorized.

Scope: only S7-I4, S7-I5 and S7-I10-LANE_C currently use control-plane mode
(`.github/workflows/stage7-capture-control-plane.yml`), because those are the only
invariants with a correction blocked by a predecessor that exists solely on `main` (see
`docs/opsiq/evidence/stage-7/README.md` and PR history). `stage7-capture.yml` (the legacy,
tag-dispatched workflow) is unchanged and remains the path for every other invariant.

---

## 7. Acceptance levels

| Level | Meaning | May back a `PROVEN` invariant |
|---|---|---|
| `REJECTED` | one or more structural, lane, hash, signature or provenance violations | never |
| `UNVERIFIED` | structurally valid, but signature absent or provenance not checked | **no** |
| `ACCEPTED` | structural + signature verified + provenance verified | yes |

`scripts/validate-evidence-artifacts.mjs` exits 1 if any artifact is `REJECTED`. With
`--require-accepted` it also exits 1 for `UNVERIFIED` — that is the mode a future closure
gate uses. The PR lane runs the default mode, so a malformed artifact is caught on the PR
that introduces it.

Zero artifacts is not a pass and not a failure: the validator reports the count and says
so explicitly. It never prints anything that could be read as Stage 7 progress.

---

## 8. Components

| Component | Path | Runs where |
|---|---|---|
| Schema | `docs/opsiq/evidence/stage-7/schema/evidence-artifact.v1.schema.json` | documentation / editor tooling |
| Helper library | `scripts/lib/evidence-artifact.mjs` | pure, no I/O — shared by helper, validator and tests |
| CI capture helper | `scripts/capture-evidence.mjs` | GitHub Actions only; refuses to run elsewhere |
| Validator | `scripts/validate-evidence-artifacts.mjs` | PR CI, and any future closure gate |
| CI action | `.github/actions/stage7-evidence-capture/action.yml` | composite action, called by a capture job |
| Control-plane capture workflow | `.github/workflows/stage7-capture-control-plane.yml` | dispatched from `refs/heads/main` only — see §6.4 |

A composite action rather than a reusable workflow, deliberately: the observation must
be the verbatim output of a step the calling job already ran, and a composite action
shares that job's workspace. A reusable workflow would have to take the observation as a
string input, interpolated into a shell command on the one job that holds the signing key.
Every input is passed through `env:` and never interpolated into a `run:` body.

No workflow calls the action. Adding one is evidence generation and needs owner
authorisation (gap G-4).

The capture helper takes **no** provenance from its arguments. Run id, workflow, job,
attempt, actor, event and subject SHA come from `GITHUB_*` environment variables and
nowhere else. A caller cannot pass `--run-id`, because no such flag exists.

---

## 9. Remaining gaps before real evidence can be collected

These are owner actions or follow-up PRs. None can be closed by an agent session.

| # | Gap | Blocks | Owner action |
|---|---|---|---|
| G-1 | `proof_artifacts` entries are still free strings; nothing requires them to name an `ACCEPTED` artifact | all invariants | follow-up PR after PR-1B merges, wiring `invariant-closure.mjs` to this validator |
| G-2 | `EVIDENCE_SIGNING_KEY` is not provisioned | every lane — no artifact can exceed `UNVERIFIED` | create the Actions secret |
| G-3 | The signing key should be an **environment** secret with required reviewers, so a merged rogue workflow still cannot sign unattended | integrity of G-2 | configure a protected `stage-7-evidence` environment |
| G-4 | No workflow calls the capture action yet — deliberately, capturing is evidence generation | LANE_C, LANE_D, LANE_E, LANE_F | owner authorises a capture PR per invariant |
| G-5 | `EVIDENCE_OWNER_LOGINS` allowlist is unset; owner-lane provenance falls back to the repository owner | LANE_F, OWNER_ACCEPTANCE | confirm or set the allowlist |
| G-6 | Deferred contract amendments A1 (deployment candidate SHA), A2 (S7-I3 evidence text), A4 (isolated environment target) still block owner decisions D-1…D-4 | S7-I1, S7-I3, S7-I11 | issue D-1 … D-4 |
| G-7 | Production runtime-log retention is ~1h; LANE_C capture must be synchronous with the observation | LANE_C | none — the framework's design constraint, recorded so it is not rediscovered |
| G-8 | The `stage7-evidence-signing` GitHub Environment's deployment branch/tag policy currently allows only `stage7-evidence-subject-*` tags; `stage7-capture-control-plane.yml` (§6.4) runs from `refs/heads/main` and cannot reach `EVIDENCE_SIGNING_KEY` until `main` is added to that policy | control-plane captures (S7-I4, S7-I5, S7-I10-LANE_C corrections) — fails closed (UNVERIFIED) until done, not a security gap | add `main` to the environment's allowed deployment branches |

## Related

- Contract: `docs/opsiq/bundles/factory-stage-7-closure.yaml`
- Frozen evidence standard: `docs/opsiq/evidence/stage-7/README.md`
- Invariant closure gate: `scripts/lib/invariant-closure.mjs` (PR-1B)
- Hostile audit suite: `src/__tests__/completion-factory/stage7-evidence-artifact.test.ts`
