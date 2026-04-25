# Open issues

## Fixed (V8 pack inspection)
- ✅ SHOCK_EVENT_TYPES and ShockEventType missing from statuses.ts (now added)
- ✅ ShockEvent model missing from prisma/schema.prisma (now added with full fields + Engagement back-relation)
- ✅ phase9-operator-interface.test.ts used JSX in a .ts file (renamed to .tsx)
- ✅ Status files were stale — updated to reflect actual implementation state

## Outstanding — design divergences (not blocking, require explicit decision)

### INTERVENTION_PHASES mismatch
- `INTERVENTION_PHASES` constant = `["triage", "stabilize", "repair", "strengthen", "grow", "protect"]`
- `intervention-state.ts` PHASE_TRANSITIONS uses `assessment → planning → execution → review → handover → closed`
- These are different semantic sets: intensity-based vs lifecycle-based
- `z.enum(INTERVENTION_PHASES)` in API routes would reject lifecycle-based phase inputs
- Tests in `intervention-state.test.ts` assert lifecycle names and will continue to fail
- **Decision needed**: unify on one naming convention; align service, constants, tests, and API routes

### Recommendation class values
- Pack spec (module-07/schema.md): `containment, stabilization, structural_repair, growth_enablement, resilience_protection`
- Implemented service: `containment | stabilization | growth` (3 classes only)
- `structural_repair` and `resilience_protection` are missing
- **Decision needed**: extend to 5 classes or document the simplification

### KPI model naming
- Pack spec (module-09/schema.md): entity named `KPIDefinition`
- Prisma schema: model named `KPI`
- No category field (survival/execution/stability/growth_readiness) on KPI model
- No confidenceLabel on KPISnapshot

### Action model naming
- Pack spec (module-08/schema.md): `ActionItem` and `ActionDependency`
- Prisma schema: `Action` only; no ActionDependency table
- No contingencyPlan or fallbackOption fields on Action model

### Deliverable versioning
- Pack spec (module-10/schema.md): `Deliverable` + `DeliverableVersion`
- Prisma schema: `Deliverable` only; no versioning

## Pending from prior work
- Database partial unique index on BusinessConditionProfile(engagement_id) WHERE is_current = true (requires raw SQL migration)
- Enum validation for ClientAccount.size not yet enforced at schema level
