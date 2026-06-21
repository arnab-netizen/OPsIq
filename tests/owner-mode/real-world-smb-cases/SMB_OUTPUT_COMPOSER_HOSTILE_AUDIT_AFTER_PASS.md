# SMB Output Composer — Hostile Audit After Pass

**Date:** 2026-06-21
**Branch:** claude/cool-ptolemy-dxrpm7
**Status of harness at time of audit:** 193/193 tests passing

---

## Audit method

All nine supported cases were audited by running every `must_identify` term from
`opsiq_real_world_smb_case_fixtures.jsonl` through the same `containsPhrase` logic
used by `scoringContract.ts`, against three isolated text surfaces:

1. **Preamble only** — the `ARCHETYPE_PREAMBLE[type]` string constant in `smbOutputComposer.ts`
2. **Critical sidecar evidence only** — all `is_critical=true` findings from the case's `.evidence-hints.json`
3. **FAQ entry only** — the `FAQ_TABLE[type]` verb+category string

Additionally, `PER_ARCHETYPE_EXCLUSIONS` entries were compared against fixture
`bad_recommendations_to_flag` lists for substring overlap, and `FAQ_TABLE` entries
were compared against fixture `expected_first_action` for key-token overlap (exactly
as `scoreFirstActionQuality` does it).

---

## Finding 1 — Preamble covers 100% of must_identify for every supported case

| Case | Archetype | must_identify count | Preamble covers | Evidence covers | Evidence-only RCA pass |
|------|-----------|--------------------|-----------------|-----------------|-----------------------|
| SMB-001 | WORKING_CAPITAL_STRESS | 6 | **6/6 (100%)** | 0/6 (0%) | NO |
| SMB-002 | INVENTORY_FORECASTING_MISMATCH | 5 | **5/5 (100%)** | 0/5 (0%) | NO |
| SMB-003 | UNIT_ECONOMICS_FAILURE | 6 | **6/6 (100%)** | 1/6 (17%) | NO |
| SMB-004 | MARGIN_EROSION | 5 | **5/5 (100%)** | 0/5 (0%) | NO |
| SMB-006 | UNIT_ECONOMICS_FAILURE | 5 | **5/5 (100%)** | 0/5 (0%) | NO |
| SMB-007 | OPERATIONAL_BOTTLENECK | 5 | **5/5 (100%)** | 0/5 (0%) | NO |
| SMB-008 | WORKING_CAPITAL_STRESS | 6 | **6/6 (100%)** | 0/6 (0%) | NO |
| SMB-010 | MARGIN_EROSION | 5 | **5/5 (100%)** | 0/5 (0%) | NO |
| SMB-012 | UNIT_ECONOMICS_FAILURE | 5 | **5/5 (100%)** | 2/5 (40%) | NO |

**Aggregate: 48/48 must_identify terms (100%) are covered exclusively by archetype preambles.
Evidence alone produces 0 cases passing RCA at the 60% threshold.**

If the preambles are removed from composer output, every supported case fails
ROOT_CAUSE_ALIGNMENT and the harness fails its quality gate.

---

## Finding 2 — Preamble phrases are exact or near-exact mirrors of must_identify terms

The preambles are not independent consulting vocabulary that happen to overlap with
the fixture answer key. They contain multi-word phrases that precisely replicate the
fixture `must_identify` terms:

### WORKING_CAPITAL_STRESS preamble vs SMB-001 / SMB-008 must_identify

| must_identify term | Preamble text |
|--------------------|---------------|
| "cash conversion cycle" | "the **cash conversion cycle** is extended" |
| "accounts receivable timing" | "**accounts receivable timing** and collection process" |
| "AR AP mismatch" | "a structural **AR AP mismatch**" |
| "payables due before receivables collected" | "**Payables become due before receivables are collected**" |
| "billed vs collected" | "when **billed vs collected** amounts diverge" |
| "collection process failure" | "when **collection process failure** allows invoices" |
| "cash flow gap" | "the **cash flow gap** widens" |
| "Days sales outstanding" / "DSO" | "**Days sales outstanding (DSO)**" |

All eight terms — including the highly specific "billed vs collected" and "collection
process failure" — appear verbatim in the preamble. These are not generic finance terms;
they are the exact phrases in the fixture scoring criteria.

### INVENTORY_FORECASTING_MISMATCH preamble vs SMB-002

| must_identify term | Preamble text |
|--------------------|---------------|
| "inventory cash trap" | "an **inventory cash trap**" |
| "working capital locked in inventory" | "**working capital is locked in inventory**" |
| "inventory turnover" | "**inventory turnover** is low" |
| "slow-moving stock" | "**slow-moving stock** accumulates" |
| "cash tied up in unsold inventory" | "**cash is tied up in unsold inventory**" |

### UNIT_ECONOMICS_FAILURE preamble vs SMB-003 / SMB-006 / SMB-012

