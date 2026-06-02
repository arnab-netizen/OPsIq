import { db } from "@/lib/db";
import type { CanonicalAuthContext, ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { hasInternalAccess } from "@/policies/capability-check";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { assessCondition } from "@/services/business-condition";
import { logger } from "@/infra/logger";
import { randomUUID } from "crypto";
import type { InterventionPhase } from "@/domain/constants/statuses";
import { DataValidationEngine } from "@/engines/DataValidationEngine";
import { FinancialEngine } from "@/engines/FinancialEngine";
import { DiagnosisOrchestrator } from "@/engines/DiagnosisOrchestrator";
import type { BusinessAssessment, OrchestratedDiagnosis } from "@/engines/contracts";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";
import { generatePersonalizedRecommendations } from "@/services/recommendation/engine";

// ─── Types ─────────────────────────────────────────────────────────────────

interface DiagnosisTransactionResult {
  createdEvidenceItems: Array<{ id: string }>;
  createdFindings: Array<{ id: string }>;
  createdRecommendations: Array<{ id: string }>;
  createdActions: Array<{ id: string }>;
}

export interface BusinessProblemInput {
  businessName: string;
  businessType: string;
  problemStatement: string;
  mainIssue: "low_sales" | "high_costs" | "cash_flow" | "customer_retention" | "operations" | "unclear";
  monthlyRevenue?: number;
  monthlyCosts?: number;
  customerCount?: number;
}

export interface ActionPlanItem {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  ownerRole: string;
  dueInDays: number;
  successMetric: string;
  urgency?: "immediate" | "next";
}

export interface ExecutiveBrief {
  title: string;
  summary: string;
  warnings: string[];
}

export interface DiagnosisResult {
  id: string;
  input: BusinessProblemInput;
  diagnosisSummary: string;
  primaryProblemCategory: string;
  severity: "low" | "medium" | "high" | "critical";
  interventionPhase: InterventionPhase;
  findings: Array<{ id: string; title: string; severity: string; description: string }>;
  recommendations: Array<{ id: string; title: string; priority: string; description: string }>;
  actionPlan: ActionPlanItem[];
  engagementId: string;
  createdAt: string;
  executiveBrief: ExecutiveBrief;
  confidence: "low" | "medium" | "high";
  dataWarnings: string[];
  _engineMetadata?: {
    orchestratedDiagnosis: OrchestratedDiagnosis;
    enginesUsed: string[];
  };
}

// ─── Data Quality & Impact Analysis ───────────────────────────────────────

function detectDataIssues(input: BusinessProblemInput): string[] {
  const issues: string[] = [];

  if (input.customerCount && input.monthlyRevenue) {
    const revenuePerCustomer = input.monthlyRevenue / input.customerCount;

    if (revenuePerCustomer > 2000) {
      issues.push("Revenue per customer unusually high — verify customer count or pricing model");
    }

    if (revenuePerCustomer < 10) {
      issues.push("Revenue per customer unusually low — possible pricing or demand issue");
    }
  }

  if (input.monthlyCosts && input.monthlyRevenue && input.monthlyCosts > input.monthlyRevenue * 1.5) {
    issues.push("Costs significantly exceed revenue — business may be in critical cash burn");
  }

  return issues;
}

function calculateConfidence(input: BusinessProblemInput, issues: string[]): "low" | "medium" | "high" {
  if (issues.length >= 2) return "low";
  if (issues.length === 1) return "medium";
  return "high";
}

function calculateBusinessImpact(input: BusinessProblemInput): { monthlyLoss: number; riskLevel: "severe" | "moderate" } | null {
  if (!input.monthlyRevenue || !input.monthlyCosts) return null;

  const loss = input.monthlyCosts - input.monthlyRevenue;

  if (loss <= 0) return null;

  return {
    monthlyLoss: loss,
    riskLevel: loss > input.monthlyRevenue * 0.5 ? "severe" : "moderate",
  };
}

// ─── Validation ───────────────────────────────────────────────────────────

export function validateBusinessProblem(input: BusinessProblemInput): void {
  if (!input.businessName || input.businessName.trim().length === 0) {
    throw new ValidationError("businessName is required");
  }
  if (!input.businessType || input.businessType.trim().length === 0) {
    throw new ValidationError("businessType is required");
  }
  if (!input.problemStatement || input.problemStatement.trim().length === 0) {
    throw new ValidationError("problemStatement is required");
  }
  const validMainIssues = ["low_sales", "high_costs", "cash_flow", "customer_retention", "operations", "unclear"];
  if (!validMainIssues.includes(input.mainIssue)) {
    throw new ValidationError(`mainIssue must be one of: ${validMainIssues.join(", ")}`);
  }
  if (input.monthlyRevenue !== undefined && input.monthlyRevenue < 0) {
    throw new ValidationError("monthlyRevenue must be non-negative");
  }
  if (input.monthlyCosts !== undefined && input.monthlyCosts < 0) {
    throw new ValidationError("monthlyCosts must be non-negative");
  }
  if (input.customerCount !== undefined && input.customerCount < 0) {
    throw new ValidationError("customerCount must be non-negative");
  }
}

// ─── Diagnosis Rules ───────────────────────────────────────────────────────

function determinePrimaryCategory(mainIssue: string): string {
  const categoryMap: Record<string, string> = {
    low_sales: "revenue_generation",
    high_costs: "cost_control",
    cash_flow: "cash_flow_stability",
    customer_retention: "customer_retention",
    operations: "operational_efficiency",
    unclear: "general_business_recovery",
  };
  return categoryMap[mainIssue] || "general_business_recovery";
}

function calculateSeverity(input: BusinessProblemInput): "low" | "medium" | "high" | "critical" {
  // Rule: costs > 125% of revenue → critical
  if (input.monthlyCosts && input.monthlyRevenue && input.monthlyCosts > input.monthlyRevenue * 1.25) {
    return "critical";
  }

  // Rule: costs > revenue → high
  if (input.monthlyCosts && input.monthlyRevenue && input.monthlyCosts > input.monthlyRevenue) {
    return "high";
  }

  // Rule: low_sales with 0 or no customers → high
  if (input.mainIssue === "low_sales" && (!input.customerCount || input.customerCount === 0)) {
    return "high";
  }

  // Rule: cash_flow or high_costs main issue → high by default
  if (input.mainIssue === "cash_flow" || input.mainIssue === "high_costs") {
    return "high";
  }

  // Default
  return "medium";
}

function determineInterventionPhase(severity: string): InterventionPhase {
  const phaseMap: Record<string, InterventionPhase> = {
    critical: "triage",
    high: "stabilization",
    medium: "recovery",
    low: "growth",
  };
  return phaseMap[severity] || "triage";
}

function generateDiagnosisSummary(input: BusinessProblemInput, category: string, severity: string): string {
  const baseMsg = `${input.businessName} (${input.businessType}) faces a ${severity} ${category.replace(/_/g, " ")} issue.`;
  const problemMsg = `Key problem: ${input.problemStatement}`;

  const details: string[] = [];
  if (input.monthlyRevenue !== undefined) {
    details.push(`Monthly revenue: $${input.monthlyRevenue}`);
  }
  if (input.monthlyCosts !== undefined) {
    details.push(`Monthly costs: $${input.monthlyCosts}`);
  }
  if (input.customerCount !== undefined) {
    details.push(`Customers: ${input.customerCount}`);
  }

  return `${baseMsg} ${problemMsg}${details.length > 0 ? " (" + details.join("; ") + ")" : ""}`;
}

function generateFindings(input: BusinessProblemInput, category: string, severity: string): Array<{
  title: string;
  description: string;
  severity: string;
}> {
  const findings: Array<{ title: string; description: string; severity: string }> = [];

  if (category === "revenue_generation") {
    findings.push({
      title: "Insufficient Revenue Streams",
      description: `${input.businessName} is experiencing low sales. Current customer count: ${input.customerCount || "unknown"}.`,
      severity: severity === "critical" ? "critical" : "high",
    });
    findings.push({
      title: "Sales Process Gaps",
      description: "No documented sales process or lead generation system detected.",
      severity: "high",
    });
  } else if (category === "cost_control") {
    findings.push({
      title: "Cost Structure Misalignment",
      description: `Monthly costs ($${input.monthlyCosts || "unknown"}) are not aligned with revenue ($${input.monthlyRevenue || "unknown"}).`,
      severity: severity === "critical" ? "critical" : "high",
    });
    findings.push({
      title: "Lack of Cost Visibility",
      description: "Unable to identify which cost categories are driving the highest expenses.",
      severity: "high",
    });
  } else if (category === "cash_flow_stability") {
    findings.push({
      title: "Cash Flow Volatility",
      description: "Business is experiencing irregular or insufficient cash generation.",
      severity: severity === "critical" ? "critical" : "high",
    });
    findings.push({
      title: "Working Capital Constraints",
      description: "Insufficient working capital to sustain operations and growth.",
      severity: "high",
    });
  } else if (category === "customer_retention") {
    findings.push({
      title: "Customer Churn Risk",
      description: `Current customer base (${input.customerCount || "unknown"}) is at risk or declining.`,
      severity: "high",
    });
    findings.push({
      title: "Value Proposition Misalignment",
      description: "Unclear or mismatched value proposition for target customers.",
      severity: "medium",
    });
  } else if (category === "operational_efficiency") {
    findings.push({
      title: "Operational Inefficiencies",
      description: "Processes and operations are not optimized for efficiency.",
      severity: "high",
    });
    findings.push({
      title: "Lack of Process Documentation",
      description: "Key operational processes are not documented or standardized.",
      severity: "medium",
    });
  } else {
    findings.push({
      title: "Unclear Business Health",
      description: `Insufficient data to assess ${input.businessName}'s specific challenges.`,
      severity: severity === "critical" ? "critical" : "medium",
    });
  }

  return findings;
}

function generateRecommendations(
  input: BusinessProblemInput
): Array<{ title: string; description: string; priority: string; estimatedImpact?: string }> {
  const assessment = {
    businessName: input.businessName,
    businessType: input.businessType,
    revenue: input.monthlyRevenue || 0,
    costs: input.monthlyCosts || 0,
    customers: input.customerCount || 0,
  };

  const personalized = generatePersonalizedRecommendations(assessment);

  return personalized.map((rec) => ({
    title: rec.recommendation.title,
    description: rec.recommendation.description,
    priority: rec.recommendation.priority as "high" | "medium" | "low",
    estimatedImpact: rec.recommendation.estimatedImpact,
  }));
}

function generateActionPlan(category: string, severity: string): ActionPlanItem[] {
  const baseDays = severity === "critical" ? 3 : severity === "high" ? 7 : 14;
  const actions: ActionPlanItem[] = [];

  if (category === "revenue_generation") {
    actions.push({
      title: "Map Current Sales Activities",
      description: "Catalog all current sales and marketing activities to understand what is and isn't working.",
      priority: "high",
      ownerRole: "Sales Lead",
      dueInDays: baseDays,
      successMetric: "Complete activity audit with win/loss analysis",
    });
    actions.push({
      title: "Identify Target Customer Profile",
      description: "Define ideal customer profile and key decision makers.",
      priority: "high",
      ownerRole: "Marketing Manager",
      dueInDays: baseDays + 3,
      successMetric: "ICP document with 3 customer segments defined",
    });
    actions.push({
      title: "Create Sales Outreach Plan",
      description: "Develop a 30/60/90 day sales outreach plan to reach new prospects.",
      priority: "high",
      ownerRole: "Sales Lead",
      dueInDays: baseDays + 7,
      successMetric: "Outreach plan with 100+ targets identified and first 20 contacted",
    });
    actions.push({
      title: "Establish Sales Metrics",
      description: "Set up daily/weekly sales tracking (pipeline, conversion rate, avg deal size).",
      priority: "medium",
      ownerRole: "Sales Manager",
      dueInDays: baseDays + 10,
      successMetric: "Sales dashboard with 2-week rolling metrics",
    });
    actions.push({
      title: "Launch Customer Win-Back Campaign",
      description: "Contact previous customers who churned to understand why and offer return options.",
      priority: "medium",
      ownerRole: "Customer Success",
      dueInDays: baseDays + 14,
      successMetric: "Contact list of 50+ previous customers; 10+ re-engaged",
    });
  } else if (category === "cost_control") {
    actions.push({
      title: "Categorize All Expenses",
      description: "Break down all monthly expenses by category (payroll, vendor, overhead, etc.).",
      priority: "high",
      ownerRole: "Owner/Manager",
      dueInDays: baseDays,
      successMetric: "Detailed expense breakdown with year-to-date trends",
    });
    actions.push({
      title: "Identify Top 5 Cost Drivers",
      description: "Focus on the 5 largest expense categories that represent 80% of costs.",
      priority: "high",
      ownerRole: "Owner/Manager",
      dueInDays: baseDays + 3,
      successMetric: "Analysis showing top 5 cost categories and % of total",
    });
    actions.push({
      title: "Vendor Renegotiation Plan",
      description: "Identify and approach top 3-5 vendors for price renegotiation.",
      priority: "high",
      ownerRole: "Operations",
      dueInDays: baseDays + 7,
      successMetric: "Renegotiation requests sent; 2+ vendors agree to discuss",
    });
    actions.push({
      title: "Review Staffing Levels",
      description: "Audit headcount and workload distribution to identify optimization opportunities.",
      priority: "medium",
      ownerRole: "HR/Operations",
      dueInDays: baseDays + 10,
      successMetric: "Report identifying roles for consolidation or reduction",
    });
    actions.push({
      title: "Implement Approval Workflows",
      description: "Set up cost control approval workflows for expenses above threshold amounts.",
      priority: "medium",
      ownerRole: "Finance",
      dueInDays: baseDays + 14,
      successMetric: "Cost approval policy documented and implemented",
    });
  } else if (category === "cash_flow_stability") {
    actions.push({
      title: "Model Cash Flow",
      description: "Create 13-week rolling cash flow forecast to identify peaks and valleys.",
      priority: "high",
      ownerRole: "Owner/Manager",
      dueInDays: baseDays,
      successMetric: "13-week cash forecast with revenue, expense, and payment timing",
    });
    actions.push({
      title: "Accelerate Collections",
      description: "Review customer payment terms and develop collection plan for overdue receivables.",
      priority: "high",
      ownerRole: "Manager",
      dueInDays: baseDays + 3,
      successMetric: "A/R aging report and action plan for 30+ day overdue accounts",
    });
    actions.push({
      title: "Negotiate Vendor Payments",
      description: "Extend payment terms with key vendors to improve cash timing.",
      priority: "high",
      ownerRole: "Operations",
      dueInDays: baseDays + 7,
      successMetric: "Extended payment terms with 3+ vendors; 30+ day extension achieved",
    });
    actions.push({
      title: "Establish Cash Reserves",
      description: "Establish target cash reserve (3-6 months of burn rate) and develop funding plan.",
      priority: "medium",
      ownerRole: "Owner",
      dueInDays: baseDays + 10,
      successMetric: "Cash reserve target and funding strategy documented",
    });
    actions.push({
      title: "Explore Financing Options",
      description: "Evaluate credit line, invoice factoring, or other financing options as safety net.",
      priority: "medium",
      ownerRole: "Owner",
      dueInDays: baseDays + 14,
      successMetric: "3 financing options evaluated with terms and conditions",
    });
  } else if (category === "customer_retention") {
    actions.push({
      title: "Analyze Customer Churn",
      description: "Identify which customers are churning and their common characteristics.",
      priority: "high",
      ownerRole: "Customer Success",
      dueInDays: baseDays,
      successMetric: "Churn analysis showing top reasons for departure",
    });
    actions.push({
      title: "Implement Retention Program",
      description: "Create loyalty/retention program with incentives and engagement tactics.",
      priority: "high",
      ownerRole: "Customer Success",
      dueInDays: baseDays + 5,
      successMetric: "Retention program defined with incentive tiers",
    });
    actions.push({
      title: "Proactive Customer Engagement",
      description: "Launch monthly touchbase calls with top 20 customers to understand satisfaction.",
      priority: "high",
      ownerRole: "Account Manager",
      dueInDays: baseDays + 7,
      successMetric: "Calls scheduled and completed with 20+ customers; feedback documented",
    });
    actions.push({
      title: "Enhance Support Quality",
      description: "Review customer support process and implement quality improvements.",
      priority: "medium",
      ownerRole: "Customer Success Manager",
      dueInDays: baseDays + 10,
      successMetric: "Support SLA defined; response time target set and tracked",
    });
    actions.push({
      title: "Customer Health Score System",
      description: "Implement customer health scoring to identify at-risk accounts early.",
      priority: "medium",
      ownerRole: "Customer Success",
      dueInDays: baseDays + 14,
      successMetric: "Health score model active; 5+ at-risk customers identified and flagged",
    });
  } else if (category === "operational_efficiency") {
    actions.push({
      title: "Map Core Processes",
      description: "Document 5 critical business processes with current-state process flows.",
      priority: "high",
      ownerRole: "Operations",
      dueInDays: baseDays,
      successMetric: "5 process maps created showing steps, owners, and pain points",
    });
    actions.push({
      title: "Identify Inefficiencies",
      description: "Review mapped processes to identify bottlenecks, redundancies, and rework.",
      priority: "high",
      ownerRole: "Operations Manager",
      dueInDays: baseDays + 3,
      successMetric: "Report listing 10+ inefficiencies with time/cost impact",
    });
    actions.push({
      title: "Design Improvements",
      description: "Design improved process flows addressing identified inefficiencies.",
      priority: "high",
      ownerRole: "Operations",
      dueInDays: baseDays + 7,
      successMetric: "Improved process designs documented with expected time savings",
    });
    actions.push({
      title: "Implement Quick Wins",
      description: "Roll out 3 highest-impact improvements and measure results.",
      priority: "medium",
      ownerRole: "Operations",
      dueInDays: baseDays + 14,
      successMetric: "3 improvements implemented; baseline and new metrics captured",
    });
    actions.push({
      title: "Training and Documentation",
      description: "Create training materials and documentation for new/improved processes.",
      priority: "medium",
      ownerRole: "Operations",
      dueInDays: baseDays + 21,
      successMetric: "Process documentation and training materials completed for all staff",
    });
  } else {
    actions.push({
      title: "Schedule Discovery Meeting",
      description: "Meet with leadership to gather more context about business challenges.",
      priority: "high",
      ownerRole: "Engagement Lead",
      dueInDays: 2,
      successMetric: "2-hour discovery session completed with decision makers",
    });
    actions.push({
      title: "Gather Financial Data",
      description: "Collect latest financial statements, P&L, and cash flow data.",
      priority: "high",
      ownerRole: "Finance",
      dueInDays: 3,
      successMetric: "Last 12 months of financial data collected and reviewed",
    });
    actions.push({
      title: "Interview Key Stakeholders",
      description: "Conduct interviews with 5-7 key leaders to understand pain points.",
      priority: "high",
      ownerRole: "Engagement Lead",
      dueInDays: 7,
      successMetric: "Interview notes with themes and problem statements identified",
    });
    actions.push({
      title: "Develop Detailed Diagnosis",
      description: "Based on data and interviews, identify the real root causes and primary issue.",
      priority: "high",
      ownerRole: "Consultant",
      dueInDays: 10,
      successMetric: "Detailed diagnosis report with root cause analysis and priority ranking",
    });
    actions.push({
      title: "Present Findings",
      description: "Present diagnosis findings and recommended actions to leadership.",
      priority: "medium",
      ownerRole: "Engagement Lead",
      dueInDays: 12,
      successMetric: "Findings presentation completed; action plan approved",
    });
  }

  return actions;
}

// ─── Main Diagnosis Function ───────────────────────────────────────────────

export async function diagnoseBusiness(input: BusinessProblemInput, authContext: CanonicalAuthContext, workspaceId: string): Promise<DiagnosisResult> {
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
  enforceWorkspaceId(validatedWorkspaceId, "diagnoseBusiness", "diagnosis");

  validateBusinessProblem(input);

  // Engine layer: orchestrate diagnosis from multiple engines
  const businessAssessment: BusinessAssessment = {
    businessName: input.businessName,
    businessType: input.businessType,
    problemStatement: input.problemStatement,
    mainIssue: input.mainIssue,
    monthlyRevenue: input.monthlyRevenue,
    monthlyCosts: input.monthlyCosts,
    customerCount: input.customerCount,
  };

  const orchestrator = new DiagnosisOrchestrator([
    new DataValidationEngine(),
    new FinancialEngine(),
  ]);

  // Engine layer: orchestrate diagnosis from multiple engines
  const engineDiagnosis = await orchestrator.orchestrate(businessAssessment);

  // Engine output drives final diagnosis (not just stored in metadata)
  const severity = engineDiagnosis.severity;
  const category = engineDiagnosis.category;
  const phase = engineDiagnosis.phase;

  // Generate outputs based on orchestrated diagnosis
  const summary = generateDiagnosisSummary(input, category, severity);
  const findingsData = generateFindings(input, category, severity);
  const recommendationsData = generateRecommendations(input);
  const actionPlanData = generateActionPlan(category, severity);

  // V2 enhancements - merge with engine findings
  const dataWarnings = engineDiagnosis.issues.length > 0
    ? engineDiagnosis.issues
    : detectDataIssues(input);
  const confidence: "low" | "medium" | "high" =
    engineDiagnosis.diagnosticConfidence >= 0.75 ? "high" :
    engineDiagnosis.diagnosticConfidence >= 0.5 ? "medium" :
    "low";
  const impact = calculateBusinessImpact(input);

  const executiveBrief: ExecutiveBrief = {
    title: severity === "critical" ? "🚨 CRITICAL BUSINESS ALERT" : "⚠️ BUSINESS DIAGNOSIS",
    summary: `${input.businessName} is currently facing a ${severity.toUpperCase()} business risk.${impact ? ` Estimated monthly loss: $${impact.monthlyLoss.toLocaleString()}` : ""} Primary issue: ${category.replace(/_/g, " ")}.${impact ? " Immediate intervention required to prevent further financial deterioration." : ""}`,
    warnings: dataWarnings,
  };

  // Get or create client (ClientAccount does not have workspaceId; isolation via Engagement)
  let client = await db.clientAccount.findFirst({
    where: { name: input.businessName },
  });

  if (!client) {
    client = await db.clientAccount.create({
      data: {
        id: randomUUID(),
        name: input.businessName,
        industry: input.businessType,
        visibility: "internal",
        createdBy: actorId,
        updatedAt: new Date(),
      },
    });
  }

  // Create engagement
  const engagement = await db.engagement.create({
    data: {
      id: randomUUID(),
      code: `DIAG-${Date.now()}`,
      title: `${input.businessName} - ${input.mainIssue.replace(/_/g, " ")}`,
      clientId: client.id,
      serviceTier: "standard",
      engagementMode: "expert",
      status: "active",
      interventionMode: category.includes("revenue") ? "growth" : category.includes("cost") ? "stabilization" : "recovery",
      interventionPhase: phase,
      description: input.problemStatement,
      createdBy: actorId,
      workspaceId: validatedWorkspaceId,
      updatedAt: new Date(),
    },
  });

  // Create business condition profile based on diagnosis
  const conditionInput = {
    engagementId: engagement.id,
    workspaceId: validatedWorkspaceId,
    businessStatus: severity === "critical" ? "critical" : severity === "high" ? "distressed" : "challenged",
    severityScore: severity === "critical" ? 9 : severity === "high" ? 7 : 5,
    urgencyLevel: severity === "critical" || severity === "high" ? "critical" : "medium",
    cashPressureLevel: category === "cash_flow_stability" ? "critical" : "medium",
    marginPressureLevel: category === "cost_control" ? "critical" : "low",
    clientConcentrationRisk: category === "customer_retention" ? "high" : "medium",
    ownerDependencyRisk: "medium",
    keyPersonDependencyRisk: "medium",
    processMaturityLevel: category === "operational_efficiency" ? "low" : "medium",
    managementMaturityLevel: "medium",
    executionCapacityLevel: "medium",
    moralFragilityLevel: "low",
    resilienceLevel: "low",
    growthReadinessLevel: category === "revenue_generation" ? "high" : "medium",
    notes: summary,
  };

  // Use the verified auth context passed to diagnose function
  await assessCondition(conditionInput, authContext);

  // Construct ServiceAuthEnvelope for service calls
  const authEnvelope: ServiceAuthEnvelope = {
    verifiedActorId: authContext.verifiedActorId,
    verifiedActorType: authContext.verifiedActorType,
    verifiedWorkspaceId: authContext.verifiedWorkspaceId,
    verifiedCapabilities: authContext.verifiedCapabilities,
    hasInternalAccess: authContext.policy ? hasInternalAccess(authContext.policy) : false,
    verifiedActor: authContext.verifiedActor,
  };

  // Atomic transaction: create all value-path records together
  // All IDs and timestamps prepared before entering transaction
  const transactionResult = await db.$transaction(async (tx: any): Promise<DiagnosisTransactionResult> => {
    // Create Evidence records first (required for Finding.primaryEvidenceId)
    const createdEvidenceItems = await Promise.all(
      findingsData.map((f) =>
        tx.evidence.create({
          data: {
            id: randomUUID(),
            engagementId: engagement.id,
            title: f.title,
            description: f.description,
            source: "diagnosis",
            status: "identified",
            updatedAt: new Date(),
          },
        })
      )
    );

    // Create Finding records (depend on Evidence IDs)
    const createdFindings = await Promise.all(
      findingsData.map((f, index) => {
        const summary = f.description || "";
        const primaryEvidenceId = createdEvidenceItems[index].id;

        // Validate primaryEvidenceId (same as createFinding service)
        if (!primaryEvidenceId) {
          throw new ValidationError(
            "primaryEvidenceId is required. Evidence must be created before Finding."
          );
        }

        return tx.finding.create({
          data: {
            id: randomUUID(),
            engagementId: engagement.id,
            title: f.title,
            summary: summary,
            primaryEvidenceId: primaryEvidenceId,
            impactArea: category.includes("revenue")
              ? "revenue"
              : category.includes("cost")
                ? "cost"
                : category.includes("cash")
                  ? "revenue"
                  : "execution",
            severity: f.severity,
            rootCause: null,
            updatedAt: new Date(),
          },
        });
      })
    );

    // Create Recommendation records (depend on Finding IDs)
    const createdRecommendations = await Promise.all(
      recommendationsData.map((r) =>
        tx.recommendation.create({
          data: {
            engagementId: engagement.id,
            findingId: createdFindings[0]?.id || null,
            priority: r.priority,
            title: r.title,
            description: r.description || null,
            estimatedImpact: null,
            workspaceId: validatedWorkspaceId,
            createdBy: actorId,
            evidenceValidationScore: 75,
            reliabilityLevel: "medium",
            kpiHealthScore: 75,
            kpiRiskLevel: "medium",
            updatedAt: new Date(),
          },
        })
      )
    );

    // Create Action records (depend on Recommendation IDs)
    const createdActions = await Promise.all(
      actionPlanData.map((a) =>
        tx.action.create({
          data: {
            id: randomUUID(),
            engagementId: engagement.id,
            recommendationId: createdRecommendations[0]?.id || null,
            title: a.title,
            description: a.description || null,
            assignedTo: null,
            dueAt: null,
            status: "draft",
            updatedAt: new Date(),
          },
        })
      )
    );

    return { createdEvidenceItems, createdFindings, createdRecommendations, createdActions };
  });

  const {
    createdEvidenceItems,
    createdFindings,
    createdRecommendations,
    createdActions,
  }: DiagnosisTransactionResult = transactionResult;

  // Side effects after transaction commit: audit events
  // Do NOT do side effects inside transaction to avoid nested transaction issues

  // Emit audit event for findings
  for (let i = 0; i < createdFindings.length; i++) {
    const finding = createdFindings[i];
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FINDING_CREATED,
      actorId,
      entityType: "Finding",
      entityId: finding.id,
      workspaceId: validatedWorkspaceId,
      payload: {
        engagementId: engagement.id,
        severity: findingsData[i]?.severity || "medium",
        title: findingsData[i]?.title || "",
      },
    });
  }

  // Emit audit event for recommendations
  for (let i = 0; i < createdRecommendations.length; i++) {
    const recommendation = createdRecommendations[i];
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
      actorId,
      entityType: "recommendation",
      entityId: recommendation.id,
      workspaceId: validatedWorkspaceId,
      payload: {
        engagementId: engagement.id,
        priority: recommendationsData[i]?.priority || "medium",
      },
      visibility: "internal",
    });
  }

  // Emit audit event for actions
  for (let i = 0; i < createdActions.length; i++) {
    const action = createdActions[i];
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_CREATED,
      actorId,
      entityType: "action",
      entityId: action.id,
      workspaceId: validatedWorkspaceId,
      payload: {
        engagementId: engagement.id,
        priority: actionPlanData[i]?.priority || "medium",
      },
      visibility: "internal",
    });
  }

  emitAuditEvent({
    eventName: AUDIT_EVENTS.DIAGNOSIS_COMPLETED,
    actorId,
    entityType: "Engagement",
    entityId: engagement.id,
    workspaceId: validatedWorkspaceId,
    payload: {
      businessProblem: input,
      severity,
      category,
      phase,
    },
  });

  const actionPlanWithUrgency = actionPlanData.map((action, index) => ({
    ...action,
    urgency: (index < 2 ? "immediate" : "next") as "immediate" | "next",
  }));

  return {
    id: engagement.id,
    input,
    diagnosisSummary: summary,
    primaryProblemCategory: category,
    severity,
    interventionPhase: phase,
    findings: createdFindings.map((f, i) => ({
      id: f.id,
      title: findingsData[i]?.title || "",
      severity: findingsData[i]?.severity || "medium",
      description: findingsData[i]?.description || "",
    })),
    recommendations: createdRecommendations.map((r, i) => ({
      id: r.id,
      title: recommendationsData[i]?.title || "",
      priority: recommendationsData[i]?.priority || "medium",
      description: recommendationsData[i]?.description || "",
    })),
    actionPlan: actionPlanWithUrgency,
    engagementId: engagement.id,
    createdAt: engagement.createdAt.toISOString(),
    executiveBrief,
    confidence,
    dataWarnings,
    _engineMetadata: {
      orchestratedDiagnosis: engineDiagnosis,
      enginesUsed: engineDiagnosis.allEngineResults.map((r) => r.engine),
    },
  };
}
