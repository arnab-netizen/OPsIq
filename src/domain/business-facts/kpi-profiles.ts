/**
 * B11 — Industry-Specific KPI Profiles.
 *
 * Defines canonical KPI profiles for minimum 9 business types.
 * Every diagnosis should use the selected industry profile's KPIs
 * and benchmark applicability notes.
 *
 * Profiles:
 *   - local service business
 *   - retail
 *   - restaurant/cloud kitchen
 *   - laundry/dry cleaning
 *   - SaaS
 *   - agency/services
 *   - e-commerce
 *   - manufacturing/trading
 *   - franchise business
 *
 * Each profile includes:
 *   - core KPIs (what to measure)
 *   - common failure modes (what can go wrong)
 *   - critical ratios (thresholds that matter)
 *   - data required (what data intake must collect)
 *   - recommended action patterns (typical solutions)
 *   - benchmark applicability notes (caveats on applying benchmarks)
 *
 * Pure function, no DB, no I/O. Deterministic reference data.
 */

// --- KPI Profile Types ---

export interface KPIProfile {
  industry_type: string;
  display_name: string;
  description: string;

  // Core KPIs (what to measure)
  core_kpis: CoreKPI[];

  // Common failure modes
  common_failure_modes: FailureMode[];

  // Critical ratios and thresholds
  critical_ratios: CriticalRatio[];

  // Data requirements
  required_data_sources: string[];
  minimum_data_points_for_diagnosis: string[];

  // Recommended action patterns
  action_patterns: ActionPattern[];

  // Benchmark guidance
  benchmark_notes: string;
  applicable_benchmarks: string[];
  caveats: string[];
}

export interface CoreKPI {
  kpi_name: string;
  measurement_unit: string; // e.g., "units/month", "₹", "%"
  calculation_method: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  why_matters: string;
}

export interface FailureMode {
  failure_name: string;
  symptoms: string[];
  typical_root_causes: string[];
  financial_impact: string;
  timeline_if_unchecked: string;
}

export interface CriticalRatio {
  ratio_name: string;
  numerator: string;
  denominator: string;
  healthy_range: { min: number; max: number };
  unit: "percentage" | "multiplier" | "days" | "count";
  why_critical: string;
}

export interface ActionPattern {
  pattern_name: string;
  when_to_apply: string;
  typical_steps: string[];
  expected_timeline: string;
  success_metrics: string[];
}

// --- Industry Profiles ---

