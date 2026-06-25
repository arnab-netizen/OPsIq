/**
 * Approved Execution Boundary v2 + fail-closed boundary validator.
 *
 * An ApprovedExecutionBoundary is the immutable, owner-approved envelope inside
 * which employee-facing execution (tasks, AI guidance, scripts, customer
 * promises) is permitted. It is the keystone safety primitive of Owner Mode
 * guided execution: NO employee-facing AI guidance may be shown unless an
 * instruction validates to BOUNDARY_VALIDATION_PASSED against the active,
 * non-expired, content-hash-intact boundary version it was generated under.
 *
 * Design rules (fail-closed):
 *  - If a boundary is missing, inactive/superseded, version-mismatched,
 *    hash-tampered, expired, or ambiguous, the validator BLOCKS or ESCALATES.
 *    It never passes by default.
 *  - Approved boundaries are immutable after sealing. Any change must create a
 *    NEW version (boundaryVersion + 1, supersedesBoundaryVersion set). Existing
 *    tasks/guidance remain tied to the exact version + contentHash they were
 *    created under.
 *  - This module is pure domain logic: no DB, no IO, no clock except an
 *    injectable `now`. Callers (services) are responsible for persistence and
 *    for emitting the audit/ledger record of every validation outcome.
 */

import { createHash } from "node:crypto";

/**
 * Explicit boundary-validation status enum.
 * Every validation attempt resolves to exactly one of these.
 */
export enum BoundaryValidationStatus {
  PASSED = "BOUNDARY_VALIDATION_PASSED",
  BLOCKED_EXPIRED = "BOUNDARY_VALIDATION_BLOCKED_EXPIRED",
  BLOCKED_ROLE = "BOUNDARY_VALIDATION_BLOCKED_ROLE",
  BLOCKED_FORBIDDEN_ACTION = "BOUNDARY_VALIDATION_BLOCKED_FORBIDDEN_ACTION",
  BLOCKED_DISCOUNT_LIMIT = "BOUNDARY_VALIDATION_BLOCKED_DISCOUNT_LIMIT",
  BLOCKED_REFUND_PROMISE = "BOUNDARY_VALIDATION_BLOCKED_REFUND_PROMISE",
  BLOCKED_SPEND_LIMIT = "BOUNDARY_VALIDATION_BLOCKED_SPEND_LIMIT",
  BLOCKED_CUSTOMER_PROMISE = "BOUNDARY_VALIDATION_BLOCKED_CUSTOMER_PROMISE",
  BLOCKED_COMMUNICATION_CHANNEL = "BOUNDARY_VALIDATION_BLOCKED_COMMUNICATION_CHANNEL",
  BLOCKED_CUSTOMER_SEGMENT = "BOUNDARY_VALIDATION_BLOCKED_CUSTOMER_SEGMENT",
  BLOCKED_DATA_ACCESS = "BOUNDARY_VALIDATION_BLOCKED_DATA_ACCESS",
  BLOCKED_CAPACITY = "BOUNDARY_VALIDATION_BLOCKED_CAPACITY",
  ESCALATE_OWNER_APPROVAL_REQUIRED = "BOUNDARY_VALIDATION_ESCALATE_OWNER_APPROVAL_REQUIRED",
  ESCALATE_MANAGER_REVIEW_REQUIRED = "BOUNDARY_VALIDATION_ESCALATE_MANAGER_REVIEW_REQUIRED",
  FAILED_MISSING_BOUNDARY = "BOUNDARY_VALIDATION_FAILED_MISSING_BOUNDARY",
  FAILED_INVALID_BOUNDARY_VERSION = "BOUNDARY_VALIDATION_FAILED_INVALID_BOUNDARY_VERSION",
}

/** Statuses that mean "do not show the unsafe instruction; route to escalation". */
export const ESCALATION_STATUSES: ReadonlySet<BoundaryValidationStatus> = new Set([
  BoundaryValidationStatus.ESCALATE_OWNER_APPROVAL_REQUIRED,
  BoundaryValidationStatus.ESCALATE_MANAGER_REVIEW_REQUIRED,
]);

