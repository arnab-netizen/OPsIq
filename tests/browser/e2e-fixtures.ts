/**
 * Shared fixed identifiers/credentials for the owner-flow E2E lane.
 *
 * Imported by BOTH the seed (`scripts/seed-e2e-owner.ts`) and the Playwright specs so the
 * browser tests can reference deterministically-seeded records (the proof-blocked task, the
 * non-owner member) without scraping IDs out of the UI. Deterministic seed = stable assertions.
 */

export const E2E_OWNER = {
  email: "test1@staging.local",
  password: "password123",
  userId: "10000000-0000-0000-0000-0000000000e2",
};

/** A real member of the SAME workspace who holds NO owner role assignment → lacks owner:view. */
export const E2E_MEMBER = {
  email: "member1@staging.local",
  password: "password123",
  userId: "10000000-0000-0000-0000-0000000000e3",
};

export const E2E_WORKSPACE_ID = "20000000-0000-0000-0000-0000000000e2";

/** A proof-required delegated task with NO accepted proof → completion is server-rejected. */
export const E2E_PROOF_BLOCKED_TASK_ID = "40000000-0000-0000-0000-0000000000e2";
export const E2E_PROOF_REQUIREMENT_ID = "41000000-0000-0000-0000-0000000000e2";

/**
 * Dedicated BC probe business in the E2E workspace. Seeded by seed-e2e-business-condition.ts
 * with ownerCashflowCycle.cashflowState="CRITICAL" so spec 46 can assert cashPressureLevel=CRITICAL.
 */
export const E2E_BC_PROBE_BUSINESS_ID = "30000000-0000-0000-0000-0000000000bc";

// ─── Phase 2 Attention Engine fixtures (seed-e2e-attention-engine.ts) ─────────

/** OwnerBusiness created specifically for metric snapshots that drive goal + trend signals. */
export const E2E_ATTN_BUSINESS_ID    = "80000000-0000-0000-0000-000000000001";

/** OwnerGoal seeded AT_RISK: targetAmount=1_000_000 INR with slow revenue growth in snapshots. */
export const E2E_GOAL_ID             = "40000000-0000-0000-0000-000000000001";

/** OPEN escalation seeded for spec 53 (escalation acknowledge). */
export const E2E_ESCALATION_ID       = "50000000-0000-0000-0000-000000000001";

/** OwnerCapacitySnapshot with bottleneckUtilization=0.92 to trigger growth_before_capacity policy. */
export const E2E_ATTN_CAPACITY_ID    = "83000000-0000-0000-0000-000000000001";

// ─── Phase 3 Execution Lifecycle fixtures (seed-e2e-phase3.ts) ──────────────

/** OwnerBusiness for Phase 3 E2E: laundry/dry-cleaning, used in RECORD_OUTCOME. */
export const E2E_PHASE3_BUSINESS_ID = "90000000-0000-0000-0000-000000000090";

/** ProcessExecutionTask in PROPOSED status: used to test ACKNOWLEDGE → inExecution journey. */
export const E2E_PHASE3_TASK_ID     = "91000000-0000-0000-0000-000000000091";

/** Stable taskKey matching E2E_PHASE3_TASK_ID — used in data-testid assertions. */
export const E2E_PHASE3_TASK_KEY    = "phase3_e2e_cash_flow_action";

// ─── Phase 4 Business Operating System fixtures (seed-e2e-phase4.ts) ─────────

/** BusinessObjective seeded as ACTIVE for Phase 4 cockpit BOS panel assertions. */
export const E2E_PHASE4_OBJECTIVE_ID = "a0000000-0000-0000-0000-000000000401";

/** Second BusinessObjective — COMPLIANCE type for arbitration multi-candidate testing. */
export const E2E_PHASE4_OBJECTIVE2_ID = "a0000000-0000-0000-0000-000000000402";

/** BusinessRiskEntry seeded with high severity for Phase 4 BOS panel risk row. */
export const E2E_PHASE4_RISK_ID      = "a1000000-0000-0000-0000-000000000401";

/** ExternalOpportunitySignal seeded as ACTIVE/CANDIDATE for arbitration external-candidate testing. */
export const E2E_PHASE4_OPPORTUNITY_ID = "a2000000-0000-0000-0000-000000000401";

/** ConstraintResolutionRecord seeded as ACTIVE with high bindingScore for constraint UI testing. */
export const E2E_PHASE4_CONSTRAINT_ID  = "a3000000-0000-0000-0000-000000000401";

/** ResourcePool seeded as active for Phase 4 BOS panel resource-pools display. */
export const E2E_PHASE4_POOL_ID        = "a4000000-0000-0000-0000-000000000401";

// ─── Phase 5 Startup Mode fixtures ───────────────────────────────────────────

/** OwnerStartupSession seeded for Phase 5 E2E journey. */
export const E2E_PHASE5_SESSION_ID     = "b0000000-0000-4000-8000-000000000501";

/** StartupIdeaRecord seeded for Phase 5 E2E journey. */
export const E2E_PHASE5_IDEA_ID        = "b1000000-0000-4000-8000-000000000501";