const LOCAL_SERVICE_BUSINESS: KPIProfile = {
  industry_type: "local_service_business",
  display_name: "Local Service Business",
  description:
    "Services delivered in local geography: cleaning, repair, plumbing, HVAC, electrical, consulting, etc.",

  core_kpis: [
    {
      kpi_name: "Monthly Recurring Revenue (MRR)",
      measurement_unit: "₹",
      calculation_method: "Sum of all service contracts billed monthly",
      frequency: "monthly",
      why_matters: "Revenue predictability drives hiring and capacity decisions",
    },
    {
      kpi_name: "Customer Acquisition Cost (CAC)",
      measurement_unit: "₹",
      calculation_method: "Total marketing spend / new customers acquired",
      frequency: "monthly",
      why_matters: "Determines profitability of growth channels",
    },
    {
      kpi_name: "Service Delivery Cost",
      measurement_unit: "% of revenue",
      calculation_method: "Labor + vehicle + materials / revenue",
      frequency: "monthly",
      why_matters: "Determines margin sustainability at scale",
    },
    {
      kpi_name: "Customer Retention Rate",
      measurement_unit: "%",
      calculation_method: "(Customers at period end - new customers) / customers at period start",
      frequency: "monthly",
      why_matters: "Drives MRR growth without CAC spend",
    },
    {
      kpi_name: "Jobs per Technician",
      measurement_unit: "jobs/month",
      calculation_method: "Total jobs completed / technician count",
      frequency: "monthly",
      why_matters: "Indicates utilization and capacity constraints",
    },
  ],

  common_failure_modes: [
    {
      failure_name: "Technician Dependency",
      symptoms: ["Revenue drops if key technician leaves", "Service quality inconsistent"],
      typical_root_causes: ["No documentation or training process", "Single technician bottleneck"],
      financial_impact: "Can lose 30-50% of revenue if key person departs",
      timeline_if_unchecked: "Weeks to months",
    },
    {
      failure_name: "Unsustainable Scaling",
      symptoms: ["Margins compress as customer base grows", "Service quality deteriorates"],
      typical_root_causes: ["Labor costs rise faster than pricing", "Operational complexity increases"],
      financial_impact: "Profitability turns negative despite revenue growth",
      timeline_if_unchecked: "2-3 months as scaling accelerates",
    },
    {
      failure_name: "Marketing Dependency",
      symptoms: ["High CAC relative to customer lifetime value", "Churn increases but not visible"],
      typical_root_causes: ["Over-reliance on paid ads", "Word-of-mouth declining"],
      financial_impact: "Unsustainable unit economics",
      timeline_if_unchecked: "Ongoing cash drain",
    },
  ],

  critical_ratios: [
    {
      ratio_name: "Gross Margin",
      numerator: "Revenue - service delivery cost",
      denominator: "Revenue",
      healthy_range: { min: 0.4, max: 0.7 },
      unit: "percentage",
      why_critical: "Below 40%, cannot cover overhead and profits",
    },
    {
      ratio_name: "CAC Payback Period",
      numerator: "CAC",
      denominator: "Monthly contribution margin per customer",
      healthy_range: { min: 0, max: 6 },
      unit: "days",
      why_critical: "Payback should be < 6 months or unit economics fail",
    },
    {
      ratio_name: "Utilization Rate",
      numerator: "Billable hours",
      denominator: "Available hours (excluding commute, admin)",
      healthy_range: { min: 0.6, max: 0.85 },
      unit: "percentage",
      why_critical: "Below 60%, technicians are idle; above 85%, burnout risk",
    },
  ],

  required_data_sources: [
    "Revenue by customer and service type",
    "Customer acquisition channels and costs",
    "Service delivery labor costs",
    "Monthly customer count and retention",
    "Technician billable hours and utilization",
  ],

  minimum_data_points_for_diagnosis: [
    "3+ months of revenue data",
    "Customer list with acquisition date and channel",
    "Labor costs for past 2 months",
    "Churn rate for past 3 months",
  ],

  action_patterns: [
    {
      pattern_name: "Margin Recovery",
      when_to_apply: "When service delivery cost creeping above 60% of revenue",
      typical_steps: [
        "Audit service delivery process for inefficiencies",
        "Test price increase on 20% of customer base",
        "Reduce scope or standardize high-cost services",
      ],
      expected_timeline: "2-3 months to see margin improvement",
      success_metrics: ["Delivery cost back to <55% of revenue", "Customer retention stable"],
    },
  ],

  benchmark_notes:
    "Local service benchmarks vary widely by geography, specialization, and business model. Use cautiously.",
  applicable_benchmarks: [
    "Home Services Industry average gross margin: 40-50%",
    "CAC payback period target: 3-6 months",
    "Technician utilization: 60-75% realistic, 80%+ unsustainable",
  ],
  caveats: [
    "Seasonal variations affect MRR and utilization significantly",
    "Geographic market size limits total addressable revenue",
    "Technician quality variance creates service delivery volatility",
  ],
};