/** True only for the single PASS status. Everything else is unsafe-to-show. */
export function isBoundaryValidationPassed(
  status: BoundaryValidationStatus
): boolean {
  return status === BoundaryValidationStatus.PASSED;
}

export function isBoundaryValidationEscalation(
  status: BoundaryValidationStatus
): boolean {
  return ESCALATION_STATUSES.has(status);
}

/** Operational capacity signal (see Slice 19 capacity model). */
export enum CapacityStatus {
  GREEN = "GREEN",
  YELLOW = "YELLOW",
  RED = "RED",
  UNKNOWN = "UNKNOWN",
}

/**
 * Capacity gating rule embedded in a boundary. Fail-closed by default: when a
 * field is omitted, GREEN capacity IS required for the corresponding promise.
 */
export interface CapacityBoundaryRule {
  /** Default true. When false, owner has explicitly relaxed the same-day gate. */
  requireGreenForSameDay?: boolean;
  /** Default true. When false, owner has explicitly relaxed the express gate. */
  requireGreenForExpress?: boolean;
}

/**
 * Owner-approved, immutable execution boundary. Sealed via {@link sealBoundary}.
 * `contentHash` is computed over all semantic constraint fields (excluding the
 * mutable lifecycle flag `isActive` and `contentHash` itself) so any in-place
 * tampering is detectable at validation time.
 */
export interface ApprovedExecutionBoundary {
  // identity & provenance
  boundaryId: string;
  boundaryVersion: number;
  supersedesBoundaryVersion?: number | null;
  workspaceId: string;
  recommendationId?: string | null;
  approvedActionId?: string | null;
  ownerApprovedBy: string;
  approvedAt: Date;
  // validity window
  validFrom: Date;
  validUntil: Date;
  maxUses?: number | null;
  // role envelope
  allowedRoles: string[];
  forbiddenRoles: string[];
  // action envelope
  allowedActions: string[];
  forbiddenActions: string[];
  // customer envelope
  allowedCustomerSegments: string[];
  forbiddenCustomerSegments: string[];
  allowedCommunicationChannels: string[];
  forbiddenCommunicationChannels: string[];
  // financial limits (null = NOT permitted at all → fail closed when requested)
  maxDiscount?: number | null;
  maxRefund?: number | null;
  maxSpend?: number | null;
  maxOvertime?: number | null;
  // promise flags
  priceQuoteAllowed: boolean;
  refundPromiseAllowed: boolean;
  sameDayPromiseAllowed: boolean;
  deliveryPromiseLimit?: number | null;
  // scope envelopes
  geographicBoundary?: string[] | null;
  serviceTypeBoundary?: string[] | null;
  capacityBoundary?: CapacityBoundaryRule | null;
  dataAccessBoundary: string[];
  // governance metadata
  proofRequired: boolean;
  escalationTriggers: string[];
  legalComplianceFlags: string[];
  brandRiskFlags: string[];
  ownerOverrideRequiredFor: string[];
  // lifecycle (mutable, not part of contentHash)
  isActive: boolean;
  contentHash: string;
}

/** A draft boundary lacking the computed hash; pass to {@link sealBoundary}. */
export type ApprovedExecutionBoundaryDraft = Omit<
  ApprovedExecutionBoundary,
  "contentHash"
> & { contentHash?: string };

/**
 * The concrete instruction/guidance being validated against a boundary. It
 * carries the version + hash it was generated under so a superseded or tampered
 * boundary is caught fail-closed.
 */
export interface BoundaryInstruction {
  action: string;
  role: string;
  // version pinning (the version this instruction was generated against)
  boundaryId?: string;
  boundaryVersion?: number;
  boundaryContentHash?: string;
  // optional dimensions
  customerSegment?: string | null;
  communicationChannel?: string | null;
  discountPercent?: number | null;
  refundAmount?: number | null;
  spendAmount?: number | null;
  promisesRefund?: boolean;
  promisesSameDayDelivery?: boolean;
  providesPriceQuote?: boolean;
  isExpress?: boolean;
  dataAccessScope?: string | null;
  capacityStatus?: CapacityStatus | null;
  /** Owner/manager-granted exception that relaxes the capacity gate for this instruction. */
  capacityExceptionApproved?: boolean;
  priorUses?: number | null;
  /** Short human-readable summary of the instruction, for the blocked record. */
  summary?: string;
}

