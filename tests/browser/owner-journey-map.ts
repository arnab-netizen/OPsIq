/**
 * Owner-Journey Proof Map — Phase 1 Wave 8 (minimal seam; groundwork only).
 *
 * This is the single, concrete seam produced by the Wave-8 owner-journey E2E proof PLAN. It is NOT a
 * test and adds NO product/business logic. It is a typed manifest that names each owner-journey stage,
 * records which of the four mandated OpsIQ dimensions that stage must exercise, and points at the
 * EXISTING browser/e2e spec that already covers it (plus any documented proof gap). A later full-Playwright
 * proof wave imports `OWNER_JOURNEY_STAGES` to organise and drive its end-to-end coverage without having
 * to re-derive the journey — so that wave requires no rewrite of this map.
 *
 * Why this file (and not a test): the owner controlling loop scopes Wave 8 to "owner-journey E2E proof
 * PLAN + coverage matrix + minimal seams only — NOT full Playwright", and to STOP after Wave 8. Full
 * Playwright specs already exist under `tests/browser/` (this map references them); this seam only makes
 * the journey → dimension → spec → gap relationship explicit and machine-readable for the next wave.
 *
 * Placement: `tests/browser/` (alongside `owner-pilot-fixtures.ts`). `tests/**` is excluded from the
 * whole-project `tsc` gate and this module is not a `*.spec.ts`/`*.test.ts`, so it is inert (no CI lane
 * executes it) until a future spec imports it.
 *
 * The four mandated dimensions (must ALL be modelled across the journey — see repo CLAUDE.md):
 *   1. consulting lifecycle stage
 *   2. business condition
 *   3. intervention mode + intervention phase
 *   4. human execution reality
 */

/** The four mandated OpsIQ dimensions each journey stage is mapped against. */
export type OwnerJourneyDimension =
  | "consulting_lifecycle_stage"
  | "business_condition"
  | "intervention_mode_and_phase"
  | "human_execution_reality";

export const OWNER_JOURNEY_DIMENSIONS: readonly OwnerJourneyDimension[] = [
  "consulting_lifecycle_stage",
  "business_condition",
  "intervention_mode_and_phase",
  "human_execution_reality",
] as const;

/** Coverage state of a stage's end-to-end proof, as of Wave 8. */
export type OwnerJourneyProofState =
  /** An existing browser/e2e spec asserts this stage end-to-end. */
  | "covered_existing_spec"
  /** A spec touches the surface but a listed dimension/assertion is not yet proven end-to-end. */
  | "partial_gap"
  /** No end-to-end spec yet; proof deferred to a future (owner-authorised) full-Playwright wave. */
  | "planned_gap";

export interface OwnerJourneyStage {
  /** Stable stage id (kebab-case); future specs key their coverage off this. */
  id: string;
  /** Human-readable stage label. */
  label: string;
  /** Ordinal position in the owner journey (1 = entry). */
  order: number;
  /** Which of the four mandated dimensions this stage must exercise. */
  dimensions: readonly OwnerJourneyDimension[];
  /** Existing browser/e2e spec file(s) that already provide proof for this stage. */
  existingSpecs: readonly string[];
  /** Current end-to-end proof state as of Wave 8. */
  proofState: OwnerJourneyProofState;
  /** If proofState !== "covered_existing_spec": the specific proof still owed (for the next wave). */
  gap?: string;
}

/**
 * The owner journey, entry → steady-state governance, mapped to the four dimensions and to the existing
 * Playwright/e2e proof surfaces under `tests/browser/` and `e2e/`. Ordered by `order`.
 *
 * NOTE: proofState reflects that the existing owner specs run in the NON-REQUIRED browser lane (which is
 * also the `next build` heap-OOM-prone lane); "covered_existing_spec" means an assertion exists, not that
 * the lane is a required gate. Promoting owner-journey proof into a required lane is itself a "planned_gap"
 * for the future full-Playwright wave and is recorded on the steady-state stages below.
 */
