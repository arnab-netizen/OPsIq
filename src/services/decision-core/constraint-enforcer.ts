import { logger } from "@/infra/logger";
import {
  GateResult,
  ConstraintCheckResult,
  GateName,
  CapacityCheckInput,
  CashCheckInput,
  ComplianceCheckInput,
} from "@/domain/decision/constraint";

export class ConstraintEnforcer {
  async enforceAllGates(
    diagnosticData: Record<string, unknown>,
    capacityInput: CapacityCheckInput,
    cashInput: CashCheckInput,
    complianceInput: ComplianceCheckInput
  ): Promise<ConstraintCheckResult> {
    const gateResults: GateResult[] = [];

    // Gate 1: Data Sufficiency
    const dataSufficient = this.checkDataSufficiency(diagnosticData);
    gateResults.push(dataSufficient);
    if (!dataSufficient.passed) {
      return this.buildFailedResult(gateResults, "data_sufficient");
    }

    // Gate 2: Contradiction-Free
    const contradictionFree = this.checkContradictionFree(diagnosticData);
    gateResults.push(contradictionFree);
    if (!contradictionFree.passed) {
      return this.buildFailedResult(gateResults, "contradiction_free");
    }

    // Gate 3: Capacity Available
    const capacityAvailable = await this.checkCapacityAvailable(capacityInput);
    gateResults.push(capacityAvailable);
    if (!capacityAvailable.passed) {
      return this.buildFailedResult(gateResults, "capacity_available");
    }

    // Gate 4: Cash Runway Safe
    const cashRunwaySafe = await this.checkCashRunwaySafe(cashInput);
    gateResults.push(cashRunwaySafe);
    if (!cashRunwaySafe.passed) {
      return this.buildFailedResult(gateResults, "cash_runway_safe");
    }

    // Gate 5: Legal/Compliance OK
    const complianceOk = await this.checkLegalCompliance(complianceInput);
    gateResults.push(complianceOk);
    if (!complianceOk.passed) {
      return this.buildFailedResult(gateResults, "legal_compliance_ok");
    }

    // All gates passed
    logger.info("All constraint gates passed", {
      gateCount: gateResults.length,
      engagementId: capacityInput.engagement_id,
    });

    return {
      allPassed: true,
      passedGates: gateResults.filter((g) => g.passed).map((g) => g.name),
      failedGates: [],
      gateResults,
    };
  }

  private checkDataSufficiency(diagnosticData: Record<string, unknown>): GateResult {
    const required = [
      "rootCauseIdentified",
      "primaryBottleneck",
      "archetype",
      "maturityLevel",
    ];
    const missing = required.filter((field) => !diagnosticData[field]);

    if (missing.length > 0) {
      return {
        name: "data_sufficient",
        passed: false,
        reason: `Missing required diagnostic fields: ${missing.join(", ")}`,
        details: { missingFields: missing },
      };
    }

    return {
      name: "data_sufficient",
      passed: true,
      reason: "All required diagnostic fields present",
    };
  }

  private checkContradictionFree(diagnosticData: Record<string, unknown>): GateResult {
    // Check for contradictions in diagnostic outputs
    const rootCauseConfidence = (diagnosticData.rootCauseConfidence as number) || 0;
    const bottleneckConfidence = (diagnosticData.bottleneckConfidence as number) || 0;
    const archetypeConfidence = (diagnosticData.archetypeConfidence as number) || 0;
    const maturityConfidence = (diagnosticData.maturityConfidence as number) || 0;

    const avgConfidence =
      (rootCauseConfidence + bottleneckConfidence + archetypeConfidence + maturityConfidence) / 4;

    // Contradiction: Very low average confidence suggests conflicting data
    if (avgConfidence < 0.3) {
      return {
        name: "contradiction_free",
        passed: false,
        reason: "Diagnostic outputs show low overall confidence, possible contradictions",
        details: { avgConfidence, threshold: 0.3 },
      };
    }

    // Check for conflicting strategy constraints
    const allowedStrategies = (diagnosticData.allowedStrategies as string[]) || [];
    const forbiddenStrategies = (diagnosticData.forbiddenStrategies as string[]) || [];
    const conflicts = allowedStrategies.filter((s) => forbiddenStrategies.includes(s));

    if (conflicts.length > 0) {
      return {
        name: "contradiction_free",
        passed: false,
        reason: `Strategy contradictions detected: ${conflicts.join(", ")} both allowed and forbidden`,
        details: { conflicts },
      };
    }

    return {
      name: "contradiction_free",
      passed: true,
      reason: "No contradictions detected in diagnostic outputs",
    };
  }

