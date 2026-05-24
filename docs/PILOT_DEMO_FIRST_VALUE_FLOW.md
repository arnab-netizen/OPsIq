# Pilot Demo First-Value Flow

Minimal demo experience showing OpsIQ value without manual setup.

## Quick Start

### Seed Demo Workspace

```bash
npm run demo:seed
```

Creates deterministic demo engagement with sample risks, opportunities, and recommended action.

### View First-Value Page

Navigate to `/owner/first-value` in authenticated dashboard.

Shows: workspace mode (DEMO), business snapshot, top 3 risks, top 3 opportunities, recommended first action, evidence, missing data, safety warnings, confidence state.

### Export Proof Packet

Click "Export Proof Packet" button to download JSON for support/buyer handoff.

## First-Action Rule

**No recommended action unless evidence exists.**

Every recommended first action includes:
- action (clear statement)
- reason (evidence-based)
- expectedImpact (quantified if possible)
- effort (MINIMAL/SMALL/MEDIUM/LARGE)
- risk (NONE/LOW/MEDIUM/HIGH)
- evidenceRefs (list of findings/KPIs supporting action)
- firstStep (concrete next move)
- stopCondition (when to reassess)
- confidenceState (HIGH_CONFIDENCE/MEDIUM_CONFIDENCE/LOW_CONFIDENCE/NEED_MORE_DATA/CANNOT_DETERMINE/DANGER_DO_NOT_ACT)

## State Machine

- **NO_WORKSPACE**: Workspace not created
- **EMPTY_WORKSPACE**: No engagement or findings
- **MINIMUM_DATA_PRESENT**: Has findings, no actions yet
- **FIRST_VALUE_READY**: Has findings and actions
- **CANNOT_DETERMINE**: Ambiguous state requiring manual review

## Demo Data

All demo records marked with:
- Workspace name: `DEMO Workspace`
- Sample data clearly labeled
- Engagement names: `Tech Startup - Growth Stage`

Demo data is illustrative only. Not real business data.

## API Endpoint

`GET /api/owner/first-value` (authenticated, workspace-scoped)

Returns `FirstValueDTO` with all visibility data.

## Limitations

- Demo workspace uses fixed sample data
- No AI-driven recommendations (evidence-based only)
- Confidence states are illustrative
- Export is JSON only (no PDF/HTML yet)
- Static snapshot (no real-time updates)

## Files Created

- `scripts/seed-demo-workspace.mjs` - Deterministic seed
- `src/services/first-value.service.ts` - Core logic
- `src/app/api/owner/first-value/route.ts` - API
- `src/app/(authenticated)/owner/first-value/page.tsx` - UI
- `src/lib/first-value/first-value.dto.ts` - Data contracts
- `src/__tests__/first-value.test.ts` - Tests (marked [db])

## Known Constraints

- No schema migrations
- No new auth system
- No recommendation engine redesign
- No full onboarding product
- Demo workspace only (no multi-tenant demo support yet)
