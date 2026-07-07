# OpsIQ — Claims Review Checklist

**Date:** 2026-07-07 · Truth-control audit (PASS 34).

Run this before publishing ANY external statement about OpsIQ (website, deck,
demo, sales email, investor update, social post). If any answer is "no" or
"unsure", the claim is **not approved** — mark it `CLAIM_RESTRICTED`.

## Gate 1 — Provenance
- [ ] Is this claim on `OPSIQ_PUBLIC_CLAIMS_ALLOWED.md`, or a strict subset of one?
- [ ] Can I name the source file + test/CI/audit evidence that backs it?
- [ ] Is it absent from `OPSIQ_PUBLIC_CLAIMS_FORBIDDEN.md` (and not a rephrasing of a forbidden one)?

## Gate 2 — Scope honesty
- [ ] Does it include "demonstrated in tests and CI" (or equivalent) rather than implying a real-world result?
- [ ] Does it preserve the human-in-the-loop / **governed** / **owner-approved** framing for any execution claim?
- [ ] Does it avoid the words "AI", "autonomous", "automatic" unless immediately qualified as deterministic + owner-gated?

## Gate 3 — No fabricated proof
- [ ] No money / ROI / % / time-saved / win-probability figure (unless owner-entered and labelled)?
- [ ] No implied real customers, real deployment, or owner-visible product that doesn't exist?
- [ ] No implied integrations (bank/POS/CRM) or live LLM?

## Gate 4 — Maturity truth
- [ ] Does it avoid "production-ready / enterprise-ready / owners are using it"?
- [ ] If it describes a capability, does it match that capability's classification + proof level in `OPSIQ_CAPABILITY_MATRIX.json`?
- [ ] If the capability is `PROVEN_DB_NOT_IN_CI` or `PROVEN_UNIT_ONLY`, does the claim avoid saying "continuously tested in CI"?

## Gate 5 — Guarantee check
- [ ] No guarantee of survival, recovery, growth, profit, or success?
- [ ] No claim of scaling a business or telling an owner "you're ready to scale"?

## Decision
- All boxes checked → **APPROVED** (record which ALLOWED item + evidence).
- Any box unchecked → **CLAIM_RESTRICTED** — rewrite to a scoped ALLOWED claim or drop it.

> Default posture: if you cannot cite the evidence from memory, you do not have
> it. Open the matrix and the evidence ledger. Do not approve from confidence.
