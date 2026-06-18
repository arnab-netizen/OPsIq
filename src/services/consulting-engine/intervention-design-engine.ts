import type { RootCause, Intervention } from "@/domain/consulting-engine/types";
import { InterventionClass } from "@/domain/consulting-engine/types";
import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Intervention Design Engine: Generates specific, actionable interventions
 * from root cause diagnosis.
 *
 * Every intervention must include:
 * - objective
 * - whyThisNow
 * - ownerRole
 * - steps
 * - estimatedCostBand
 * - expectedImpact
 * - successMetrics
 * - failureRisks
 * - fallbackPlan
 * - evidenceBasis
 *
 * Deterministic: pattern-based generation.
 */

interface InterventionTemplate {
  rootCauseKeyword: string;
  generateInterventions: (diagnosis: RootCause) => Intervention[];
}

const interventionTemplates: InterventionTemplate[] = [
  {
    rootCauseKeyword: "operational_bottleneck",
    generateInterventions: (diagnosis) => [
      // Containment: Quick buffer to reduce impact
      {
        id: uuidv4(),
        title: "Implement waitlist system to manage demand",
        class: InterventionClass.CONTAINMENT,
        objective:
          "Reduce customer frustration by setting expectations and freeing capacity for retention",
        rationale:
          "While turnaround time remains high, a waitlist prevents customer abandonment",
        whyThisNow:
          "Immediate relief for customer experience while longer-term capacity fix is designed",
        ownerRole: "operations_lead",
        steps: [
          {
            sequence: 1,
            title: "Design waitlist communication template",
            description:
              "Create customer communication explaining wait time and providing estimated completion date",
            ownerRole: "operations_lead",
            estimatedDays: 2,
            successCriteria:
              "Template tested with 3 customers, feedback incorporated",
          },
          {
            sequence: 2,
            title: "Implement waitlist tracking system",
            description:
              "Use spreadsheet or simple tool to track order position and manage customer expectations",
            ownerRole: "operations_lead",
            estimatedDays: 3,
            successCriteria:
              "All customer orders tracked, completion estimates accurate within 10%",
          },
          {
            sequence: 3,
            title: "Monitor customer satisfaction weekly",
            description:
              "Collect feedback on waitlist experience via follow-up call or survey",
            ownerRole: "operations_lead",
            estimatedDays: 1,
            successCriteria:
              "Satisfaction score improves to 7+/10, repeat customer inquiry rate increases",
          },
        ],
        estimatedCostBand: "MINIMAL",
        expectedImpactOnRevenue: "MINOR",
        successMetrics: [
          "Repeat customer rate increases by 15%",
          "Complaint rate drops by 25%",
          "Customer satisfaction score improves",
        ],
        failureRisks: [
          "Customers may still defect to competitors even with better communication",
          "Waitlist may discourage new customer acquisition",
        ],
        fallbackPlan:
          "Remove waitlist and implement expedited service tier at premium pricing",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 6,
        priorityScore: 0,
      },

      // Stabilization: Address root cause directly (capacity)
      {
        id: uuidv4(),
        title: "Diagnose turnaround time bottleneck",
        class: InterventionClass.STABILIZATION,
        objective:
          "Identify specific cause of high turnaround (equipment, labor, process) to guide intervention",
        rationale:
          "Without diagnosis, capacity solution will be misaligned and costly",
        whyThisNow:
          "Prerequisite for any structural capacity improvement. Can run in parallel with Containment",
        ownerRole: "consultant",
        steps: [
          {
            sequence: 1,
            title: "Time study: Map current process end-to-end",
            description:
              "Observe and document each step in the service delivery process with time stamps",
            ownerRole: "consultant",
            estimatedDays: 3,
            successCriteria:
              "Process map complete, bottleneck identified (where time accumulates)",
          },
          {
            sequence: 2,
            title: "Interview operations team on constraints",
            description:
              "Ask what limits speed at each step: equipment capacity, labor availability, process design",
            ownerRole: "consultant",
            estimatedDays: 2,
            successCriteria:
              "Team consensus on 1-2 primary constraints preventing speed",
          },
          {
            sequence: 3,
            title: "Create capability roadmap",
            description:
              "Design solution (equipment upgrade, process redesign, staffing, or hybrid)",
            ownerRole: "operations_lead",
            estimatedDays: 3,
            dependsOn: [1, 2],
            successCriteria:
              "Roadmap costed and sequenced, board/owner approval obtained",
          },
        ],
        estimatedCostBand: "LOW",
        expectedImpactOnRevenue: "SIGNIFICANT",
        successMetrics: [
          "Root cause clearly identified (>80% confidence)",
          "Capacity improvement solution designed and costed",
          "Turnaround time reduction target defined",
        ],
        failureRisks: [
          "Multiple bottlenecks discovered requiring simultaneous fixes",
          "Cost of solution exceeds budget",
        ],
        fallbackPlan:
          "Prioritize highest-ROI bottleneck only, phase other fixes over 6 months",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 8,
        priorityScore: 0,
      },

      // Structural Repair: Implementation of capacity solution
      {
        id: uuidv4(),
        title: "Implement capacity improvement solution",
        class: InterventionClass.STRUCTURAL_REPAIR,
        objective:
          "Increase service delivery speed to competitive range (diagnosis dependent)",
        rationale:
          "Removing the turnaround bottleneck unlocks customer retention and revenue growth",
        whyThisNow:
          "After root cause is diagnosed and solution is designed. May require capital approval",
        ownerRole: "owner",
        steps: [
          {
            sequence: 1,
            title: "Secure capital and/or budget approval",
            description:
              "Present business case to board or lender for investment in capacity solution",
            ownerRole: "owner",
            estimatedDays: 5,
            successCriteria: "Funding secured, timeline approved",
          },
          {
            sequence: 2,
            title: "Execute equipment upgrade or process redesign",
            description:
              "Based on diagnosis, implement the designed solution (procurement, install, training)",
            ownerRole: "operations_lead",
            estimatedDays: 21,
            dependsOn: [1],
            successCriteria:
              "New equipment operational or new process in place and tested",
          },
          {
            sequence: 3,
            title: "Verify turnaround time improvement",
            description:
              "Measure actual turnaround on 20 consecutive orders vs baseline",
            ownerRole: "operations_lead",
            estimatedDays: 5,
            dependsOn: [2],
            successCriteria:
              "Turnaround time reduced to target (e.g., 50% reduction), consistency verified",
          },
        ],
        estimatedCostBand: "MEDIUM",
        expectedImpactOnRevenue: "TRANSFORMATIVE",
        successMetrics: [
          "Turnaround time meets competitive benchmark",
          "Repeat customer rate increases to >40%",
          "Revenue per customer increases (higher frequency)",
          "Market share increases vs competitors",
        ],
        failureRisks: [
          "Implementation delays push timeline",
          "New capacity utilization is lower than projected",
          "Quality issues emerge with new process",
          "Team resistance to new process/equipment",
        ],
        fallbackPlan:
          "Revert to manual process, hire temp labor to increase capacity, revisit capital investment in 6 months",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 31,
        priorityScore: 0,
      },
    ],
  },
  {
    rootCauseKeyword: "quality_control",
    generateInterventions: (diagnosis) => [
      // Containment: Prevent further damage
      {
        id: uuidv4(),
        title: "Implement complaint tracking and customer outreach",
        class: InterventionClass.CONTAINMENT,
        objective:
          "Capture complaint data to identify patterns and immediately contact affected customers",
        rationale:
          "Shows customers concerns are taken seriously; generates data for root cause analysis",
        whyThisNow:
          "Immediate action to rebuild trust and prevent repeat customer loss",
        ownerRole: "operations_lead",
        steps: [
          {
            sequence: 1,
            title: "Create complaint log template",
            description:
              "Record what went wrong, customer name, order details, resolution offered",
            ownerRole: "operations_lead",
            estimatedDays: 1,
            successCriteria: "Template reviewed and approved by team",
          },
          {
            sequence: 2,
            title: "Implement follow-up protocol",
            description:
              "All complaints receive same-day acknowledgment and manager review",
            ownerRole: "operations_lead",
            estimatedDays: 2,
            successCriteria:
              "Complaints reviewed daily, customers contacted within 24 hours",
          },
          {
            sequence: 3,
            title: "Analyze complaint patterns monthly",
            description:
              "Group complaints by cause, identify most common issue, propose countermeasure",
            ownerRole: "operations_lead",
            estimatedDays: 2,
            successCriteria:
              "Monthly pattern report generated, top 3 issues identified",
          },
        ],
        estimatedCostBand: "MINIMAL",
        expectedImpactOnRevenue: "MINOR",
        successMetrics: [
          "All complaints logged and analyzed",
          "Customer follow-up response time <24 hours",
          "Top complaint sources identified",
        ],
        failureRisks: [
          "Complaint tracking abandoned after initial month",
          "Follow-up feels insincere without real resolution",
        ],
        fallbackPlan:
          "Use complaints to justify investment in full QA program or third-party quality auditing",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 5,
        priorityScore: 0,
      },

      // Stabilization: Build basic QA capability
      {
        id: uuidv4(),
        title: "Implement quality checkpoints before customer delivery",
        class: InterventionClass.STABILIZATION,
        objective:
          "Establish QA checkpoints to prevent defect shipment and catch issues early",
        rationale:
          "Reduces complaint rate by catching issues before customer, improves team quality awareness",
        whyThisNow:
          "Foundational quality practice that can begin immediately without capital",
        ownerRole: "operations_lead",
        steps: [
          {
            sequence: 1,
            title: "Define quality standard and checklist",
            description:
              "Based on complaint patterns, define what 'good quality' means and create inspection checklist",
            ownerRole: "operations_lead",
            estimatedDays: 2,
            successCriteria: "Checklist covers 80% of historical complaint causes",
          },
          {
            sequence: 2,
            title: "Assign quality checkpoint responsibility",
            description:
              "Designate team member or create rotation for pre-shipment quality check",
            ownerRole: "operations_lead",
            estimatedDays: 1,
            successCriteria: "Team trained on checklist, ownership clear",
          },
          {
            sequence: 3,
            title: "Track defects caught vs. released",
            description:
              "For 4 weeks, log defects caught at checkpoint vs shipped (escaped) defects",
            ownerRole: "operations_lead",
            estimatedDays: 28,
            successCriteria:
              ">85% of defects caught at checkpoint, escaped defect rate <5%",
          },
        ],
        estimatedCostBand: "MINIMAL",
        expectedImpactOnRevenue: "MINOR",
        successMetrics: [
          "Quality checklist implemented",
          "Defect detection rate >85%",
          "Complaint rate drops by 30%",
        ],
        failureRisks: [
          "Checklist too complex, team skips steps",
          "QA checker lacks authority to stop shipment",
          "No time allocated for quality check",
        ],
        fallbackPlan:
          "Simplify checklist to 3 critical items only, assign most experienced team member as QA owner",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 31,
        priorityScore: 0,
      },
    ],
  },
  {
    rootCauseKeyword: "retention_erosion",
    generateInterventions: (diagnosis) => [
      {
        id: uuidv4(),
        title: "Design and launch customer loyalty program",
        class: InterventionClass.RESILIENCE_PROTECTION,
        objective:
          "Create incentive for repeat business and data capture for customer relationship management",
        rationale:
          "Systematic retention mechanism replaces transactional, one-time customer model",
        whyThisNow:
          "Revenue is declining due to low repeat rate; immediate action to rebuild recurring revenue",
        ownerRole: "owner",
        steps: [
          {
            sequence: 1,
            title: "Design loyalty program structure",
            description:
              "Points-based or tiered program; benchmark against industry, competitor research",
            ownerRole: "owner",
            estimatedDays: 3,
            successCriteria: "Program design reviewed, discount budget allocated",
          },
          {
            sequence: 2,
            title: "Implement simple tracking system",
            description:
              "Use email or phone-based customer identification to track repeat visits",
            ownerRole: "operations_lead",
            estimatedDays: 2,
            successCriteria:
              "System tested, staff trained, can enroll customer in <30 seconds",
          },
          {
            sequence: 3,
            title: "Launch to current customer base",
            description:
              "Send email or in-person invitation to 50+ previous customers; track enrollment rate",
            ownerRole: "operations_lead",
            estimatedDays: 2,
            successCriteria:
              "Email sent to prior customers, enrollment rate >20%, feedback gathered",
          },
        ],
        estimatedCostBand: "LOW",
        expectedImpactOnRevenue: "SIGNIFICANT",
        successMetrics: [
          "Loyalty program enrollment >50% of customer base",
          "Repeat customer rate increases to >35%",
          "Customer lifetime value increases by 40%",
        ],
        failureRisks: [
          "Program too complex, low enrollment",
          "Discount cost erodes margins",
          "Customers engage for discount only, churn when offer expires",
        ],
        fallbackPlan:
          "Pivot to referral program (existing customers get discount for bringing new customers)",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 7,
        priorityScore: 0,
      },
    ],
  },
  // ─── E1: financial-health interventions (all low-cost, reversible, no capex/
  // hiring/discount/irreversible actions) ──────────────────────────────────
  {
    rootCauseKeyword: "cash_liquidity",
    generateInterventions: (diagnosis) => [
      {
        id: uuidv4(),
        title: "Build a 13-week cash flow forecast and freeze discretionary spend",
        class: InterventionClass.CONTAINMENT,
        objective: "Establish visibility and stop avoidable cash outflow before any structural action",
        rationale: "A short-horizon cash forecast plus a discretionary-spend freeze are low-cost, reversible, and buy decision time without committing capital.",
        whyThisNow: "Liquidity pressure requires immediate visibility before any financing or cost decision",
        ownerRole: "finance_lead",
        steps: [
          { sequence: 1, title: "Build 13-week cash flow forecast", description: "List weekly expected inflows and committed outflows for the next 13 weeks.", ownerRole: "finance_lead", estimatedDays: 3, successCriteria: "Forecast shows weekly net cash and the first projected shortfall week" },
          { sequence: 2, title: "Freeze discretionary spend", description: "Pause non-essential, reversible spend categories; do not touch payroll or contractual obligations.", ownerRole: "owner", estimatedDays: 2, dependsOn: [1], successCriteria: "Discretionary categories identified and paused" },
        ],
        estimatedCostBand: "MINIMAL",
        expectedImpactOnRevenue: "NONE",
        successMetrics: ["13-week forecast complete", "Discretionary burn reduced"],
        failureRisks: ["Forecast inputs incomplete", "Shortfall arrives sooner than modeled"],
        fallbackPlan: "Escalate to owner/board for financing options review (no action taken without owner approval)",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 5,
        priorityScore: 0,
      },
    ],
  },
  {
    rootCauseKeyword: "unit_economics",
    generateInterventions: (diagnosis) => [
      {
        id: uuidv4(),
        title: "Rebuild cohort-level contribution margin before scaling spend",
        class: InterventionClass.STABILIZATION,
        objective: "Establish true per-unit/per-customer economics so no growth spend is committed on negative margin",
        rationale: "Reconstructing contribution margin and CAC payback from existing data is low-cost and reversible, and prevents loss-amplifying scaling.",
        whyThisNow: "Unit economics appear negative; scaling before confirming would deepen losses",
        ownerRole: "finance_lead",
        steps: [
          { sequence: 1, title: "Reconstruct unit economics", description: "Compute per-unit revenue, variable cost, contribution margin, and CAC payback from existing records.", ownerRole: "finance_lead", estimatedDays: 4, successCriteria: "Contribution margin and CAC payback quantified per cohort" },
          { sequence: 2, title: "Freeze incremental growth spend", description: "Hold incremental acquisition/discount spend until economics are confirmed (reversible).", ownerRole: "owner", estimatedDays: 1, dependsOn: [1], successCriteria: "No new growth spend committed pending review" },
        ],
        estimatedCostBand: "LOW",
        expectedImpactOnRevenue: "NONE",
        successMetrics: ["Cohort contribution margin computed", "CAC payback quantified"],
        failureRisks: ["Cost allocation data incomplete"],
        fallbackPlan: "Run a small reversible pricing/cost test on one cohort before any broad change",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 5,
        priorityScore: 0,
      },
    ],
  },
  {
    rootCauseKeyword: "margin_erosion",
    generateInterventions: (diagnosis) => [
      {
        id: uuidv4(),
        title: "Decompose cost drivers and identify margin-recovery levers",
        class: InterventionClass.STABILIZATION,
        objective: "Locate the specific drivers of margin decline before any pricing or cost action",
        rationale: "A cost-driver decomposition is analysis-only, low-cost, and reversible; it avoids blanket price hikes or cuts that could harm volume or quality.",
        whyThisNow: "Margin is eroding; targeted diagnosis must precede any price/cost change",
        ownerRole: "finance_lead",
        steps: [
          { sequence: 1, title: "Decompose margin by driver", description: "Split margin change into COGS, labor, overhead, and price/mix contributions over recent periods.", ownerRole: "finance_lead", estimatedDays: 4, successCriteria: "Top 3 margin-erosion drivers quantified" },
          { sequence: 2, title: "Shortlist reversible recovery levers", description: "Identify low-risk levers (supplier terms, waste reduction, mix) — no blanket price change.", ownerRole: "owner", estimatedDays: 2, dependsOn: [1], successCriteria: "Reversible levers shortlisted with expected margin impact" },
        ],
        estimatedCostBand: "LOW",
        expectedImpactOnRevenue: "MINOR",
        successMetrics: ["Margin bridge by driver complete", "Reversible levers shortlisted"],
        failureRisks: ["Cost data not granular enough to attribute drivers"],
        fallbackPlan: "Pilot one reversible lever and measure before broader rollout",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 6,
        priorityScore: 0,
      },
    ],
  },
  // ─── E2 slice 1 templates (verify-first, low-cost, reversible, owner-safe) ──
  {
    rootCauseKeyword: "debt_solvency",
    generateInterventions: (diagnosis) => [
      {
        id: uuidv4(),
        title: "Build a covenant and debt-service model and a proactive lender engagement plan",
        class: InterventionClass.STABILIZATION,
        objective: "Map covenant headroom, debt service, and maturities before any financing or operating move",
        rationale: "A covenant/debt-service model and lender engagement are analysis-only and reversible; they avoid taking on more debt to paper over a breach.",
        whyThisNow: "The pressure is balance-sheet structural; the debt position must be modelled before any operating cut or new borrowing",
        ownerRole: "finance_lead",
        steps: [
          { sequence: 1, title: "Model covenants, debt service, and maturities", description: "Build a covenant and debt-service model against the next test dates and the maturity profile.", ownerRole: "finance_lead", estimatedDays: 5, successCriteria: "Covenant headroom and debt-service coverage modelled to the next test date" },
          { sequence: 2, title: "Prepare a proactive lender engagement plan", description: "Draft a lender engagement / waiver-or-refinancing plan before any covenant test is breached.", ownerRole: "owner", estimatedDays: 4, dependsOn: [1], successCriteria: "Lender engagement plan ready ahead of the test date" },
        ],
        estimatedCostBand: "LOW",
        expectedImpactOnRevenue: "MINOR",
        successMetrics: ["Covenant/debt-service model complete", "Lender engagement plan ready"],
        failureRisks: ["Lender appetite for a waiver is uncertain"],
        fallbackPlan: "Engage a restructuring advisor if lenders decline a waiver",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 9,
        priorityScore: 0,
      },
    ],
  },
  {
    rootCauseKeyword: "working_capital",
    generateInterventions: (diagnosis) => [
      {
        id: uuidv4(),
        title: "Map the cash-conversion cycle and build a receivables segmentation and collections plan",
        class: InterventionClass.STABILIZATION,
        objective: "Locate where cash is trapped in receivables/payables before any financing or factoring",
        rationale: "Cash-conversion-cycle mapping and a collections plan are low-cost and reversible; they avoid factoring all receivables at punitive rates before the cycle is understood.",
        whyThisNow: "Cash is trapped in working capital; the conversion cycle must be mapped before any financing decision",
        ownerRole: "finance_lead",
        steps: [
          { sequence: 1, title: "Map the cash-conversion cycle", description: "Quantify DSO, DPO, and inventory days into a cash-conversion-cycle map by customer/supplier segment.", ownerRole: "finance_lead", estimatedDays: 4, successCriteria: "Cash-conversion cycle mapped with the largest receivables drivers identified" },
          { sequence: 2, title: "Build a receivables segmentation and collections plan", description: "Segment receivables and stand up a prioritized collections plan for the slowest-paying accounts.", ownerRole: "owner", estimatedDays: 4, dependsOn: [1], successCriteria: "Collections plan live for the top overdue receivables" },
        ],
        estimatedCostBand: "LOW",
        expectedImpactOnRevenue: "MINOR",
        successMetrics: ["Cash-conversion cycle mapped", "Collections plan live"],
        failureRisks: ["Large customers may resist tighter terms"],
        fallbackPlan: "Negotiate selective, non-punitive financing only after the cycle is mapped",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 8,
        priorityScore: 0,
      },
    ],
  },
  {
    rootCauseKeyword: "pricing",
    generateInterventions: (diagnosis) => [
      {
        id: uuidv4(),
        title: "Run a price-realization and discount-leakage analysis and a win/loss price-sensitivity review",
        class: InterventionClass.STABILIZATION,
        objective: "Quantify the price-realization gap and discount leakage before any price change",
        rationale: "A price-realization and discount-leakage analysis is analysis-only and reversible; it avoids an across-the-board price increase without elasticity data.",
        whyThisNow: "The gap is price realization, not cost; the leakage must be measured before any pricing move",
        ownerRole: "finance_lead",
        steps: [
          { sequence: 1, title: "Analyze price realization and discount leakage", description: "Measure realized vs list price and discount leakage by deal/rep against comparable competitors.", ownerRole: "finance_lead", estimatedDays: 4, successCriteria: "Price-realization gap and discount leakage quantified by segment" },
          { sequence: 2, title: "Run a win/loss price-sensitivity review", description: "Review win/loss and willingness-to-pay to size reversible price/governance levers — no blanket hike.", ownerRole: "owner", estimatedDays: 3, dependsOn: [1], successCriteria: "Reversible pricing-governance levers shortlisted with elasticity evidence" },
        ],
        estimatedCostBand: "LOW",
        expectedImpactOnRevenue: "MINOR",
        successMetrics: ["Price-realization / leakage analysis complete", "Win/loss price-sensitivity reviewed"],
        failureRisks: ["Elasticity data may be thin in some segments"],
        fallbackPlan: "Pilot a governed discount-approval policy before any list-price change",
        evidenceBasis: diagnosis.evidenceIds,
        estimatedTotalDays: 7,
        priorityScore: 0,
      },
    ],
  },
];