  private async checkCapacityAvailable(input: CapacityCheckInput): Promise<GateResult> {
    // Check if effort_hours exceed available_hours
    const availableHours = input.available_hours || 168; // Default: 1 week of hours
    const effortHours = input.effort_hours;

    if (effortHours > availableHours) {
      return {
        name: "capacity_available",
        passed: false,
        reason: `Insufficient team capacity: ${effortHours} hours required, ${availableHours} hours available`,
        details: {
          effortHours,
          availableHours,
          shortage: effortHours - availableHours,
        },
      };
    }

    return {
      name: "capacity_available",
      passed: true,
      reason: `Sufficient capacity: ${availableHours - effortHours} hours remaining`,
      details: { effortHours, availableHours },
    };
  }

  private async checkCashRunwaySafe(input: CashCheckInput): Promise<GateResult> {
    // Conservative check: payback period should be reasonable
    const maxPaybackDays = 180; // 6 months

    if (input.payback_days > maxPaybackDays) {
      return {
        name: "cash_runway_safe",
        passed: false,
        reason: `Payback period too long: ${input.payback_days} days exceeds safe threshold of ${maxPaybackDays} days`,
        details: {
          paybackDays: input.payback_days,
          threshold: maxPaybackDays,
        },
      };
    }

    // Check capital requirement is not negative (error state)
    if (input.capital_required < 0) {
      return {
        name: "cash_runway_safe",
        passed: false,
        reason: "Capital requirement invalid (negative value)",
        details: { capitalRequired: input.capital_required },
      };
    }

    return {
      name: "cash_runway_safe",
      passed: true,
      reason: `Cash runway safe: payback in ${input.payback_days} days (< ${maxPaybackDays} day threshold)`,
      details: { paybackDays: input.payback_days, threshold: maxPaybackDays },
    };
  }

  private async checkLegalCompliance(input: ComplianceCheckInput): Promise<GateResult> {
    // Blocked strategy types check
    const blockedStrategies = ["high_risk_pivot", "aggressive_downsizing"];

    if (input.strategy_type && blockedStrategies.includes(input.strategy_type)) {
      return {
        name: "legal_compliance_ok",
        passed: false,
        reason: `Strategy type '${input.strategy_type}' is blocked by compliance policy`,
        details: { strategyType: input.strategy_type, blockedStrategies },
      };
    }

    return {
      name: "legal_compliance_ok",
      passed: true,
      reason: "Compliance check passed",
      details: { strategyType: input.strategy_type || "not specified" },
    };
  }

  private buildFailedResult(
    gateResults: GateResult[],
    firstFailure: GateName
  ): ConstraintCheckResult {
    const passedGates = gateResults
      .filter((g) => g.passed)
      .map((g) => g.name);
    const failedGates = gateResults
      .filter((g) => !g.passed)
      .map((g) => g.name);

    logger.warn("Constraint gate failed", {
      firstFailure,
      passedGates,
      failedGates,
    });

    return {
      allPassed: false,
      passedGates,
      failedGates,
      gateResults,
      firstFailure,
    };
  }
}

export const constraintEnforcer = new ConstraintEnforcer();
