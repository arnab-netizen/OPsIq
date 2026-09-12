# DEC-EVID-01 / GAP-EVIDENCE-DRIFT-02 — Evidence Bundle Wiring

## Decision (recorded, consistent with repo)
Proof FSM = canonical staff-execution proof; `Evidence` = canonical consulting evidence; `EvidenceBundle`
may GROUP canonical Evidence but must not be a parallel proof truth.

## State on this branch
- GAP-EVIDENCE-DRIFT-01 (legacy `Evidence` service runtime 500s) — CLOSED_PROVEN (ported `evidence-repair.db`).
- Bundle end-to-end wiring (creation/read scoped to canonical Evidence; bundled evidence participating in
  verification + recommendation evidence counts; invalid/stale/reused not counted; SoD on bundled evidence;
  fail-closed on missing) — **NOT implemented this session.**

## Status: OPEN
Bundle wiring is a multi-file implementation (bundle service ↔ canonical Evidence, verification counting,
SoD, isolation, fail-closed) with its own test matrix. Deferred as OPEN (tracked), NOT closed. It is a
**pilot blocker only if bundles are surfaced in the pilot owner UI**; if bundles are not in pilot scope,
they can be disabled/hidden for pilot. Owner decision: include bundle wiring in pilot scope (implement +
test per Phase C matrix) OR disable bundle UI for pilot.
