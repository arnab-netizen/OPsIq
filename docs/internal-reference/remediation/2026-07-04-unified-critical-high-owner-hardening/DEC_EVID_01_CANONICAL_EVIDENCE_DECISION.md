# DEC-EVID-01 / GAP-EVIDENCE-DRIFT-02 — Canonical Evidence Entity

## Source verification
- Coexisting entities: `Evidence` (String status), `EvidenceItem` (real enum status), `EvidenceBundle` + bundle items, plus the `Proof` FSM (staff proof) and `DecisionEvidence`. GAP-EVIDENCE-DRIFT-01 (legacy `Evidence` service 500s) was **repaired and ported** on this branch (`evidence-repair.db.test.ts` green).
- The remaining ambiguity: which entity is the ONE canonical proof truth, and whether `EvidenceBundle`/`EvidenceItem` are grouping vs a parallel unverified proof system.

## Decision (default, per task guidance, consistent with repo)
- **`Proof` FSM is canonical for staff execution proof** (accepted/duplicate/fresh + separation-of-duty — already the enforced completion gate).
- **`Evidence` is the canonical consulting evidence entity**; `EvidenceBundle` MAY group canonical `Evidence` records but MUST NOT become a separate proof truth.
- `EvidenceItem` (enum-status) is retained only where already wired; not to be extended as a second truth.

## Status
- GAP-EVIDENCE-DRIFT-01 (legacy service 500s): **CLOSED_PROVEN** (ported + tested).
- DEC-EVID-01 / DRIFT-02 (bundle canonicalization end-to-end: creation/read scoped to canonical Evidence, SoD on bundled evidence, stale/reused rejection, no silent 0-evidence): **STILL_OPEN** — decision recorded above; implementation (bundle→canonical Evidence wiring + isolation/SoD tests) is tracked, not done this session.

**Status: PARTIALLY_CLOSED — canonical decision recorded; bundle end-to-end wiring OPEN.**
