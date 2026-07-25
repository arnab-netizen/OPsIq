/**
 * Owner Strategy — Wealth Command Center composition (execution.md Phases 24–25).
 * Pure, deterministic, no I/O.
 *
 * COMPOSITION, not a new engine. It runs the already-built engines in one pass
 * and produces the owner's single decision view: wealth path + BMQ, risk-adjusted
 * score, opportunity cost, financial governor + cash-safety + capital allocation,
 * business-wisdom admission, the Next Best Move (do / choose-alternative /
 * validate-first / blocked), a Work Package where safe, the owner-workload
 * transfer score, the proof requirement, and the outcome-review state.
 */

import { classifyWealthPath } from "./wealth-path";
import { scoreRiskAdjustedWealth, reviewOpportunityCost } from "./risk-adjusted-wealth";
import { generateWorkPackage } from "./work-package";
import { admitAdvice } from "./business-wisdom";
import { validateStartup } from "./startup-mode";
import { lmh } from "./scales";
import { evaluateSpend } from "@/domain/owner-budget/spend-governance";
import { rankCapitalAllocation } from "@/domain/owner-budget/capital-allocation";
import { evaluateCashSafetyGate } from "@/domain/owner-finance/cash-safety-gate";
import type { WorkPackageInput, WorkPackageActionKind } from "./work-package.types";
import type { ActionKind, RiskAdjustedWealthInput } from "./risk-adjusted-wealth.types";
import type {
  WealthCommandCenterInput,
  WealthCommandCenter,
  ProposedAction,
  NextBestMove,
  OwnerWorkloadTransferScore,
} from "./command-center.types";

const BLOCKING_SPEND_DECISIONS = new Set(["HOLD", "BLOCK", "INVESTIGATE"]);

/** Map a risk-adjusted action kind to a Work Package artifact kind. */
const ACTION_KIND_TO_WP: Record<ActionKind, WorkPackageActionKind> = {
  preserve_cash: "generic",
  reduce_debt: "generic",
  fix_operations: "sop_creation",
  customer_retention: "customer_reactivation",
  sales_followup: "customer_reactivation",
  marketing: "marketing_campaign",
  staff_training: "staff_training",
  equipment_purchase: "generic",
  hiring: "generic",
  expansion: "generic",
  new_business: "generic",
  owner_skill_building: "generic",
  do_nothing: "generic",
  other: "generic",
};

function riskLevelFor(a: ProposedAction): "low" | "medium" | "high" | "critical" {
  const d = lmh(a.downsideRisk);
  if (d === "high") return "high";
  if (d === "low") return "low";
  return "medium";
}

function transferScore(before: number, after: number): OwnerWorkloadTransferScore {
  const saved = Math.max(0, before - after);
  const pct = before > 0 ? Math.round((saved / before) * 100) : 0;
  return { minutesBefore: before, minutesAfter: after, minutesSaved: saved, pctReduced: pct };
}

