# Holdout Fixture Schema

## Overview

Holdout fixtures must conform to the same schema as the internal benchmark fixtures. The schema is enforced by `fixtureSchema.ts`. Any fixture that fails schema validation is rejected before scoring.

The only differences from the internal fixture schema are:
1. `case_id` must match `/^HO-\d{3}$/` (e.g., `HO-001`) instead of `/^SMB-\d{3}$/`
2. A `holdout_meta` block is required (not in the original schema — holdout runner validates this separately)

---

## TypeScript Interface

```typescript
// Matches SmbFixture from fixtureSchema.ts with holdout extensions

interface HoldoutFixtureScenario {
  business: string;                                    // Non-blank string
  facts_known_to_owner: Record<string, unknown>;       // Non-null object; can include numeric KPIs
  symptoms: string[];                                  // Min 3 items, each non-blank
  misleading_signals: string[];                        // Min 2 items, each non-blank
  missing_inputs_opsiq_should_request: string[];       // Min 3, max 6 items, each non-blank
}

interface HoldoutFixtureScoringCriteria {
  must_identify: string[];    // Min 4, max 8 items — diagnostic phrases
  must_not_claim: string[];   // Min 2, max 4 items — false diagnosis phrases
  ideal_depth: string[];      // Min 2, max 4 items — thoroughness indicators
}

interface HoldoutFixtureDiagnosis {
  primary_root_cause: string;            // Snake_case label, non-blank
  secondary_causes: string[];            // Min 2, max 4 snake_case labels
  expected_first_action: string;         // Full sentence, specific and diagnostic
  bad_recommendations_to_flag: string[]; // Min 4, max 6 items
  scoring_criteria: HoldoutFixtureScoringCriteria;
}

interface HoldoutMeta {
  author_id: string;          // Opaque identifier for the case author
  construction_date: string;  // ISO 8601 date
  industry: string;           // Human-readable industry label
  archetype_hypothesis: string; // Author's guess at the primary archetype (does not affect scoring)
  author_read_existing_fixtures: boolean;  // Must be false
  author_read_composer_source: boolean;    // Must be false
}

interface HoldoutFixture {
  case_id: string;            // Pattern: /^HO-\d{3}$/
  title: string;              // Non-blank descriptive title
  segment: string;            // Non-blank segment label
  source_basis: string[];     // Min 1 item — basis for constructing the case
  scenario: HoldoutFixtureScenario;
  expected_opsiq_diagnosis: HoldoutFixtureDiagnosis;
  holdout_meta: HoldoutMeta;
}
```

---

## JSON Example (Annotated)

```json
{
  "case_id": "HO-001",

  "title": "Profitable on Paper, Perpetually Short — Electrical Contractor",

  "segment": "Trade contractor, B2B, 8 employees, $1.6M revenue",

  "source_basis": [
    "Composite of trade contractor cash flow patterns from consulting practice",
    "Progress billing cycle common in construction and trades"
  ],

  "scenario": {
    "business": "Eight-person electrical contracting business doing commercial fit-outs. Owner has been operating 7 years. Revenue grew 22% last year. Profit-and-loss shows positive net income. Bank account regularly drops below $20K in weeks 3–4 of each month. Owner is drawing less than he did three years ago despite higher revenue. Has not missed payroll but came close twice in the past 6 months. Currently has $140K in outstanding invoices.",

    "facts_known_to_owner": {
      "annual_revenue": 1600000,
      "gross_margin_pct": 38,
      "outstanding_invoices": 140000,
      "bank_balance_low_point": 18000,
      "employees": 8,
      "years_operating": 7,
      "revenue_growth_pct": 22
    },

    "symptoms": [
      "Bank balance drops dangerously low in the third and fourth week of every month",
      "Owner is drawing less personally despite revenue being higher than ever",
      "Came close to missing payroll twice in the last six months",
      "Has a growing pile of outstanding invoices but cannot access the cash",
      "Feels like the harder the business works the worse the cash situation gets"
    ],

    "misleading_signals": [
      "Revenue grew 22% last year — owner believes the problem is insufficient growth",
      "Gross margin of 38% is healthy for the trade — owner believes margin is not the issue",
      "Profit-and-loss statement shows positive net income — accountant says the business is profitable",
      "Owner recently upgraded a van — suspects this may be causing the cash problem"
    ],

    "missing_inputs_opsiq_should_request": [
      "Full accounts receivable aging report broken down by client and days outstanding",
      "Standard payment terms in client contracts and what enforcement mechanism exists",
      "Average days from invoice issue to payment receipt for the last 12 months",
      "Payroll schedule and supplier payment schedule relative to invoice collection dates",
      "List of the three largest outstanding invoices and their age"
    ]
  },

  "expected_opsiq_diagnosis": {
    "primary_root_cause": "accounts_receivable_collection_lag",

    "secondary_causes": [
      "no_formal_collections_process",
      "misaligned_payment_terms_with_payroll_cycle",
      "progress_billing_not_enforced"
    ],

    "expected_first_action": "Produce an aged receivables report listing every outstanding invoice by client and days outstanding, identify all invoices beyond 45 days, and send formal payment requests with a 7-day deadline to the three largest overdue accounts before taking any other action.",

    "bad_recommendations_to_flag": [
      "grow revenue to solve the cash problem",
      "take on a line of credit to cover the shortfall",
      "hire a salesperson to bring in more clients",
      "invest in marketing to attract larger clients",
      "reduce the team to cut costs"
    ],

    "scoring_criteria": {
      "must_identify": [
        "accounts receivable",
        "days sales outstanding",
        "invoice collection lag",
        "cash flow gap",
        "payment terms",
        "collections process"
      ],

      "must_not_claim": [
        "the business needs more revenue",
        "the van purchase is causing the cash problem",
        "gross margin needs to be improved"
      ],

      "ideal_depth": [
        "identifies the mismatch between payroll cycle timing and invoice collection timing",
        "notes that progress billing milestones may not be enforced contractually",
        "recognises that profitability does not equal cash availability"
      ]
    }
  },

  "holdout_meta": {
    "author_id": "author-A",
    "construction_date": "2026-06-22",
    "industry": "Trade contractor",
    "archetype_hypothesis": "Working capital / AR collection lag",
    "author_read_existing_fixtures": false,
    "author_read_composer_source": false
  }
}
```

