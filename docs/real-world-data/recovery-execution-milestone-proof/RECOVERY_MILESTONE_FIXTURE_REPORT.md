# Recovery Milestone-Proof — fixture report (PASS 33)

11 fixture cases (A–K) drive the recovery milestone state machine through every
governed path. Each case is exercised by the unit suite
(`src/__tests__/owner-mode/recovery-milestone-execution.test.ts`, 17 tests) and
the DB simulation
(`src/__tests__/execution/recovery-execution-milestone-proof.db.test.ts`, 11 tests,
`TEST_WITH_DB=true`, wired into CI LANE_B + LANE_A).

| ID | Case | Path exercised | Final recovery state | Proven by |
|----|------|----------------|----------------------|-----------|
| A | laundry | full milestone pass | `THRIVE_GATE_ELIGIBLE` | DB #7/8/9, unit #8 |
| B | housekeeping | full pass | `THRIVE_GATE_ELIGIBLE` | DB #7/8/9 |
| C | property | legal owner-approval gate → full pass | `THRIVE_GATE_ELIGIBLE` | DB #6/7/8/9 |
| D | franchise | full pass | `THRIVE_GATE_ELIGIBLE` | DB #7/8/9 |
| E | saas | launch frozen → full pass | `THRIVE_GATE_ELIGIBLE` | DB #7/8/9/12 |
| F | tender | auto-submit blocked, owner gate → full pass | `THRIVE_GATE_ELIGIBLE` | DB #6/12 |
| G | b2b | full pass | `THRIVE_GATE_ELIGIBLE` | DB #7/8/9 |
| H | collective | growth blocked → full pass | `THRIVE_GATE_ELIGIBLE` | DB #7/8/9/12 |
| I | regression | m3 reassessment WORSENED | `RECOVERY_REGRESSED` | DB #10, unit #10 |
| J | unrecoverable | all "done" but infeasible | `RESTRUCTURE_REVIEW_REQUIRED` | DB #11, unit #11 |
| K | clean | no plan | `null` (nothing fabricated) | DB #14, unit #15 |

## Evidence gating (DB-verified)
- `EVIDENCE_REQUIRED` returned when a milestone task is completed with no evidence (DB #2+3+4+5).
- `OWNER_APPROVAL_REQUIRED` returned when a non-owner tries to approve an owner-gated task (DB #6).
- Workspace isolation holds across all cases (DB #13).

## No fabrication (verified)
- No `[$£€]\d`, `%`, `ROI`, `MRR`, or `guaranteed …` text in any cockpit summary (schema refine + unit #14).
- No `*score*` field on any view (unit #16).
- Schema fails closed on a tampered view (thrive ELIGIBLE while stabilization BLOCKED → rejected; unit #17).
