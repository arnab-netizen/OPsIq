/**
 * Module 41 — 360° Business Function coverage (pure).
 *
 * The single canonical enumeration of business functions the Real-Time 360° Owner
 * Guidance Layer must cover. Every recommendation, owner action, command-center
 * item, and action-to-avoid must map to at least one of these. This is the shared
 * vocabulary that lets the guidance layer orchestrate the command-and-control
 * modules (M1–M40) without collapsing them.
 *
 * Pure + deterministic. No Date.now()/Math.random().
 */

export enum BusinessFunction {
  STRATEGY = "STRATEGY",
  CASH_FLOW = "CASH_FLOW",
  PROFITABILITY = "PROFITABILITY",
  PRICING = "PRICING",
  UNIT_ECONOMICS = "UNIT_ECONOMICS",
  COST_CONTROL = "COST_CONTROL",
  PAYROLL = "PAYROLL",
  OWNER_WORKLOAD = "OWNER_WORKLOAD",
  EMPLOYEE_WORKLOAD = "EMPLOYEE_WORKLOAD",
  CAPACITY = "CAPACITY",
  QUALITY = "QUALITY",
  CUSTOMER_COMPLAINTS = "CUSTOMER_COMPLAINTS",
  CUSTOMER_RETENTION = "CUSTOMER_RETENTION",
  CUSTOMER_ACQUISITION = "CUSTOMER_ACQUISITION",
  MARKETING = "MARKETING",
  SALES_PIPELINE = "SALES_PIPELINE",
  SUPPLIER = "SUPPLIER",
  INVENTORY = "INVENTORY",
  SOP_PROCESS = "SOP_PROCESS",
  RISK_COMPLIANCE = "RISK_COMPLIANCE",
  BUSINESS_CONTINUITY = "BUSINESS_CONTINUITY",
  GROWTH_READINESS = "GROWTH_READINESS",
  SCALE_READINESS = "SCALE_READINESS",
  DATA_QUALITY = "DATA_QUALITY",
  EVIDENCE_PROOF = "EVIDENCE_PROOF",
  OUTCOME_LEARNING = "OUTCOME_LEARNING",
  ARCHETYPE_OPERATIONS = "ARCHETYPE_OPERATIONS",
}

/** All business functions, stable order. */
export const ALL_BUSINESS_FUNCTIONS: readonly BusinessFunction[] = Object.values(BusinessFunction);

/** Functions that are inherently compliance/tax/legal-sensitive → professional review. */
export const PROFESSIONAL_REVIEW_FUNCTIONS: ReadonlySet<BusinessFunction> = new Set([
  BusinessFunction.RISK_COMPLIANCE,
  BusinessFunction.PAYROLL,
]);

export function isBusinessFunction(value: unknown): value is BusinessFunction {
  return typeof value === "string" && (ALL_BUSINESS_FUNCTIONS as string[]).includes(value);
}

/** True when the supplied functions include any that demand a professional-review warning. */
export function requiresProfessionalReview(functions: readonly BusinessFunction[]): boolean {
  return functions.some((f) => PROFESSIONAL_REVIEW_FUNCTIONS.has(f));
}

/** Thrown when a governed object lacks a required business-function mapping. */
export class MissingBusinessFunctionError extends Error {
  readonly code = "MISSING_BUSINESS_FUNCTION";
  constructor(ref: string) {
    super(`Object ${ref} must map to at least one business function.`);
    this.name = "MissingBusinessFunctionError";
  }
}

/**
 * Guard: every recommendation / owner action / command-center item / action-to-avoid
 * must map to at least one valid business function. Rejects empty or invalid sets.
 */
export function assertBusinessFunction(
  functions: readonly unknown[] | undefined | null,
  ref: string
): asserts functions is readonly BusinessFunction[] {
  if (!functions || functions.length === 0 || !functions.every(isBusinessFunction)) {
    throw new MissingBusinessFunctionError(ref);
  }
}
