# Conflict Privacy & Safety Notes — PASS 29

The conflict-resolution layer consumes **already-interpreted** normalized signals and produces the safest governed collective decision. It uses **controlled fixtures only** and inherits every PASS 28 safety property.

1. **No live scraping / crawling / browsing.** Every conflict case is a set of controlled raw-text fixtures. Nothing is fetched at runtime.
2. **No login-only / private / scraped-at-scale data.** None used.
3. **PII never carried forward.** PII is stripped by the interpreter before a signal exists; the conflict package holds only normalized fields + governed summaries — no email/phone/name (proven: conflict unit test 14, DB test 10). The layer records `pii:stripped-upstream-not-carried-forward` in its audit trace.
4. **Prompt injection stays ignored.** Injection embedded in any raw signal is detected upstream and aggregated into `blockedUnsafeActions` ("obeying instructions embedded in public text …"); it can never change the conflict classification, the route, verification state, or authority (unit test 13, DB test 18).
5. **Money / ROI / win-probability claims are never accepted.** Any financial claim is aggregated into `blockedUnsafeActions` ("accepting a money/ROI/win-probability claim as a verified fact") and never appears as a governed figure; a Zod refinement forbids currency/percentage in any collective summary (unit test 15/22, DB test 11).
6. **Public text is a signal, not ground truth.** One weak signal never becomes a high-confidence conclusion; repeated weak signals produce validation/reassessment, never an accusation; an official source strengthens **published** facts only, never internal execution; a positive review can never close an issue without executed-correction + outcome evidence; a recent negative reopens a "fixed" claim.
7. **Gates are never bypassed.** Tender urgency cannot auto-submit or override missing eligibility/cost/capacity; growth cannot override unresolved quality/cash/capacity (scale stays blocked-before-proof); material pricing/brand/spend/commitment decisions are owner-gated.
8. **One cockpit action, no spam.** Duplicate/near-duplicate signals cluster; each conflict case yields exactly one governed collective ProcessExecutionTask (DB test 3/7+8).
9. **The layer has no execution authority.** It proposes one conservative collective decision; the governed bridge alone routes it and enforces owner-/evidence-gating. No external action is ever produced.
10. **Fail-closed.** The collective decision package is Zod-validated (including gate-consistency and no-fabricated-money refinements) before it can enter the governed path; a tampered/inconsistent package is rejected (unit test 19/20).

**Copyright minimization:** only short paraphrased fixtures; the interpreter's sanitized summary is truncated and never verbatim.
