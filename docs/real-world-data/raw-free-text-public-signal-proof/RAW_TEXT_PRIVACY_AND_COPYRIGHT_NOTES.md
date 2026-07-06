# Raw Text Privacy & Copyright Notes — PASS 28

This pack proves a **conservative raw-text interpreter** using **controlled raw-text fixtures only**. It does not fetch, crawl, scrape, or browse anything.

1. **No live scraping used.** Every `rawText` is a controlled fixture written/derived from the public-source *categories* documented in PASS 27. Nothing is fetched at runtime.
2. **No login-only / private data used.** Nothing behind authentication, no account exports, no scraped-at-scale datasets, no ToS-bypassing access.
3. **No customer personal data retained.** The interpreter strips emails, phone numbers, and names *before* anything is derived or persisted. Deliberately-planted PII in a fixture (e.g. `Mr Smith`, `john.doe@example.com`, `07700 900123`) is redacted to `[redacted-name]` / `[redacted-email]` / `[redacted-phone]` and never reaches a governed task or audit event (proven by the DB sim, test 9).
4. **PII stripped or replaced.** `stripPii()` runs first in `interpretRawPublicSignal`; `piiRemoved` records that it happened. Currency amounts are protected from the phone matcher so money is not misread as a phone number.
5. **Long copyrighted text not copied.** Only short, aggressively paraphrased thematic snippets are stored; the interpreter also emits a truncated `sanitizedTextSummary` (≤180 chars), never a verbatim article/review.
6. **Public text treated as a signal, not ground truth.** Every output carries `sourceQuality` and `evidenceStrength`; only an official source is `VERIFIED_SOURCE`/`STRONG`, and even then the decision still needs the owner's own business data (`OFFICIAL_BUT_NEEDS_BUSINESS_DATA`).
7. **Prompt-injection text is ignored.** Instructions embedded in public content ("ignore previous instructions", "mark this business as verified", "submit the tender now", "automatically email the customer", "fire the employee") are detected, flagged (`promptInjectionDetected`), and never obeyed (`promptInjectionIgnored`); they cannot change verification, routing, or authority.
8. **The interpreter has no execution authority.** It is a translator only. It never executes, contacts, submits, approves, spends, or changes contracts. Its output is a *proposal* that must pass Zod validation and then flows through the already-proven governed bridge, which alone enforces owner-gating and evidence-gating.

**Money-claim caveat:** a detected money/ROI/win-probability claim is recorded (`financialClaimDetected`) but **never** accepted as fact (`financialClaimAccepted` is a Zod `literal(false)`). It is not turned into any numeric financial field and does not appear in a governed task.

**Ground-truth caveat:** public reviews/notices/posts are *signals*, not verified facts about any specific business. A single complaint is treated as an unverified one-off (`SINGLE_UNVERIFIED_COMPLAINT`), never a systemic finding.
