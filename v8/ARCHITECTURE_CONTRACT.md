# OPSIQ Enterprise Architecture Contract

This repository must remain a governed decision-support system, not a generic AI advice generator.

## Non-negotiable rules

1. Next.js App Router route handlers stay thin. They validate request/context, call services, and return a standard API envelope.
2. Business logic lives under `src/services`, `src/modules`, `src/domain`, or `src/repositories`.
3. Diagnosis V2 is additive until explicitly promoted. It must not silently replace existing diagnosis behavior.
4. Every major output must be evidence-backed, confidence-rated, and explainable.
5. Blocking validation issues must produce `needs_input` or provisional state, never false certainty.
6. Recommendations must not become executable until risk, contingency, policy, and action-plan stages have run.
7. Audit events are append-only by convention. Do not update or delete historical audit records except through explicit retention tooling.
8. Every persisted write must have tenant/business context where the current schema supports it.
9. All timestamps must be UTC ISO strings at the service boundary.
10. Prisma is the persistence boundary. Do not introduce a second ORM.
11. Do not add background work inside route handlers. Route handlers enqueue work or call bounded synchronous services only.
12. Zod is the preferred validation layer where already available. If Zod is not installed, wire these contracts through the repo's existing validator first, then add Zod intentionally.

## Pack discipline

The 45-pack roadmap is valid as product sequencing, but it must not be merged as a single giant change. The V5 enterprise pack implements the smallest backbone-compatible subset:

- shared API envelope
- error contract
- request context
- structured logging facade
- audit event builder
- diagnosis V2 orchestration
- evidence validation
- metrics/scoring/hypothesis/recommendation/risk/scenario engines
- business state snapshot engine
- variable registry engine
- trigger/rule engine
- action orchestration engine
- confidence/data-quality engine
- tests and Claude wiring instructions

Everything else remains roadmap until the walking skeleton is green.