export function composeWealthCommandCenter(input: WealthCommandCenterInput): WealthCommandCenter {
  const mode = input.mode ?? "operating";
  const businessName = input.businessName ?? null;

  // ---- Startup mode -------------------------------------------------------
  if (mode === "startup") {
    const startupValidation = validateStartup(input.startupIntake ?? {}, input.startupIdeas ?? []);
    const rec = startupValidation.recommended;
    return {
      mode,
      businessName,
      wealthPath: null,
      businessModelQuality: null,
      riskAdjustedScore: null,
      opportunityCost: null,
      financialGovernor: null,
      capitalAllocation: null,
      cashSafety: null,
      wisdomAdmission: null,
      nextBestMove: {
        decision: "VALIDATE_FIRST",
        actionLabel: rec ? `Validate: ${rec.name}` : null,
        reason: rec
          ? `Validate "${rec.name}" before spending to launch — launch is not authorized from validation alone.`
          : "No idea passed validation screening — rework economics/capital before launching.",
      },
      workPackage: startupValidation.validationWorkPackage,
      ownerWorkloadTransfer: startupValidation.validationWorkPackage
        ? transferScore(
            startupValidation.validationWorkPackage.ownerWorkload.estimatedMinutesBefore,
            startupValidation.validationWorkPackage.ownerWorkload.estimatedMinutesAfter,
          )
        : null,
      proofRequirement: startupValidation.validationWorkPackage?.requiredProof ?? null,
      outcomeReviewState: "no_actions_yet",
      approvalsNeeded: startupValidation.validationWorkPackage?.ownerApprovalRequired
        ? [`Startup validation approval: ${startupValidation.validationWorkPackage.title}`]
        : [],
      exceptions: startupValidation.warnings.filter((w) => w.toLowerCase().includes("not authorized") || w.toLowerCase().includes("validate first")),
      proofFailed: [],
      actionsToIgnore: [],
      stopPivotScaleWarnings: [],
      startupValidation,
      provisional: true,
      warnings: startupValidation.warnings,
    };
  }

  // ---- Operating mode -----------------------------------------------------
  const warnings: string[] = [];
  const wealthPath = input.wealthPathInput ? classifyWealthPath(input.wealthPathInput) : null;
  const businessModelQuality = wealthPath ? { score: wealthPath.quality.score, tier: wealthPath.quality.tier } : null;

  const proposed = input.proposedAction ?? null;
  const opportunityCost = proposed ? reviewOpportunityCost({ proposed, alternatives: input.alternatives ?? [] }) : null;
  const riskAdjustedScore = opportunityCost
    ? opportunityCost.proposed.riskAdjustedScore
    : proposed
      ? scoreRiskAdjustedWealth(proposed).riskAdjustedScore
      : null;

  const financialGovernor = input.spend ? evaluateSpend(input.spend) : null;
  const capitalAllocation = input.capital ? rankCapitalAllocation(input.capital) : null;
  const cashSafety =
    input.cash && proposed?.riskSensitivity
      ? evaluateCashSafetyGate(input.cash.cashflowState, input.cash.survivalState, proposed.riskSensitivity)
      : null;
  const wisdomAdmission = input.wisdom ? admitAdvice(input.wisdom.item, input.wisdom.decisionDomain ?? null) : null;

  // ---- Next Best Move (compose the gates) --------------------------------
  const unsafe = !!proposed && (proposed.isSafe === false || proposed.isLegal === false || proposed.withinAuthority === false);
  const governorBlocks = !!financialGovernor && BLOCKING_SPEND_DECISIONS.has(financialGovernor.decision);
  const cashBlocks = !!cashSafety && !cashSafety.allowed;
  const wisdomBlocks = !!wisdomAdmission && wisdomAdmission.decision === "BLOCK";
  const hardBlocked = unsafe || governorBlocks || cashBlocks || wisdomBlocks;

  let nextBestMove: NextBestMove;
  let workPackage: WealthCommandCenter["workPackage"] = null;

  if (!proposed) {
    nextBestMove = { decision: "VALIDATE_FIRST", actionLabel: null, reason: "No candidate action supplied — gather options and re-run." };
  } else if (hardBlocked) {
    const why = unsafe
      ? "unsafe/illegal/outside authority"
      : cashBlocks
        ? `cash-safety gate (${cashSafety!.effectiveState})`
        : governorBlocks
          ? `financial governor (${financialGovernor!.decision})`
          : "business-wisdom gate (unverified/guru advice for a high-risk decision)";
    nextBestMove = { decision: "BLOCKED", actionLabel: proposed.label, reason: `"${proposed.label}" blocked by ${why}.` };
    workPackage = generateWorkPackage(toWorkPackageInput(proposed, businessName, "BLOCKED"));
  } else if (opportunityCost && opportunityCost.betterAlternativeExists) {
    nextBestMove = {
      decision: "CHOOSE_ALTERNATIVE",
      actionLabel: opportunityCost.recommendedLabel,
      reason: `A higher-value option exists: "${opportunityCost.recommendedLabel}". OpsIQ prepares that instead of "${proposed.label}".`,
    };
    // Prepare the recommended alternative's work — do not leave the owner with only a suggestion.
    const rec = [proposed as RiskAdjustedWealthInput, ...(input.alternatives ?? [])].find((c) => c.label === opportunityCost.recommendedLabel);
    if (rec && rec.label === proposed.label) {
      workPackage = generateWorkPackage(toWorkPackageInput(proposed, businessName, proposed.financialDecision ?? "APPROVED"));
    } else if (rec) {
      workPackage = generateWorkPackage(altToWorkPackageInput(rec, businessName));
    }
  } else if (wealthPath?.blocksHighRiskExecution && (riskLevelFor(proposed) === "high" || proposed.kind === "expansion")) {
    nextBestMove = {
      decision: "VALIDATE_FIRST",
      actionLabel: proposed.label,
      reason: `Wealth-path verdict (${wealthPath.label}) blocks high-risk execution — validate/stabilize before committing to "${proposed.label}".`,
    };
    workPackage = generateWorkPackage(toWorkPackageInput(proposed, businessName, proposed.financialDecision ?? "NEEDS_MORE_DATA"));
  } else {
    nextBestMove = { decision: "DO_THIS", actionLabel: proposed.label, reason: `"${proposed.label}" is the highest risk-adjusted, safe, affordable move.` };
    workPackage = generateWorkPackage(toWorkPackageInput(proposed, businessName, proposed.financialDecision ?? "APPROVED"));
  }

  if (financialGovernor?.requiresOwnerApproval) warnings.push("Financial governor requires owner approval before this spend.");
  if (wisdomAdmission?.decision === "DOWNGRADE") warnings.push("Supporting advice downgraded to advisory (low source tier / guru red flags).");
  if (wealthPath?.provisionalLowConfidence) warnings.push("Wealth-path verdict is provisional — structural data is thin.");

  const ownerWorkloadTransfer = workPackage
    ? transferScore(workPackage.ownerWorkload.estimatedMinutesBefore, workPackage.ownerWorkload.estimatedMinutesAfter)
    : null;

  const outcomeReviewState: WealthCommandCenter["outcomeReviewState"] = !input.outcomeReview
    ? "no_actions_yet"
    : input.outcomeReview.pendingCount > 0
      ? "pending_review"
      : "all_reviewed";

  // ---- Phase 25 — Owner Daily Command Center decision surface ----------------
  const approvalsNeeded: string[] = [];
  if (financialGovernor?.requiresOwnerApproval) approvalsNeeded.push(`Financial approval needed: ${proposed?.label ?? "spend"}`);
  if (workPackage?.ownerApprovalRequired) approvalsNeeded.push(`Work Package approval required: ${workPackage.title}`);

  const exceptions: string[] = [];
  if (unsafe) exceptions.push(`Unsafe/illegal/outside-authority action flagged: "${proposed?.label}"`);
  if (wisdomAdmission?.decision === "BLOCK") exceptions.push("Business-wisdom gate blocked: unverified high-risk advice.");
  if (cashSafety && !cashSafety.allowed) exceptions.push(`Cash-safety exception: action blocked (${cashSafety.effectiveState}).`);

  const actionsToIgnore: string[] = [];
  if (opportunityCost?.betterAlternativeExists && proposed?.label && nextBestMove.decision === "CHOOSE_ALTERNATIVE") {
    actionsToIgnore.push(proposed.label);
  }

  const stopPivotScaleWarnings: string[] = [];
  if (wealthPath?.pathType === "trap_business") {
    stopPivotScaleWarnings.push("STOP: business model is a wealth trap — stop investing and consider pivot or exit.");
  }
  if (wealthPath?.strategicOptions?.includes("exit")) stopPivotScaleWarnings.push("EXIT may be the highest-value option.");
  if (wealthPath?.strategicOptions?.includes("pivot")) stopPivotScaleWarnings.push("PIVOT to a higher-margin model recommended.");
  if (wealthPath && ["multi_unit_scalable_business", "asset_light_scalable_service", "technology_product_business"].includes(wealthPath.pathType)
      && (businessModelQuality?.tier === "strong" || businessModelQuality?.tier === "exceptional")) {
    stopPivotScaleWarnings.push("SCALE: business model is ready for expansion — seize the window.");
  }

  return {
    mode,
    businessName,
    wealthPath,
    businessModelQuality,
    riskAdjustedScore,
    opportunityCost,
    financialGovernor,
    capitalAllocation,
    cashSafety,
    wisdomAdmission,
    nextBestMove,
    workPackage,
    ownerWorkloadTransfer,
    proofRequirement: workPackage?.requiredProof ?? null,
    outcomeReviewState,
    approvalsNeeded,
    exceptions,
    proofFailed: [],
    actionsToIgnore,
    stopPivotScaleWarnings,
    startupValidation: null,
    provisional: wealthPath?.provisionalLowConfidence ?? false,
    warnings,
  };
}

