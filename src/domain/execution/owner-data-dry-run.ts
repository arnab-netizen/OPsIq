/**
 * Slice 26 — Real Owner-Data Dry Run Preparation (pure logic).
 *
 * The governed loop (Slices 6–25) is proven against synthetic data. Before any
 * supervised real-employee pilot, the owner must run a DRY RUN against their own
 * real business data. This module does NOT fabricate owner data — it defines the
 * exact import/input checklist the owner must satisfy and assesses readiness over
 * whatever real data is supplied, mapping every input to the four product
 * dimensions OpsIQ must always model:
 *   1. consulting lifecycle stage
 *   2. business condition
 *   3. intervention mode + intervention phase
 *   4. human execution reality
 *
 * A dry run is BLOCKED until every blocking section is present. Output is always
 * provisional and owner-approval-gated (it reuses the Slice 24 trial-pack), so a
 * dry run can never silently start live employee execution.
 */

import {
  TrialPackInput,
  DataCompleteness,
  ProvisionalTrialOutput,
  assessDataCompleteness,
  buildProvisionalTrialOutput,
} from "@/domain/execution/trial-pack";

/** The four dimensions every OpsIQ input must feed. */
export enum ProductDimension {
  CONSULTING_LIFECYCLE = "CONSULTING_LIFECYCLE",
  BUSINESS_CONDITION = "BUSINESS_CONDITION",
  INTERVENTION_MODE_PHASE = "INTERVENTION_MODE_PHASE",
  HUMAN_EXECUTION_REALITY = "HUMAN_EXECUTION_REALITY",
}

export interface OwnerDataChecklistItem {
  /** Maps 1:1 to a Slice 24 trial-pack input section. */
  section: keyof TrialPackInput;
  label: string;
  /** Concrete fields the owner must provide for this section to count as present. */
  requiredFields: string[];
  /** Expected shape, stated plainly for a non-technical owner. */
  format: string;
  /** Which product dimension this input primarily feeds. */
  dimension: ProductDimension;
  /** A dry run cannot run without a blocking section; non-blocking degrades confidence only. */
  blocking: boolean;
  why: string;
}

/**
 * The authoritative owner-data intake checklist. Every section the trial-pack
 * scores is represented exactly once, tied to the dimension it feeds and marked
 * blocking or confidence-degrading. No section is invented and none is dropped —
 * the four dimensions are all covered.
 */
export const OWNER_DATA_INTAKE_CHECKLIST: readonly OwnerDataChecklistItem[] = [
  {
    section: "businessProfile",
    label: "Business profile",
    requiredFields: ["businessName", "industry", "locationOrService", "ownerRole", "headcount"],
    format: "One object describing the business.",
    dimension: ProductDimension.CONSULTING_LIFECYCLE,
    blocking: true,
    why: "Anchors the consulting lifecycle stage and the archetype pack; nothing can be scoped without it.",
  },
  {
    section: "ownerGoals",
    label: "Owner goals & current condition",
    requiredFields: ["primaryGoal", "topPainPoint", "currentMonthlyRevenueBand", "urgency"],
    format: "One object stating what the owner wants fixed and how urgent it is.",
    dimension: ProductDimension.BUSINESS_CONDITION,
    blocking: true,
    why: "Establishes the BusinessConditionProfile and intervention urgency that drive recommendation priority.",
  },
  {
    section: "paymentCash",
    label: "Payment / cash position",
    requiredFields: ["cashRunwayMonths", "monthlyFixedCost", "outstandingReceivables"],
    format: "One object with cash-health figures (owner-only; never shown to employees).",
    dimension: ProductDimension.BUSINESS_CONDITION,
    blocking: true,
    why: "Cash runway is a core business-condition signal and a shock-trigger input for re-evaluation.",
  },
  {
    section: "pricingBoundary",
    label: "Pricing & approval boundary",
    requiredFields: ["maxDiscountPercent", "maxRefund", "refundPromiseAllowed", "priceQuoteAllowed", "allowedActions"],
    format: "One object defining what an employee is allowed to do without owner approval.",
    dimension: ProductDimension.INTERVENTION_MODE_PHASE,
    blocking: true,
    why: "Becomes the owner-approved execution boundary that gates every employee-facing guidance instruction.",
  },
  {
    section: "employees",
    label: "Employees / roles",
    requiredFields: ["name", "role", "reliability", "isKeyPerson"],
    format: "An array, one object per employee.",
    dimension: ProductDimension.HUMAN_EXECUTION_REALITY,
    blocking: true,
    why: "Defines who executes, key-person dependency, and follow-through risk — the human execution reality.",
  },
  {
    section: "capacity",
    label: "Operational capacity",
    requiredFields: ["dailyJobCapacity", "currentBacklog", "peakHours"],
    format: "One object describing throughput limits.",
    dimension: ProductDimension.HUMAN_EXECUTION_REALITY,
    blocking: true,
    why: "Burden/overload control depends on real capacity; without it, tasks could exceed what staff can deliver.",
  },
  {
    section: "customersOrders",
    label: "Customers / recent orders",
    requiredFields: ["customerSegment", "orderValue", "channel", "date"],
    format: "An array of recent orders/jobs.",
    dimension: ProductDimension.BUSINESS_CONDITION,
    blocking: false,
    why: "Improves condition/profit assessment confidence; a dry run can proceed without history but with lower confidence.",
  },
  {
    section: "sopInput",
    label: "Existing SOPs / how work is done",
    requiredFields: ["taskType", "currentSteps"],
    format: "One object (or array) describing current workflows, if any.",
    dimension: ProductDimension.INTERVENTION_MODE_PHASE,
    blocking: false,
    why: "Personalizes the SOP/workflow engine; absence falls back to the archetype default pack.",
  },
  {
    section: "proofExamples",
    label: "Proof examples",
    requiredFields: ["taskType", "proofType", "exampleDescription"],
    format: "An array of what 'done right' looks like.",
    dimension: ProductDimension.HUMAN_EXECUTION_REALITY,
    blocking: false,
    why: "Calibrates the proof requirement/precheck; absence uses the default proof requirement per task.",
  },
  {
    section: "complaintHistory",
    label: "Complaint / rework history",
    requiredFields: ["issue", "frequency", "severity"],
    format: "An array of recurring problems, if any.",
    dimension: ProductDimension.BUSINESS_CONDITION,
    blocking: false,
    why: "Sharpens risk detection and review cadence; optional for a first dry run.",
  },
  {
    section: "marginTarget",
    label: "Margin target",
    requiredFields: ["marginTargetPercent"],
    format: "A single number (owner-only).",
    dimension: ProductDimension.BUSINESS_CONDITION,
    blocking: false,
    why: "Tunes profit-impact assessment thresholds; defaults applied if absent.",
  },
] as const;

