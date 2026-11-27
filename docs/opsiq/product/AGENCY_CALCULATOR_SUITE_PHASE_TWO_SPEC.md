# Agency calculator suite: phase two specification

Status: specification only. Nothing in this document is implemented. Phase one (six agency calculators, hub, funnel links) must be released and its measurements read before any of this is started.

## Selection rules (apply to every phase-two tool)
- Reuse `src/services/tools/agency/shared.ts` (strict parsing, `safeDiv`, `feeForMargin`, cents rounding) and the `AgencyCalculator` shell. New tools add one engine file, one config entry, one registry entry, one content entry and one route file.
- Browser-only and deterministic. No network, no storage, no query-string state, no new dependency, no database.
- Undefined results show "Not available". Invalid input withholds results. Nothing is clamped.
- Targets are the visitor's own and are never presented as benchmarks. A cited figure needs source, year, sample, metric definition and limitation.
- Excluded from Microsoft Clarity by adding the route to `CLARITY_EXCLUDED_EXACT_PATHS` when the tool takes payroll, client or margin figures.
- Build one at a time, in the order below, and only after the previous tool's start/complete events show real use.

## Priority order and specification

| # | Tool | Core formulas | Key inputs | Main trap to design against |
|---|------|---------------|------------|------------------------------|
| 1 | Agency profitability and break-even | AGI = revenue − pass-through. Operating profit = AGI − delivery − overhead. Break-even AGI = (delivery + overhead) ÷ 1. Operating margin = operating profit ÷ AGI. Required AGI at target = (delivery + overhead) ÷ (1 − target) | Monthly or annual revenue, pass-through, delivery payroll, other delivery cost, overhead, target operating margin | Do not call delivery margin profit. Do not subtract overhead twice |
| 2 | Employee true cost | Loaded cost = salary + employer taxes + benefits + equipment + software + allocated overhead share. Loaded cost per paid hour = loaded cost ÷ paid hours. Per available hour = loaded cost ÷ (paid hours − leave) | Salary, employer-cost percentage, benefits, equipment, software, paid hours, leave hours | Employer costs vary by country, so the tool takes the visitor's percentage and states no default as fact |
| 3 | Project pricing and budget variance | Price at margin = cost ÷ (1 − margin). Variance = actual − budget. Margin remaining = (price − actual to date − forecast to complete) ÷ price | Budgeted and logged hours per role, cost rates, direct expenses, price | Forecast to complete is an input, not a guess |
| 4 | Cash flow and runway | Net monthly burn = outflows − inflows. Runway = cash ÷ net burn when burn > 0. Receivables timing shown separately | Cash, monthly inflows and outflows, receivables and days to collect | No runway when burn ≤ 0 ("Not available"), never infinity |
| 5 | Hiring versus freelancer | Employee cost per productive hour = loaded cost ÷ (available hours × utilization). Freelancer cost per hour is entered. Break-even hours per month where costs are equal | Loaded employee cost, expected utilization, freelancer rate, expected monthly hours | Utilization uncertainty: show the break-even hours across a visitor-chosen range, not one answer |
| 6 | Client concentration | Share = client AGI ÷ total AGI. Top-1, top-3 shares. Revenue at risk if one client leaves = share × AGI | Up to ten client AGI amounts | Use AGI, not revenue, so pass-through does not inflate a client |
| 7 | Revenue leakage | Report separately: unbilled hours × rate, discount given, overdue receivables, scope absorbed. Never sum overlapping measures | Hours logged versus billed, rate, discounts, overdue amounts | Overlap: absorbed scope and unbilled hours can be the same hours. Show them as alternative views |
| 8 | AI productivity ROI | Hours saved × loaded cost per hour − tool cost − setup and review time. Net per month and payback months when positive | Hours saved per period (measured, not assumed), loaded cost, tool cost, setup hours, review hours | Hours "saved" are only value if redeployed or avoided. State the assumption beside the result |
| 9 | Break-even ROAS and CPA | Break-even ROAS = 1 ÷ contribution margin. Break-even CPA = average order value × contribution margin | Average order value, contribution margin or cost of goods, other variable costs | Margin must be contribution margin, not gross revenue share |
| 10 | Customer acquisition cost and lifetime value | CAC = acquisition spend ÷ new customers. Simple LTV = average margin per period × expected periods. LTV:CAC ratio and payback period | Spend, new customers, monthly margin per customer, retention or expected lifetime | Lifetime is an assumption. Show sensitivity and a payback period that does not depend on it |

## Analytics and measurement (unchanged rules)
- Only the events `calculator_start`, `calculator_complete`, `calculator_related_tool_click`, `calculator_agency_diagnostic_click`, `agency_beta_cta_click`, with the calculator id (and a fixed CTA position for the beta click). Add the new calculator ids to `CALCULATOR_ANALYTICS_IDS` and the registry only.
- The privacy page already describes the counts generically ("each calculator"); it needs no new text unless a new kind of event is added.

## Exit criteria for starting a phase-two tool
1. Phase one is released under an exact-SHA authorization and its rollback was never needed.
2. Provider ingestion of custom events is confirmed (not just local transmission) or the decision is recorded that events are unsupported on the current plan.
3. At least one phase-one calculator shows genuine completions or related-tool clicks, so the order above is informed by use rather than guesswork.
