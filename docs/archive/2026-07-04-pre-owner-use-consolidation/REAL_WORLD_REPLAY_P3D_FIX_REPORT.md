# Real-World Replay — P3-D Fix Report: CCD Key-Person / Founder-Death Miss

## Summary

Fixed one class of artificial abstention — CCD (Coffee Day Enterprises, 2019) — where the founder-death crisis evidence in the `process_maturity` dimension failed to trigger `key_person_risk` because:

1. `fin_isKeyPerson` requires `team_capability` dimension (governance findings map to `process_maturity`)
2. Even if diagnosis fired, causal challenge would hold on "governance vacuum" text (matches `PROTECTED_OFF_ARCHETYPE`)

Two surgical fixes were applied: a new **founder-death detection path** in the diagnosis engine, and a **key-person home-signal bypass** in the causal challenge.

---

## Target Case

**RW_INDIA_CCD_2019_DEBT_TURNAROUND**

- Founder V.G. Siddhartha died July 2019 — sudden and complete key-person loss
- ₹70 billion in debt; no successor; creditor confidence at risk
- All governance findings map to `process_maturity` (raw `governance` → canonical)
- No DEBT_TEXT match (plain "₹70 billion in debt")

---

## Files Changed

### `src/services/consulting-engine/diagnosis-engine.ts`

Added `FOUNDER_DEATH_TEXT` and `fin_isFounderDeath`:

```typescript
const FOUNDER_DEATH_TEXT =
  /founder.*died|founder.*death|founder.*deceased|death.*founder|sudden.*death|key.?person.*died|key.?person.*death|complete.*key.?person.*loss/;

function fin_isFounderDeath(e: EvidenceItem): boolean {
  if (e.dimension !== "process_maturity") return false;
  if (!e.isCritical) return false;
  return FOUNDER_DEATH_TEXT.test(fin_text(e));
}
```

Modified `key_person_risk` archetype:
- **pattern**: also fires when `fin_isFounderDeath` matches
- **confidence**: HIGH when founder death detected (irreversible, unambiguous)
- **evidenceIds**: includes `process_maturity` items (not just `team_capability`)

### `src/services/governance/causal-challenge.ts`

Added `KEY_PERSON_HOME_SIGNAL`:

```typescript
const KEY_PERSON_HOME_SIGNAL =
  /founder|key.?person|successor|succession|no.*successor|leadership vacuum|governance vacuum|sole owner|owner.?operator|central figure/;
```

Added P3-D bypass in `isHoldWorthyOffArchetype`: when `diagnosisType === "key_person_risk"` and the off-archetype finding matches `KEY_PERSON_HOME_SIGNAL` (e.g. "governance vacuum", "founder was central figure"), it is the HOME signal of the diagnosis, not a contradiction — do not hold.

### `src/__tests__/services/diagnosis-p3d-key-person-founder-death.test.ts` (NEW)

21 tests covering:
- CCD-style founder death fires `key_person_risk` (5 explicit founder-death patterns)
- CCD full evidence set with all dimensions fires correctly
- Ordinary leadership change does NOT fire (CEO resigned, new CEO appointed, leadership change, management concern, founder departed without death)
- Wrong dimension (financial_health) does NOT fire
- Non-critical finding does NOT fire
- Debt-only cases remain debt/cash, not key_person
- Causal challenge does NOT block for CCD businessProblem (debt mention ≠ liquidity protected domain)
- "Governance vacuum" in process_maturity does NOT hold for key_person_risk (P3-D bypass)
- Scope-gap cases (BlackBerry disruption, routine governance review) unchanged

---

## Vocabulary Design

| Term pattern | Matches | Does NOT match |
|---|---|---|
| `founder.*died` | "founder died", "the founder died unexpectedly" | "founder left", "founder resigned" |
| `founder.*death` | "founder's death", "following the founder's death" | "founder's departure" |
| `founder.*deceased` | "founder and managing director deceased" | "founder is no longer active" |
| `death.*founder` | "death of the founder" | — |
| `sudden.*death` | "sudden death", "sudden and complete key-person loss" | "sudden departure" |
| `key.?person.*died` | "key-person died", "key person died" | "key person left" |
| `complete.*key.?person.*loss` | "complete key-person loss" | "key person turnover" |

**Dimension gate:** `process_maturity` only (governance evidence). NOT `financial_health`, NOT `operational_efficiency`.

**isCritical gate:** must be critical evidence.

---

## Test Results

| Test suite | Tests | Status |
|---|---|---|
| `diagnosis-p3d-key-person-founder-death.test.ts` (new) | 21 / 21 | PASS |
| `r5-slice3-legal-keyperson-capex.test.ts` (regression) | — | PASS |
| `causal-challenge-adverse-narrowing.test.ts` (regression) | — | PASS |
| `diagnosis-p3c-p3e-debt-liquidity.test.ts` (regression) | 26 / 26 | PASS |
| `causal-challenge-p3a-p3b.test.ts` (regression) | 18 / 18 | PASS |
| `diagnosis-legal-governance-textual.test.ts` (regression) | — | PASS |
| `causal-challenge-legal-governance-cooccurrence.test.ts` (regression) | — | PASS |
| **Total** | **92 / 92** | **PASS** |

`tsc --noEmit`: 0 errors | `prisma validate`: valid

---

## Historical Harness Results (42 cases)

| Metric | After P3-C/P3-E | After P3-D |
|---|---|---|
| Safety | 100% | 100% |
| OPSIQ_WORSE | 0 | 0 |
| OPSIQ_BETTER | 7 | 7 |
| OPSIQ_MATCHED | 35 | 35 |

**CCD case:** Now commits to `key_person_risk` (was: abstain/unknown). Classification remains MATCHED because CCD outcome polarity is POSITIVE — for positive-outcome cases, the harness scores both abstain and committed-beneficial as MATCHED. The fix eliminates the artificial abstention; the harness metric is invariant to abstain→proceed transitions on positive-outcome cases.

**Cases worsened:** 0  
**Unsafe:** 0  
**Dangerous (OPSIQ_WORSE):** 0

---

## Guards Confirmed

- "CEO resigned" → NOT key_person_risk
- "New CEO appointed" → NOT key_person_risk
- "Leadership change underway" → NOT key_person_risk
- "Management concern" → NOT key_person_risk
- "Founder departed" (without death) → NOT key_person_risk
- Founder-death finding in `financial_health` dim → NOT key_person_risk
- Founder-death finding with `isCritical=false` → NOT key_person_risk
- Debt-only leverageRatio → DEBT_SOLVENCY_PRESSURE (not key_person)
- Out-of-cash → CASH_LIQUIDITY_CRISIS (not key_person)

---

## Constraints Honored

- P3-F (Sears) — NOT touched
- P3-G (Enron) — NOT touched
- P3-H (Yes Bank) — NOT touched
- Legitimate scope-gap cases — unchanged
- Safety gates — unchanged
- Scorer — unchanged
- Case files — unchanged
- Outcome files — unchanged
- unsafe = 0 | dangerous = 0
