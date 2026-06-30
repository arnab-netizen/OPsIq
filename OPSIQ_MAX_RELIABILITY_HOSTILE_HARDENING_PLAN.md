# OpsIQ — Maximum Reliability + Credibility Hardening Plan (hostile-audited)

Branch: `claude/opsiq-real-world-case-training` · Base HEAD: `deb5b3d`
Plan written BEFORE behavior changes. Baseline: `OPSIQ_MAX_RELIABILITY_BASELINE.json` (real sweep, stride 2).

## Baseline (measured, before any hardening change)
- Corpus: **4,032** total · 1,008 real-source · 3,024 variants · 378 adversarial split.
- Global: production runtime **98.2** · collective **98.2** · holdout **98.5** · adversarial unsafe **0** ·
  regression failures **0** · learning-applied rate **63%**.
- Coverage: **60/60** required domains scored · **56** collective decision types scored.
- **Weak segments: NONE** across all 7 dimensions (domain, critical domain, category, severity, stage,
  location, collective type) at their thresholds (domains ≥90, categories/severities/stages/locations ≥85,
  collective types ≥90).

### 1. Score by all 60 domains
All ≥90 (see baseline `segments.byDomain`). 50/60 ≥95; 10 in the near-threshold band (<95), all non-critical.

### 2. Score by all critical domains
All 26 ≥90 (baseline `segments.byCriticalDomain`); none weak, none near the 90 floor.

### 3. Score by business category / 4. severity / 5. stage / 6. location / 7. collective type
- Categories: none <85. Severities: none <85. Stages: 98.1–98.5 (none <85). Locations: 96.2–98.5 (none <85).
- Collective types: 56 scored, range 90–100; none <90 (six sit exactly at the 90 floor).

### 8. Near-threshold segments (surfaced, not hidden)
- Domains <95 (10): Customer complaints/reputation 92.5 · Customer retention 90 · Customer service 90 ·
  Reputation/social-media crisis 90 · SOPs 90 · Checklists 90 · Process improvement 90 · Staff training 90 ·
  Delivery/logistics 90 · Brand/franchise constraints 94.1. **All non-critical.**
- Collective types at the 90 floor (6): "spend on marketing now", "acquire more customers before fixing
  quality", "rely on 'try harder'", "owner personally re-checks everything forever", "spend on ads to
  replace churn", "ignore late-delivery complaints". No margin — flagged for the assurance scorecard.

### 9. Missing assurance checks (the work of this pass)
No aggregated assurance LAYER yet exists: (a) scorer negative-control/anti-gaming proof; (b) per-domain
and per-collective-type assurance scorecards with ASSURED_EXPERT_READY status; (c) a max-reliability
ratchet vs the baseline. These are built in slices below, reusing the existing validated engines.

### 10–18. Risk register
- Scorer-gaming: the collective + case scorers must reject expert-sounding-but-wrong output → negative
  controls (slice C). `PASS_THRESHOLD` (70) and `COLLECTIVE_WEIGHTS` must be locked against silent change.
- Source-quality / hallucinated-source: `source-register.test.ts` already enforces ID format, PII, copied-
  text length; assurance cites it.
- Overfitting/holdout: `publicSplitIntegrity()` + the holdout split already enforced; the ratchet adds the
  "training up / holdout down" guard.
- Contradiction / owner-burden: `detectUnsafe` + collective fail-conditions already catch core cases;
  negative controls add explicit coverage.
- Browser coverage: 17/17 already green this branch; ratchet enforces ≥10 desktop + ≥5 mobile.
- DB/provider confidence: business-scoped provider reads + `criticalDomainsRealProviderBacked` already
  proven (`owner-business-isolation.db.test.ts`).
- Learning governance: `learning.test.ts` proves workspace-private + no-auto-global + scope limits.

### 19. Baseline metrics — captured in `OPSIQ_MAX_RELIABILITY_BASELINE.json`.

### 20. Slice plan (each committed; tests must pass before commit)
- **A — sweep segments + plan + baseline:** extend `scorePublicCorpus` with byStage/byLocation/
  byCollectiveType + weak lists; generate the baseline JSON; this plan. (this commit)
- **B — baseline assurance test:** baseline exists, contains all 7 segment dimensions + global + corpus,
  and cannot omit a weak/near-threshold segment.
- **C — scorer negative-control + strictness:** ≥20 deliberately-bad advice outputs must fail
  `scoreAdvice`/`detectUnsafe`; `PASS_THRESHOLD` + `COLLECTIVE_WEIGHTS` locked by assertion.
- **D — domain + collective assurance scorecards:** an assurance module computing per-domain and per-
  collective-type assurance status; weak/unsafe/missing-holdout block ASSURED_EXPERT_READY; weak segment
  cannot be hidden behind an average.
- **E — max-reliability ratchet:** compare current sweep vs baseline; unsafe-never-up, no domain drops
  <90, browser ≥10/mobile ≥5, regression 0, weak-segment fails; tests for each rule.
- **F — reports + honest classification.**

### Honest scope note
Slices A–E reuse the existing validated scorer / runtime / holdout / source / learning engines and are
fully provable in this environment. The prompt's broader slices (standalone FMEA module, evidence-trace
matrix surface, adjudication-queue persistence, fresh browser re-run) are partially satisfied by existing
mechanisms; where a gate is not freshly and independently proven this pass, the final classification is
held at the honest achieved rung (NOT MAX_RELIABILITY_CORE/EXPERT_READY) and the unproven gates are listed.

### Final classification gates — see prompt §19. Target this pass: the highest rung every gate is genuinely
proven for, reported honestly with command/log evidence.
