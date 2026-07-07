# Shadow Pilot — Data Redaction Guide (PASS 41)

**Date:** 2026-07-07 · **Rule of the guide:** *use operational facts, not personal identities.*

If redaction is uncertain, **do not ingest**. Data must be minimized to what a module actually consumes.

## 1. Fields to REMOVE entirely (never ingest)
- Customer phone numbers, emails, full names, home/private addresses.
- Staff personal identifiers (full name, phone, email, ID numbers) unless the owner explicitly authorizes AND
  it is necessary — default is to use a placeholder role instead.
- Bank login data, passwords, API keys, tokens.
- Unredacted invoices containing personal data; private contracts (unless owner-authorized AND redacted).
- Medical/health/political/religious/other sensitive personal data (unless explicitly required and safely handled).
- Any field not necessary for the pilot.

## 2. Fields to REPLACE with placeholders
| Real thing | Placeholder |
|-----------|-------------|
| a customer | `CUSTOMER_001`, `CUSTOMER_002`, … |
| a staff member | `STAFF_A`, `STAFF_B`, … |
| a manager | `MANAGER_A` |
| a vendor/supplier | `VENDOR_A` |
| a branch/outlet | `BRANCH_A` |
| a service order | `SERVICE_ORDER_001` |
| a B2B client / opportunity | `B2B_CLIENT_A` |
| a property/site | `PROPERTY_A` |
| the workspace | `WORKSPACE_A` |
| the owner's business | `OWNER_BUSINESS_A` |

## 3. Fields allowed only as AGGREGATED numbers
- Revenue, cost of goods, fixed/variable costs, margins → period aggregates only, owner-supplied.
- Cash in hand, receivables overdue, payables → aggregate balances only.
- Order/complaint/rework counts → counts per period, never per-identified-person.
- Pricing → allowed as a number list; exclude if it exposes a specific client's negotiated contract.

## 4. Fields NEVER to include
See section 1. Additionally: live account access, CRM/email/bank connections, real-time feeds — none are used;
the pilot is non-live.

## 5. Example before/after redactions

### Customer complaint
- **Bad:** "Rahul ignored customer Mrs. Sen's pickup from 9831XXXXXX, she's furious, email sen@…"
- **Good:** `STAFF_A missed CUSTOMER_001 pickup. Complaint received (severity: high). Evidence: order note exists (SERVICE_ORDER_001).`

### Staff / process issue
- **Bad:** "Priya keeps messing up the pressing, third time this month, she's careless."
- **Good:** `STAFF_B: repeated pressing-quality defect on 3 orders this period (rework loop). SOP gap: no final-check step. Evidence: rework log.`
  (No character judgement — operational fact only. No "careless/lazy/negligent" language.)

### Cash / cost summary
- **Bad:** invoice scan with client name, GSTIN, bank details.
- **Good:** `{ periodRevenue: 180000, costOfGoods: 90000, fixedCosts: 60000, cashInHand: 25000, receivablesOverdue: 40000, currency: "INR", confidence: "medium" }` (owner-supplied aggregates, no counterparties).

### Vendor issue
- **Bad:** "Supplier Bengal Chemicals Ltd, contact Mr. Das 98XXXX, late again."
- **Good:** `VENDOR_A: detergent delivery late by 5 days, impact: 1 day of delayed service. Evidence: delivery note.`

### Opportunity / tender
- **Bad:** "Tender from Hotel Taj, contract PDF attached with signatures and pricing."
- **Good:** `B2B_CLIENT_A: weekly towel-laundering enquiry (gyms/hotels segment, local). hasUnitEconomics: false. No pricing committed. Evidence: none yet.`

## 6. Safe formats (canonical)
- **Complaint:** `{ customer: CUSTOMER_00N, issue: "<operational>", severity: LOW|MEDIUM|HIGH, evidenceRef: "<id|null>" }`
- **Staff issue:** `{ role: STAFF_A|MANAGER_A, issue: "<operational, no judgement>", sopGap: "<gap|null>", evidenceRef: "<id|null>" }`
- **Cash/cost:** aggregates only, `{ ...numbers, currency, confidence }`, no counterparties.
- **Vendor:** `{ vendor: VENDOR_A, issue, impact, evidenceRef }`
- **Opportunity/tender:** `{ client: B2B_CLIENT_A, need, segment, hasUnitEconomics, pricingCommitted: false, evidenceRef }`

## 7. Redaction verification checklist (must pass before any ingest — enforced in PASS 42 fixtures)
1. No email pattern (`@`), no phone pattern, no full personal name.
2. All persons/vendors/clients are placeholders.
3. All money is an owner-supplied aggregate, no counterparties named.
4. No credentials/keys/tokens.
5. No character/negligence/legal judgement language.
6. Only necessary fields present (data minimized).
