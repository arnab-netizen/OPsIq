/**
 * B08 — Owner Constraints Engine.
 *
 * Evaluates whether a recommendation respects owner's operational constraints.
 * Identifies constraint violations and classifies severity (advisory vs blocking).
 *
 * Constraint categories:
 *   - budget: available marketing/operational spend
 *   - time: owner's weekly available hours
 *   - staff: headcount constraints
 *   - geography: service area limits
 *   - legal/payment: compliance and payment processing limits
 *   - data_availability: data readiness (missing integrations, etc.)
 *   - risk_appetite: owner's risk tolerance
 *   - business_stage: startup vs mature vs exit mode
 *   - owner_goal: growth vs stability vs profitability focus
 *   - channel_limits: channel-specific constraints
 *   - execution_capacity: operational bandwidth
 *   - cash_runway: months of cash remaining
 *
 * Rules:
 *   - every recommendation must check constraints
 *   - violated constraints must be listed
 *   - if action violates hard constraint, it cannot be primary recommendation
 *   - constraint violations must be surfaced to owner
 *
 * Acceptance gates:
 *   - no-budget owner does not receive paid-ad-first plan
 *   - low-time owner receives low-time action plan
 *   - cash crisis owner does not receive high-cash-burn plan
 *
 * Pure function, no DB, no I/O. Deterministic over constraint input only.
 */

// --- Constraint categories and types -----------------------------------------

export const CONSTRAINT_CATEGORIES = [
  "budget",
  "time",
  "staff",
  "geography",
  "legal_payment",
  "data_availability",
  "risk_appetite",
  "business_stage",
  "owner_goal",
  "channel_limits",
  "execution_capacity",
  "cash_runway",
] as const;

export type ConstraintCategory = (typeof CONSTRAINT_CATEGORIES)[number];

export interface OwnerConstraints {
  // Budget constraints
  marketing_budget_monthly?: number | null; // in currency units
  operational_budget_available?: number | null;

  // Time constraints
  owner_available_hours_per_week?: number | null; // 0-168
  team_available_hours_per_week?: number | null;

  // Staff constraints
  total_staff_count?: number | null;
  can_hire?: boolean; // whether owner can onboard new staff
  max_new_hires?: number | null;

  // Geographic constraints
  service_area_km_radius?: number | null;
  multi_location?: boolean;
  target_geographies?: string[] | null;

  // Legal/payment constraints
  payment_processor_live?: boolean;
  invoicing_capability?: boolean;
  gst_compliance_status?: "compliant" | "non_compliant" | "exempt" | null;
  has_corporate_structure?: boolean;

  // Data availability
  crm_system_live?: boolean;
  accounting_system_live?: boolean;
  inventory_tracking_live?: boolean;
  marketing_analytics_live?: boolean;
  integration_readiness?: "full" | "partial" | "none" | null;

  // Risk appetite (1-10 scale)
  risk_appetite?: number | null; // 1 = very conservative, 10 = aggressive

  // Business stage
  business_stage?: "bootstrap" | "seed" | "growth" | "scaling" | "mature" | "exit" | null;

  // Owner goals
  primary_goal?: "growth" | "stability" | "profitability" | "exit" | "survival" | null;

  // Channel constraints
  channel_focus?: string[] | null; // e.g., ["ecommerce", "marketplace", "direct_sales"]
  channels_to_avoid?: string[] | null;

  // Execution capacity (1-10 scale)
  execution_capacity?: number | null; // 1 = minimal, 10 = high

  // Cash runway (months)
  months_of_cash_runway?: number | null; // 0 = immediate crisis, 12+ = comfortable
}

// --- Recommendation shape (constraint checker accepts this) ---

export interface RecommendationForConstraintCheck {
  id: string;
  domain: string; // e.g., "sales", "finance", "operations"
  action: string; // e.g., "scale_paid_ads", "hire_sales_rep"
  cash_requirement_monthly?: number | null; // monthly burn if applicable
  time_requirement_hours?: number | null; // hours per week required
  staff_requirement?: number | null; // FTE needed
  channels_required?: string[] | null;
  geographic_scope?: string | null;
  legal_requirements?: string[] | null;
  reversibility?: "reversible" | "partially_reversible" | "irreversible" | null;
  priority_level?: "critical" | "high" | "medium" | "low" | null;
}

// --- Constraint violation result ---

export interface ConstraintViolation {
  category: ConstraintCategory;
  description: string;
  severity: "advisory" | "blocking"; // blocking = action cannot be primary if violated
  owner_constraint: string; // e.g., "monthly_marketing_budget: $5000"
  requirement: string; // e.g., "paid_ads_plan requires $10000/month"
}

