/**
 * EXHAUSTIVE CHAOS PROOF LEDGER — the single, authoritative list of the 180 counted real-world chaos
 * scenarios (165 source-backed corpus + 15 independent-gold), with the locked expectation per scenario and
 * a per-layer proof-status slot. Every exhaustive proof layer (arbitrate / owner runtime / DB-backed /
 * supervisor summary / jsdom dashboard / Playwright desktop / Playwright mobile / source-privacy /
 * business-scope) iterates THIS ledger — no layer may invent an untracked scenario or count a skip as a pass.
 *
 * Pure module: no DB, no Date.now, no AI. The committed JSON (OPSIQ_EXHAUSTIVE_CHAOS_REPLAY_LEDGER.json) is
 * generated from `buildChaosLedger()` by scripts/gen-chaos-ledger.ts and integrity-tested.
 */
import { COUNTED_CHAOS_SCENARIOS } from "./chaos-corpus";
import { INDEPENDENT_GOLD_CASES } from "./independent-gold";
import type { Constraint } from "../whole-business/arbitration";

export type LayerStatus = "pass" | "fail" | "skipped" | "not_run";
export type DbActionStatus = "blocked" | "need_more_data" | "owner_decision_required" | "cautious_proceed" | "proceed";

/** How to seed a scenario into the DB to reach its locked dominant + the intended action status. */
export interface ScenarioSeedPlan {
  /** Force this dominant constraint via the knob template. */
  dominant: Constraint;
  /** good→fragile opportunity, bad→correctable, ugly→serious risk. */
  goodBadUgly: "good" | "bad" | "ugly";
  /** When set, grant an `owner.safe-action-approved` SOP at this risk class (low→proceed, medium→cautious). */
  sopRiskClass?: "low" | "medium";
  /** When true, strip critical finance/cash rows after seeding ⇒ need_more_data (proves missing-data gate). */
  stripCriticalData?: boolean;
}

export interface ChaosLedgerEntry {
  scenarioId: string;
  category: string;
  goodBadUgly: "good" | "bad" | "ugly";
  sourceRefs: string[];
  independentGold: boolean;
  expectedDominantConstraint: Constraint;
  /** Disposition the supervisor SHOULD reach under the DB-backed path (real provider data + PR #63 policy). */
  expectedActionStatus: DbActionStatus;
  expectedModules: string[];
  expectedDoNotDo: string;
  expectedProofReassessment: string[];
  /** Which of profit/cash/workload the case materially touches (impact dimensions expected non-empty). */
  expectedProfitCashWorkload: string[];
  expectedDashboardFields: string[];
  /** Deterministic seed plan used by the DB + browser harnesses. */
  seed: ScenarioSeedPlan;
  // Per-layer proof status (defaults not_run; filled by run-result artifacts, never hand-set to pass).
  arbitrateStatus: LayerStatus;
  ownerRuntimeStatus: LayerStatus;
  dbBackedStatus: LayerStatus;
  supervisorSummaryStatus: LayerStatus;
  jsdomStatus: LayerStatus;
  playwrightDesktopStatus: LayerStatus;
  playwrightMobileStatus: LayerStatus;
  sourcePrivacyStatus: LayerStatus;
  businessScopeStatus: LayerStatus;
  finalScenarioStatus: LayerStatus;
  failureReason: string | null;
  evidenceArtifactRef: string | null;
}

const BLOCKED_DOMINANTS = new Set<Constraint>(["compliance_block", "proof_fraud_block"]);

/**
 * The genuine DB disposition for a COUNTED chaos scenario. The chaos corpus is adversarial by construction
 * (bad / ugly / good-fragile real-world cases) — NONE of its locked dominants is a low-risk, routine,
 * SOP-approved action, so NO counted scenario may ever `proceed` / `cautious_proceed`. That is the safety
 * property, not a gap: a compliance/proof boundary blocks; every other binding constraint routes to an owner
 * decision. The proceed / cautious_proceed / need_more_data statuses are exercised separately by the
 * dedicated PR #63 safe-action scenarios (re-run alongside the all-180 DB lane), never by a chaos case.
 */