/** Structured, ledger-ready outcome of a single validation attempt. */
export interface BoundaryValidationResult {
  validationStatus: BoundaryValidationStatus;
  passed: boolean;
  escalation: boolean;
  boundaryId: string | null;
  boundaryVersion: number | null;
  validatedAt: string;
  validatedByService: string;
  reason: string;
  blockedInstructionSummary?: string;
}

const VALIDATOR_SERVICE = "execution-boundary-validator@v2";

/**
 * Deterministically hash the semantic content of a boundary. Excludes
 * `contentHash` (self) and `isActive` (mutable lifecycle). Object keys are
 * sorted recursively so the hash is stable across construction order.
 */
export function computeBoundaryContentHash(
  boundary: ApprovedExecutionBoundaryDraft | ApprovedExecutionBoundary
): string {
  const {
    contentHash: _ignoredHash,
    isActive: _ignoredActive,
    ...semantic
  } = boundary as ApprovedExecutionBoundary;
  const canonical = canonicalize(semantic);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Recursively sort object keys; serialize Dates as ISO; keep array order. */
function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Seal a boundary draft: compute its contentHash and deep-freeze it so it can
 * never be mutated in place. Returns a new frozen object.
 */
export function sealBoundary(
  draft: ApprovedExecutionBoundaryDraft
): ApprovedExecutionBoundary {
  const contentHash = computeBoundaryContentHash(draft);
  const sealed: ApprovedExecutionBoundary = { ...draft, contentHash };
  return deepFreeze(sealed);
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}

/**
 * Create the next immutable version of a boundary. Does NOT mutate `previous`.
 * The returned version supersedes the previous one and is sealed/active.
 * Persistence layer is responsible for marking the previous row inactive.
 */
export function createNextBoundaryVersion(
  previous: ApprovedExecutionBoundary,
  changes: Partial<
    Omit<
      ApprovedExecutionBoundary,
      | "boundaryId"
      | "boundaryVersion"
      | "supersedesBoundaryVersion"
      | "contentHash"
    >
  >,
  opts: { approvedByOwnerId: string; now: Date }
): ApprovedExecutionBoundary {
  const draft: ApprovedExecutionBoundaryDraft = {
    ...previous,
    ...changes,
    boundaryVersion: previous.boundaryVersion + 1,
    supersedesBoundaryVersion: previous.boundaryVersion,
    ownerApprovedBy: opts.approvedByOwnerId,
    approvedAt: opts.now,
    isActive: true,
  };
  // strip inherited hash so it is recomputed for the new content
  delete (draft as { contentHash?: string }).contentHash;
  return sealBoundary(draft);
}

/** True if `now` is inside [validFrom, validUntil] AND the boundary is active. */
export function isBoundaryActiveAt(
  boundary: ApprovedExecutionBoundary,
  now: Date
): boolean {
  return (
    boundary.isActive &&
    now.getTime() >= boundary.validFrom.getTime() &&
    now.getTime() <= boundary.validUntil.getTime()
  );
}

/**
 * Fail-closed validator. Returns the FIRST failing/escalating condition in a
 * deterministic order, or PASSED only when every check is satisfied.
 *
 * @param boundary the active sealed boundary, or null/undefined if none exists
 * @param instruction the employee-facing instruction to authorize
 * @param opts.now injectable clock for deterministic tests
 */
export function validateInstructionAgainstBoundary(
  boundary: ApprovedExecutionBoundary | null | undefined,
  instruction: BoundaryInstruction,
  opts?: { now?: Date }
): BoundaryValidationResult {
  const now = opts?.now ?? new Date();
  const validatedAt = now.toISOString();
  const summary = instruction.summary;

  const make = (
    status: BoundaryValidationStatus,
    reason: string,
    boundaryId: string | null,
    boundaryVersion: number | null
  ): BoundaryValidationResult => ({
    validationStatus: status,
    passed: status === BoundaryValidationStatus.PASSED,
    escalation: ESCALATION_STATUSES.has(status),
    boundaryId,
    boundaryVersion,
    validatedAt,
    validatedByService: VALIDATOR_SERVICE,
    reason,
    ...(status === BoundaryValidationStatus.PASSED
      ? {}
      : { blockedInstructionSummary: summary }),
  });

  // 1. Missing boundary → fail closed.
  if (!boundary) {
    return make(
      BoundaryValidationStatus.FAILED_MISSING_BOUNDARY,
      "No approved execution boundary was supplied for this instruction.",
      null,
      null
    );
  }

  const bId = boundary.boundaryId;
  const bVer = boundary.boundaryVersion;
  const safeVer = Number.isInteger(bVer) ? bVer : null;

  // 2. Boundary self-integrity → fail closed if the boundary itself is malformed.
  if (!boundary.isActive) {
    return make(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION,
      "Boundary is not the active version (superseded or deactivated).",
      bId,
      safeVer
    );
  }
  if (safeVer == null || (safeVer as number) < 1) {
    return make(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION,
      "Boundary has no valid boundaryVersion (unsealed or malformed).",
      bId,
      null
    );
  }
  if (typeof boundary.contentHash !== "string" || boundary.contentHash.length === 0) {
    return make(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION,
      "Boundary has no contentHash (unsealed or malformed).",
      bId,
      safeVer
    );
  }

  // 3. Version pinning & tamper detection → fail closed on any mismatch.
  if (instruction.boundaryId && instruction.boundaryId !== bId) {
    return make(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION,
      "Instruction references a different boundaryId than the active boundary.",
      bId,
      bVer
    );
  }
  if (
    instruction.boundaryVersion != null &&
    instruction.boundaryVersion !== bVer
  ) {
    return make(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION,
      "Instruction was generated under a superseded boundary version.",
      bId,
      bVer
    );
  }
  const recomputed = computeBoundaryContentHash(boundary);
  if (boundary.contentHash !== recomputed) {
    return make(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION,
      "Boundary content hash does not match its content (tamper detected).",
      bId,
      bVer
    );
  }
  if (
    instruction.boundaryContentHash &&
    instruction.boundaryContentHash !== boundary.contentHash
  ) {
    return make(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION,
      "Instruction content hash does not match the active boundary.",
      bId,
      bVer
    );
  }

  // 4. Validity window & usage cap → fail closed if window missing/invalid.
  const validFromMs =
    boundary.validFrom instanceof Date ? boundary.validFrom.getTime() : NaN;
  const validUntilMs =
    boundary.validUntil instanceof Date ? boundary.validUntil.getTime() : NaN;
  if (Number.isNaN(validFromMs) || Number.isNaN(validUntilMs)) {
    return make(
      BoundaryValidationStatus.BLOCKED_EXPIRED,
      "Boundary validity window (validFrom/validUntil) is missing or invalid.",
      bId,
      bVer
    );
  }
  if (now.getTime() < validFromMs) {
    return make(
      BoundaryValidationStatus.BLOCKED_EXPIRED,
      "Boundary is not yet valid (before validFrom).",
      bId,
      bVer
    );
  }
  if (now.getTime() > validUntilMs) {
    return make(
      BoundaryValidationStatus.BLOCKED_EXPIRED,
      "Boundary has expired (after validUntil).",
      bId,
      bVer
    );
  }
  if (
    boundary.maxUses != null &&
    instruction.priorUses != null &&
    instruction.priorUses >= boundary.maxUses
  ) {
    return make(
      BoundaryValidationStatus.BLOCKED_EXPIRED,
      "Boundary usage cap (maxUses) has been exhausted.",
      bId,
      bVer
    );
  }

  // 5. Role envelope (allow-list is mandatory; empty/missing = deny, fail closed).
  if ((boundary.forbiddenRoles ?? []).includes(instruction.role)) {
    return make(
      BoundaryValidationStatus.BLOCKED_ROLE,
      `Role '${instruction.role}' is explicitly forbidden by the boundary.`,
      bId,
      bVer
    );
  }
  if (
    !Array.isArray(boundary.allowedRoles) ||
    boundary.allowedRoles.length === 0 ||
    !boundary.allowedRoles.includes(instruction.role)
  ) {
    return make(
      BoundaryValidationStatus.BLOCKED_ROLE,
      `Role '${instruction.role}' is not in the boundary's allowed roles (empty or missing allow-list denies).`,
      bId,
      bVer
    );
  }

  // 6. Action envelope (allow-list is mandatory; empty/missing = deny, fail closed).
  if ((boundary.forbiddenActions ?? []).includes(instruction.action)) {
    return make(
      BoundaryValidationStatus.BLOCKED_FORBIDDEN_ACTION,
      `Action '${instruction.action}' is explicitly forbidden.`,
      bId,
      bVer
    );
  }
  if (
    !Array.isArray(boundary.allowedActions) ||
    boundary.allowedActions.length === 0 ||
    !boundary.allowedActions.includes(instruction.action)
  ) {
    return make(
      BoundaryValidationStatus.BLOCKED_FORBIDDEN_ACTION,
      `Action '${instruction.action}' is not in the boundary's allowed actions (empty or missing allow-list denies).`,
      bId,
      bVer
    );
  }

  // 6. Customer segment.
  if (instruction.customerSegment) {
    const seg = instruction.customerSegment;
    if (boundary.forbiddenCustomerSegments.includes(seg)) {
      return make(
        BoundaryValidationStatus.BLOCKED_CUSTOMER_SEGMENT,
        `Customer segment '${seg}' is forbidden by the boundary.`,
        bId,
        bVer
      );
    }
    if (
      !Array.isArray(boundary.allowedCustomerSegments) ||
      boundary.allowedCustomerSegments.length === 0 ||
      !boundary.allowedCustomerSegments.includes(seg)
    ) {
      return make(
        BoundaryValidationStatus.BLOCKED_CUSTOMER_SEGMENT,
        `Customer segment '${seg}' is not in the boundary's allowed segments (empty allow-list denies).`,
        bId,
        bVer
      );
    }
  }

  // 7. Communication channel.
  if (instruction.communicationChannel) {
    const ch = instruction.communicationChannel;
    if (boundary.forbiddenCommunicationChannels.includes(ch)) {
      return make(
        BoundaryValidationStatus.BLOCKED_COMMUNICATION_CHANNEL,
        `Communication channel '${ch}' is forbidden by the boundary.`,
        bId,
        bVer
      );
    }
    if (
      !Array.isArray(boundary.allowedCommunicationChannels) ||
      boundary.allowedCommunicationChannels.length === 0 ||
      !boundary.allowedCommunicationChannels.includes(ch)
    ) {
      return make(
        BoundaryValidationStatus.BLOCKED_COMMUNICATION_CHANNEL,
        `Communication channel '${ch}' is not in the boundary's allowed channels (empty allow-list denies).`,
        bId,
        bVer
      );
    }
  }

  // 8. Discount limit (ambiguous = no limit set = fail closed).
  if (instruction.discountPercent != null && instruction.discountPercent > 0) {
    if (boundary.maxDiscount == null) {
      return make(
        BoundaryValidationStatus.BLOCKED_DISCOUNT_LIMIT,
        "Discount requested but the boundary permits no discount.",
        bId,
        bVer
      );
    }
    if (instruction.discountPercent > boundary.maxDiscount) {
      return make(
        BoundaryValidationStatus.BLOCKED_DISCOUNT_LIMIT,
        `Discount ${instruction.discountPercent}% exceeds the boundary limit of ${boundary.maxDiscount}%.`,
        bId,
        bVer
      );
    }
  }

  // 9. Refund promise / amount.
  if (instruction.promisesRefund && !boundary.refundPromiseAllowed) {
    return make(
      BoundaryValidationStatus.BLOCKED_REFUND_PROMISE,
      "Refund promise is not permitted by the boundary.",
      bId,
      bVer
    );
  }
  if (instruction.refundAmount != null && instruction.refundAmount > 0) {
    if (boundary.maxRefund == null) {
      return make(
        BoundaryValidationStatus.BLOCKED_REFUND_PROMISE,
        "Refund amount requested but the boundary permits no refund.",
        bId,
        bVer
      );
    }
    if (instruction.refundAmount > boundary.maxRefund) {
      return make(
        BoundaryValidationStatus.BLOCKED_REFUND_PROMISE,
        `Refund ${instruction.refundAmount} exceeds the boundary limit of ${boundary.maxRefund}.`,
        bId,
        bVer
      );
    }
  }

  // 10. Spend limit (ambiguous = no limit set = fail closed).
  if (instruction.spendAmount != null && instruction.spendAmount > 0) {
    if (boundary.maxSpend == null) {
      return make(
        BoundaryValidationStatus.BLOCKED_SPEND_LIMIT,
        "Spend requested but the boundary permits no spend.",
        bId,
        bVer
      );
    }
    if (instruction.spendAmount > boundary.maxSpend) {
      return make(
        BoundaryValidationStatus.BLOCKED_SPEND_LIMIT,
        `Spend ${instruction.spendAmount} exceeds the boundary limit of ${boundary.maxSpend}.`,
        bId,
        bVer
      );
    }
  }

  // 11. Other customer promises (price quote, same-day) + capacity gating.
  if (instruction.providesPriceQuote && !boundary.priceQuoteAllowed) {
    return make(
      BoundaryValidationStatus.BLOCKED_CUSTOMER_PROMISE,
      "Price quote is not permitted by the boundary.",
      bId,
      bVer
    );
  }
  if (instruction.promisesSameDayDelivery) {
    if (!boundary.sameDayPromiseAllowed) {
      return make(
        BoundaryValidationStatus.BLOCKED_CUSTOMER_PROMISE,
        "Same-day delivery promise is not permitted by the boundary.",
        bId,
        bVer
      );
    }
    const requireGreen =
      boundary.capacityBoundary?.requireGreenForSameDay !== false;
    if (
      requireGreen &&
      !instruction.capacityExceptionApproved &&
      instruction.capacityStatus !== CapacityStatus.GREEN
    ) {
      return make(
        BoundaryValidationStatus.BLOCKED_CAPACITY,
        `Same-day promise requires GREEN capacity (current: ${
          instruction.capacityStatus ?? CapacityStatus.UNKNOWN
        }).`,
        bId,
        bVer
      );
    }
  }
  if (instruction.isExpress) {
    const requireGreen =
      boundary.capacityBoundary?.requireGreenForExpress !== false;
    if (
      requireGreen &&
      !instruction.capacityExceptionApproved &&
      instruction.capacityStatus !== CapacityStatus.GREEN
    ) {
      return make(
        BoundaryValidationStatus.BLOCKED_CAPACITY,
        `Express task requires GREEN capacity (current: ${
          instruction.capacityStatus ?? CapacityStatus.UNKNOWN
        }).`,
        bId,
        bVer
      );
    }
  }

  // 12. Data access scope (present scope requires an explicit allow-list entry).
  if (instruction.dataAccessScope) {
    if (
      !Array.isArray(boundary.dataAccessBoundary) ||
      boundary.dataAccessBoundary.length === 0 ||
      !boundary.dataAccessBoundary.includes(instruction.dataAccessScope)
    ) {
      return make(
        BoundaryValidationStatus.BLOCKED_DATA_ACCESS,
        `Data access scope '${instruction.dataAccessScope}' is outside the boundary (empty allow-list denies).`,
        bId,
        bVer
      );
    }
  }

  // 13. Escalation routing (owner-override-required wins over manager review).
  if (boundary.ownerOverrideRequiredFor.includes(instruction.action)) {
    return make(
      BoundaryValidationStatus.ESCALATE_OWNER_APPROVAL_REQUIRED,
      `Action '${instruction.action}' requires owner approval before execution.`,
      bId,
      bVer
    );
  }
  if (boundary.escalationTriggers.includes(instruction.action)) {
    return make(
      BoundaryValidationStatus.ESCALATE_MANAGER_REVIEW_REQUIRED,
      `Action '${instruction.action}' requires manager review before execution.`,
      bId,
      bVer
    );
  }

  // All checks satisfied.
  return make(
    BoundaryValidationStatus.PASSED,
    "Instruction is within the approved execution boundary.",
    bId,
    bVer
  );
}
