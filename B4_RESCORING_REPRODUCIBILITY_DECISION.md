# B4 — RESCORING REPRODUCIBILITY DECISION

**Blocker:** B4 (from `STAGE_A_SAFETY_VALIDATION_BLOCKER.md`) — the legacy Round 1
"manual" rescoring is unreproducible.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Mode:** documentation-only decision. No production code, scoring logic,
thresholds, answer keys, benchmark outputs, or existing scoring records changed.
**Not a Stage A pass claim.**

---

## 1. FINDINGS (traced to evidence)

### 1.1 Which claims depended on `/tmp/manual_scoring_results/`
- `ROUND_1_RESCORING_CLOSEOUT.md`: "Temporary results: All 50 detailed manual
  scores at `/tmp/manual_scoring_results/`"; corrected **average 5.21/10**,
  **median 5.00/10**; method "Manual locked-answer-key review (50 cases, 13
  dimensions)".
- `ROUND_1_HOSTILE_AUDIT_FINAL_REPORT.md`: cites `/tmp/manual_scoring_results/`
  "(50 individual JSON files with detailed rationales)"; the scoring-accuracy
  analysis (**−0.85 avg delta**, **+1.06 / +26% improvement**, **78% too harsh**,
  **20% directionally correct**, **2% too generous**); per-dimension corrected
  averages (root-cause 2.3, first-action 2.0, business-relevance 3.0, etc.).
- `10_scoring_record.json` × 50: field `"corrected_scoring_method":
  "MANUAL_LOCKED_ANSWER_KEY_REVIEW"`.

All of the above corrected numbers and the "manual" characterization derive from
the `/tmp` artifact set.

### 1.2 Does the source exist?
- `/tmp/manual_scoring_results/` — **ABSENT** (ephemeral; never committed).
- Git history / tracked files for a rescoring script or the manual results —
  **NONE** (`git log --all` and `git ls-files` for `*manual_scoring*` / `*rescor*`
  match only the closeout `.md` reports, not a generator or data).

### 1.3 Is a committed reproducible script present?
- **NO.** No script regenerates the `10_scoring_record.json` corrected values.
  (Contrast: the *step-3* review IS reproducible — `simulation_runner/
  monitor-safety-review.ts` → `13_monitor_safety_review.json` — but that covers
  only the 4 safety flags for the 40 cases, not the 13-dimension rescore.)

### 1.4 Templated or genuinely manual?
- **Templated.** Across the 50 records there are only **3 distinct**
  `recommendation_quality` rationale strings (and the other dimensions are
  similarly parametric, e.g. "N/3 elements present. Score: X/10"). 8/50 carry
  `Expected: N/A` in root-cause. This is mechanical string-templating, not
  per-case human prose. The `MANUAL_LOCKED_ANSWER_KEY_REVIEW` label is on all 50.

**Conclusion:** the legacy "manual locked-answer-key review" cannot be
reproduced, has no committed generator, no surviving source data, and its
rationales are templated — i.e. it was a second heuristic mislabeled as manual.

---

## 2. DECISION

**B4 DECISION: B — FORMALLY RETRACT the unreproducible manual-rescoring claim.**
(Reproduction from committed artifacts is impossible — Section 1.2/1.3.)

**Reproduced: NO.**

### 2.1 Retracted claims (no longer to be relied upon)
1. That the Round 1 corrected scores came from **"MANUAL_LOCKED_ANSWER_KEY_REVIEW"**
   / human manual review. Re-characterized as: **unverified, templated heuristic
   rescoring of unknown provenance.**
2. The **5.21/10 average** and **5.00/10 median** as *validated/defensible*
   metrics. They remain as committed artifacts but are **UNVERIFIED** (not a
   trustworthy quality figure).
3. The scoring-accuracy analysis (**−0.85 delta / +1.06 / 78% too harsh / 20%
   directionally correct / 2% too generous**) — unreproducible; **retracted**.
4. The per-dimension "corrected" averages presented as manual-review outputs —
   **retracted** as manual; treat as heuristic.

### 2.2 What is NOT retracted
- The **frozen engine outputs** (`09_*`) — deterministic, reproducible, intact.
- The **abstention-gate decisions** (`12_*`, `14_*`, `15_*`, `16_*`) — produced by
  committed code, re-runnable.
- The **step-3 deterministic safety review** (`13_*` via `monitor-safety-review.ts`)
  — reproducible; it is the model for the standard below.
- Existing `10_scoring_record.json` files are **left unedited** (per constraints);
  this document supersedes their `corrected_scoring_method` label.

---

## 3. REPLACEMENT EVIDENCE STANDARD (binding for future scoring)

A scoring/review result is **ACCEPTED** only if ALL hold:

1. **Committed generator.** The script that produces it is committed to the repo
   (e.g. under `simulation_runner/`), not run ad hoc.
2. **Committed inputs.** All inputs (frozen outputs, locked answer keys, rubric)
   are committed; **no ephemeral `/tmp` or uncommitted source.**
3. **Deterministic re-run.** Re-running the committed script on the committed
   inputs reproduces the committed outputs byte-for-byte (modulo timestamps).
4. **Per-case key citation.** Each scored dimension that compares to an answer
   key cites the specific key text/criterion used (no `Expected: N/A` placeholders
   on key-dependent dimensions).
5. **Honest method label.** `scoring_method` must accurately reflect the
   mechanism — `DETERMINISTIC_MECHANICAL_REVIEW`, `LLM_ASSISTED_REVIEW`, or
   `HUMAN_MANUAL_REVIEW` — and must not label a heuristic as "manual."
6. **Denominator transparency.** Any rate reports its evaluated denominator and
   does not count unevaluated cases as safe/pass (per B2 lesson).
7. **No leakage.** Generator must not read answer keys into the engine-visible path.

The committed `monitor-safety-review.ts` → `13_*` pipeline already satisfies
(1)–(3),(5),(6) for the safety flags and is the reference implementation. A
future 13-dimension *quality* rescore must meet this same bar before any
"corrected average" may be cited as valid.

---

## 4. RESULTING STATE

- **B4: CLOSED** by retraction. The unreproducible manual-rescore claim is
  withdrawn; a binding reproducibility standard replaces it.
- Stage A quality metric is now honestly **UNVERIFIED** (no trustworthy
  consultant-grade average); the **safety** posture rests on the reproducible
  gate + `13_*` review, not on the retracted numbers.
- No old artifacts edited; this doc is the authoritative supersession record.

**Stage A remains BLOCKED for promotion.**

---

## 5. NEXT BLOCKER

- **B5** — the named `ABSTENTION_GATE_*` / `STAGE_A_FINAL_HOSTILE_DECISION`
  decision documents still do not exist (no promotion/safety/falsification record).
- **RW-005 human adjudication** — the one escalated hallucination verdict.
- (Optional) a standard-compliant 13-dimension quality rescore, if a validated
  quality average is ever required.