export interface ConstraintCheckResult {
  recommendation_id: string;
  constraint_compliant: boolean; // true if no blocking violations
  can_be_primary: boolean; // false if any blocking violations exist
  violations: ConstraintViolation[];
  notes: string[];
}

// --- Constraint checking logic ---

/**
 * Check if a recommendation respects owner constraints.
 * Returns violations and a verdict on whether it can be primary.
 */
export function checkRecommendationAgainstConstraints(
  recommendation: RecommendationForConstraintCheck,
  constraints: OwnerConstraints,
): ConstraintCheckResult {
  const violations: ConstraintViolation[] = [];
  const notes: string[] = [];

  // Budget constraint check
  if (recommendation.cash_requirement_monthly && constraints.marketing_budget_monthly !== null) {
    if (recommendation.cash_requirement_monthly > (constraints.marketing_budget_monthly ?? 0)) {
      violations.push({
        category: "budget",
        description: "Recommendation requires more monthly budget than available",
        severity: "blocking",
        owner_constraint: `$${constraints.marketing_budget_monthly}/month available`,
        requirement: `$${recommendation.cash_requirement_monthly}/month required`,
      });
    }
  }

  // Cash runway constraint (critical: no high-burn recommendations in crisis)
  if (
    constraints.months_of_cash_runway !== null &&
    constraints.months_of_cash_runway < 3 &&
    recommendation.cash_requirement_monthly &&
    recommendation.cash_requirement_monthly > 0
  ) {
    violations.push({
      category: "cash_runway",
      description: "High-burn action not recommended in cash crisis",
      severity: "blocking",
      owner_constraint: `${constraints.months_of_cash_runway} months of cash runway`,
      requirement: "Zero-burn or revenue-positive action required",
    });
  }

  // Time constraint check
  if (recommendation.time_requirement_hours && constraints.owner_available_hours_per_week !== null) {
    if (recommendation.time_requirement_hours > (constraints.owner_available_hours_per_week ?? 0)) {
      violations.push({
        category: "time",
        description: "Recommendation requires more owner time than available",
        severity: "advisory",
        owner_constraint: `${constraints.owner_available_hours_per_week}h/week owner availability`,
        requirement: `${recommendation.time_requirement_hours}h/week required`,
      });
    }
  }

  // Staff constraint check
  if (
    recommendation.staff_requirement &&
    constraints.total_staff_count !== null &&
    recommendation.staff_requirement > (constraints.total_staff_count ?? 0)
  ) {
    if (!constraints.can_hire) {
      violations.push({
        category: "staff",
        description: "Recommendation requires staff expansion but owner cannot hire",
        severity: "blocking",
        owner_constraint: "No hiring capacity",
        requirement: `${recommendation.staff_requirement} FTE required`,
      });
    } else {
      const new_hires_needed = recommendation.staff_requirement - (constraints.total_staff_count ?? 0);
      if (constraints.max_new_hires !== null && new_hires_needed > constraints.max_new_hires) {
        violations.push({
          category: "staff",
          description: "Recommendation exceeds max new hires constraint",
          severity: "blocking",
          owner_constraint: `Max ${constraints.max_new_hires} new hires allowed`,
          requirement: `${new_hires_needed} new hires needed`,
        });
      }
    }
  }

  // Data availability constraint
  if (
    recommendation.action.includes("analytics") ||
    recommendation.action.includes("marketing_optimization")
  ) {
    if (!constraints.marketing_analytics_live) {
      violations.push({
        category: "data_availability",
        description: "Recommendation requires marketing analytics but system is not live",
        severity: "advisory",
        owner_constraint: "Marketing analytics not integrated",
        requirement: "Live analytics feed required",
      });
    }
  }

  // Geographic constraint
  if (recommendation.geographic_scope && constraints.service_area_km_radius !== null) {
    // This is simplified; in production would do proper distance calculation
    if (recommendation.geographic_scope === "national" && (constraints.service_area_km_radius ?? 0) < 100) {
      violations.push({
        category: "geography",
        description: "National recommendation not feasible for local-only business",
        severity: "blocking",
        owner_constraint: `${constraints.service_area_km_radius}km service radius`,
        requirement: "National reach required",
      });
    }
  }

  // Legal constraint
  if (recommendation.legal_requirements && recommendation.legal_requirements.length > 0) {
    if (recommendation.legal_requirements.includes("payment_processor") && !constraints.payment_processor_live) {
      violations.push({
        category: "legal_payment",
        description: "Recommendation requires payment processing but system not ready",
        severity: "blocking",
        owner_constraint: "Payment processor not live",
        requirement: "Live payment processing required",
      });
    }
  }

  // Risk appetite constraint
  if (recommendation.priority_level === "critical" && constraints.risk_appetite !== null && constraints.risk_appetite < 3) {
    violations.push({
      category: "risk_appetite",
      description: "High-risk recommendation not suitable for conservative owner",
      severity: "advisory",
      owner_constraint: `Risk appetite: ${constraints.risk_appetite}/10 (conservative)`,
      requirement: "High-risk action",
    });
  }

  // Business stage constraint
  if (
    constraints.business_stage === "bootstrap" &&
    recommendation.action.includes("scale_ads")
  ) {
    violations.push({
      category: "business_stage",
      description: "Scaling ads not recommended for bootstrap-stage business",
      severity: "advisory",
      owner_constraint: "Business stage: bootstrap",
      requirement: "Paid ads scaling recommended",
    });
  }

  // Channel constraint
  if (recommendation.channels_required && constraints.channel_focus) {
    const incompatible = recommendation.channels_required.filter((ch) => !constraints.channel_focus!.includes(ch));
    if (incompatible.length > 0 && constraints.channels_to_avoid?.some((ch) => incompatible.includes(ch))) {
      violations.push({
        category: "channel_limits",
        description: "Recommendation requires channel business explicitly wants to avoid",
        severity: "blocking",
        owner_constraint: `Focus: ${constraints.channel_focus.join(", ")}; Avoid: ${constraints.channels_to_avoid.join(", ")}`,
        requirement: `Action requires: ${incompatible.join(", ")}`,
      });
    }
  }

  // Execution capacity constraint
  if (
    recommendation.priority_level === "critical" &&
    constraints.execution_capacity !== null &&
    constraints.execution_capacity < 3
  ) {
    notes.push("Recommendation requires high execution capacity but owner has limited bandwidth");
  }

  // Determine overall verdict
  const blocking_violations = violations.filter((v) => v.severity === "blocking");
  const can_be_primary = blocking_violations.length === 0;
  const constraint_compliant = violations.length === 0;

  return {
    recommendation_id: recommendation.id,
    constraint_compliant,
    can_be_primary,
    violations,
    notes,
  };
}