/** Prepare a Work Package for a recommended ALTERNATIVE (a bare risk-adjusted input). */
function altToWorkPackageInput(alt: RiskAdjustedWealthInput, businessName: string | null): WorkPackageInput {
  const dr = lmh(alt.downsideRisk);
  const risk = dr === "high" ? "high" : dr === "low" ? "low" : "medium";
  return {
    title: alt.label,
    problem: `Prepare the higher-value action: ${alt.label}`,
    actionKind: ACTION_KIND_TO_WP[alt.kind ?? "other"],
    riskLevel: risk,
    assigneeRole: "owner",
    financialDecision: "APPROVED",
    isSafe: true,
    businessName,
  };
}

function toWorkPackageInput(
  a: ProposedAction,
  businessName: string | null,
  financialDecision: WorkPackageInput["financialDecision"],
): WorkPackageInput {
  return {
    title: a.label,
    problem: a.problem ?? `Address: ${a.label}`,
    actionKind: a.workPackageKind,
    riskLevel: riskLevelFor(a),
    assigneeRole: a.assigneeRole ?? "owner",
    financialDecision,
    isSafe: a.isSafe ?? true,
    isLegal: a.isLegal ?? true,
    withinAuthority: a.withinAuthority ?? true,
    businessName,
  };
}