const SAAS: KPIProfile = {
  industry_type: "saas",
  display_name: "SaaS (Software as a Service)",
  description: "Recurring revenue from software subscriptions, API access, or cloud services.",

  core_kpis: [
    {
      kpi_name: "Monthly Recurring Revenue (MRR)",
      measurement_unit: "₹",
      calculation_method: "Sum of all active subscription fees",
      frequency: "monthly",
      why_matters: "Defines company valuation and growth trajectory",
    },
    {
      kpi_name: "Customer Churn Rate",
      measurement_unit: "%",
      calculation_method: "Customers lost in period / customers at period start",
      frequency: "monthly",
      why_matters: "Determines if business is growing or declining",
    },
    {
      kpi_name: "Customer Lifetime Value (LTV)",
      measurement_unit: "₹",
      calculation_method: "ARPU × (1 / monthly churn rate) × contribution margin %",
      frequency: "quarterly",
      why_matters: "Defines how much can be spent on CAC",
    },
    {
      kpi_name: "Customer Acquisition Cost (CAC)",
      measurement_unit: "₹",
      calculation_method: "Total S&M spend / new customers acquired",
      frequency: "monthly",
      why_matters: "Must be < 30% of LTV for sustainability",
    },
    {
      kpi_name: "Net Revenue Retention (NRR)",
      measurement_unit: "%",
      calculation_method: "Revenue from existing customers in period (including expansion) / revenue from those customers in prior period",
      frequency: "quarterly",
      why_matters: "NRR > 100% means existing customers expanding",
    },
  ],

  common_failure_modes: [
    {
      failure_name: "High Churn, Unsustainable Growth",
      symptoms: ["MRR flat or declining despite acquisition spend", "CAC rising relative to LTV"],
      typical_root_causes: ["Product-market fit lacking", "Onboarding or support failure"],
      financial_impact: "Burn rate exceeds runway quickly",
      timeline_if_unchecked: "Cash runway depletes in 6-12 months",
    },
    {
      failure_name: "No Product-Led Growth",
      symptoms: ["High S&M spend required for each new customer", "Viral adoption never emerges"],
      typical_root_causes: ["Product lacks viral mechanisms", "Value prop not self-evident"],
      financial_impact: "CAC grows as market saturates",
      timeline_if_unchecked: "Unit economics deteriorate over 12+ months",
    },
  ],

  critical_ratios: [
    {
      ratio_name: "CAC Payback",
      numerator: "CAC",
      denominator: "ARPU × contribution margin %",
      healthy_range: { min: 0, max: 18 },
      unit: "days",
      why_critical: "Payback must be < 18 months or funding constrained",
    },
    {
      ratio_name: "LTV/CAC Ratio",
      numerator: "Lifetime Value",
      denominator: "Customer Acquisition Cost",
      healthy_range: { min: 3, max: 10 },
      unit: "multiplier",
      why_critical: "Ratio < 3 means unit economics unsustainable",
    },
    {
      ratio_name: "Net Revenue Retention",
      numerator: "Expansion revenue + retention revenue",
      denominator: "Prior period revenue from same cohort",
      healthy_range: { min: 1.0, max: 1.3 },
      unit: "multiplier",
      why_critical: "> 100% (expansion exceeds churn) drives compounding growth",
    },
  ],

  required_data_sources: [
    "Monthly subscription revenue by customer",
    "Customer churn events with reason",
    "Marketing spend by channel",
    "Customer onboarding success rates",
    "Feature usage and engagement metrics",
  ],

  minimum_data_points_for_diagnosis: [
    "12+ months of monthly revenue and churn data",
    "Customer cohort analysis by acquisition month",
    "S&M spend by channel for 6+ months",
    "Customer survey or NPS data",
  ],

  action_patterns: [
    {
      pattern_name: "Churn Reduction",
      when_to_apply: "When monthly churn > 5% or NRR < 100%",
      typical_steps: [
        "Segment customers by churn risk (cohort analysis)",
        "Interview churned customers on reasons",
        "Implement onboarding improvements for high-churn cohorts",
        "Create win-back campaign for at-risk accounts",
      ],
      expected_timeline: "3-4 months to see churn improvement",
      success_metrics: ["Churn rate down to < 3%", "NRR > 105%"],
    },
  ],

  benchmark_notes: "SaaS benchmarks assume B2B SaaS with >12 month history. B2C and early-stage differ significantly.",
  applicable_benchmarks: [
    "SaaS CAC payback: < 12 months ideal, < 18 months acceptable",
    "Churn rate: < 3% monthly for mature SaaS, 5-10% for growth-stage",
    "NRR: 120%+ for strong SaaS, 100-110% for sustainable",
  ],
  caveats: [
    "Cohort analysis required; blended metrics hide real trends",
    "Unit economics vary dramatically by customer segment",
    "Expansion revenue depends on product maturity and use cases",
  ],
};