---

## Field-by-Field Constraints

### case_id
- Pattern: `/^HO-\d{3}$/`
- Must be unique across all holdout fixtures
- Do not start at HO-001 if any prior holdout batch used those IDs — continue numbering

### title
- Human-readable, descriptive
- Must not contain diagnostic jargon that would appear in `must_identify`
- Should capture the presenting business tension, not the diagnosis

### segment
- Single string: business type, revenue model, approximate size, headcount
- Example: `"Specialty retail, e-commerce + physical, 3 employees, $680K revenue"`

### source_basis
- At least 1 entry
- Describes the basis for constructing the case — real experience, composite, published pattern
- Does not affect scoring

### scenario.business
- Narrative paragraph (2–5 sentences)
- Written in plain language, as a case briefing
- Must not contain any `must_identify` phrase verbatim
- Must include: what the business does, approximate size/age, and the primary presenting problem

### scenario.facts_known_to_owner
- JSON object of key-value pairs
- Numeric KPIs with snake_case keys (e.g., `annual_revenue`, `gross_margin_pct`, `outstanding_invoices`)
- Only facts the owner actually knows and has told OpsIQ
- Does not include metrics the owner does not know (those belong in `missing_inputs_opsiq_should_request`)

### scenario.symptoms
- Array of strings
- Written as the owner would state them (plain language, not consulting vocabulary)
- Minimum 3, no maximum
- Must not echo `must_identify` phrases

### scenario.misleading_signals
- Array of strings
- Minimum 2
- Each must be a fact that is true for the business but that points toward a wrong conclusion
- Must not be obviously irrelevant

### scenario.missing_inputs_opsiq_should_request
- Array of strings
- Minimum 3, maximum 6
- Must be specific and diagnostic
- Must include at least one document and at least one numeric metric

### expected_opsiq_diagnosis.primary_root_cause
- snake_case string
- Your own label — do not copy from any existing fixture

### expected_opsiq_diagnosis.secondary_causes
- Array of snake_case strings
- Minimum 2, maximum 4

### expected_opsiq_diagnosis.expected_first_action
- Full sentence describing a specific, immediate, diagnostic action
- Must not be a copy of any scenario field
- Must not include generic language like "review your business"

### expected_opsiq_diagnosis.bad_recommendations_to_flag
- Array of lowercase strings
- Minimum 4, maximum 6
- Written as the bad advice would actually be given ("grow revenue" not "GROW_REVENUE")
- Must not appear in the scenario

### expected_opsiq_diagnosis.scoring_criteria.must_identify
- Array of strings: 4–8 items
- Standard consulting / accounting / domain vocabulary
- Not copied from the scenario
- Mix of mechanism terms, metric terms, and consequence terms

### expected_opsiq_diagnosis.scoring_criteria.must_not_claim
- Array of strings: 2–4 items
- Phrases that would indicate a wrong diagnosis
- Typically derived from misleading signals

### expected_opsiq_diagnosis.scoring_criteria.ideal_depth
- Array of strings: 2–4 items
- Observations above the minimum pass standard
- Written as complete sentences describing what a thorough analyst would note

### holdout_meta
- All fields required
- `author_read_existing_fixtures` and `author_read_composer_source` must be `false`
- If either is `true`, the case is rejected before scoring

---

## Schema Validation

The holdout runner will validate each fixture against this schema before scoring. Validation errors are fatal — the case is excluded from the run with an error logged. Authors should pre-validate using the reference implementation before submitting.

### Case ID Uniqueness
No two holdout fixtures may share a `case_id`. Duplicates are rejected.

### Cross-Fixture Leakage Check
The holdout runner will also check that no `must_identify` term from any holdout fixture appears verbatim in the fixture's own `scenario` fields (symptoms, misleading_signals, business). This is the anti-leakage schema check.