/**
 * Batch check multiple recommendations against constraints.
 * Returns verdict for each, and summary of most constrained areas.
 */
export function checkMultipleRecommendations(
  recommendations: RecommendationForConstraintCheck[],
  constraints: OwnerConstraints,
): {
  results: ConstraintCheckResult[];
  most_constrained_categories: ConstraintCategory[];
  any_blocking_violations: boolean;
} {
  const results = recommendations.map((rec) => checkRecommendationAgainstConstraints(rec, constraints));

  const all_violations = results.flatMap((r) => r.violations);
  const categories_with_blocking = all_violations
    .filter((v) => v.severity === "blocking")
    .map((v) => v.category);

  const category_violation_counts = new Map<ConstraintCategory, number>();
  for (const cat of categories_with_blocking) {
    category_violation_counts.set(cat, (category_violation_counts.get(cat) ?? 0) + 1);
  }

  const most_constrained_categories = Array.from(category_violation_counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);

  return {
    results,
    most_constrained_categories,
    any_blocking_violations: categories_with_blocking.length > 0,
  };
}

/**
 * Human-readable summary of constraints for owner communication.
 */
export function summarizeConstraints(constraints: OwnerConstraints): string[] {
  const summary: string[] = [];

  if (constraints.marketing_budget_monthly) {
    summary.push(`Marketing budget: $${constraints.marketing_budget_monthly}/month`);
  }
  if (constraints.months_of_cash_runway != null) {
    summary.push(`Cash runway: ${constraints.months_of_cash_runway} months`);
  }
  if (constraints.owner_available_hours_per_week != null) {
    summary.push(`Owner availability: ${constraints.owner_available_hours_per_week} hours/week`);
  }
  if (constraints.business_stage) {
    summary.push(`Business stage: ${constraints.business_stage}`);
  }
  if (constraints.primary_goal) {
    summary.push(`Primary goal: ${constraints.primary_goal}`);
  }
  if (constraints.risk_appetite != null) {
    summary.push(`Risk appetite: ${constraints.risk_appetite}/10`);
  }

  return summary;
}