const RESTAURANT: KPIProfile = {
  industry_type: "restaurant",
  display_name: "Restaurant / Cloud Kitchen",
  description: "Food service with in-house or ghost kitchen operations.",

  core_kpis: [
    {
      kpi_name: "Food Cost %",
      measurement_unit: "%",
      calculation_method: "Cost of food sold / revenue",
      frequency: "daily",
      why_matters: "Industry standard is 28-35%; above 35% unsustainable",
    },
    {
      kpi_name: "Labour Cost %",
      measurement_unit: "%",
      calculation_method: "Total payroll / revenue",
      frequency: "weekly",
      why_matters: "Industry standard 28-35%; above 35% indicates overstaffing",
    },
    {
      kpi_name: "Covers per Day",
      measurement_unit: "count",
      calculation_method: "Number of customer transactions per day",
      frequency: "daily",
      why_matters: "Indicates traffic and revenue potential",
    },
    {
      kpi_name: "Average Check Value",
      measurement_unit: "₹",
      calculation_method: "Total revenue / number of covers",
      frequency: "weekly",
      why_matters: "Determines pricing adequacy and menu engineering needs",
    },
    {
      kpi_name: "Peak Hour Utilization",
      measurement_unit: "%",
      calculation_method: "Covers during peak / available seating",
      frequency: "weekly",
      why_matters: "Low utilization = idle capacity cost",
    },
  ],

  common_failure_modes: [
    {
      failure_name: "Food Waste",
      symptoms: ["Food cost creeping above 35%", "Frequent discards at close"],
      typical_root_causes: ["Over-prepping", "Inaccurate demand forecasting", "Spoilage"],
      financial_impact: "2-5% revenue loss due to waste",
      timeline_if_unchecked: "Ongoing drain on margins",
    },
    {
      failure_name: "Inconsistent Service",
      symptoms: ["Customer complaints rising", "Repeat visits declining", "Poor online reviews"],
      typical_root_causes: ["High staff turnover", "Inadequate training", "Unclear SOPs"],
      financial_impact: "Revenue declines 5-15% as reputation suffers",
      timeline_if_unchecked: "3-6 months to notice revenue impact",
    },
  ],

  critical_ratios: [
    {
      ratio_name: "Gross Margin",
      numerator: "Revenue - food cost - labour cost",
      denominator: "Revenue",
      healthy_range: { min: 0.25, max: 0.35 },
      unit: "percentage",
      why_critical: "Below 25%, cannot cover rent, utilities, and profit",
    },
    {
      ratio_name: "Menu Margin",
      numerator: "Item price - item food cost",
      denominator: "Item price",
      healthy_range: { min: 0.65, max: 0.75 },
      unit: "percentage",
      why_critical: "Per-item margin drives overall health",
    },
  ],

  required_data_sources: [
    "Daily sales by item (POS data)",
    "Daily food purchases and usage",
    "Daily labour hours and costs",
    "Waste/spoilage tracking",
    "Customer traffic (covers) by time of day",
  ],

  minimum_data_points_for_diagnosis: [
    "30+ days of daily POS and cost data",
    "Peak hour traffic for 2+ weeks",
    "Waste tracking for 2+ weeks",
  ],

  action_patterns: [
    {
      pattern_name: "Menu Engineering",
      when_to_apply: "When average check < 250 or food cost > 35%",
      typical_steps: [
        "Analyze each item: margin, popularity, preparation time",
        "Remove low-margin, low-volume items",
        "Increase prices on high-demand, high-margin items",
        "Feature high-margin items in marketing",
      ],
      expected_timeline: "2-4 weeks to see impact",
      success_metrics: ["Food cost to 30-32%", "Check average +10%"],
    },
  ],

  benchmark_notes: "Restaurant margins are thin; benchmarks by cuisine type and location vary significantly.",
  applicable_benchmarks: [
    "Food cost benchmark: 28-35% of revenue",
    "Labour cost benchmark: 28-35% of revenue",
    "Combined food+labour should be 56-65% max",
  ],
  caveats: [
    "Location and rent significantly impact profitability",
    "Seasonality (holidays, weather) affects traffic",
    "Cuisine type affects cost structure (fine dining higher margins)",
  ],
};

