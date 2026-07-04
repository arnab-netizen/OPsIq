# OpsIQ — Owner-Data Dry Run: Execution Checklist & First-Run Input Pack

This is the exact pack the owner uses to run the **first supervised dry run** on
their own real business data. Nothing here fabricates data; the dry run is
fail-closed and **BLOCKED until every required input is filled with real values**,
and even when READY it requires explicit owner approval before any execution.

---

## 1. The four dimensions every input must feed

| Dimension | Fed by |
|---|---|
| Consulting lifecycle stage | Business profile |
| Business condition | Owner goals, payment/cash, customers/orders, complaints, margin target |
| Intervention mode + phase | Pricing/approval boundary, existing SOPs |
| Human execution reality | Employees/roles, capacity, proof examples |

## 2. Intake checklist (REQUIRED = blocking, optional = raises confidence)

| Section | Required? | Fields the owner must provide | Dimension |
|---|---|---|---|
| `businessProfile` | REQUIRED | businessName, industry, locationOrService, ownerRole, headcount | Consulting lifecycle |
| `ownerGoals` | REQUIRED | primaryGoal, topPainPoint, currentMonthlyRevenueBand, urgency | Business condition |
| `paymentCash` | REQUIRED | cashRunwayMonths, monthlyFixedCost, outstandingReceivables | Business condition |
| `pricingBoundary` | REQUIRED | maxDiscountPercent, maxRefund, refundPromiseAllowed, priceQuoteAllowed, allowedActions | Intervention mode/phase |
| `employees` | REQUIRED | name, role, reliability, isKeyPerson (per employee) | Human execution reality |
| `capacity` | REQUIRED | dailyJobCapacity, currentBacklog, peakHours | Human execution reality |
| `customersOrders` | optional | customerSegment, orderValue, channel, date (per order) | Business condition |
| `sopInput` | optional | taskType, currentSteps | Intervention mode/phase |
| `proofExamples` | optional | taskType, proofType, exampleDescription | Human execution reality |
| `complaintHistory` | optional | issue, frequency, severity | Business condition |
| `marginTarget` | optional | a single number | Business condition |

Fail-closed rules enforced by the assessor:
- A section counts only when present **and** its required fields are non-empty.
  A blank-but-structured pack is BLOCKED (numeric `0` is a valid value; empty
  strings/arrays are not).
- A dry run is READY only when **all six REQUIRED sections** are satisfied **and**
  **all four dimensions** are covered.
- READY never auto-executes: the provisional output always carries
  `requiresOwnerApproval: true`.

## 3. First dry-run commands

Print the checklist + a blank template:
```
npx tsx scripts/owner-data-dry-run.ts
```

Assess readiness over the owner's real data (copy the example, fill real values):
```
cp owner-data-intake.example.json owner-data.json
# edit owner-data.json with the owner's REAL business data
npx tsx scripts/owner-data-dry-run.ts owner-data.json
```

Exit codes: `0` = READY for supervised dry run · `1` = BLOCKED (missing required
data; the report lists exactly which sections and dimensions) · `2` = no file
(template printed) · `3` = unreadable/invalid file.

## 4. Input pack template

`owner-data-intake.example.json` (in the repo root) is the starter pack. It is
intentionally **blank** — running it as-is reports BLOCKED, by design, until real
values replace the placeholders.

## 5. What happens after READY

A READY verdict means the data is sufficient to run the governed loop in a
**supervised** dry run. The owner then reviews and approves every generated
workflow before any employee sees a task. Only after a successful supervised
dry run on real data does **Slice 27 (limited real-employee pilot)** become
available — that is a supervised live operational step, not a code task, and is
NOT started until real owner data and live supervision are in place.
