# Deferred / Broad Gaps (PASS 35)

Recorded honestly; **not** in scope for the PASS 36 minimum cockpit.

## Deferred beyond PASS 36 (needs new work, not just UI)
1. **Wire the newest proven pipeline to an owner surface.** business-survival-recovery
   (PASS 32), recovery-milestone-execution (PASS 33), owner-cockpit-decision-explanation
   (PASS 31), and public-signal-* (PASS 28-30) have **no served endpoint**. Surfacing
   them requires new API routes + services, not a UI-only change. PASS 36 deliberately
   reuses existing proven routes (now-view + process-execution) and does not touch these.
   A later pass should add a served endpoint for the survival→recovery-milestone flow
   and a minimal owner view, still governed and evidence-gated.

2. **Consolidate the three cockpit surfaces.** owner/, owner/now, and
   owner/process-intelligence overlap. PASS 36 builds ONE canonical cockpit; fully
   retiring/redirecting the others is a follow-up to avoid a large refactor in one pass.

3. **Replace prompt()-based action input** across the whole owner surface with proper
   forms. PASS 36 fixes this for the canonical cockpit only.

## Explicitly out of scope (frozen — do not build)
Public SaaS, billing, Product Hunt / launch readiness, live integrations/connectors,
Local Mode, enterprise/compliance, autonomous browsing/external action, LLM/NLP,
private owner shadow pilot, marketing/landing/pricing. None may be implied as present.

## Not a gap (correctly invisible)
- Workspace isolation, server-side authorization — safety controls, not owner features.
- Raw public signals / raw audit logs — must NOT be surfaced by UX rule even though the
  backend produces them.