const LAUNDRY: KPIProfile = {
  industry_type: "laundry",
  display_name: "Laundry / Dry Cleaning",
  description: "Garment cleaning services with delivery or pickup options.",

  core_kpis: [
    {
      kpi_name: "Kg/Pieces per Day",
      measurement_unit: "kg or pieces",
      calculation_method: "Total garments processed / day",
      frequency: "daily",
      why_matters: "Drives utilization and capacity planning",
    },
    {
      kpi_name: "Delivery Cost per Order",
      measurement_unit: "₹",
      calculation_method: "Total delivery cost / number of orders",
      frequency: "weekly",
      why_matters: "In high-delivery businesses, can exceed profit margin",
    },
    {
      kpi_name: "Chemical Cost per Kg",
      measurement_unit: "₹/kg",
      calculation_method: "Total chemical cost / kg processed",
      frequency: "monthly",
      why_matters: "Indicates efficiency and economies of scale",
    },
    {
      kpi_name: "Repeat Customer Rate",
      measurement_unit: "%",
      calculation_method: "Repeat orders / total orders",
      frequency: "monthly",
      why_matters: "Drives economics by reducing customer acquisition cost",
    },
    {
      kpi_name: "Machine Utilization",
      measurement_unit: "%",
      calculation_method: "Operating hours / available hours",
      frequency: "weekly",
      why_matters: "Below 50% = idle capacity; above 85% = bottleneck",
    },
  ],

  common_failure_modes: [
    {
      failure_name: "Delivery Cost Squeeze",
      symptoms: ["Delivery cost > 20% of order value", "Margins compressed despite revenue growth"],
      typical_root_causes: ["Dispersed customer base", "Inefficient routing", "Low AOV"],
      financial_impact: "Delivery becomes unprofitable; order economics fail",
      timeline_if_unchecked: "Ongoing with each delivery",
    },
    {
      failure_name: "Quality Issues",
      symptoms: ["Customer complaints about shrinkage or damage", "Churn increasing"],
      typical_root_causes: ["Rushed processing", "Inadequate chemicals", "Staff training gaps"],
      financial_impact: "Repeat rates drop 5-10%; replacement costs rise",
      timeline_if_unchecked: "Reputation damage in 2-3 months",
    },
  ],

  critical_ratios: [
    {
      ratio_name: "Gross Margin",
      numerator: "Revenue - chemicals - delivery - labour",
      denominator: "Revenue",
      healthy_range: { min: 0.3, max: 0.5 },
      unit: "percentage",
      why_critical: "Below 30%, cannot cover rent and equipment",
    },
    {
      ratio_name: "Delivery Cost Ratio",
      numerator: "Delivery cost",
      denominator: "Order revenue",
      healthy_range: { min: 0.0, max: 0.2 },
      unit: "percentage",
      why_critical: "Above 20% makes orders unprofitable",
    },
  ],

  required_data_sources: [
    "Orders by customer with delivery flag and distance",
    "Daily kg/pieces processed",
    "Chemical purchases and usage",
    "Delivery vendor costs",
    "Customer retention data",
    "Machine operating hours",
  ],

  minimum_data_points_for_diagnosis: [
    "30+ days of order data with delivery costs",
    "Customer repeat purchase history for 3+ months",
    "Chemical inventory for 2+ months",
    "Machine utilization logs for 2+ weeks",
  ],

  action_patterns: [
    {
      pattern_name: "Delivery Model Optimization",
      when_to_apply: "When delivery cost > 15% of order value or customer density low",
      typical_steps: [
        "Segment customers by geography",
        "Test no-delivery option or pickup-based model",
        "Implement batch delivery for concentrated areas",
        "Partner with logistics vs. in-house delivery",
      ],
      expected_timeline: "4-6 weeks to test and measure",
      success_metrics: ["Delivery cost < 15% of order", "Repeat rate > 60%"],
    },
  ],

  benchmark_notes: "Laundry economics depend heavily on delivery model. Pickup-only vs. delivery-heavy have different profiles.",
  applicable_benchmarks: [
    "Chemical cost: 5-10% of revenue for efficient operations",
    "Delivery cost: 10-15% of revenue if included in order price",
    "Labour: 30-40% of revenue",
  ],
  caveats: [
    "Geography determines delivery feasibility",
    "Seasonal demand (weddings, holidays) affects utilization",
    "Customer retention critical since acquisition cost high",
  ],
};