export const OWNER_JOURNEY_STAGES: readonly OwnerJourneyStage[] = [
  {
    id: "auth-and-access",
    label: "Owner authentication & server-side access control",
    order: 1,
    dimensions: ["human_execution_reality"],
    existingSpecs: ["e2e/auth-flow.spec.ts", "tests/browser/07-owner-server-rejection.spec.ts"],
    proofState: "covered_existing_spec",
  },
  {
    id: "onboarding-intake",
    label: "Onboarding / business intake (type-specific required inputs)",
    order: 2,
    dimensions: ["consulting_lifecycle_stage", "business_condition", "human_execution_reality"],
    existingSpecs: ["tests/browser/15-owner-pilot-onboarding.spec.ts", "tests/browser/21-owner-critical-intake.spec.ts", "tests/browser/51-owner-manual-entry.spec.ts"],
    proofState: "covered_existing_spec",
  },
  {
    id: "diagnosis-confidence",
    label: "First diagnosis with fail-closed confidence (weak data ⇒ low confidence, no fake certainty)",
    order: 3,
    dimensions: ["consulting_lifecycle_stage", "business_condition"],
    existingSpecs: ["tests/browser/15-owner-pilot-onboarding.spec.ts", "tests/browser/09-owner-indicators.spec.ts"],
    proofState: "partial_gap",
    gap: "Onboarding proves weak-business low-confidence + missing-data; a dedicated end-to-end assertion that a confident diagnosis is BLOCKED (not merely low) on contradictory evidence is owed (ties to the Wave-7 isDataSufficient fail-closed unit proof).",
  },
  {
    id: "recommendation-priority",
    label: "Recommendation generation & priority ordering surfaced to the owner",
    order: 4,
    dimensions: ["business_condition", "intervention_mode_and_phase"],
    existingSpecs: ["tests/browser/46-owner-cockpit.spec.ts", "tests/browser/13-owner-whole-business-plan.spec.ts"],
    proofState: "partial_gap",
    gap: "Cockpit renders recommendations; an explicit ordering/priority assertion end-to-end (highest-priority first, deterministic) is owed (ties to Wave-3/4 recommendation proofs).",
  },
  {
    id: "next-best-action",
    label: "Owner next-best-action selection (highest-priority action, no overload)",
    order: 5,
    dimensions: ["intervention_mode_and_phase", "human_execution_reality"],
    existingSpecs: ["tests/browser/47-owner-cockpit-end-to-end-no-overload.spec.ts", "tests/browser/16-owner-pilot-command-center.spec.ts"],
    proofState: "covered_existing_spec",
  },
  {
    id: "action-execution-commitment",
    label: "Action execution & commitment status (draft → in_progress → completed)",
    order: 6,
    dimensions: ["intervention_mode_and_phase", "human_execution_reality"],
    existingSpecs: ["tests/browser/20-action-status-spectrum.spec.ts", "tests/browser/16-owner-pilot-command-center.spec.ts"],
    proofState: "covered_existing_spec",
  },
  {
    id: "adjudication-governance",
    label: "Owner adjudication of governed decisions (approve / block, server-enforced)",
    order: 7,
    dimensions: ["intervention_mode_and_phase", "human_execution_reality"],
    existingSpecs: ["tests/browser/43-owner-adjudication.spec.ts", "tests/browser/48-private-owner-shadow-pilot.spec.ts"],
    proofState: "covered_existing_spec",
  },
  {
    id: "finance-budget-safety",
    label: "Finance / budget safety guardrails",
    order: 8,
    dimensions: ["business_condition", "intervention_mode_and_phase"],
    existingSpecs: ["tests/browser/08-owner-finance-budget-safety.spec.ts"],
    proofState: "covered_existing_spec",
  },
  {
    id: "opportunity-loop",
    label: "Opportunity validation & execution loop",
    order: 9,
    dimensions: ["consulting_lifecycle_stage", "business_condition", "intervention_mode_and_phase"],
    existingSpecs: ["tests/browser/45-owner-opportunity-loop.spec.ts", "tests/browser/44-owner-process-intelligence.spec.ts"],
    proofState: "covered_existing_spec",
  },
  {
    id: "weekly-review-cadence",
    label: "Weekly management / trend review cadence & re-evaluation",
    order: 10,
    dimensions: ["consulting_lifecycle_stage", "business_condition", "intervention_mode_and_phase"],
    existingSpecs: ["tests/browser/18-owner-supervisor-summary.spec.ts", "tests/browser/31-weekly-desktop.spec.ts", "tests/browser/32-weekly-mobile.spec.ts"],
    proofState: "partial_gap",
    gap: "Weekly summary renders; an end-to-end assertion that a significant change (KPI deterioration / shock) routes into governed re-evaluation of condition/mode/phase + review cadence (the CLAUDE.md mandatory adaptive rule) is owed.",
  },
  {
    id: "shock-adaptive-reeval",
    label: "Shock / crisis event triggers governed adaptive re-evaluation",
    order: 11,
    dimensions: ["business_condition", "intervention_mode_and_phase", "human_execution_reality"],
    existingSpecs: ["tests/browser/40-crisis-mobile.spec.ts", "tests/browser/19-chaos-replay.spec.ts", "tests/browser/21-chaos-exhaustive-desktop.spec.ts"],
    proofState: "partial_gap",
    gap: "Crisis/chaos specs exercise shock surfaces; a focused end-to-end assertion binding a shock event to the adaptive re-evaluation of BusinessConditionProfile + InterventionMode/Phase + priority + review cadence is owed.",
  },
  {
    id: "steady-state-governance",
    label: "Steady-state owner cockpit governance (no overload; mobile parity; self-use readiness)",
    order: 12,
    dimensions: ["consulting_lifecycle_stage", "business_condition", "intervention_mode_and_phase", "human_execution_reality"],
    existingSpecs: ["tests/browser/06-owner-control-center.spec.ts", "tests/browser/50-owner-self-use-readiness.spec.ts", "tests/browser/17-owner-pilot-mobile.spec.ts", "tests/browser/12-owner-mobile-smoke.spec.ts", "tests/browser/owner-realistic-baseline.spec.ts"],
    proofState: "planned_gap",
    gap: "Owner-journey proof currently lives ONLY in the non-required browser lane (also the next-build heap-OOM-prone lane). The future full-Playwright wave should (a) add the four gap assertions above and (b) promote a minimal owner-journey smoke into a required, memory-stable lane. NOT started in Wave 8 by owner instruction (STOP after the plan).",
  },
] as const;

/** Convenience: stages still owing end-to-end proof, for the next wave to consume. */
export const OWNER_JOURNEY_OPEN_GAPS: readonly OwnerJourneyStage[] = OWNER_JOURNEY_STAGES.filter(
  (s) => s.proofState !== "covered_existing_spec"
);
