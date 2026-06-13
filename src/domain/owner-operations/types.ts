/**
 * Owner Operations (Module 4) — shared types for the deterministic operations
 * engine.
 *
 * Pure types only: no DB, no I/O, no LLM. Every snapshot input is optional at the
 * type level; the engine treats missing/invalid numbers as `null` (missing) and
 * never invents a value. `null` on a derived metric means "not computable from the
 * provided data". Operations is an EXECUTION domain (throughput/bottleneck
 * reliability), distinct from the survival/growth lenses.
 */

export const OPERATIONS_BUSINESS_MODELS = ["service", "inventory", "hybrid"] as const;
export type OperationsBusinessModel = (typeof OPERATIONS_BUSINESS_MODELS)[number];

/** Operations state, smoothest to most overloaded. */
export const OPERATIONS_STATES = ["SMOOTH", "STEADY", "STRAINED", "BOTTLENECKED", "OVERLOADED"] as const;
export type OperationsState = (typeof OPERATIONS_STATES)[number];

/** Action-class hierarchy for operations work. */
export const OPERATIONS_TIERS = ["rescue", "recovery", "growth", "optimization"] as const;
export type OperationsTier = (typeof OPERATIONS_TIERS)[number];

/** Raw operations snapshot entered by the owner for one reporting period. */
export interface OperationsSnapshotInput {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  currency: string;
  businessModel?: OperationsBusinessModel;
  industryTemplate?: string;

  // Throughput
  ordersReceived?: number;
  ordersCompleted?: number;
  ordersDelayed?: number;

  // Quality
  reworkCount?: number;
  complaints?: number;

  // Capacity / labour
  staffHours?: number;
  machineCapacityUnits?: number; // equipment capacity (units processable this period)
  idleHours?: number;

  // Delivery / logistics
  deliveryAttempts?: number;
  deliveryFailures?: number;

  // Inventory / process
  inventoryShortages?: number; // count of stockout events
  sopChecks?: number; // total SOP checks expected
  sopMisses?: number;

  notes?: string;
}

/**
 * Deterministic derived operations metrics. Ratio/per-unit metrics are
 * `number | null` (`null` = not computable). Composite scores are always
 * `0..100`; their trustworthiness is carried by `dataConfidenceScore`.
 */
export interface OperationsDerivedMetrics {
  currency: string;
  currencyValid: boolean;

  completionRatePct: number | null;
  delayRatePct: number | null;
  reworkRatePct: number | null;
  complaintRatePct: number | null;
  capacityUtilizationPct: number | null;
  ordersPerStaffHour: number | null;
  deliverySuccessRatePct: number | null;
  sopCompliancePct: number | null;
  idleRatePct: number | null;
  inventoryShortageCount: number | null;

  operationsHealthScore: number; // 0..100
  operationsRiskScore: number; // 0..100
  operationsOpportunityScore: number; // 0..100
  dataConfidenceScore: number; // 0..100

  operationsState: OperationsState;
  operationsTier: OperationsTier;

  missingRequiredInputs: string[];
}
