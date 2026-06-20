# Real-World Blind Replay — Phase 2: Corpus Gap Report

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Program:** OWNER_MODE_REAL_WORLD_BLIND_REPLAY_PROGRAM  
**Phase:** 2 — Corpus Gap Report  

---

## 1. Required vs. Available

| Metric | Required | Available | Gap |
|---|---|---|---|
| Minimum cases for a valid run | 50 (per program) | 0 | **-50** |
| REAL_SOURCE_BACKED cases | ≥50 | 0 | **-50** |
| Minimum industries represented | ≥5 (recommended) | 0 | **-5** |
| Minimum outcome_polarity variety | SUCCESS, FAILURE, MIXED | none | all missing |
| Cases with per-case layout | ≥50 (01_case_input.json + outcome.json + source.json) | 0 | **-50** |

---

## 2. Gap Root Cause Analysis

### 2.1 Primary cause: Web access blocked

The environment cannot perform source verification:
- `WebFetch` returns HTTP 403 on all external domains
- Web archive access is disallowed
- Search snippets are explicitly not verification per `ROUND_2_REAL_WORLD_SOURCE_STANDARD`

Without web access, no new case can be sourced and no citation can be verified. A case added without web verification would be classified `grounding_class !== REAL_SOURCE_BACKED` and rejected by the harness integrity gate.

### 2.2 Secondary cause: No existing REAL_SOURCE_BACKED inventory

The repository was built with a correct integrity standard from the start: the harness was written to enforce `REAL_SOURCE_BACKED` before even a single case was added. The protocol is correct; the corpus sourcing simply has not been performed.

### 2.3 Tertiary cause: B15-S1 cases are infrastructure, not corpus

The 5 B15-S1 seed cases are sourced from industry guidance publications (SCORE/SBA, NRA, AICPA, NIST MEP, Shopify). They are general industry patterns, not specific historical events with:
- Pre-decision evidence that can be reconstructed
- Hidden outcomes verified against a real business decision
- Resolvable citations to a specific event

They cannot be promoted to REAL_SOURCE_BACKED without adding a real specific event they represent.

---

## 3. Gap Classification

| Gap | Severity | Blocking for Phase 5? |
|---|---|---|
| 0 of 50 minimum cases present | CRITICAL | YES — Phase 5 cannot execute |
| Web access blocked for sourcing | CRITICAL | YES — cannot add cases in this environment |
| No per-case layout files exist | CRITICAL | YES — harness finds nothing to score |

**Phase 5 (blind replay execution) is BLOCKED.**

---

## 4. Gap Remediation Path (for a fetch-capable environment)

This section documents what a future fetch-capable environment would need to do. This is NOT an implementation in this session — it is a documentation record.

### 4.1 Required per case

Each case must produce three files in `simulation_runs/historical_validation/case_<ID>/`:

**`01_case_input.json`** — outcome-hidden engine input:
```json
{
  "caseId": "<stable-id>",
  "businessProblem": "<pre-decision framing — outcome removed>",
  "evidence": [
    {
      "dimension": "<finance|operations|market|leadership|...>",
      "finding": "<pre-decision observable finding>",
      "confidence": "HIGH|MEDIUM|LOW",
      "isCritical": true/false
    }
  ],
  "clientContext": {
    "industry": "<industry>",
    "size": "small|medium|large",
    "revenueImpactUrgency": "LOW|MEDIUM|HIGH|CRITICAL"
  }
}
```

**`outcome.json`** — hidden ground truth (never seen by engine):
```json
{
  "grounding_class": "REAL_SOURCE_BACKED",
  "expert_diagnosis": "<documented root cause normalized to engine archetype>",
  "expert_first_action": "<what experts/business decided to do first>",
  "actual_decision": "<decision actually taken>",
  "outcome_polarity": "SUCCESS|FAILURE|MIXED",
  "harmful_actions": ["<action phrasings that were value-destroying>"],
  "beneficial_actions": ["<action phrasings that worked>"],
  "citation": "<resolvable URL or document reference>"
}
```

**`source.json`** — full source record per `ROUND_2_REAL_WORLD_SOURCE_STANDARD`:
```json
{
  "citation": "<full bibliographic citation>",
  "source_type": "government_report|court_filing|annual_report|founder_postmortem|...",
  "published_date": "<ISO date>",
  "accessed_date": "<ISO date>",
  "reliability_tier": "A|B|C|D",
  "evidence_extracted": ["<specific data points taken from source>"],
  "inferred_vs_stated": {}
}
```

### 4.2 Suggested sources (public-domain, fetch-capable environment only)

| Source type | Examples | Count potential |
|---|---|---|
| SBA post-mortem public loan default disclosures | Public FOIA/SBA datasets | 10–20 cases |
| FTC administrative complaints (business failure cases) | ftc.gov | 5–10 cases |
| SEC enforcement actions against small businesses | sec.gov | 5–10 cases |
| Founder post-mortems (public blogs) | startups.com, medium.com/tag/startup-postmortem | 10–15 cases |
| Public annual reports showing documented turnarounds | SEC EDGAR | 5–10 cases |
| Government SMB case studies (NIST MEP, SBA) | nist.gov, sba.gov | 5 cases |

These would need per-case layout creation and source verification in a fetch-capable environment.

---

## 5. Conclusion

**Corpus gap: 50 cases (100% of minimum required).**

Phase 5 (blind replay execution) cannot run. Phases 0–4 and 11–12 are documentation phases only. The final report (Phase 11) and decision (Phase 12) must record `NOT_PROVEN` due to 0 blind replays executed.

---

**Phase 2 complete.**
