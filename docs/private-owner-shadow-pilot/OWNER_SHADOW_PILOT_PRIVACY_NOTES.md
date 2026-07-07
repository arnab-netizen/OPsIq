# Owner Shadow Pilot — Privacy Notes (PASS 42)

**Date:** 2026-07-07

## Data classification
All fixtures in this pack are **`OWNER_STYLE_SYNTHETIC_SHADOW_FIXTURES`** — anonymized, synthetic, invented for
the shadow pilot. **No real owner business data, no customer/staff/vendor PII, no credentials.** Every person,
customer, vendor, client, branch, and order is a placeholder (`CUSTOMER_001`, `STAFF_A`, `MANAGER_A`,
`VENDOR_A`, `BRANCH_A`, `B2B_CLIENT_A`, `OWNER_BUSINESS_A`, `WORKSPACE_A`).

## What is NOT in this pack
- No real names, emails, phone numbers, addresses.
- No bank data, passwords, API keys, tokens.
- No unredacted invoices or private contracts.
- No live CRM/email/bank/account access; no connectors; no live fetch.
- No third-party private data.

## Adversarial privacy proof
The pack deliberately seeds one **adversarial** public-review intake row for scenario E that embeds a
prompt-injection instruction and PII (`test@example.com`, `07700900123`). The DB simulation
(`private-owner-shadow-pilot-pack.db.test.ts`, test 10) asserts that the owner-facing public-signals read:
- hides raw text (`rawTextHidden === true`),
- strips PII (`piiStripped === true`),
- never surfaces the email/phone or the injection text,
- states "OpsIQ does not fetch live web data in this view",
so a hostile public signal cannot leak PII or steer the system.

## If real owner data is supplied later
Real data may only be used **after redaction** per
`docs/audits/2026-07-07-private-owner-shadow-pilot-readiness/SHADOW_PILOT_DATA_REDACTION_GUIDE.md`:
1. Remove PII; replace people/vendors/clients with placeholders.
2. Express money only as owner-supplied aggregates (no counterparties).
3. Evidence is reference ids only, never contents embedding PII.
4. Run the §7 redaction verification checklist. If redaction is uncertain, exclude the field.
5. Data is minimized to what each module consumes.

## Retention
Shadow fixtures live in the repo (synthetic, safe to commit). Any real redacted snapshot must **not** be
committed to the repo; it stays in the owner's controlled environment and is deleted after the pilot.

## Boundary restated
The shadow pilot never contacts anyone, moves money, submits a tender, changes a contract, or takes any
external action. It evaluates governed *decision routing* only; the owner performs the real work manually.
