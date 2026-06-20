# OpsIQ Real-World SMB Case Pack

## What This Is

A set of 12 source-inspired, anonymized SMB / solopreneur / small-entity scenarios designed to test the OpsIQ Owner Mode system against realistic business problems before public or SaaS release.

These are **not** private business records. They are **composite, anonymized** scenarios informed by documented patterns in publicly available SMB business failure literature, industry benchmarking studies, and commonly observed small business failure modes.

## Cases Included

| Case ID | Title | Segment | Primary Root Cause |
|---|---|---|---|
| SMB-001 | Growing Revenue, Shrinking Cash — Home Décor Retailer | retail_smb | working_capital_cash_flow_trap |
| SMB-002 | Inventory Cash Trap — Specialty Outdoor Equipment Retailer | retail_smb | inventory_cash_trap |
| SMB-003 | Scaling Losses — DTC Apparel Brand on Paid Acquisition | ecommerce_smb | negative_unit_economics_paid_acquisition |
| SMB-004 | Always Busy, Never Profitable — Independent Casual Dining | food_service_smb | prime_cost_margin_erosion |
| SMB-005 | One Client Owns the Business — B2B Marketing Agency | professional_services_smb | revenue_concentration_single_client_dependency |
| SMB-006 | Fixed Cost Overextension — Independent Fitness Studio | fitness_smb | fixed_cost_overextension_below_breakeven |
| SMB-007 | Capacity Ceiling — Solopreneur HR Consultant | solopreneur | owner_capacity_bottleneck_revenue_ceiling |
| SMB-008 | Revenue on Paper, Cash in the Void — IT Managed Services | b2b_smb | accounts_receivable_cash_flow_gap |
| SMB-009 | Turnover Spiral — Residential and Commercial Cleaning | services_smb | staff_turnover_cost_spiral |
| SMB-010 | Input Cost Squeeze With Frozen Prices — Artisan Bakery | food_retail_smb | input_cost_margin_compression_without_pricing_response |
| SMB-011 | Audience Without Revenue — Creator-Turned-SaaS Tool | saas_creator_smb | product_market_fit_gap_audience_engagement_without_paid_validation |
| SMB-012 | Premature Expansion — Multi-Location Tutoring Center | education_smb | unit_economics_failure_premature_expansion |

## Source Basis

All cases are source-inspired composites. Each fixture records its `source_basis` field, which names the general pattern category and confirms the composite/anonymized nature. No case represents a specific real individual's or organization's private records.

These cases **must not** be treated as factual private business records. They are test scenarios for evaluating diagnosis quality.

## Purpose

These cases exist to test four dimensions of OpsIQ's output quality:

1. **Diagnosis quality** — does the system identify the true root cause rather than surface symptoms?
2. **Missing-input requests** — does the system ask for the evidence it needs rather than guessing?
3. **Bad-recommendation avoidance** — does the system avoid generic, harmful, or premature advice?
4. **First-action quality** — is the recommended first action appropriately specific and sequenced?

## What Is NOT Being Tested

- Production database behavior
- Authentication or authorization
- UI rendering
- Multi-user concurrency
- Real-world API integrations
- Any live data source

## How to Run

```bash
npm run test:owner-real-world-smb
```

Or run the full schema/loader/scoring tests directly:

```bash
npx vitest run tests/owner-mode/real-world-smb-cases
```

## Engine Integration Status

The integration harness (Part B of `realWorldSmbHarness.test.ts`) is currently **skipped**.

Reason: The OpsIQ diagnosis engine accepts `EvidenceItem[]` with typed canonical dimensions.
SMB fixtures carry narrative format (symptoms, free-form facts). No deterministic conversion
exists without case-specific EvidenceItem mappings.

See `runCaseAgainstOpsiq.ts` for the resolution path.

## Expansion

This pack should be expanded with additional real-world cases after the harness is stable.
Minimum recommended holdout pack: 25 additional cases not used for tuning.