function dbActionStatusFor(dominant: Constraint): { status: DbActionStatus; seedExtra: Partial<ScenarioSeedPlan> } {
  if (BLOCKED_DOMINANTS.has(dominant)) return { status: "blocked", seedExtra: {} };
  return { status: "owner_decision_required", seedExtra: {} };
}

/** Which impact dimensions a dominant constraint materially touches (for the dashboard impact assertion). */
function profitCashWorkloadFor(dominant: Constraint): string[] {
  switch (dominant) {
    case "cash_survival": return ["cash"];
    case "below_margin": return ["profit"];
    case "capacity_feasibility": return ["workload"];
    case "owner_workload": return ["workload"];
    case "customer_quality": return ["profit"];
    case "profitable_growth": return ["profit", "cash"];
    default: return ["profit"];
  }
}

const DASHBOARD_FIELDS = ["mainIssue", "actionStatus", "doNow", "doNotDo", "ownerDecisionRequired", "proofNeeded", "impact", "reassessment", "confidence"];

function freshLayers() {
  return {
    arbitrateStatus: "not_run" as LayerStatus, ownerRuntimeStatus: "not_run" as LayerStatus,
    dbBackedStatus: "not_run" as LayerStatus, supervisorSummaryStatus: "not_run" as LayerStatus,
    jsdomStatus: "not_run" as LayerStatus, playwrightDesktopStatus: "not_run" as LayerStatus,
    playwrightMobileStatus: "not_run" as LayerStatus, sourcePrivacyStatus: "not_run" as LayerStatus,
    businessScopeStatus: "not_run" as LayerStatus, finalScenarioStatus: "not_run" as LayerStatus,
    failureReason: null, evidenceArtifactRef: null,
  };
}

/** Build the authoritative 180-row ledger (165 corpus + 15 gold). Deterministic; order is stable. */
export function buildChaosLedger(): ChaosLedgerEntry[] {
  const out: ChaosLedgerEntry[] = [];

  for (const s of COUNTED_CHAOS_SCENARIOS) {
    const { status, seedExtra } = dbActionStatusFor(s.expectedDominantConstraint);
    out.push({
      scenarioId: s.scenarioId,
      category: s.businessCategory,
      goodBadUgly: s.goodBadUgly,
      sourceRefs: s.sourceRefs,
      independentGold: false,
      expectedDominantConstraint: s.expectedDominantConstraint,
      expectedActionStatus: status,
      expectedModules: s.expectedModules,
      expectedDoNotDo: s.expectedRejectedTemptingAction,
      expectedProofReassessment: s.expectedProofReassessment,
      expectedProfitCashWorkload: profitCashWorkloadFor(s.expectedDominantConstraint),
      expectedDashboardFields: s.expectedDashboardFields,
      seed: { dominant: s.expectedDominantConstraint, goodBadUgly: s.goodBadUgly, ...seedExtra },
      ...freshLayers(),
    });
  }

  for (const g of INDEPENDENT_GOLD_CASES) {
    out.push({
      scenarioId: g.id,
      category: g.businessCategory,
      goodBadUgly: g.goodBadUgly,
      sourceRefs: [g.sourceRef],
      independentGold: true,
      expectedDominantConstraint: g.expected.dominantConstraint,
      expectedActionStatus: g.expected.dbActionStatus,
      expectedModules: g.expected.modules,
      expectedDoNotDo: g.expected.doNotDo,
      expectedProofReassessment: [g.expected.safeNextAction],
      expectedProfitCashWorkload: profitCashWorkloadFor(g.expected.dominantConstraint),
      expectedDashboardFields: DASHBOARD_FIELDS,
      seed: { dominant: g.expected.dominantConstraint, goodBadUgly: g.goodBadUgly },
      ...freshLayers(),
    });
  }

  return out;
}

/** Convenience: the locked count and id set, used by integrity tests + every layer. */
export const CHAOS_LEDGER: ChaosLedgerEntry[] = buildChaosLedger();
export const EXPECTED_LEDGER_COUNT = 180;
