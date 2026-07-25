/**
 * Owner Strategy — Wealth Command Center composition types (execution.md Phases
 * 24–25: cross-domain command-and-control + owner daily command center).
 *
 * This is a COMPOSITION surface, not a new engine: it folds the already-built
 * wealth-path, business-model-quality, risk-adjusted, opportunity-cost,
 * financial-governor, capital-allocation, cash-safety, business-wisdom,
 * work-package and startup engines into one owner-facing decision payload.
 */
import type { WealthPathInput, WealthPathResult } from "./wealth-path.types";
import type { RiskAdjustedWealthInput, OpportunityCostResult } from "./risk-adjusted-wealth.types";
import type { KnowledgeItem, HighRiskDomain, AdviceAdmission } from "./business-wisdom.types";
import type { WorkPackage, WorkPackageActionKind, AssigneeRole, FinancialDecision } from "./work-package.types";
import type { StartupIntake, StartupIdea, StartupValidationResult } from "./startup-mode.types";
import type { SpendGovernanceInput, SpendGovernanceResult, CapitalAllocationResult } from "@/domain/owner-budget/types";
import type { CapitalAllocationInput } from "@/domain/owner-budget/capital-allocation";
import type { FinancialHealthState, CashSafetyGateResult } from "@/domain/owner-finance/cash-safety-gate";
import type { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";

/** How the proposed action maps to execution + safety inputs. */
export interface ProposedAction extends RiskAdjustedWealthInput {
  workPackageKind: WorkPackageActionKind;
  assigneeRole?: AssigneeRole | null;
  financialDecision?: FinancialDecision | null;
  isSafe?: boolean | null;
  isLegal?: boolean | null;
  withinAuthority?: boolean | null;
  riskSensitivity?: RecommendationSensitivity | null; // for the cash-safety gate
  problem?: string | null;
}

export interface WealthCommandCenterInput {
  businessName?: string | null;
  mode?: "operating" | "startup";

  // Operating mode
  wealthPathInput?: WealthPathInput | null;
  proposedAction?: ProposedAction | null;
  alternatives?: RiskAdjustedWealthInput[] | null;
  spend?: SpendGovernanceInput | null;
  capital?: CapitalAllocationInput | null;
  cash?: { cashflowState: FinancialHealthState; survivalState: FinancialHealthState } | null;
  wisdom?: { item: KnowledgeItem; decisionDomain?: HighRiskDomain | null } | null;
  outcomeReview?: { pendingCount: number; reviewedCount: number } | null;

  // Startup mode
  startupIntake?: StartupIntake | null;
  startupIdeas?: StartupIdea[] | null;
}

export type NextMoveDecision = "DO_THIS" | "CHOOSE_ALTERNATIVE" | "VALIDATE_FIRST" | "BLOCKED";

export interface NextBestMove {
  decision: NextMoveDecision;
  actionLabel: string | null;
  reason: string;
}

export interface OwnerWorkloadTransferScore {
  minutesBefore: number;
  minutesAfter: number;
  minutesSaved: number;
  pctReduced: number;
}

export interface WealthCommandCenter {
  mode: "operating" | "startup";
  businessName: string | null;

  wealthPath: WealthPathResult | null;
  businessModelQuality: { score: number; tier: string } | null;
  riskAdjustedScore: number | null;
  opportunityCost: OpportunityCostResult | null;

  financialGovernor: SpendGovernanceResult | null;
  capitalAllocation: CapitalAllocationResult | null;
  cashSafety: CashSafetyGateResult | null;
  wisdomAdmission: AdviceAdmission | null;

  nextBestMove: NextBestMove;
  workPackage: WorkPackage | null;
  ownerWorkloadTransfer: OwnerWorkloadTransferScore | null;
  proofRequirement: string | null;
  outcomeReviewState: "no_actions_yet" | "pending_review" | "all_reviewed";

  // Phase 25 — Owner Daily Command Center decision surface
  approvalsNeeded: string[];       // approvals the owner must act on now
  exceptions: string[];            // deviations/unsafe conditions flagged for owner
  proofFailed: string[];           // proof failures the owner must address
  actionsToIgnore: string[];       // actions deprioritised by the engine
  stopPivotScaleWarnings: string[]; // stop/pivot/scale strategic signals

  startupValidation: StartupValidationResult | null;

  provisional: boolean;
  warnings: string[];
}
