# Owner Data-Entry Guide (PASS 44)

**Date:** 2026-07-07 · The minimum useful data to enter manually, and what never to enter.

## Enter this (minimum useful set)
1. **Business type** — e.g. laundry / restaurant / SaaS / local service.
2. **Services / products** — a short list.
3. **Current constraints** — capacity, cash cap, owner hours/week (as owner-supplied notes/aggregates).
4. **Recent complaints / issues** — anonymized, operational: `STAFF_A missed CUSTOMER_001 pickup; complaint received; evidence: order note`.
5. **Process / SOP gaps** — where a step is missing or failing.
6. **Staff / role capacity** — roles as placeholders (STAFF_A, MANAGER_A) + function; no personal data.
7. **Cash / cost pressure summary** — owner-supplied aggregates only (revenue, cost of goods, cash in hand, receivables overdue); no counterparties.
8. **Opportunities / growth ideas** — e.g. a B2B enquiry or a public tender (as a signal, not a commitment).
9. **Evidence available** — reference ids only (photo id, order note id, report id).
10. **Missing data** — what you know you don't have yet (OpsIQ will raise a missing-data request rather than guess).

## Never enter this
1. Customer PII — names, emails, phone numbers, addresses.
2. Full staff personal data.
3. Bank passwords / login credentials / API keys.
4. Raw contracts.
5. Unredacted invoices.
6. Private customer messages unless redacted.
7. Sensitive personal data (health / political / religious / etc.).

## How to keep it safe
- Use placeholders: `CUSTOMER_001`, `STAFF_A`, `MANAGER_A`, `VENDOR_A`, `BRANCH_A`, `B2B_CLIENT_A`.
- Money is an owner-supplied **aggregate**, never a per-person figure with a counterparty.
- Evidence is a **reference id**, never contents that embed PII.
- If unsure whether something is safe to enter, leave it out and record it as **missing data**.

## Where to enter it
- **Business:** "+ New business" on any owner domain page.
- **Operating data / issues:** `/owner/intake` (Manual form / paste / CSV) + notes.
- **Finance/cash snapshots:** the per-domain "Add snapshot" forms.
- Then open **`/owner/cockpit`** to see your top action.

## What OpsIQ does with it
It routes each issue to a governed task (correction / SOP / training / missing-data / owner-approval / monitor /
blocked), gates completion on evidence, opens reassessment, and never fabricates money or takes an external
action. Public signals you enter are treated as **unverified** until you validate them.
