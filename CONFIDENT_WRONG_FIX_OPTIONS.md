# CONFIDENT-WRONG FIX OPTIONS (Phase 3)

**Mode:** ROOT-CAUSE — design only, no implementation, no threshold tuning.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Goal:** smallest *proper* fix for RC-1 (confidence-only) / RC-2 (field loss) /
RC-3 (no evidence-support), not a threshold patch.

Design constraint carried from Phase 2: the production gate has **no answer key
and no factuality oracle at runtime**, so any recommended fix must rely on
signals the engine/input already produce.

---

## Option A — Pass monitor safety flags into the abstention decision
- **Fixes:** RC-4.
- **Files:** adapter + runner (thread `10_scoring_record` flags into `12`).
- **Testability:** easy (flags are booleans).
- **Risk:** **HIGH / invalid** — monitor flags are post-hoc and **answer-key
  aware**; they do not exist at production runtime. This makes the benchmark go
  green while production stays blind. Masks RC-1.
- **Effect RW-001:** would abstain (flag=true). **RW-005:** no effect (unreviewed).
- **Regression risk:** creates a false sense of safety; couples runtime gate to
  an offline artifact. **Reject.**

## Option B — Add evidence-support verification before proceed
- **Fixes:** RC-1 (partially), RC-2, RC-3 directly.
- **Mechanism:** stop the adapter field loss; derive an `evidence_support` signal
  from data the engine already emits — `evidenceIds.length / evidence.length`
  and `missingEvidenceFor.length`. Add one abstention rule: a *committed*
  diagnosis with low support ratio or non-empty `missingEvidenceFor` cannot
  proceed at < high confidence (uses existing states, e.g. `INSUFFICIENT_EVIDENCE`
  / `MISSING_PRECONDITIONS`).
- **Files:** `consulting-safety-adapter.ts` (derive support); `abstention-engine.ts`
  (one new rule) — both already in the safety layer.
- **Testability:** **high** — deterministic from frozen outputs; unit-testable;
  re-runnable over all 50 via `apply-abstention.ts`.
- **Risk:** LOW–MEDIUM — could abstain on genuinely well-supported confident
  cases if the ratio threshold is crude (mitigate by gating on
  `missingEvidenceFor` non-empty AND support-ratio, not ratio alone).
- **Effect RW-001:** abstain (1/6 support + 3 gaps). **RW-005:** abstain (1/5 + 3 gaps).
- **Regression risk:** LOW — the 47 already-abstaining cases are unaffected; only
  the 3 SUCCESS cases are re-examined, and all 3 have low support.

## Option C — Recommendation-to-constraint alignment check
- **Fixes:** RC-5 (and part of RC-6).
- **Files:** adapter (pass `ownerConstraintProfile` + recommendation), new rule.
- **Testability:** medium (needs cost/time/legal comparison rules).
- **Risk:** MEDIUM — alignment with the *stated problem* is harder to mechanize
  than constraint numerics; risk of weak signal.
- **Effect RW-001:** weak (rec within constraints; misalignment is semantic).
  **RW-005:** partial (loyalty program is within budget; "wrong question" is
  semantic, not a numeric constraint breach).
- **Regression risk:** MEDIUM. Does not address the PRIMARY cause alone.

## Option D — Factuality / hallucination gate
- **Fixes:** RC-7.
- **Files:** new verifier service + wiring.
- **Testability:** low without an oracle; needs a second model or knowledge base.
- **Risk:** **HIGH** — no runtime ground truth; large new surface; non-deterministic.
- **Effect RW-001/RW-005:** potentially catches both, but unproven and heavy.
- **Regression risk:** HIGH. Out of scope for a *minimal* fix.

## Option E — Composite gate (confidence + evidence support + monitor flags + constraint alignment)
- **Fixes:** RC-1, RC-2, RC-3, RC-5 (+ RC-4 if monitor flags included).
- **Files:** adapter + engine + runner + new alignment module + tests.
- **Testability:** medium; many interacting rules.
- **Risk:** MEDIUM–HIGH — largest blast radius; multiple new thresholds to
  justify; if it bundles Option A it re-imports the answer-key-leak problem.
- **Effect RW-001/RW-005:** both abstain.
- **Regression risk:** HIGH for a single step; appropriate as a *later* roadmap
  target after B is proven.

---

## COMPARISON

| Option | Primary cause fixed? | Prod-valid | Size | Catches RW-001 | Catches RW-005 | Regression risk |
|---|---|---|---|---|---|---|
| A | No (RC-4 only) | **No** | S | ✅ | ❌ | High (false safety) |
| **B** | **Yes (RC-1/2/3)** | **Yes** | **S–M** | ✅ | ✅ | **Low** |
| C | No (RC-5) | Yes | M | weak | partial | Medium |
| D | RC-7 | No | L | maybe | maybe | High |
| E | Yes (broad) | Partly | L | ✅ | ✅ | High |

**Smallest proper fix = Option B.** It targets the primary, production-valid root
cause using signals the engine already emits, deterministically testable, lowest
regression risk, and demonstrably flips both RW-001 and RW-005 to abstain.
C/D/E are deferred enhancements; A is rejected as production-invalid.
