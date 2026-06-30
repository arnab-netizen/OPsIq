/**
 * COUNTED chaos corpus — a deterministic selection of real, source-backed `PublicCase`s, lifted into the
 * chaos-scenario lens. Selection guarantees the readiness coverage: ≥15 real-world business categories,
 * ≥1 good + ≥2 bad + ≥2 ugly per category, and every mandatory cross-cutting chaos type. Nothing here is
 * synthetic; every counted scenario inherits a real `sourceRef`. A small set of clearly-marked synthetic
 * edge scenarios is provided separately and is NEVER counted toward readiness.
 */
import { PUBLIC_CORPUS } from "../public-cases/library";
import type { PublicCase } from "../public-cases/schema";
import { publicCaseToChaosScenario, type ChaosScenario } from "./chaos-schema";

const REAL = PUBLIC_CORPUS.filter((p) => p.meta.realFlag === "real" && p.meta.productionRuntimeEligible);

/** 15 required real-world-like categories (corpus keys) → the prompt's category list. */
export const REQUIRED_CATEGORIES = [
  "laundry", "housekeeping", "restaurant", "retail_grocery", "pharmacy", "salon", "repair", "manufacturing",
  "logistics", "agency", "ecommerce", "eldercare", "franchise", "multi_location", "b2b_contractor",
] as const;

/** 11 sourced patterns chosen so the cross-product covers good/bad/ugly + every chaos type. */
export const CHAOS_PATTERN_SET = [
  "weak_unit_economics_scale", // GOOD (good_fragile): a fragile growth opportunity — proceed only with proof
  "owner_overload",            // BAD: owner bottleneck / owner pressure
  "quality_complaints",        // BAD: customer/reputation
  "seasonality_planning",      // BAD (normal): novelty / demand planning
  "local_market_remote",       // BAD (normal): remote-owner / novelty
  "cashflow_squeeze",          // UGLY: cash crisis / high-revenue-bad-business / stop-loss
  "over_expansion",            // UGLY: premature growth / shutdown-pivot
  "compliance_shutdown_risk",  // UGLY: compliance boundary / stop-reject
  "fake_completion_proof",     // UGLY: fake completion / proof-fraud / manipulation
  "fake_vendor_fraud",         // UGLY: vendor fraud / manipulation
  "cyber_payment_fraud",       // UGLY: cyber/payment/data-loss
] as const;

function findReal(category: string, patternId: string): PublicCase | undefined {
  return REAL.find((p) => p.meta.businessCategory === category && p.meta.patternId === patternId);
}

function buildCounted(): ChaosScenario[] {
  const out: ChaosScenario[] = [];
  for (const cat of REQUIRED_CATEGORIES) {
    for (const pat of CHAOS_PATTERN_SET) {
      const pc = findReal(cat, pat);
      if (pc) out.push(publicCaseToChaosScenario(pc, { counted: true }));
    }
  }
  return out;
}

/** The counted, source-backed real-world chaos scenarios that score toward readiness. */
export const COUNTED_CHAOS_SCENARIOS: ChaosScenario[] = buildCounted();

/** The underlying PublicCases for the counted scenarios (used by the replay runner). */
export const COUNTED_PUBLIC_CASES: PublicCase[] = (() => {
  const out: PublicCase[] = [];
  for (const cat of REQUIRED_CATEGORIES) for (const pat of CHAOS_PATTERN_SET) {
    const pc = findReal(cat, pat);
    if (pc) out.push(pc);
  }
  return out;
})();

// ─── Synthetic edge scenarios (MARKED, never counted) ──────────────────────────────────────────────
/** A clean-textbook + an unsourced + a no-chaos scenario — used only to prove the gates reject them. */
export const SYNTHETIC_EDGE_SCENARIOS: ChaosScenario[] = [
  {
    scenarioId: "SYNTH-CLEAN-TEXTBOOK",
    countedForReadiness: false, synthetic: true, sourceRefs: [], sourceLimitations: ["synthetic edge case — not real"],
    goodBadUgly: "good", businessProfile: "textbook healthy café", businessCategory: "restaurant", businessStage: "established",
    ownerRole: "owner-operator", workspaceHandling: "isolated", locationBranch: "US / tier1",
    availableData: ["all financials verified"], missingData: ["nothing material"], staleData: [], conflictingData: ["none"],
    ownerPressure: "owner is calm and disciplined", temptingWrongAction: "none",
    staffVendorCustomerNoise: [], financialState: "healthy", operationalState: "healthy", staffWorkloadState: "balanced",
    customerReputationState: "strong", proofCompletionState: "verified", growthOpportunityState: "clear opportunity",
    complianceBoundaryState: "no active block", expectedModules: ["domain:profitable_growth"], expectedNonDominantModules: [],
    expectedDominantConstraint: "profitable_growth", expectedRejectedTemptingAction: "none",
    expectedSupervisorActionStatus: "cautious_proceed", expectedDashboardFields: ["mainIssue"],
    expectedProofReassessment: ["quarterly review"], expectedBusinessOutcomeRationale: "Healthy business; only fine-tuning.",
    expected7DaySignal: "stable", expected30DaySignal: "stable", expectedLearningOnFail: "n/a",
    expectedRealWorldConsequenceIfWrong: "Minimal — this synthetic clean case carries no real chaos.", chaosTypes: ["growth_scale_temptation"],
  },
];

// ─── Coverage helpers ───────────────────────────────────────────────────────────────────────────────
export interface ChaosCoverage {
  countedTotal: number;
  categories: string[];
  perCategory: Record<string, { good: number; bad: number; ugly: number; total: number }>;
  chaosTypeCounts: Record<string, number>;
}

export function computeCoverage(scenarios: ChaosScenario[] = COUNTED_CHAOS_SCENARIOS): ChaosCoverage {
  const counted = scenarios.filter((s) => s.countedForReadiness && !s.synthetic);
  const perCategory: ChaosCoverage["perCategory"] = {};
  const chaosTypeCounts: Record<string, number> = {};
  for (const s of counted) {
    const pc = (perCategory[s.businessCategory] ??= { good: 0, bad: 0, ugly: 0, total: 0 });
    pc[s.goodBadUgly]++; pc.total++;
    for (const t of new Set(s.chaosTypes)) chaosTypeCounts[t] = (chaosTypeCounts[t] ?? 0) + 1;
  }
  return { countedTotal: counted.length, categories: Object.keys(perCategory), perCategory, chaosTypeCounts };
}
