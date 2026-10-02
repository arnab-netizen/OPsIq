# SERP research, first pass (2026-10-02)

Method: three WebSearch queries (US index), result titles and snippets only. No page was opened, no rank positions were checked, no volume tool was used.
All search volumes: **VOLUME UNKNOWN**. This is a first pass, not a validation. Each cluster still needs a full SERP read (competitor pages, People Also Ask, discussion results) before any page is written.

| Query | Observed result types | Intent (inference) | Calculators dominate? | Gap candidate (UNVERIFIED) |
|---|---|---|---|---|
| margin vs markup calculator | Calculator pages on spreadsheetplanet.com, keka.com, invoicer.ai, calcplanet.com, straitsdata.com plus several low-quality duplicate-looking pages | Tool use (convert margin to markup and back) | Yes, tool pages are the large majority | Calculators stop at the conversion. A cash-implication angle is untested. A new article is unlikely to beat these tools; improving the calculator's margin/markup section is more plausible |
| business profitable but no cash why | Articles: belaysolutions, kapitus, crowe.com (ZA), accountipro, others | Learn why (informational) | No, articles dominate. Accounting and lender blogs | Competitors list generic causes (late payment, inventory, payroll, tax, capex, working capital). None seen in this pass pairs the explanation with a self-check tool. Resource #1 plus the calculator is the matching asset. Whether it differs enough is UNKNOWN until the competing pages are read |
| how to price for target profit margin formula small business | Calculators (ordio, webwork-tracker), newsletters/blogs (zyflora, beancount.io, cleverence, smallbiztrends) | Formula plus tool | Mixed | The formula (cost / (1 - margin)) is fully commoditised. Value would have to come from worked operating-margin examples that cover overhead, which the snippets suggest few do |

## Consequences for the next-resource decision

- Resource B (target-margin pricing): the formula answer already exists everywhere. Do not write a generic article. Only proceed if a full SERP read finds the overhead-inclusive worked example missing.
- Resource A (margin vs markup): tool-dominated SERP. INFERENCE: prefer strengthening the calculator page (its FAQ already covers margin vs markup, merged in PR #566) over a separate article, which risks cannibalising the calculator page.
- INFERENCE: the cluster that fits OpsIQ best on this evidence is profit-but-no-cash, which Resource #1 already targets. Its blocker looks like distribution and indexing rather than content volume; the indexing state is UNKNOWN until Search Console is read (H1/H2).
