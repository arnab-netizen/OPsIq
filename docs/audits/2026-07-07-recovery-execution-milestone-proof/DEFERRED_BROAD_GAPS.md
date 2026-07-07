# Deferred / out-of-scope (PASS 33)

The following are **intentionally not** part of this pass. They remain deferred
and unclaimed; this pass neither implements nor asserts them.

- **No real financial ingestion.** Cash runway / margin remain qualitative
  missing-data tasks. OpsIQ never computes or displays a money figure.
- **No autonomous external action.** No customer contact, tender submission,
  spend, discount, contract, pricing change — all stay in `blockedUnsafeActions`.
- **No staff / payroll / legal automation.** Staff issues route to
  training/SOP review only; legal risk routes to an owner-approval task.
- **No live connectors / integrations / LLM-NLP / autonomous browsing.**
- **No public SaaS / billing / launch-readiness / enterprise-compliance
  hardening.**
- **No guaranteed outcome.** The system never asserts survival, recovery, or
  success will occur.
- **No cross-cycle time simulation of real dates.** The state machine is pure
  and deterministic; "cycles" are milestone transitions driven by reported
  outcomes, not wall-clock time.

## Honest limitations
- Milestone outcomes (executed/evidence/reassessment) are supplied by the
  governed task layer; this module does not itself judge whether reported
  evidence is *sufficient* — that judgement stays with the reviewer/owner and the
  existing evidence-gating in the process-execution bridge.
- The reassessment result (IMPROVED/WORSENED) is an input, not a computed
  verdict; OpsIQ does not fabricate an improvement signal.