export function designInterventions(
  diagnosis: RootCause,
  evidence: EvidenceItem[]
): Intervention[] {
  const interventions: Intervention[] = [];

  // Find matching template
  for (const template of interventionTemplates) {
    if (
      diagnosis.type
        .toLowerCase()
        .includes(template.rootCauseKeyword)
    ) {
      interventions.push(
        ...template.generateInterventions(diagnosis)
      );
      break;
    }
  }

  // If no specific template matched, return generic diagnosis-driven interventions
  if (interventions.length === 0) {
    interventions.push(
      createGenericDiagnosticIntervention(diagnosis, evidence)
    );
  }

  return interventions;
}

function createGenericDiagnosticIntervention(
  diagnosis: RootCause,
  evidence: EvidenceItem[]
): Intervention {
  return {
    id: uuidv4(),
    title: "Further root cause investigation required",
    class: InterventionClass.STABILIZATION,
    objective: "Gather additional evidence to refine diagnosis",
    rationale: diagnosis.mechanismDescription,
    whyThisNow:
      "Current evidence does not match standard root cause patterns",
    ownerRole: "consultant",
    steps: [
      {
        sequence: 1,
        title: "Conduct deeper investigation",
        description:
          "Interview team, observe processes, review financial data to understand root cause mechanism",
        ownerRole: "consultant",
        estimatedDays: 5,
        successCriteria: "Additional evidence gathered on root cause factors",
      },
      {
        sequence: 2,
        title: "Refined diagnosis and intervention design",
        description:
          "Based on new evidence, design targeted interventions with higher confidence",
        ownerRole: "consultant",
        estimatedDays: 3,
        dependsOn: [1],
        successCriteria: "Revised diagnosis confidence level HIGH or better",
      },
    ],
    estimatedCostBand: "LOW",
    expectedImpactOnRevenue: "MINOR",
    successMetrics: [
      "Root cause confidence increases to HIGH",
      "Interventions designed with >80% confidence",
    ],
    failureRisks: ["Investigation reveals multiple root causes requiring different solutions"],
    fallbackPlan:
      "Implement parallel low-risk interventions while continuing investigation",
    evidenceBasis: diagnosis.evidenceIds,
    estimatedTotalDays: 8,
    priorityScore: 0,
  };
}

