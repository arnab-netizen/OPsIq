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
    });

    return {
      allPassed: true,
      passedGates: gateResults.filter((g) => g.passed).map((g) => g.name),
      failedGates: [],
      gateResults,
    };
  }

  private checkDataSufficiency(diagnosticData: Record<string, unknown>): GateResult {
    // Verify diagnostic data has evidence and findings
    const hasFindingsEvidence = Array.isArray(diagnosticData.findings) &&
      diagnosticData.findings.length > 0;
    const hasRecommendationsEvidence = Array.isArray(diagnosticData.recommendations) &&
      diagnosticData.recommendations.length > 0;

    if (!hasFindingsEvidence && !hasRecommendationsEvidence) {
      return {
        name: "data_sufficient",
        passed: false,
        reason: "Insufficient diagnostic data: missing critical findings and recommendations",
        details: { requiresFindings: true, requiresRecommendations: true },
      };
    }

    return {
      name: "data_sufficient",
      passed: true,
      reason: "Sufficient evidence and findings present",
      details: { hasFindingsEvidence, hasRecommendationsEvidence },
    };
  }

  private checkContradictionFree(diagnosticData: Record<string, unknown>): GateResult {
    // Check for contradictions in findings vs evidence
    const findings = (diagnosticData.findings as Array<{ severity?: string; resolved?: boolean }>) || [];
    const kpiTrend = diagnosticData.kpiTrend as string;
    const healthStatus = diagnosticData.healthStatus as string;

    // Contradiction: Critical findings but improving health
    const hasCriticalFindings = findings.some((f) => f.severity === "critical" && !f.resolved);
    const isHealthyTrend = healthStatus === "healthy" || kpiTrend === "improving";

    if (hasCriticalFindings && isHealthyTrend) {
      return {
        name: "contradiction_free",
        passed: false,
        reason: "Evidence contradiction: unresolved critical findings contradict positive health indicators",
        details: { hasCriticalFindings, isHealthyTrend },
      };
    }

    return {
      name: "contradiction_free",
      passed: true,
      reason: "Evidence is internally consistent",
      details: { hasCriticalFindings, isHealthyTrend },
    };
  }

  private async checkCapacityAvailable(input: CapacityCheckInput): Promise<GateResult> {
    const { availableCapacity, requiredCapacity, bufferPercentage = 0 } = input;
    const bufferFraction = bufferPercentage / 100;
    const effectiveAvailable = availableCapacity * (1 - bufferFraction);

    if (requiredCapacity > effectiveAvailable) {
      return {
        name: "capacity_available",
        passed: false,
        reason: `Insufficient capacity: ${requiredCapacity} required, ${effectiveAvailable} available (with ${bufferPercentage}% buffer)`,
        details: {
          requiredCapacity,
          availableCapacity,
          effectiveAvailable,
          bufferPercentage,
          gap: requiredCapacity - effectiveAvailable,
        },
      };
    }

    return {
      name: "capacity_available",
      passed: true,
      reason: `Sufficient capacity available: ${effectiveAvailable - requiredCapacity} remaining`,
      details: { requiredCapacity, availableCapacity, effectiveAvailable, bufferPercentage },
    };
  }

  private async checkCashRunwaySafe(input: CashCheckInput): Promise<GateResult> {
    const { monthlyBurn, currentCash, minRunwayMonths = 3 } = input;

    let runway = Infinity;
    if (monthlyBurn > 0) {
      runway = currentCash / monthlyBurn;
    }

    if (runway < minRunwayMonths) {
      return {
        name: "cash_runway_safe",
        passed: false,
        reason: `Cash runway too short: ${runway.toFixed(1)} months available, ${minRunwayMonths} months required`,
        details: {
          runway,
          minRunwayMonths,
          currentCash,
          monthlyBurn,
          shortfall: minRunwayMonths - runway,
        },
      };
    }

    return {
      name: "cash_runway_safe",
      passed: true,
      reason: `Cash runway safe: ${runway.toFixed(1)} months available (>= ${minRunwayMonths} months required)`,
      details: { runway, minRunwayMonths, currentCash, monthlyBurn },
    };
  }

  private async checkLegalCompliance(input: ComplianceCheckInput): Promise<GateResult> {
    const { riskLevel, requiresApproval, approvalStatus } = input;

    // Critical risk blocks execution
    if (riskLevel === "critical") {
      return {
        name: "legal_compliance_ok",
        passed: false,
        reason: "Execution blocked: critical compliance risk identified",
        details: { riskLevel, blockedReason: "critical risk" },
      };
    }

    // Approval required but not approved blocks execution
    if (requiresApproval && approvalStatus !== "approved") {
      return {
        name: "legal_compliance_ok",
        passed: false,
        reason: `Approval required but status is '${approvalStatus || "pending"}'`,
        details: { requiresApproval, approvalStatus, blockedReason: "approval required" },
      };
    }

    return {
      name: "legal_compliance_ok",
      passed: true,
      reason: "Compliance constraints satisfied",
      details: { riskLevel: riskLevel || "not specified", approvalStatus: approvalStatus || "not required" },
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
