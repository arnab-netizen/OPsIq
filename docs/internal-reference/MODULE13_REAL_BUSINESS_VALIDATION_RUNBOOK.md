# Owner Mode — Real-Business Validation Runbook (M13)

Status: **PENDING MANUAL EXECUTION by an authorized owner.** This is the
execution.md §20 (Module 13) real-business validation gate, which §0 places **before**
building further owner domain modules ("prove it on real/staging runtime → build full
owner capacity module by module"). It validates the now-synthetic-runtime-proven owner
loop on a **real business** to earn `OWNER_MODE_REAL_BUSINESS_PROVEN`.

It cannot be run by the agent: it requires a real owner's real numbers and real
follow-through over a reporting period. No synthetic data, no DB edits, no hardcoded
business logic. Public/SaaS stays frozen.

## What is already proven (synthetic, deployed)

The full owner loop is deployed-runtime-proven on `https://o-ps-iq.vercel.app` with
synthetic data:
- Module 1 Owner Recovery — run 27379402334.
- Module 2 Finance (engine→diagnosis→planner→schema→API→UI) — runs 27404358424 /
  27406156168.
- Owner Command Center read + `/owner` home — runs 27407345728 / 27411312442.
- Cross-domain condition (finance + recovery) — run 27412646582.

This runbook proves the same loop **on a real business**.

## Validation business (per §20)

- **Tumbledry Mukundapur** — Industry: Laundry / Dry Cleaning — Currency: INR.
- The product must stay generic; Tumbledry is the *validation example only* (no
  Tumbledry logic in code — audited in `MODULE2_FINANCIAL_INTELLIGENCE_AUDIT_REPORT.md`).

## Pre-conditions

1. Deployed app includes the latest `main` (build-info commit `c1fe646` or later) — the
   command center + cross-domain condition.
2. The Module 1 + Module 2 finance migrations are applied to the target DB (both done
   via their manual fail-closed workflows).
3. An authorized owner account (role grants OWNER_VIEW/OWNER_MANAGE).
4. **Rotate** the previously-exposed Neon credential first if not already done.

## Procedure (deployed UI; no DB edits)

Perform each step in the deployed app and record the result in §"Results" below.

1. **Sign in** as the owner. Open `/owner` (Owner Command Center).
2. **Create the business** (`/owner/finance` or `/owner/recovery` → + New business):
   `Tumbledry Mukundapur`, laundry/local service, INR.
3. **Recovery snapshot (real numbers):** `/owner/recovery` → Add metric snapshot with
   the real reporting-period figures (revenue, total costs, orders, customers, repeat
   customers, delivery cost, complaints, etc.). Run a **diagnosis cycle**. Review the
   real findings + recommended actions.
4. **Finance snapshot (real numbers):** `/owner/finance` → Add financial snapshot with
   the real figures (revenue, COGS, fixed/variable costs, rent, payroll, utilities,
   delivery, marketing, discounts, debt/EMI, cash on hand, receivables, payables, owner
   withdrawals, order/customer counts). Run a **finance diagnosis**. Review findings,
   the survival state, and the data-confidence + any missing-data banner.
5. **Command center:** open `/owner`. Confirm the **Business Condition** reflects both
   domains (finance + recovery) and shows a single **"Do this next"** highest-impact
   action with its domain, priority, and verification metric.
6. **Execute one real action:** the owner actually performs the recommended action in
   the real business (e.g., tighten discounts / collect receivables / win-back
   campaign). Mark it `assigned → in_progress → completed` with completion notes +
   evidence.
7. **Enter after-data + verify:** after the verification window, enter the real
   after-value and run **Verify outcome**. Record the honest verification status
   (`verified_improved` / `verified_not_improved` / `inconclusive` / `disputed`).
8. **Confirm dashboards reflect reality:** `/owner/finance` (or recovery) dashboard and
   `/owner` command center show the completed action + verification + updated condition.
9. **Second cycle:** enter the next period's real snapshot and run a second diagnosis;
   confirm it links/compares to the first and the condition updates.
10. **Owner feedback:** the owner records whether the recommendation was useful and
    whether they could act without developer help.

## Required proof to capture (per §20)

For at least one real cycle: **before state · recommendation · action taken · after
state · verified result · dashboard/command-center update · owner notes.** Capture
masked IDs / screenshots only — **never** paste secrets, cookies, tokens, or DB URLs.

## Done when (acceptance — earns `OWNER_MODE_REAL_BUSINESS_PROVEN`)

- ≥1 real business cycle proven end-to-end on the deployed app.
- No manual DB edits were required.
- No hardcoded business logic was required (generic product worked on real data).
- The owner could understand and act without a developer.
- The verification result is recorded honestly (improvement is **not** faked; a
  non-improvement is recorded as such).

## Results (filled in during manual execution — leave blank until done)

| Field | Value |
|---|---|
| Business / period | |
| Before state (key metrics) | |
| Survival state + condition | |
| Recommended next action | |
| Action taken | |
| After state | |
| Verification status | |
| Dashboard/command-center reflected? | |
| Owner notes / could act without dev? | |
| Manual DB edits needed? (must be "no") | |
| Date validated | |

## After validation

Record the outcome in a `MODULE13_REAL_BUSINESS_PROVEN_REPORT.md`, set
`OWNER_MODE_STATUS = OWNER_MODE_REAL_BUSINESS_PROVEN` in `OWNER_MODE_STATUS_REPORT.md`,
then resume building owner capacity module by module (per execution.md §22 / the audit
addendum sequence). Public/SaaS stays frozen until Owner Mode reaches full capacity.