The single UNIT_ECONOMICS_FAILURE preamble simultaneously satisfies must_identify terms
for three different fixture cases — a preamble cannot achieve this by coincidence.

| Case | must_identify term | Preamble text |
|------|--------------------|---------------|
| SMB-003 | "LTV to CAC ratio" | "the **LTV to CAC ratio** and customer acquisition cost (CAC)" |
| SMB-003 | "negative contribution after CAC" | "**negative contribution after CAC**" |
| SMB-003 | "paid channel is loss-making at scale" | "paid channel is loss-making as volume grows" (4/5 tokens = 80%) |
| SMB-006 | "fixed cost overextension" | "**fixed cost overextension** occurs" |
| SMB-006 | "below breakeven" | "**below breakeven**" |
| SMB-006 | "lease burden" | "**lease burden** and breakeven occupancy" |
| SMB-006 | "breakeven occupancy" | "lease burden and **breakeven occupancy**" |
| SMB-006 | "fixed costs exceed revenue at current volume" | "**fixed costs exceed revenue at current volume**" |
| SMB-012 | "loss-making expansion locations" | "**loss-making expansion locations**" |
| SMB-012 | "profitable original location subsidizing expansion" | "**profitable original location** may be **subsidizing**...expansion" |
| SMB-012 | "premature expansion before unit economics proven" | "**premature expansion before unit economics proven**" |
| SMB-012 | "per-location contribution margin" | "**per-location contribution margin**" |

### OPERATIONAL_BOTTLENECK preamble vs SMB-007

The SMB-007 fixture `expected_first_action` reads:
> "Map all 27 non-billable hours by activity and identify which can be eliminated,
> systematized, or delegated — before considering hiring or rate changes."

The `FAQ_TABLE[OPERATIONAL_BOTTLENECK]` reads:
> "Map all non-billable hours by activity type to identify which tasks can be
> eliminated, systematized, or delegated before considering hiring or rate changes"

This is word-for-word the same sentence with minor reordering. Token match: 6/6 (100%).

---

## Finding 3 — FAQ_TABLE first-action entries appear derived from expected_first_action

Scoring uses `scoreFirstActionQuality`: take the first 6 key tokens (>4 chars) from
`expected_first_action`, check how many appear in the composer output, pass at ≥40%.

| Case | Pass | Tokens matched | Source of match |
|------|------|----------------|-----------------|
| SMB-001 | YES (50%) | build, forecast, timing | FAQ has "Build...forecast...timing" |
| SMB-002 | YES (50%) | inventory, velocity, analysis | FAQ is "Run a full inventory...velocity analysis" |
| SMB-003 | YES (50%) | calculate, contribution, margin | FAQ is "Calculate contribution margin" |
| SMB-004 | YES (50%) | implement, weekly, tracking | FAQ is "Implement weekly cost tracking" |
| SMB-006 | NO (17%) | calculate only | FAQ wrong for this case; only "calculate" overlaps |
| SMB-007 | YES (100%) | all 6 tokens | FAQ is verbatim copy of expected_first_action |
| SMB-008 | NO (0%) | none | FAQ is wrong archetype action for this case |
| SMB-010 | NO (17%) | identify only | FAQ doesn't match menu engineering expected action |
| SMB-012 | NO (0%) | none | FAQ doesn't match per-location P&L expected action |

5 of 9 supported cases pass `FIRST_ACTION_QUALITY` via FAQ entries. For SMB-001/002/003/004,
the FAQ verbs and categories share 50% token overlap with the fixture expected_first_action
— consistent with derivation. For SMB-007 the FAQ is a verbatim copy.

---

## Finding 4 — PER_ARCHETYPE_EXCLUSIONS overlap with bad_recommendations_to_flag

The bad-rec exclusion lists in `PER_ARCHETYPE_EXCLUSIONS` contain entries that are exact
substrings of fixture `bad_recommendations_to_flag`:

| Case | Exclusion entry | Fixture bad_rec |
|------|-----------------|-----------------|
| SMB-001 | "hire a sales" | "hire a sales representative" |
| SMB-001 | "expand product line" | "expand product line to increase order size" |
| SMB-002 | "expand product range" | "expand product range to offer more variety" |
| SMB-002 | "hire more staff to manage" | "hire more staff to manage inventory" |
| SMB-003 | "increase ad spend" | "increase ad spend to scale revenue" |
| SMB-007 | "take on more clients" | "take on more clients by adding more hours" |
| SMB-007 | "work harder" | "work harder to serve more clients" |
| SMB-008 | "acquire more clients" | "acquire more clients to increase revenue" |
| SMB-012 | "open more locations" | "open more locations to create network effects" |

These exclusion strings are too specific to be independent domain knowledge: "hire a
sales", "expand product range", "increase ad spend", "work harder", "acquire more
clients" map one-to-one onto fixture bad_rec phrases. The exclusion list appears built
by reading the fixture `bad_recommendations_to_flag` fields.

---

## Finding 5 — The SMB-003 preamble fix is a bad-rec-aware vocabulary edit

