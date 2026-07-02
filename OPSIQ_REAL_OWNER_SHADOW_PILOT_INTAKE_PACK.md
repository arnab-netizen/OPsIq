# OpsIQ Real-Owner Shadow-Pilot Intake Pack

> The minimum real-business data needed for the FIRST shadow pilot. Target archetype: **laundry / dry-cleaning /
> local service operation**. This is intake specification only — no live-outcome claim. OpsIQ maps each input to the
> proven owner runtime (`getOwnerWholeBusinessPlan` → arbitration → SupervisorSummary → action-status policy). When an
> input is missing, OpsIQ does NOT guess: confidence drops, the item resolves to `need_more_data`, and material
> recommendations are owner-gated or held — exactly as proven across the 1,465-scenario corpus.

## How to read the columns
- **Why** — why OpsIQ needs it. **Decisions** — what it affects. **Min format** — smallest acceptable form.
- **Provider** — who supplies it. **O/S** — Owner-must-provide (O) or Staff-can-provide (S).
- **If missing → confidence** — confidence impact. **→ status** — action-status impact if absent.
- **Blocks?** — does absence block recommendations in its domain. **Later?** — can be added after pilot start.

## Tier A — pilot cannot start without these (financial + workload + safety baseline)
| # | Category | Why | Decisions | Min format | Provider | O/S | If missing → confidence | → status | Blocks? | Later? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Last 3–6 mo revenue | Establish cash/margin baseline | cash_survival, below_margin, pricing | Monthly totals (sheet/photo) | Owner/accountant | O | low | need_more_data | Yes (finance) | No |
| 13 | Rent / utilities / fixed costs | Break-even + runway | cash_survival, capacity | Monthly fixed-cost list | Owner | O | low | need_more_data | Yes (cash) | No |
| 16 | Receivables / payables | True cash position | cash_survival, credit | Aging list or balances | Owner/accountant | O | low | owner_decision / need_more_data | Yes (cash) | No |
| 25 | Cash obligations + safety threshold | Insolvency line, min-cash guard | block insolvency-risk moves | Upcoming obligations + min-cash figure | Owner | O | low | blocked (if crossed) | Yes (crisis) | No |
| 23 | Owner standing instructions | What owner pre-authorises vs reserves | proceed vs owner_decision gating | Short list of do/never rules | Owner | O | n/a (changes gating) | more owner_decision if absent | No (safe default = gate) | Partial |
| 24 | Owner availability constraints | Owner-unavailable handling | hold vs escalate cadence | Hours/days reachable | Owner | O | n/a | holds owner-gated items | No | Yes |

## Tier B — needed within the first week (operations + quality + capacity)
| # | Category | Why | Decisions | Min format | Provider | O/S | If missing → confidence | → status | Blocks? | Later? |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | Daily order counts | Demand/throughput trend | capacity, staffing, trend | Daily count log | Staff | S | medium | need_more_data (trend) | No | Yes |
| 3 | Service mix | Margin by service | pricing, mix, promotions | % or counts per service | Staff | S | medium | need_more_data (margin) | No | Yes |
| 4 | Customer complaints | Quality/complaint trend | quality response, owner-gate | Count + short samples | Staff | S | medium | need_more_data → owner_decision | No | Yes |
| 5 | Rework / refund logs | Margin leak + gaming check | rework, proof_fraud checks | Log of redo/refund + reason | Staff | S | medium | need_more_data; blocked if evidence gamed | No | Yes |
| 6 | Delivery / pickup logs | On-time + capacity | routing, capacity | Timestamped log | Staff | S | medium | need_more_data | No | Yes |
| 7 | Staff roster | Who does what | delegation, owner-vs-staff | Names + roles + shifts | Owner/manager | O | medium | delegation defaults to owner | No | Yes |
| 8 | Attendance / punctuality | Execution reliability | follow-through risk, gaming | Attendance log | Staff | S | medium | need_more_data; blocked if falsified | No | Yes |
| 10 | Machine / equipment list | Capacity ceiling | capacity_feasibility | Asset list + capacity | Owner/staff | S | medium | need_more_data (capacity) | No | Yes |
| 12 | Chemical / consumable purchases | Input-cost drift | margin, supplier switch | Purchase log/invoices | Staff | S | medium | need_more_data (usage) | No | Yes |
| 14 | Vendor bills | Payables + supplier reliability | vendor calls, cash | Recent bills | Owner/staff | S | medium | need_more_data | No | Yes |

## Tier C — improves depth, optional at start (can be added later)
| # | Category | Why | Decisions | Min format | Provider | O/S | If missing → confidence | → status | Blocks? | Later? |
|---|---|---|---|---|---|---|---|---|---|---|
| 9 | Payroll + incentives | Fixed cost + gaming risk | cash, incentive design | Payroll summary | Owner | O | medium | need_more_data (cash) | No | Yes |
| 11 | Downtime / maintenance | Capacity loss cause | maintenance, capacity | Downtime log | Staff | S | low→medium | need_more_data | No | Yes |
| 15 | B2B contracts / proposals | Concentration + margin | contract owner-gate | Contract copies/terms | Owner | O | medium | owner_decision | No | Yes |
| 17 | Discounts / offers used | Discount creep leak | pricing correction | Offer log | Staff | S | low | need_more_data | No | Yes |
| 18 | Marketing spend | ROI / attribution | budget reallocation | Spend by channel | Owner | O | low | need_more_data | No | Yes |
| 19 | Customer repeat data | Retention/cohort | retention response | Repeat-rate or list | Staff | S | low | need_more_data | No | Yes |
| 20 | Google / review / WhatsApp complaint samples | Real complaint texture | complaint theme, reputation | Screenshots/samples | Staff | S | low | need_more_data | No | Yes |
| 21 | SOPs / checklists | Routine-vs-material classification | proceed eligibility | Existing docs | Owner/manager | O | low (defaults stricter) | more owner_decision if absent | No | Yes |
| 22 | Proof photos / completion samples | Anti-gaming proof capture | proof requirement | Sample photos/tasks | Staff | S | low | need_more_data; blocked if faked | No | Yes |

## Governing rules (how missing data is handled — proven, not aspirational)
1. **No guessing.** A missing critical figure (Tier A) → the affected domain resolves `need_more_data`; confidence is
   never "high" without real provider-backing (`criticalDomainsRealProviderBacked`).
2. **Safe default = gate.** Absent standing instructions/SOPs make OpsIQ *more* conservative (more owner_decision),
   never more permissive.
3. **Staff can supply operations data; only the owner supplies money/authority/obligation data** (Tier A #1,13,16,23,24,25).
4. **Tier A blocks a trustworthy first plan; Tier B/C degrade depth gracefully** and can be added mid-pilot without reset.
5. **Nothing here enables a live-outcome claim** — intake feeds expected decisions; actuals require the running pilot.
