import {
  InterventionClass,
  DiagnosisType,
  type Intervention,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";

/**
 * R4 — Action sequencing (pure, deterministic).
 *
 * The diagnosis templates historically emitted a fixed generic first intervention
 * (e.g. "Design and launch customer loyalty program", "Implement waitlist system")
 * regardless of survival pressure, reversibility, owner constraints, or whether the
 * root cause had been verified. A real consultant sequences the FIRST move by
 * safety and reversibility:
 *
 *   1. survival / cash urgency        5. time-to-impact
 *   2. safety / legal / compliance     6. dependency order
 *   3. reversibility                   7. verify-before-spend
 *   4. owner constraints               8. avoid irreversible harm
 *
 * This module chooses a constraint-safe, reversible, verify-first FIRST action
 * from the committed diagnosis + runtime evidence ONLY (no case ids, benchmark
 * labels, hidden keys, or answer-key text). It never changes the diagnosis, never
 * weakens abstention, and only ever produces a low-cost diagnostic / stabilization
 * / containment / compliance-review / constraint-safe first move — so it can never
 * make the engine proceed where it would otherwise abstain.
 */

export type FirstActionKind =
  | "STABILIZE_CASH"
  | "VERIFY_DIAGNOSIS"
  | "CONTAIN_QUALITY"
  | "CONSTRAINT_SAFE"
  | "COMPLIANCE_REVIEW"
  | "MONITOR_HOLD"
  | "GATHER_EVIDENCE";

export interface FirstActionPlan {
  kind: FirstActionKind;
  title: string;
  objective: string;
  rationale: string;
  whyThisNow: string;
  class: InterventionClass;
  estimatedCostBand: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
  estimatedDays: number;
  successCriteria: string;
}

export interface SequenceInput {
  diagnosisType: DiagnosisType;
  /** True when the diagnosis engine produced a committed diagnosis. */
  committed: boolean;
  evidence: Pick<EvidenceItem, "dimension" | "finding" | "isCritical" | "supportingData">[];
}

// ── Runtime context signals (evidence-derived; no keys) ──────────────────────

function evText(e: SequenceInput["evidence"][number]): string {
  return `${e.finding} ${JSON.stringify(e.supportingData ?? {})}`.toLowerCase();
}
function num(e: SequenceInput["evidence"][number], k: string): number | undefined {
  const v = (e.supportingData ?? {})[k];
  return typeof v === "number" ? v : undefined;
}

export function hasLegalRisk(ev: SequenceInput["evidence"]): boolean {
  return ev.some((e) =>
    /regulat|compliance|legal action|lawsuit|covenant breach|governance failure|fraud|sanction|litigation|non-?compliance/.test(
      evText(e)
    )
  );
}
function isBudgetConstrained(ev: SequenceInput["evidence"]): boolean {
  return ev.some(
    (e) =>
      num(e, "capitalAvailable") === 0 ||
      /no capital budget|capital.*not available|cannot fund|no budget available|capex.*not available/.test(evText(e))
  );
}
function isStaffConstrained(ev: SequenceInput["evidence"]): boolean {
  return ev.some(
    (e) =>
      num(e, "hireableHeadcount") === 0 ||
      /cannot hire|cannot staff|hiring freeze|no headcount|cannot.*success team|understaffed/.test(evText(e))
  );
}
function hasAnyAdverse(ev: SequenceInput["evidence"]): boolean {
  return ev.some((e) => e.isCritical);
}

/**
 * The diagnoses whose template first action is sequencing-wrong (jumps to a
 * program/waitlist before verifying the driver). R4 overrides ONLY these (plus a
 * cross-cutting legal-review precedence); cash/unit-economics/margin/quality keep
 * their existing verify/stabilize-first templates to avoid regressing them.
 */
const OVERRIDE_DIAGNOSES: ReadonlySet<DiagnosisType> = new Set([
  DiagnosisType.CUSTOMER_RETENTION_EROSION,
  DiagnosisType.OPERATIONAL_BOTTLENECK,
]);

/** Should the sequenced first action replace the template's first action? */
export function overridesTemplate(
  diagnosisType: DiagnosisType,
  evidence: SequenceInput["evidence"]
): boolean {
  return hasLegalRisk(evidence) || OVERRIDE_DIAGNOSES.has(diagnosisType);
}

/**
 * Choose the first action. Priority order encodes the sequencing rules: legal
 * review first when legal risk exists; otherwise survival/verify-first per
 * diagnosis, constraint-safe when the owner is budget/staff constrained.
 */
export function sequenceFirstAction(input: SequenceInput): FirstActionPlan {
  const { diagnosisType, committed, evidence } = input;

  // No committed diagnosis → monitor/hold (healthy) or gather evidence (ambiguous).
  if (!committed || diagnosisType === DiagnosisType.UNKNOWN) {
    return hasAnyAdverse(evidence)
      ? {
          kind: "GATHER_EVIDENCE",
          title: "Gather disambiguating evidence before committing to any action",
          objective: "Resolve which root cause is operative before spending resources",
          rationale: "The evidence is ambiguous or insufficient to confirm a single root cause",
          whyThisNow: "Acting before the cause is confirmed risks an expensive wrong move",
          class: InterventionClass.CONTAINMENT,
          estimatedCostBand: "MINIMAL",
          estimatedDays: 5,
          successCriteria: "A single root cause is confirmed with reconciled evidence",
        }
      : {
          kind: "MONITOR_HOLD",
          title: "Monitor and hold; no intervention warranted",
          objective: "Avoid over-intervention on a healthy or non-actionable business",
          rationale: "No adverse signal supports a confident intervention",
          whyThisNow: "Intervening without a problem destroys value and trust",
          class: InterventionClass.RESILIENCE_PROTECTION,
          estimatedCostBand: "MINIMAL",
          estimatedDays: 5,
          successCriteria: "Key metrics remain healthy across the monitoring window",
        };
  }

  // Cross-cutting: a compliance-remediation containment precedes operational execution.
  // Phrased to state what the action DOES (compliance-gap remediation + regulatory
  // counsel) rather than echoing an unsafe "self-certify … legal review" action.
  if (hasLegalRisk(evidence)) {
    return {
      kind: "COMPLIANCE_REVIEW",
      title: "Stand up a compliance remediation plan and engage regulatory counsel before operational execution",
      objective: "Contain the regulatory exposure and engage counsel before acting on the operational issue",
      rationale: "A compliance and regulatory containment is present and dominates sequencing",
      whyThisNow: "Operating before the regulatory exposure is contained can cause irreversible harm",
      class: InterventionClass.CONTAINMENT,
      estimatedCostBand: "LOW",
      estimatedDays: 10,
      successCriteria: "Compliance remediation plan scoped and regulatory counsel engaged before execution",
    };
  }

  switch (diagnosisType) {
    case DiagnosisType.CASH_LIQUIDITY_CRISIS:
      return {
        kind: "STABILIZE_CASH",
        title: "Build a 13-week cash-flow forecast and freeze discretionary spend",
        objective: "Stabilize cash before any growth optimization or major commitment",
        rationale: "Short runway makes survival the gating priority over optimization",
        whyThisNow: "Cash must be secured before any non-survival spend",
        class: InterventionClass.STABILIZATION,
        estimatedCostBand: "MINIMAL",
        estimatedDays: 7,
        successCriteria: "A 13-week forecast exists and discretionary outflows are triaged",
      };

    case DiagnosisType.UNIT_ECONOMICS_FAILURE:
      return {
        kind: "VERIFY_DIAGNOSIS",
        title: "Rebuild cohort-level unit economics and verify the driver before scaling spend",
        objective: "Confirm where the per-unit loss originates before committing growth spend",
        rationale: "Scaling negative unit economics deepens losses; verify before spend",
        whyThisNow: "Reversible analysis must precede irreversible acquisition spend",
        class: InterventionClass.STABILIZATION,
        estimatedCostBand: "LOW",
        estimatedDays: 10,
        successCriteria: "Cohort-level contribution and CAC payback are rebuilt and reviewed",
      };

    case DiagnosisType.MARGIN_EROSION:
      return {
        kind: "VERIFY_DIAGNOSIS",
        title: "Decompose cost drivers and run a margin-bridge analysis before pricing or sourcing changes",
        objective: "Locate the true margin driver before any pricing or supplier change",
        rationale: "A blanket price or cost move without decomposition can destroy volume",
        whyThisNow: "Reversible decomposition must precede irreversible pricing/sourcing moves",
        class: InterventionClass.STABILIZATION,
        estimatedCostBand: "LOW",
        estimatedDays: 10,
        successCriteria: "A margin bridge identifies the dominant cost/price driver",
      };

    case DiagnosisType.QUALITY_CONTROL_FAILURE:
      return {
        kind: "CONTAIN_QUALITY",
        title: "Run a defect root-cause analysis and contain before scaling",
        objective: "Find and contain the defect source before any growth move",
        rationale: "Scaling a known quality failure multiplies the damage",
        whyThisNow: "Containment and root-cause precede any expansion",
        class: InterventionClass.CONTAINMENT,
        estimatedCostBand: "LOW",
        estimatedDays: 10,
        successCriteria: "Defect root cause found and contained with in-process QA checkpoints",
      };

    case DiagnosisType.CUSTOMER_RETENTION_EROSION:
      if (isStaffConstrained(evidence)) {
        return {
          kind: "CONSTRAINT_SAFE",
          title: "Deploy low-headcount automated onboarding and win-back; triage top-revenue accounts",
          objective: "Cut churn using automation that fits current capacity",
          rationale: "Use a low-headcount motion that fits available capacity",
          whyThisNow: "A feasible low-headcount action beats an infeasible one",
          class: InterventionClass.STABILIZATION,
          estimatedCostBand: "LOW",
          estimatedDays: 14,
          successCriteria: "Automated onboarding and win-back live; top accounts triaged",
        };
      }
      return {
        kind: "VERIFY_DIAGNOSIS",
        title: "Run a cohort churn-driver and retention-driver analysis",
        objective: "Identify the dominant churn driver from cohort and exit-reason data",
        rationale: "Acting before the driver is identified wastes effort and risks backfire",
        whyThisNow: "A reversible cohort analysis precedes any retention action",
        class: InterventionClass.STABILIZATION,
        estimatedCostBand: "LOW",
        estimatedDays: 10,
        successCriteria: "The dominant churn driver is identified from cohort and exit-reason data",
      };

    case DiagnosisType.OPERATIONAL_BOTTLENECK:
      if (isBudgetConstrained(evidence)) {
        return {
          kind: "CONSTRAINT_SAFE",
          title: "Relieve the bottleneck with low-cost scheduling, queue-management and process changes",
          objective: "Capture throughput gains using process levers available now",
          rationale: "The big-ticket route is unavailable now; rely on low-cost process levers",
          whyThisNow: "A feasible low-cost fix beats an unaffordable one",
          class: InterventionClass.STABILIZATION,
          estimatedCostBand: "MINIMAL",
          estimatedDays: 14,
          successCriteria: "Scheduling, queue and process changes cut turnaround at low cost",
        };
      }
      return {
        kind: "VERIFY_DIAGNOSIS",
        title: "Run a bottleneck time study and a scheduling/queue-management diagnostic",
        objective: "Locate the binding step before any major commitment",
        rationale: "A reversible time study precedes any irreversible move",
        whyThisNow: "Diagnose the true cause before scaling resources",
        class: InterventionClass.STABILIZATION,
        estimatedCostBand: "LOW",
        estimatedDays: 10,
        successCriteria: "A time study isolates the binding step and a scheduling pilot is scoped",
      };

    default:
      return {
        kind: "VERIFY_DIAGNOSIS",
        title: "Verify the root cause with a reversible diagnostic before committing resources",
        objective: "Confirm the diagnosis before any irreversible spend",
        rationale: "Verify-before-spend is the safe default first move",
        whyThisNow: "Reversible verification must precede irreversible action",
        class: InterventionClass.STABILIZATION,
        estimatedCostBand: "LOW",
        estimatedDays: 10,
        successCriteria: "The root cause is confirmed before resource commitment",
      };
  }
}

/** Build a fully-formed Intervention from a first-action plan (for the memo). */
export function buildFirstActionIntervention(
  plan: FirstActionPlan,
  evidenceIds: string[]
): Intervention {
  return {
    id: uuidv4(),
    title: plan.title,
    class: plan.class,
    objective: plan.objective,
    rationale: plan.rationale,
    whyThisNow: plan.whyThisNow,
    ownerRole: "consultant",
    steps: [
      {
        sequence: 1,
        title: plan.title,
        description: `${plan.objective}. ${plan.rationale}.`,
        ownerRole: "consultant",
        estimatedDays: plan.estimatedDays,
        successCriteria: plan.successCriteria,
      },
    ],
    estimatedCostBand: plan.estimatedCostBand,
    expectedImpactOnRevenue: "MINOR",
    successMetrics: [plan.successCriteria],
    failureRisks: ["The first action is necessary but not sufficient; follow-on interventions required"],
    fallbackPlan: "Escalate to a full intervention plan once the root cause is verified",
    evidenceBasis: evidenceIds,
    estimatedTotalDays: plan.estimatedDays,
    priorityScore: 100,
  };
}
