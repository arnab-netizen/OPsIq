# Factory Stage 7 — Evidence Standard

**Status:** frozen baseline, applied in PR-1A (governance only).
**Authority:** `docs/opsiq/bundles/factory-stage-7-closure.yaml` is the contract. This
document defines the *form* of the artifacts that prove it. It does not add, remove, or
reinterpret any invariant.

**Enforcement:** declarative. PR-1A adds no validator logic. Until PR-1B implements the
closure gate, this standard binds the owner and any agent operating in this repository,
but is not machine-checked.

---

## Why this standard exists

Two facts established during the Stage 7 audit make an evidence standard necessary
rather than decorative.

1. **Production runtime logs are not retrievable.** Vercel runtime-log retention on the
   current plan is approximately one hour. A seven-day query returns
   *"No logs found. The requested window likely exceeds your plan's runtime-log
   retention."* Any LANE_C observation not written down at the moment it is made is gone.
   **Git is therefore the retention layer for Stage 7 evidence.**

2. **Absence of logs is not absence of activity.** Because retention is ~1h, an empty log
   window proves nothing about whether the owner used production. No artifact may cite
   log absence as evidence of anything.

---

## Artifact record

One artifact per invariant per attempt. Artifacts live under
`docs/opsiq/evidence/stage-7/` and are committed to git.

| Field | Meaning |
|---|---|
| `invariant_id` | `S7-I1` … `S7-I16` |
| `lane` | `LANE_C` \| `LANE_D` \| `LANE_E` \| `LANE_F` \| `OWNER_ACCEPTANCE` |
| `captured_at_utc` | ISO-8601, UTC |
| `subject_sha` | the commit the observation was made against |
| `deployment_id` | Vercel deployment id (LANE_C only) |
| `environment` | `production` \| `isolated_simulation` \| `ci` |
| `producer` | CI run id, script name, or owner |
| `method` | `http_probe` \| `db_query` \| `test_run` \| `owner_attestation` |
| `raw_observation` | verbatim response, output, or attestation — never paraphrased |
| `assertion` | the specific claim the observation supports |
| `result` | `PASS` \| `FAIL` \| `BLOCKED` \| `NOT_TESTED` |
| `redaction_attestation` | statement that no secret, token, or credential value appears |
| `content_hash` | hash over `raw_observation` |
| `supersedes` | id of the artifact this replaces, if any |

## Rules

**Producer.** LANE_C and LANE_E artifacts must be produced by a CI run and must carry
that run id. **An artifact produced by an interactive agent session is not valid
evidence.** This rule exists because a prior session asserted a
`STAGE_8_PRIVATE_OWNER_PRODUCTION_CLOSED` status that existed in no commit, no ledger
entry, and no bundle manifest. LANE_F artifacts are produced by the owner and by no one
else.

**Retention.** Committed to git. No external retention dependency, and no Vercel plan
change is required.

**Provenance.** `subject_sha`, `producer`, and — for LANE_C — `deployment_id` must all be
present. An artifact whose `subject_sha` is not an ancestor of `main` is invalid.

**Expiry.** LANE_C evidence expires when the production `deployment_id` changes. LANE_E
evidence expires when files under its assertion path change. LANE_F evidence does not
expire: it attests a historical event.

**Replayability.** Every LANE_C and LANE_E artifact must name a command that reproduces
it. LANE_F evidence is inherently non-replayable and must be marked so — this is a
property of owner judgment, not a deficiency.

**Tamper resistance.** Artifacts are append-only. A correction is a new artifact with
`supersedes` set. Never edit an artifact in place. This follows the repository rule
against silent mutation of approved records.

**Secrets.** No artifact may contain a secret, token, credential, or connection string.
Configuration evidence records **presence booleans only, never values**.

**Owner acceptance.** S7-I16 requires that all non-waived invariants hold valid,
unexpired artifacts at one SHA, followed by an explicit owner statement. It is never
inferred from CI, from a passing gate, or from the absence of failures.

---

## Lane reference

| Lane | Meaning | Produced by |
|---|---|---|
| `LANE_C` | Production runtime — real production ran the code and returned the result | CI capture run |
| `LANE_D` | Live provider — a real external provider processed a real operation | CI capture run |
| `LANE_E` | Simulation — realistic scenario in an isolated environment | CI test run |
| `LANE_F` | Real owner pilot — owner completed a real governance cycle on real data | Owner |
| `OWNER_ACCEPTANCE` | Explicit owner judgment | Owner |

## Related

- Contract: `docs/opsiq/bundles/factory-stage-7-closure.yaml`
- Ledger: `docs/opsiq/status/REMAINING_STAGE_ACCEPTANCE.yaml`
- S7-I14 field mapping: `docs/opsiq/evidence/stage-7/s7-i14-field-mapping.md`
