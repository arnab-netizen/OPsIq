# Recovery Milestone-Proof — safety notes (PASS 33)

These fixtures are **synthetic**. They contain no real customer data, no PII, no
financial figures, and no scraped third-party content. Every crisis input is a
qualitative pressure level (`NONE`…`CRITICAL`) plus a small set of
`missingData` labels and boolean feasibility constraints.

## What the simulation is allowed to do
- Read a PASS 32 survival/recovery plan and drive it forward through its ordered milestones.
- Consume the **real** `ProcessExecutionTask` outcomes already proven by earlier passes:
  executed? evidence provided? reassessment improved/worsened?
- Report the next bottleneck milestone, the stabilization gate, and the thrive gate.

## What the simulation must never do
- **No milestone skipping.** The next milestone is always the first not-proven one.
- **No completion without evidence.** Evidence gating is enforced by the process-execution bridge (`EVIDENCE_REQUIRED`).
- **No owner bypass.** Owner-approval tasks reject non-owner actors (`OWNER_APPROVAL_REQUIRED`).
- **No fabricated money / runway / ROI / MRR / win-probability / guaranteed outcome.** Schema-enforced on every cockpit summary.
- **No hidden score.** No `*score*` field is exposed.
- **No premature growth.** The thrive gate stays BLOCKED until stabilization is proven, and even then only becomes ELIGIBLE with owner approval — never auto-executed.
- **No fake recovery.** An unrecoverable business keeps the restructure/controlled-shutdown review active regardless of reported milestone outcomes.
- **No automatic external action.** Scale/growth/expansion/auto-contact/discount/tender-auto-submit stay in `blockedUnsafeActions` throughout recovery.

## Human-factors scope
Only business-operational human variables are modelled (owner overload,
follow-through, capability, delegation). No mental-health / personality /
pseudo-psychology modelling. Staff issues route to training/SOP review, never to
blame, discipline, firing, or payroll language.
