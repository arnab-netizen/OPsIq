# ROUND 2 — REMEDIATION DEPENDENCY GRAPH

**Mode:** planning only. No code/engine/scorer/gate/threshold/key/corpus change.
No improvement or promotion claim. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.

Derived from `ROOT_CAUSE_FAILURE_MAP.md` (exact corpus counts). Maps each candidate
fix to the buckets it addresses, its prerequisites, expected benchmark impact, risk,
effort, and confidence. The abstention/safety gate stays frozen and abstain-only
throughout; "reduce abstention" here means *give the engine the reasoning to PROCEED
safely*, never lower a standard.

---

## 1. NODES

| Fix | Name | Buckets addressed | Status |
|---|---|---|---|
| **R0** | 6-axis scorer + full-pipeline re-trial | F9 measurement | **COMPLETE** (a716c134) |
| R1 | Lexical-trigger hardening | I (8), partial A-decoys | candidate |
| R2 | Causal adjudication layer | L (27), B (15), G (3), C/E (1), H-relief (14) | candidate |
| R3 | Prioritization engine (survival/urgency) | C/E (1 measured) + the PC set once R2 lands | candidate |
| R4 | Action-sequencing engine | D (27), K (24), F (4) | candidate |
| R5 | Multi-domain synthesis | G (3) + multi-cause depth | candidate |
| R6 | Business-model reasoning archetypes | A-subset (gtm/unit-econ-model) | candidate |
| R7 | Strategic reasoning archetypes | A-subset (capex/strategy) | candidate |
| R8 | Financial reasoning archetypes | A-subset (debt/working-capital) | candidate |
| R9 | Execution reasoning | P (execution under constraints) | candidate |

R6–R9 are the archetype-expansion family (formerly "R5 archetype expansion E2+");
they are split by domain only for sizing. They are **all gated behind R2**.

---

## 2. EDGES (prerequisite relationships)

```
R0 (done)
 ├─> R1  (independent; cheap; do alongside R2 — does NOT depend on R2)
 └─> R2  (causal adjudication) ── the keystone
        ├─> R3  (prioritization needs a correct primary first)
        ├─> R4  (sequencing needs a correct diagnosis first)
        │      └─> R9 (execution reasoning builds on sequencing)
        ├─> R5  (multi-domain synthesis extends the adjudicator)
        └─> R6, R7, R8 (archetype expansion — ONLY after R2, else +decoys)
                 └─> (each new archetype: re-run R0 + adversarial suite)
```

Hard ordering rules (from the audit):
- **R2 before R6/R7/R8.** Adding archetypes before causal adjudication multiplies
  confident decoys (proven by the 12 false_root_cause + 8 financial-decoy cases).
- **R2 before R3 and R4.** You cannot prioritize or sequence off a wrong primary.
- **R1 may run before/with R2** (independent), but R1 alone fixes only 8 decoys and
  adds no reasoning — it is a guard, not a capability.
- **No threshold change anywhere** until the root cause it would mask is proven
  fixed; **no gate weakening**; the abstention gate is re-run (not edited) per slice.

---

## 3. EXPECTED BENCHMARK IMPACT (per node)

Impact stated as the buckets unlocked and the axes that can move. Case-count
"reachable" = exact memberships from the failure map; realized lift is NOT claimed
here (measured only by re-running R0 after each slice).

| Fix | Buckets | Cases reachable | Axes it can move | Effort | Confidence it helps |
|---|---|---|---|---|---|
| R1 | I | 8 | diagnosis (decoys), safety | LOW | HIGH (localized, general rule) |
| **R2** | L,B,G,C/E,H-relief | **up to 41** (15 wrong-primary + 14 gate-holds + 3 MC + 9 honest-abstain decoys it stops) | diagnosis, safety, abstention | MED-HIGH | MED-HIGH (keystone) |
| R3 | C/E + PC set | 1 measured + 7 PC (post-R2) | diagnosis (priority), safety | MED | MED |
| R4 | D,K,F | up to 51 (27+24, overlap) | first-action, safety | MED | MED-HIGH (templates → planner) |
| R5 | G | 3 + multi-cause depth | diagnosis | MED | MED |
| R6/R7/R8 | A | up to 38 (post-R2 only) | diagnosis, safety, first-action | MED ×3 | MED (HIGH risk if early) |
| R9 | P | execution subset | first-action | MED | MED |

**Why R2 is the keystone, not R6–R8 (the larger bucket A):** bucket A is the
largest by raw count (38), but its cases are *honestly abstained* today — they are
safe failures (no wrong action). The L/B cluster (27/15) produces *confident wrong
primaries and wrong actions* — unsafe failures — and it also gates 14 of the
over-abstentions. Fixing A first without R2 converts safe abstentions into confident
decoys. Therefore R2 has the highest real-world ROI even though A has more cases.

---

## 4. RISK REGISTER

| Fix | Regression risk | Overfit risk | Mitigation |
|---|---|---|---|
| R1 | LOW | LOW | re-run adversarial + Round-1 baseline; keep negation general |
| R2 | MED (could mis-attribute) | MED-HIGH | hold out a random FRC split; require it to generalize + not regress the 6 covered controls; never use case ids/keys at runtime |
| R3 | MED | MED | encode general survival precedence (cash/solvency/safety/legal), not per-case order |
| R4 | MED | LOW-MED | stabilize-before-optimize is general; test on DC cases held out |
| R5 | MED | MED | synthesis rules derived from R2 precedence, not per-case |
| R6–R8 | MED-HIGH if early | MED-HIGH if early | ONLY after R2; one archetype at a time; re-run R0 + adversarial each |
| R9 | MED | MED | builds on R4; constraint reasoning from owner profile only |

**Runtime purity invariant (all nodes):** no answer key, probe key, monitor label,
benchmark label, or case id may be read at runtime. R0's scorer reads keys only
AFTER the frozen run; every fix must preserve that boundary.
