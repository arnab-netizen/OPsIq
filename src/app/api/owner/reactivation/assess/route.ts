/**
 * POST /api/owner/reactivation/assess — Customer Reactivation Campaign Assessment (Module #8).
 *
 * Accepts dormant-customer metrics and returns:
 * - A churn-risk score (LOW / MEDIUM / HIGH / CRITICAL) with urgency classification
 * - An LTV recovery estimate (when avgMonthlyRevenuePerCustomer is supplied)
 * - A fully-prepared customer_reactivation WorkPackage — scripts, trackers, steps,
 *   assignee, deadline, and proof rules — ready to execute without further advice
 *
 * Hard governance rules (enforced deterministically):
 * - ownerApprovalRequired is always true (reactivation spend requires the owner to approve)
 * - Churn rate derived from dormantCustomerCount / cohortSize when not supplied
 * - cashPressureActive upgrades urgency by one level (MONITOR → PLANNED, etc.)
 * - No DB writes; no fabricated customer records; no persistence
 * - workspaceId sourced only from ctx.verifiedWorkspaceId
 *
 * Pure analysis — no persistence. workspaceId from canonical session context only.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 * Body: validated via Zod (reactivationAssessRequestSchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { reactivationAssessRequestSchema } from "@/domain/owner-mode/reactivation-assess.validation";
import { generateWorkPackage } from "@/domain/owner-strategy/work-package";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Churn-risk thresholds ──────────────────────────────────────────────────
const CHURN_CRITICAL = 0.15; // >= 15% → CRITICAL
const CHURN_HIGH = 0.10;     // >= 10% → HIGH
const CHURN_MEDIUM = 0.05;   // >  5%  → MEDIUM
                              // ≤  5%  → LOW

type ChurnRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type InterventionUrgency = "IMMEDIATE" | "URGENT" | "PLANNED" | "MONITOR";

function classifyChurnRisk(
  churnRate: number,
  cashPressureActive: boolean,
): {
  riskLevel: ChurnRiskLevel;
  interventionUrgency: InterventionUrgency;
  churnPct: number;
} {
  let riskLevel: ChurnRiskLevel;
  let urgency: InterventionUrgency;

  if (churnRate >= CHURN_CRITICAL) {
    riskLevel = "CRITICAL";
    urgency = "IMMEDIATE";
  } else if (churnRate >= CHURN_HIGH) {
    riskLevel = "HIGH";
    urgency = "URGENT";
  } else if (churnRate > CHURN_MEDIUM) {
    riskLevel = "MEDIUM";
    urgency = "PLANNED";
  } else {
    riskLevel = "LOW";
    urgency = "MONITOR";
  }

  // Cash pressure upgrades urgency by one step
  if (cashPressureActive) {
    if (urgency === "MONITOR") urgency = "PLANNED";
    else if (urgency === "PLANNED") urgency = "URGENT";
    else if (urgency === "URGENT") urgency = "IMMEDIATE";
    // IMMEDIATE stays IMMEDIATE
  }

  return { riskLevel, interventionUrgency: urgency, churnPct: Math.round(churnRate * 100 * 10) / 10 };
}

// ── Route handler ──────────────────────────────────────────────────────────

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const {
      dormantCustomerCount,
      cohortSize,
      avgMonthlyChurnRate,
      avgMonthlyRevenuePerCustomer,
      businessName,
      context,
      evaluatedAt,
    } = await parseRequestBody(ctx.request!, reactivationAssessRequestSchema);

    const now = evaluatedAt ?? new Date().toISOString();
    const cashPressureActive = context?.cashPressureActive ?? false;

    // Derive churn rate — prefer supplied value; fall back to derived
    const effectiveChurnRate =
      avgMonthlyChurnRate !== undefined
        ? avgMonthlyChurnRate
        : dormantCustomerCount / cohortSize;

    const { riskLevel, interventionUrgency, churnPct } = classifyChurnRisk(
      effectiveChurnRate,
      cashPressureActive,
    );

    // LTV impact — only when revenue per customer is known
    let ltvImpact: {
      estimatedMonthlyRevenueLost: number;
      estimatedAnnualRevenueLost: number;
    } | null = null;

    if (avgMonthlyRevenuePerCustomer !== undefined && avgMonthlyRevenuePerCustomer > 0) {
      const monthlyLost = Math.round(dormantCustomerCount * avgMonthlyRevenuePerCustomer);
      ltvImpact = {
        estimatedMonthlyRevenueLost: monthlyLost,
        estimatedAnnualRevenueLost: monthlyLost * 12,
      };
    }

    // Map risk level to WorkPackage risk classification
    const wpRisk = riskLevel === "CRITICAL" ? "critical"
      : riskLevel === "HIGH" ? "high"
      : riskLevel === "MEDIUM" ? "medium"
      : "low";

    const deadlineDays = interventionUrgency === "IMMEDIATE" ? 2
      : interventionUrgency === "URGENT" ? 5
      : 14;

    const workPackage = generateWorkPackage({
      title: "Dormant customer reactivation campaign",
      problem: `${dormantCustomerCount} dormant customers represent ${churnPct}% monthly churn — ${riskLevel} risk. Revenue recovery requires a structured win-back campaign.`,
      actionKind: "customer_reactivation",
      evidence: [
        `Dormant customers: ${dormantCustomerCount} of ${cohortSize} (${churnPct}% effective monthly churn)`,
        ...(ltvImpact ? [`Estimated monthly revenue lost: ${ltvImpact.estimatedMonthlyRevenueLost}`] : []),
        ...(cashPressureActive ? ["Cash pressure active — urgency upgraded"] : []),
      ],
      riskLevel: wpRisk,
      ownerApprovalRequired: true,        // Governance invariant — always
      assigneeRole: "owner",
      deadlineDays,
      businessName: businessName ?? null,
      expectedOutcome: `Recover returned customers and track revenue recovered within the ${deadlineDays}-day window.`,
      measurementWindowDays: Math.max(deadlineDays, 14),
    });

    return {
      workspaceId: ctx.verifiedWorkspaceId,
      evaluatedAt: now,
      dormantCustomerCount,
      cohortSize,
      churnRate: effectiveChurnRate,
      churnRisk: {
        riskLevel,
        interventionUrgency,
        churnPct,
      },
      ltvImpact,
      reactivationUrgent: interventionUrgency === "IMMEDIATE" || interventionUrgency === "URGENT",
      ownerApprovalRequired: true,        // Governance invariant — always surface to caller
      workPackage,
    };
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
