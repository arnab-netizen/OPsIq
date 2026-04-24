import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import { ValidationError } from "@/infra/errors";
import {
  BusinessAssessment,
  EngineResult,
  OrchestratedDiagnosis,
} from "@/engines/contracts";
import { DataValidationEngine } from "@/engines/DataValidationEngine";
import { FinancialEngine } from "@/engines/FinancialEngine";
import { DiagnosisOrchestrator } from "@/engines/DiagnosisOrchestrator";
import type { DiagnosticInterventionPhase } from "@/domain/constants/diagnostic-phases";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DiagnosisRequest {
  businessName: string;
  businessType: string;
  problemStatement: string;
  mainIssue: string;
  monthlyRevenue?: number;
  monthlyCosts?: number;
  customerCount?: number;
}

export interface DiagnosisResult {
  severity: "low" | "medium" | "high" | "critical";
  primaryProblemCategory: string;
  diagnosticInterventionPhase: DiagnosticInterventionPhase;
  confidence: number;
  dataWarnings: string[];
  findings: string[];
  recommendations: string[];
  actionPlan: string[];
  executiveBrief: string;
  engineMetadata: {
    orchestratedDiagnosis: OrchestratedDiagnosis;
    enginesUsed: string[];
    diagnosticSources: EngineResult[];
  };
}

// ─── Engine Initialization ──────────────────────────────────────────────────

const engines = [new DataValidationEngine(), new FinancialEngine()];
const orchestrator = new DiagnosisOrchestrator(engines);

// ─── Service ───────────────────────────────────────────────────────────────

export async function performDiagnosis(
  request: DiagnosisRequest,
  actorId: string
): Promise<DiagnosisResult> {
  // Validate input
  if (!request.businessName || !request.businessType || !request.mainIssue) {
    throw new ValidationError(
      "businessName, businessType, and mainIssue are required"
    );
  }

  // Build assessment object
  const assessment: BusinessAssessment = {
    businessName: request.businessName,
    businessType: request.businessType,
    problemStatement: request.problemStatement || "",
    mainIssue: request.mainIssue,
    monthlyRevenue: request.monthlyRevenue,
    monthlyCosts: request.monthlyCosts,
    customerCount: request.customerCount,
  };

  logger.info("Starting diagnosis", {
    businessName: request.businessName,
    businessType: request.businessType,
    mainIssue: request.mainIssue,
  });

  // Run orchestrated diagnosis
  const orchestratedDiagnosis = await orchestrator.orchestrate(assessment);

  // Extract and structure findings from all engines
  const findings = orchestratedDiagnosis.signals
    .filter((s) => s.message && s.confidence >= 0.6)
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
    .map((s) => s.message);

  // Generate recommendations based on severity and category
  const recommendations = generateRecommendations(
    orchestratedDiagnosis.severity,
    orchestratedDiagnosis.category,
    orchestratedDiagnosis.signals
  );

  // Create action plan from high-confidence signals
  const actionPlan = createActionPlan(
    orchestratedDiagnosis.severity,
    orchestratedDiagnosis.signals
  );

  // Generate executive brief
  const executiveBrief = generateExecutiveBrief(
    request.businessName,
    orchestratedDiagnosis.severity,
    orchestratedDiagnosis.category,
    findings,
    orchestratedDiagnosis.diagnosticConfidence
  );

  const result: DiagnosisResult = {
    severity: orchestratedDiagnosis.severity,
    primaryProblemCategory: orchestratedDiagnosis.category,
    diagnosticInterventionPhase: orchestratedDiagnosis.recommendedDiagnosticPhase,
    confidence: orchestratedDiagnosis.diagnosticConfidence,
    dataWarnings: orchestratedDiagnosis.issues,
    findings,
    recommendations,
    actionPlan,
    executiveBrief,
    engineMetadata: {
      orchestratedDiagnosis,
      enginesUsed: orchestratedDiagnosis.allEngineResults.map((r) => r.engine),
      diagnosticSources: orchestratedDiagnosis.allEngineResults,
    },
  };

  // Emit audit event for diagnosis
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.DIAGNOSIS_COMPLETED,
    actorId,
    entityType: "diagnosis",
    entityId: `${request.businessName}-${Date.now()}`,
    payload: {
      businessName: request.businessName,
      businessType: request.businessType,
      severity: result.severity,
      category: result.primaryProblemCategory,
      diagnosticInterventionPhase: result.diagnosticInterventionPhase,
      confidence: result.confidence,
      enginesUsed: result.engineMetadata.enginesUsed,
    },
    visibility: "internal",
  });

  logger.info("Diagnosis completed", {
    businessName: request.businessName,
    severity: result.severity,
    category: result.primaryProblemCategory,
    confidence: result.confidence,
  });

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateRecommendations(
  severity: string,
  category: string,
  signals: any[]
): string[] {
  const recommendations: string[] = [];

  // Severity-based recommendations
  if (severity === "critical") {
    recommendations.push(
      "Immediate intervention required — business continuity at risk"
    );
    recommendations.push("Escalate to executive leadership immediately");
  } else if (severity === "high") {
    recommendations.push("Urgent remediation needed within 1-2 weeks");
    recommendations.push("Allocate resources for rapid stabilization");
  } else if (severity === "medium") {
    recommendations.push(
      "Plan remediation within 2-4 weeks as part of recovery roadmap"
    );
  } else {
    recommendations.push("Monitor and review during next planning cycle");
  }

  // Category-specific recommendations
  if (category === "cost_control") {
    recommendations.push(
      "Conduct immediate cost structure review — identify fixed vs. variable expenses"
    );
    recommendations.push(
      "Implement cost reduction initiatives aligned with revenue capacity"
    );
  } else if (category === "revenue_generation") {
    recommendations.push("Develop and execute rapid revenue growth strategy");
    recommendations.push(
      "Review pricing model, sales capacity, and market positioning"
    );
  } else if (category === "customer_retention") {
    recommendations.push(
      "Launch customer health assessment and retention program"
    );
    recommendations.push("Improve customer support and product-market fit");
  } else if (category === "cash_flow_stability") {
    recommendations.push(
      "Implement cash flow forecasting and working capital optimization"
    );
    recommendations.push(
      "Establish weekly cash position reporting and contingency planning"
    );
  }

  return recommendations;
}

