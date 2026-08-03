# Stage 7 evidence artifacts

**This directory is empty of artifacts, and that is the correct state.**

An empty directory means no Stage 7 observation has been captured. It is neither a pass
nor a failure, it is not progress, and it must never be cited as either. Sixteen
invariants remain `PENDING` in `docs/opsiq/bundles/factory-stage-7-closure.yaml`.

## What goes here

One JSON file per artifact, named exactly `<artifact_id>.json`, where `artifact_id` is
derived from the artifact's own content (`evd_` + 32 hex). The filename is part of
duplicate detection, so it is not a naming convention — it is checked.

- Form: `../schema/evidence-artifact.v1.schema.json`
- Rules: `../EVIDENCE_ARTIFACT_SPEC.md`
- Frozen standard: `../README.md`

## How a file gets here

Only via `.github/actions/stage7-evidence-capture/action.yml` running inside a GitHub
Actions job, which calls `scripts/capture-evidence.mjs`. That script exits non-zero when
`GITHUB_ACTIONS` is not `true`, and takes every provenance field from the `GITHUB_*`
environment — there is no flag by which a caller can state its own run id, workflow or
commit.

A hand-written file placed here will be read by `scripts/validate-evidence-artifacts.mjs`
on every pull request and classified `REJECTED` or, at best, `UNVERIFIED`. Neither may
back a `PROVEN` invariant.

## Append-only

Never edit an artifact in place. A correction is a **new** artifact with `supersedes` set
to the id it replaces — the same rule that governs every other approved record in this
repository. Editing one breaks its `artifact_id`, its `content_hash` and its signature,
all three of which the validator recomputes.
