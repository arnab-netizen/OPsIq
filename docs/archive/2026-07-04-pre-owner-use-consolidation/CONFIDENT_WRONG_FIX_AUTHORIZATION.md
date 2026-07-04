# CONFIDENT-WRONG FIX AUTHORIZATION (Phase 4)

**Mode:** ROOT-CAUSE — documentation only. **No implementation in this run.**
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`

---

## RECOMMENDED FIX — Option B: Evidence-support verification before proceed

### Exact root cause addressed
- **PRIMARY:** RC-1 `SAFETY_ENGINE_CONFIDENCE_ONLY` — the gate proceeds on
  confidence magnitude alone.
- **Enablers:** RC-2 `ADAPTER_FIELD_LOSS` and RC-3 `NO_EVIDENCE_SUPPORT_CHECK` —
  the adapter discards the engine's evidence-support ratio and its own
  `missingEvidenceFor` flags before the gate runs.

Not addressed here (deferred, by design): RC-4 (answer-key-aware, not
production-valid), RC-7 (no runtime factuality oracle), RC-5/RC-6 (later roadmap).

### Exact files to change (when authorized)
1. `src/services/governance/consulting-safety-adapter.ts`
   — extend `deriveSafetyGateInputs` to compute and surface an
   `evidence_support` signal from the engine output it already receives:
   `evidenceIds.length`, total `evidence.length` (must be threaded through from
   the engine input/frozen output), and `missingEvidenceFor.length`. Stop
   collapsing to binary `has_evidence` only.
2. `src/services/governance/abstention-engine.ts`
   — add **one** rule: a *committed* recommendation (status SUCCESS/PROVISIONAL)
   with low evidence support **and** non-empty `missingEvidenceFor` must abstain,
   reusing an existing `AbstentionState` (`INSUFFICIENT_EVIDENCE` or
   `MISSING_PRECONDITIONS`). No change to existing thresholds.

> No new artifact files; no benchmark or answer-key changes; no threshold tuning
> of the existing 0.3/0.6/0.7 confidence cutoffs.

### Exact behavior required
- A committed diagnosis whose supporting evidence is a small fraction of
  available evidence **and** whose `missingEvidenceFor` is non-empty must NOT
  proceed; it must abstain with an explicit state and escalation.
- A committed diagnosis with strong evidence support and no declared gaps
  continues to proceed (no regression).
- Low-confidence / insufficient cases keep their current behavior (the 47
  already-abstaining cases are untouched).
- Decision rule must be deterministic and derivable from the frozen output (no
  answer key, no monitor flags, no oracle).

### Tests required (before declaring done)
1. **Unit (adapter):** `evidence_support` derivation for support ratios and
   `missingEvidenceFor` present/absent.
2. **Unit (engine):** new rule abstains on low-support + gaps; proceeds on
   high-support + no gaps; existing 8 rules unchanged (regression assertions on
   the prior test suite `empirical-discipline.test.ts`).
3. **Wiring (adapter test):** extend `consulting-safety-adapter.test.ts`.

### Benchmark / probe validation required
- Re-run `apply-abstention.ts` over round_001 (engine outputs preserved, not
  re-run). **Required outcome:** RW-001 and RW-005 flip PROCEED → ABSTAIN; RW-002
  (well-formed, the clean proceed case) is re-checked and its proceed/abstain
  recorded with rationale; the 47 INSUFFICIENT_EVIDENCE cases remain abstain.
- Record before/after proceed-set deltas in a new validation report.
- **Do not** alter `10_scoring_record.json`, `12_*` history, answer keys, or
  thresholds; write new `12`-series outputs or a new round if re-derivation is
  needed.

### Rollback plan
- The change is additive (one adapter field + one engine rule). Rollback = revert
  the two files and re-run `apply-abstention.ts` to restore the prior `12_*`
  decisions. No data migration, no schema change, no threshold state to unwind.
- Gate the new rule behind a clearly-named boolean in the adapter call path so it
  can be disabled without code removal if an unexpected regression appears in the
  47-case baseline.

---

## AUTHORIZATION STATUS

**Implementation authorized: NO.** This run is documentation-only per the
ROOT-CAUSE-MODE hard rules. Option B is *recommended and specified*; it requires
an explicit implementation instruction in a subsequent run before any code in
`abstention-engine.ts` / `consulting-safety-adapter.ts` is changed.

**Stage A remains BLOCKED for promotion** until Option B is implemented, tested,
and validated to flip RW-001/RW-005 to abstain without regressing the 47-case
baseline — and until the still-open items (RW-005 human adjudication, B4 legacy
reproducibility, B5 missing decision docs, step-4 designed adversarial probes)
are closed.