export function formatInterventions(interventions: Intervention[]): string {
  const lines: string[] = [];

  lines.push(`${interventions.length} intervention(s) designed:\n`);

  for (const intervention of interventions) {
    lines.push(`## ${intervention.title}`);
    lines.push(`Class: ${intervention.class}`);
    lines.push(`Owner: ${intervention.ownerRole}`);
    lines.push(`Duration: ${intervention.estimatedTotalDays} days`);
    lines.push(`Cost: ${intervention.estimatedCostBand}`);
    lines.push(`Expected Impact: ${intervention.expectedImpactOnRevenue}\n`);

    lines.push(`**Objective**: ${intervention.objective}`);
    lines.push(`**Why This Now**: ${intervention.whyThisNow}\n`);

    lines.push(`**Steps**:`);
    for (const step of intervention.steps) {
      lines.push(
        `  ${step.sequence}. [${step.estimatedDays}d] ${step.title}`
      );
      if (step.dependsOn) {
        lines.push(
          `     (depends on steps: ${step.dependsOn.join(", ")})`
        );
      }
    }

    lines.push(`\n**Success Metrics**:`);
    for (const metricDesc of intervention.successMetrics) {
      lines.push(`  - ${metricDesc}`);
    }

    lines.push(`\n**Risks & Fallback**:`);
    for (const risk of intervention.failureRisks) {
      lines.push(`  ⚠ ${risk}`);
    }
    lines.push(`  💡 ${intervention.fallbackPlan}\n`);
  }

  return lines.join("\n");
}