const HOUSEKEEPING: KPIProfile = {
  industry_type: "housekeeping",
  display_name: "Housekeeping / Cleaning Services",
  description:
    "Residential or commercial cleaning services where staff are dispatched to client sites; economics are labour- and capacity-bound.",

  core_kpis: [
    {
      kpi_name: "Jobs per Cleaner per Day",
      measurement_unit: "jobs",
      calculation_method: "Completed jobs / active cleaners / working days",
      frequency: "daily",
      why_matters: "Primary throughput driver; too low means idle paid staff, too high risks quality",
    },
    {
      kpi_name: "Staff Utilization",
      measurement_unit: "%",
      calculation_method: "Billable on-site hours / paid hours",
      frequency: "weekly",
      why_matters: "Below 60% = paying for idle/travel time; above 90% = no slack for sickness or churn",
    },
    {
      kpi_name: "Travel Time Ratio",
      measurement_unit: "%",
      calculation_method: "Travel hours / total paid hours",
      frequency: "weekly",
      why_matters: "Travel is unbillable cost; dispersed jobs erode margin like delivery cost in laundry",
    },
    {
      kpi_name: "Revenue per Cleaner-Hour",
      measurement_unit: "₹/hour",
      calculation_method: "Service revenue / total cleaner hours",
      frequency: "monthly",
      why_matters: "Core unit economics; must exceed fully-loaded wage + travel + overhead per hour",
    },
    {
      kpi_name: "Rework / Complaint Rate",
      measurement_unit: "%",
      calculation_method: "Jobs requiring re-clean or refund / total jobs",
      frequency: "monthly",
      why_matters: "Rework consumes capacity twice and drives churn in a referral-driven business",
    },
    {
      kpi_name: "Client Retention Rate",
      measurement_unit: "%",
      calculation_method: "Recurring clients retained / clients at period start",
      frequency: "monthly",
      why_matters: "Recurring contracts stabilise capacity planning and reduce acquisition cost",
    },
  ],

  common_failure_modes: [
    {
      failure_name: "Staff Capacity Bottleneck",
      symptoms: [
        "Turning away jobs / long booking lead times",
        "Owner or supervisor covering shifts personally",
        "Overtime rising while new bookings stall",
      ],
      typical_root_causes: [
        "Under-hiring relative to demand",
        "High cleaner churn / absenteeism",
        "Poor scheduling and route clustering",
      ],
      financial_impact: "Revenue capped by headcount; growth blocked and existing staff burn out",
      timeline_if_unchecked: "Lost bookings weekly; churn compounds within 1-2 months",
    },
    {
      failure_name: "Quality / Rework Spiral",
      symptoms: ["Rising complaints and re-cleans", "Client cancellations after first job"],
      typical_root_causes: ["Rushed jobs to hit capacity", "Inadequate training", "No checklist/QA"],
      financial_impact: "Rework consumes capacity twice; referral pipeline dries up",
      timeline_if_unchecked: "Reputation and retention decline in 2-3 months",
    },
  ],

  critical_ratios: [
    {
      ratio_name: "Gross Margin",
      numerator: "Revenue - cleaner wages - travel - supplies",
      denominator: "Revenue",
      healthy_range: { min: 0.25, max: 0.45 },
      unit: "percentage",
      why_critical: "Labour-heavy; below 25% cannot cover supervision, admin and overhead",
    },
    {
      ratio_name: "Staff Utilization",
      numerator: "Billable on-site hours",
      denominator: "Paid hours",
      healthy_range: { min: 0.6, max: 0.85 },
      unit: "percentage",
      why_critical: "Below 60% bleeds idle wage cost; above 85% leaves no resilience for absence",
    },
    {
      ratio_name: "Travel Time Ratio",
      numerator: "Travel hours",
      denominator: "Total paid hours",
      healthy_range: { min: 0.0, max: 0.2 },
      unit: "percentage",
      why_critical: "Above 20% means routing inefficiency is eating margin",
    },
  ],

  required_data_sources: [
    "Jobs by client with location, duration and assigned cleaner",
    "Cleaner roster with paid vs billable hours",
    "Wage and overtime records",
    "Travel/transport costs or mileage",
    "Supplies cost",
    "Complaint / re-clean log",
    "Client contract and retention data",
  ],

  minimum_data_points_for_diagnosis: [
    "30+ days of job data with durations and assigned cleaners",
    "Roster with paid vs billable hours for 2+ weeks",
    "Wage records for 1+ month",
    "Complaint/re-clean log for 2+ months",
  ],

  action_patterns: [
    {
      pattern_name: "Capacity & Scheduling Optimization",
      when_to_apply: "When staff utilization > 85% with lost bookings, or travel ratio > 20%",
      typical_steps: [
        "Cluster jobs geographically to cut travel time",
        "Forecast demand and pre-hire/cross-train before peak",
        "Introduce a QA checklist to cut rework that wastes capacity",
        "Tier recurring contracts to smooth scheduling",
      ],
      expected_timeline: "4-6 weeks to test and measure",
      success_metrics: ["Utilization 60-85%", "Travel ratio < 15%", "Rework rate < 5%"],
    },
  ],

  benchmark_notes:
    "Housekeeping economics are dominated by labour and travel; capacity (headcount × utilization) is the binding constraint, analogous to machine capacity in laundry but human and churn-prone.",
  applicable_benchmarks: [
    "Cleaner wages: 45-60% of revenue",
    "Travel: under 15% of paid hours for clustered routes",
    "Supplies: 5-10% of revenue",
  ],
  caveats: [
    "Capacity is human and churn-sensitive; staffing buffers matter",
    "Seasonality (spring cleaning, holidays, move-outs) shifts demand",
    "Trust and reliability drive retention in a referral-led market",
  ],
};

// --- Profile Registry ---

export const KPI_PROFILES: Record<string, KPIProfile> = {
  local_service: LOCAL_SERVICE_BUSINESS,
  saas: SAAS,
  restaurant: RESTAURANT,
  laundry: LAUNDRY,
  housekeeping: HOUSEKEEPING,
};

/**
 * Get KPI profile by industry type.
 */
export function getKPIProfile(industryType: string): KPIProfile | null {
  return KPI_PROFILES[industryType.toLowerCase()] || null;
}

/**
 * List all available industry profiles.
 */
export function listAvailableProfiles(): Array<{ id: string; name: string }> {
  return Object.entries(KPI_PROFILES).map(([id, profile]) => ({
    id,
    name: profile.display_name,
  }));
}

/**
 * Check if industry type has a profile defined.
 */
export function hasProfile(industryType: string): boolean {
  return industryType.toLowerCase() in KPI_PROFILES;
}
