# DIAGNOSIS-ENGINE RESIDUAL FIX DECISION

**Mode:** decision document only. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. Grounded in
`DIAGNOSIS_ENGINE_RESIDUAL_AUDIT.md` (machine-traced from the frozen
`evidence_support_refinement` retrial; FRC-11=A defer, HC-02=B hold, PC-01=A fix).

## DECISION: **IMPLEMENT_PC01_ONLY**

(Next slice — NOT this run: add a narrow **survival-dominance** diagnosis-selection rule
so a co-matched `cash_liquidity_crisis` with a critically short runway wins PRIMARY over
an optimization diagnosis. This run implements nothing.)

### Exact reason
PC-01 is the only one of the three that is (a) a clean single-mechanism diagnosis-engine
bug, (b) low safety risk, and (c) low regression risk. The engine misdiagnoses
`customer_retention_erosion` over the true `cash_liquidity_crisis` purely because of
pattern array order at an equal-HIGH-confidence tie, even though the runway is 3 months.
The gate already proves the runway is the dominant signal (it abstains on the
contradiction). Making cash-survival dominate the primary selection — mirroring the R3
survival-first philosophy already applied to the first ACTION — both corrects the
diagnosis and releases a safe cash-stabilization proceed.

### Exact expected metric movement
- over_abstention 7 → **6** (PC-01 ABSTAIN→PROCEED).
- diagnosis 95/8 → **96/7** (PC-01 MISDIAGNOSIS→CORRECT; the only diagnosis-axis gain
  available among the three).
- safety 96/7 → **97/6**; first-action 89/14 → **90/13**.
- unsafe_proceed 0, dangerous_proceed 0, abstention 23/0 (100%), false_root_cause 0 —
  all unchanged.
- (Exact movement to be re-proved by the implementation slice's full retrial; the gate
  stays active, so these are the expected — not guaranteed — deltas.)

### Exact risk
LOW. The rule only flips PRIMARY between two already-matched HIGH-confidence diagnoses
and only when cash is a candidate with a runway at/below the survival threshold. The
resulting first action is the low-cost reversible 13-week cash stabilization; the safety
gate remains fully active. Residual risk: a true-retention case that also shows a short
runway would be re-pointed to cash — but cash-survival-first is the safety-conservative
choice, and a full retrial must confirm no case reorders into a wrong/dangerous proceed
(the implementation slice's gate condition).

### Exact cases fixed
PC-01 (→ `cash_liquidity_crisis`, PROCEED with cash stabilization).

### Exact cases that must remain held
- **HC-02 (classification B)** — a confidence-only fix does not release it (the protected
  adverse-off-archetype arm re-holds the regulated safety-recall); forcing a proceed
  would risk shipping an uncoordinated regulated recall. Hold.
- **FRC-11 (classification A, deferred)** — fixable by broadening the bottleneck pattern,
  but MEDIUM regression risk (relaxing the retention co-requirement widens a core
  operational pattern); defer to a dedicated, carefully-guarded slice.
- **Protected safety holds FRC-04, FRC-07, PC-09, PC-11** — untouched; the PC-01 fix is
  diagnosis-selection-only and does not alter any gate that holds them.

### Why the other options are rejected
- **IMPLEMENT_FRC11_ONLY** — rejected (now): same +1 over_abstention value as PC-01 but
  MEDIUM regression risk (broadening a core pattern's match condition); not the cleanest
  single fix. Worth a later dedicated slice with tight numeric guards + full retrial.
- **IMPLEMENT_HC02_ONLY** — rejected: HC-02 is class B; a confidence fix does not release
  it (protected adverse arm) and a forced proceed is unsafe (uncoordinated regulated
  recall).
- **IMPLEMENT_FRC11_HC02 / IMPLEMENT_ALL_THREE** — rejected: both include HC-02, which
  must remain held; and bundling the MEDIUM-risk FRC-11 with PC-01 enlarges the blast
  radius and harms isolation/rollback. One isolated low-risk fix per slice.
- **IMPLEMENT_NONE** — rejected: a clean, low-risk +1 over_abstention AND +1 diagnosis
  gain (PC-01) is available with no unsafe-proceed risk; doing nothing forgoes real,
  safe value.

### Stage A status
Remains **DO_NOT_PROMOTE / BLOCKED.** Even after PC-01, over_abstention would be 6
(HC-02 held, FRC-11 deferred, plus the 4 protected safety holds), and the full
pre-registered promotion bar is unmet. No single fix changes that.

## ANSWERS — fix-eligibility per case

| case | bug class | clean single-mechanism fix? | safe? | recommend |
|---|---|---|---|---|
| PC-01 | diagnosis priority (survival dominance) | yes | yes (LOW risk) | **IMPLEMENT (next slice)** |
| FRC-11 | bottleneck pattern gap | yes, but wide blast radius | LOW case-risk / MED regression | DEFER (dedicated slice) |
| HC-02 | quality confidence + protected regulated hold | no (multi-mechanism) | forcing proceed is unsafe | HOLD |