export type DryRunVerdict =
  | "READY_FOR_SUPERVISED_DRY_RUN"
  | "BLOCKED_MISSING_REQUIRED_DATA";

export interface DryRunReadiness {
  verdict: DryRunVerdict;
  ready: boolean;
  completeness: DataCompleteness;
  /** Blocking checklist items the owner has NOT yet provided. */
  blockingGaps: OwnerDataChecklistItem[];
  /** Optional items missing — readiness holds but confidence is reduced. */
  nonBlockingGaps: OwnerDataChecklistItem[];
  /** Dimensions with no blocking input satisfied yet (must be empty to be ready). */
  uncoveredDimensions: ProductDimension[];
  /** Safe, owner-approval-gated provisional output from the trial-pack. */
  provisional: ProvisionalTrialOutput;
  nextActions: string[];
}

function isSectionPresent(input: TrialPackInput, section: keyof TrialPackInput): boolean {
  const v = input[section];
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.length > 0;
  return true;
}

/**
 * Assess whether a supervised dry run can run against the supplied REAL owner
 * data. Fail-closed: any missing blocking section, or any of the four dimensions
 * with no blocking input satisfied, blocks the dry run.
 */
export function assessDryRunReadiness(input: TrialPackInput): DryRunReadiness {
  const blockingGaps: OwnerDataChecklistItem[] = [];
  const nonBlockingGaps: OwnerDataChecklistItem[] = [];

  for (const item of OWNER_DATA_INTAKE_CHECKLIST) {
    if (isSectionPresent(input, item.section)) continue;
    if (item.blocking) blockingGaps.push(item);
    else nonBlockingGaps.push(item);
  }

  // A dimension is "covered" when at least one of its BLOCKING inputs is present.
  const dimensionsNeedingBlocking = new Set(
    OWNER_DATA_INTAKE_CHECKLIST.filter((i) => i.blocking).map((i) => i.dimension)
  );
  const coveredDimensions = new Set(
    OWNER_DATA_INTAKE_CHECKLIST.filter(
      (i) => i.blocking && isSectionPresent(input, i.section)
    ).map((i) => i.dimension)
  );
  const uncoveredDimensions = [...dimensionsNeedingBlocking].filter(
    (d) => !coveredDimensions.has(d)
  );

  const completeness = assessDataCompleteness(input);
  const provisional = buildProvisionalTrialOutput(input);

  const ready = blockingGaps.length === 0 && uncoveredDimensions.length === 0;

  const nextActions: string[] = [];
  if (blockingGaps.length > 0) {
    nextActions.push(
      `Provide the ${blockingGaps.length} blocking input(s): ${blockingGaps
        .map((g) => g.label)
        .join(", ")}.`
    );
  }
  if (uncoveredDimensions.length > 0) {
    nextActions.push(
      `These product dimensions have no data yet: ${uncoveredDimensions.join(", ")}.`
    );
  }
  if (nonBlockingGaps.length > 0) {
    nextActions.push(
      `Optional (raises confidence): ${nonBlockingGaps.map((g) => g.label).join(", ")}.`
    );
  }
  if (ready) {
    nextActions.push(
      "All blocking data present. Run the supervised dry run; the owner must review and approve every generated workflow before any employee sees a task."
    );
  }

  return {
    verdict: ready ? "READY_FOR_SUPERVISED_DRY_RUN" : "BLOCKED_MISSING_REQUIRED_DATA",
    ready,
    completeness,
    blockingGaps,
    nonBlockingGaps,
    uncoveredDimensions,
    provisional,
    nextActions,
  };
}

/**
 * The blank intake template the owner fills in. Returns the checklist with empty
 * value slots — NEVER fabricated data — so the owner (or an importer) can populate
 * it and feed it back to {@link assessDryRunReadiness}.
 */
export function buildBlankIntakeTemplate(): Record<string, null> {
  const template: Record<string, null> = {};
  for (const item of OWNER_DATA_INTAKE_CHECKLIST) {
    template[item.section] = null;
  }
  return template;
}