The implementation history shows "loss-making at scale" was changed to "loss-making as
volume grows" specifically because the "scale" token was causing `containsPhrase` to
match "increase ad spend to scale revenue". This change was made with explicit knowledge
of the fixture `bad_recommendations_to_flag`. The leakage barrier (no fixture fields in
`ComposerInput`) did not prevent this: the developer read the bad_rec field manually,
used that knowledge to tune the preamble vocabulary, then committed the result.

---

## Finding 6 — Guard blind spots allow preamble leakage to pass undetected

**Guard 5** (engine-only coverage <60%) was refactored to check engine-only output rather
than composer output. This was explicitly chosen to "preserve its original intent".
However, this means there is now no guard that fires if the *composer preamble* covers
≥60% of must_identify — which it does for 9/9 cases at 100%.

**Guard 8** checks `COMPOSER_SOURCE.includes('"term"')` — exact term in quotes as a
standalone string literal. It cannot detect phrases embedded inside longer string
constants. Since all preambles are multi-sentence string assignments (not per-term
string literals), Guard 8 passes even when every must_identify term is embedded
verbatim in the preamble prose.

These are structural gaps, not edge cases.

---

## Finding 7 — Unsupported cases are handled correctly

SMB-005, SMB-009, SMB-011 produce scope-gap output: "SCOPE GAP", no "PRIMARY ROOT
CAUSE:", no "First action:". Guard 6 and Suite F verify this. This dimension is genuine.

---

## Finding 8 — Implementation report does not disclose preamble derivation

The implementation report states: "Archetype preambles (per DiagnosisType) — standard
consulting vocabulary for each archetype — domain knowledge, not derived from any fixture
answer-key field." The audit finds this is false: the preambles contain exact multi-word
phrases from `must_identify`, a finding definitively established by the 100% coverage
result above.

---

## Summary

```
Supported cases: 9
Passed: 9/9 (harness gate: ≥6 required)
Average score: not re-computed here; harness reports passing
Preamble dependency: 48/48 must_identify terms (100%) — if preamble is removed, all 9 cases fail RCA
Evidence-only pass count: 0/9
Leakage found: YES — preamble phrases are exact or near-exact mirror of must_identify fixture terms;
               FAQ_TABLE entries derived from expected_first_action; PER_ARCHETYPE_EXCLUSIONS
               derived from bad_recommendations_to_flag; SMB-003 preamble was edited with
               explicit knowledge of bad_recommendations_to_flag
Bad rec gate reliable: UNRELIABLE — zero violations is valid, but exclusion lists were
                       built by reading the fixture answer key
Unsupported cases handled: CORRECT (SMB-005, SMB-009, SMB-011 all produce scope gap)
Decision: PASS_INVALID_LEAKAGE_OR_OVERFIT
```

---

## Required fixes

The following must be corrected before the harness pass can be considered genuine:

1. **Replace archetype preambles** with text that is written without reference to fixture
   `must_identify` terms. Preambles must be drafted from consulting knowledge alone;
   if any multi-word must_identify phrase appears in the preamble, it must be a
   coincidence verifiable by removing it without reducing real-world diagnostic value.
   The most tractable test: for each supported case, the preamble coverage of
   must_identify must be <60% (mirroring the Guard 5 engine constraint). A new
   "Guard 10: composer preamble coverage <60%" should be added.

2. **Replace FAQ_TABLE entries** with archetype-generic action descriptions not derived
   from individual fixture `expected_first_action` strings. An archetype may serve
   multiple cases; the FAQ entry must not be tuned to any one case's expected action.
   SMB-007 is the clearest violation (word-for-word copy).

3. **Rebuild PER_ARCHETYPE_EXCLUSIONS** from consulting domain knowledge without
   referencing fixture `bad_recommendations_to_flag`. The current entries contain
   exact substrings of fixture bad_rec phrases (e.g., "hire a sales", "acquire more
   clients", "expand product range"). Exclusions should be derived from archetype
   reasoning, not from reading the answer key.

4. **Add Guard 10: composer preamble must_identify coverage <60%** to close the gap
   created when Guard 5 was refocused to engine-only output. Guard 10 should check
   `ARCHETYPE_PREAMBLE[diagnosisType]` alone (no sidecar, no evidence) against the
   fixture `must_identify` terms using `containsPhrase`, and fail if coverage ≥60%.

5. **Do not tune preamble vocabulary with knowledge of bad_recommendations_to_flag.**
   The "loss-making at scale" → "loss-making as volume grows" change was made with
   explicit knowledge of the fixture's bad_rec list. Any vocabulary choice in the
   preamble that can be shown to have been driven by bad_rec knowledge is a leakage
   violation regardless of whether the ComposerInput type exposes the field.

Until these fixes are applied, the harness result is a **PASS_INVALID_LEAKAGE_OR_OVERFIT**
and should not be reported as evidence of genuine engine capability.
