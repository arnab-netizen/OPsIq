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
