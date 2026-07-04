# Safety / Adversarial Ledger

Every attack case is an executable test on `main` (`1ef21e2`). Sources:
`src/__tests__/owner-strategy/wealth-loop-simulation.test.ts` (WLS),
`src/__tests__/owner-strategy/domain-hardening.test.ts` (DH),
`src/__tests__/owner-strategy/real-world-startup.test.ts` (RW-S),
`src/__tests__/owner-strategy/real-world-wealth.test.ts` (RW-W). All green.

| # | Attack case | Risk | Expected safe behaviour | Actual behaviour | Evidence | Pass |
|---|---|---|---|---|---|---|
| 1 | Staff fake completion | Owner pays for work not done | Proof validation fails closed | Low-quality/irrelevant proof cannot verify completion | WLS #4 "STAFF FAKE COMPLETION fails closed"; DH WORKFORCE "fake completion detected" | ✅ |
| 2 | Staff/manager proof bypass | Accountability defeated | Low-quality proof cannot verify | Bypass rejected; proof requirement stands | WLS #12 "STAFF/MANAGER PROOF BYPASS" | ✅ |
| 3 | Reused / irrelevant proof | Fake audit trail | Reject non-matching proof | Proof gate rejects irrelevant evidence | WLS #4/#12 (proof validation) | ✅ |
| 4 | Marketing waste (paid ads, no tracking) | Cash burn under risk | Block ads while cash AT_RISK | Blocked (nbm=BLOCKED) | WLS #5; RW-W06 (BLOCKED, 92% workload saved) | ✅ |
| 5 | Premature expansion | Scale before readiness | Block while cash unsafe / not scale-ready | Blocked | WLS #6; DH OPERATIONS "unstable ops not scale-ready"; RW-W05 (BLOCKED) | ✅ |
| 6 | Owner overrides financial guardrail | Self-approved reckless spend | Over-threshold not auto-cleared; explicit override record required | Self-approval not auto-cleared | WLS #10 "OWNER OVERRIDES FINANCIAL GUARDRAIL" | ✅ |
| 7 | Reckless discounting below margin | Margin destruction | Block below-margin discount | Unsafe discount blocked | DH FINANCE "unsafe discount + spend blocked" | ✅ |
| 8 | Compliance hallucination | Wrong legal/tax advice | Escalate/block; no invented legal content | Escalates to professional; blocks; no hallucination | WLS #9; DH COMPLIANCE "escalates/blocks (no hallucination)" | ✅ |
| 9 | Reckless startup launch before demand | Owner burns capital pre-validation | launchAllowed=false; validation-first | No reckless launch in any case | RW-S01–S10 (all launchAllowed=false); WLS #3 | ✅ |
| 10 | Hype startup, weak unit economics | Chasing hype | Downrank/reject; kill-pivot criteria | Rejected/downranked, criteria set | RW-S02; WLS #15 "attractive revenue but trap" | ✅ |
| 11 | Guru / unverified business-wisdom | Generic/unsafe advice on high-risk | Block Tier-C/D/unsourced from high-risk | `admitAdvice`/`detectGuruRedFlags` block unsourced on high-risk | business-wisdom engine; wired in command-center (`admitAdvice`) | ✅ |
| 12 | Cross-domain conflict (growth vs cash) | Attractive growth vs runway | Cash safety wins | Cash safety overrides growth push | WLS #11; DH CROSS-DOMAIN "cash safety overrides growth" | ✅ |
| 13 | Sales growth vs operations capacity | Overload delivery | Gate on ops capacity | Growth push gated by ops stress | WLS #16 | ✅ |
| 14 | Missing / stale data + high confidence | False confidence | Disclose missing data; cap confidence | Evidence-weighting caps score; missing-data disclosed | risk-adjusted-wealth (evidence weight); Rule-D disclosure | ✅ |
| 15 | Owner workload overload by OpsIQ | Advisor homework | Advice-only that doesn't cut burden is flagged | Advice-only action does not reduce burden → flagged | WLS #13 "OWNER WORKLOAD OVERLOAD" | ✅ |
| 16 | Weak business model presented as viable | Owner stuck in trap | Classify trap/dead-end; offer stop/pivot/exit | trap → stop/pivot/exit offered | WLS #7/#15; DH STRATEGY "weak model → stop/pivot/exit" | ✅ |
| 17 | Owner-dependent job as "business" | Illusory ownership | Classify owner-job; transfer/redesign | owner-job classified; alternative Work Package | RW-W09 (CHOOSE_ALTERNATIVE) | ✅ |

No fix required this pass — all adversarial cases already pass on `main`. Any future
failure would follow the standard: classify (product/test/infra), fix with minimum
required code, retest, and record the retest row here.
