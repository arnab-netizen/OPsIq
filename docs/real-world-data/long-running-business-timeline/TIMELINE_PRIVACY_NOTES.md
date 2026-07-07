# Timeline Privacy Notes — Long-Running Business Timeline (PASS 47)

**Date:** 2026-07-07.

This timeline is a **synthetic, illustrative** laundry/local-service scenario. It uses **no real owner
data** and contains **no PII**.

## What the fixtures contain
- Business-operational facts only: pressure levels (cash/customer/quality/operational/staff/owner-load/
  legal), a temptation flag, missing-data item names, and evidence/reassessment markers.
- Entities are referenced by **placeholders**: `CUSTOMER_001`, `VENDOR_A`, `STAFF_A`. No real names,
  phone numbers, emails, addresses, bank details, contracts, payroll, or unredacted invoices appear.

## What the fixtures deliberately do NOT contain
- No fabricated money, revenue, profit, ROI, win-probability, or owner time-saving figures. The only
  number is a transparent 0–100 **condition score** derived visibly from the pressure levels.
- No real customer/staff/vendor identities, no reviews scraped from any live source, no private records.

## Human-factors scope
Only business-operational human variables are modelled (owner overload/firefighting, follow-through/
delegation, complaints, staff/SOP capability). **No** mental-health, personality, or pseudo-psychology
modelling — consistent with the repository human-factors safety rule.

## Safety posture proven by the run
- OpsIQ takes **no external action**: growth/scale, auto-contact, auto-send, auto-spend and tender
  auto-submit are always in the blocked set of every crisis plan.
- No staff blame/discipline/payroll automation appears in any plan (asserted by the DB test).
- The clean control (a business with no events) fabricates nothing — no crisis, no top action.