function createActionPlan(severity: string, signals: any[]): string[] {
  const plan: string[] = [];

  // Critical signals drive immediate actions
  const criticalSignals = signals.filter((s) => s.severity === "critical");
  if (criticalSignals.length > 0) {
    plan.push(
      "IMMEDIATE (Today): Assemble crisis management team and assess runway"
    );
    criticalSignals.forEach((s) => {
      plan.push(`  → Address: ${s.message}`);
    });
  }

  // High signals drive urgent actions
  const highSignals = signals.filter((s) => s.severity === "high");
  if (highSignals.length > 0) {
    plan.push("URGENT (This Week): Execute stabilization measures");
    highSignals.forEach((s) => {
      plan.push(`  → Action: ${s.message}`);
    });
  }

  // Medium signals drive recovery planning
  const mediumSignals = signals.filter((s) => s.severity === "medium");
  if (mediumSignals.length > 0) {
    plan.push("RECOVERY (Next 2-4 Weeks): Plan sustainable improvements");
    mediumSignals.forEach((s) => {
      plan.push(`  → Improvement: ${s.message}`);
    });
  }

  if (plan.length === 0) {
    plan.push("MONITOR: Continue current course with regular reviews");
  }

  return plan;
}

function generateExecutiveBrief(
  businessName: string,
  severity: string,
  category: string,
  findings: string[],
  confidence: number
): string {
  const severityLabel = severity.toUpperCase();
  const topFinding = findings[0] || "Business assessment complete";

  return `${businessName} diagnostic assessment identifies ${severityLabel} condition in ${category}. Primary finding: ${topFinding}. Assessment confidence: ${(confidence * 100).toFixed(0)}%. Recommend ${getSeverityAction(severity)} action.`;
}

function getSeverityAction(severity: string): string {
  switch (severity) {
    case "critical":
      return "immediate executive";
    case "high":
      return "urgent";
    case "medium":
      return "planned";
    default:
      return "routine";
  }
}
