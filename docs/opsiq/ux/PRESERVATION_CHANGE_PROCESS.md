# Owner Feature Preservation — Intentional Change Process

`docs/opsiq/ux/OWNER_FEATURE_PRESERVATION_BASELINE.json` is the accepted, owner-approved
inventory of every owner-facing route, API, capability, workflow state, action, and Cockpit
data dependency that exists as of `baselineSha`. `scripts/ux/verify-owner-feature-preservation.mjs`
runs in CI on every PR (see `.github/workflows/ci.yml`, "Owner feature-preservation gate") and
fails the build if a candidate generated from current source would silently lose, narrow, or
(for access/capability contracts) broaden anything the baseline protects.

This gate has **no automatic override**. There is no `--force`, `--accept-new-baseline`, or
`--update-baseline-in-ci` flag, and none will be added. A red preservation gate always means one
of two things:

1. **An unintended regression.** Fix the code so the candidate matches the baseline again. This
   is the common case and needs no process beyond the normal fix-and-repush loop.
2. **An intentional product change** — a deliberate migration, removal, or capability change that
   the accepted baseline correctly flags as a contract change.

## For an intentional change

1. **Make the product change** in its own PR, following the repository's normal review process.
2. **Explain the change in the PR description**: what preservation contract it changes and why
   (e.g. "removes the legacy `/api/owner/foo` route, replaced by `/api/owner/bar`; all callers
   migrated in this same PR").
3. **Get Arnab's explicit written approval** for that specific feature migration, removal, or
   capability change — approval of the PR in general is not sufficient; the approval must name
   the specific preservation-contract change.
4. **Only after that approval**, regenerate the baseline in the *same* PR:
   ```
   node scripts/ux/generate-owner-feature-baseline.mjs
   ```
   Commit the regenerated `docs/opsiq/ux/OWNER_FEATURE_PRESERVATION_BASELINE.json` alongside the
   product change. The preservation gate then passes because the accepted baseline itself now
   reflects the approved new contract.
5. If the change also moves `baselineSha`'s meaning forward (i.e. this PR is meant to become the
   new anchor), update `ACCEPTED_BASELINE_SHA` in
   `scripts/ux/verify-owner-feature-preservation.mjs` to the new baseline-generating commit's SHA
   in that same PR, so the gate keeps checking the baseline file's `baselineSha` against the
   correct value going forward.

## What the gate does not do

- It does not require every generated field to match exactly. Most protected sets (pages, APIs,
  methods, OwnerNowView fields, actions, workflow states, non-workflow mutations, Cockpit
  dependencies) are checked baseline-⊆-candidate: **adding** a new page, API, field, action,
  workflow, capability, or mutation never fails the gate on its own.
- Three specific contracts are checked for exact equality in either direction, because they are
  security/access-relevant rather than purely additive: a page's `pageAccessGate`, a route's
  method-specific API capability requirements, and whether a route classified
  `HIDDEN_FOR_SAFETY_NO_NAV_ENTRY` in the baseline stays hidden. A broadened capability or an
  exposed hidden-for-safety route is treated exactly as seriously as a removed one.
- It does not evaluate whether a change is a *good* idea. It only tells you whether the
  preservation contract changed and requires a human decision (Arnab's) before the accepted
  baseline is allowed to move.
