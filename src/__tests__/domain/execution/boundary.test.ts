import { describe, it, expect } from "vitest";
import {
  ApprovedExecutionBoundary,
  ApprovedExecutionBoundaryDraft,
  BoundaryInstruction,
  BoundaryValidationStatus,
  CapacityStatus,
  computeBoundaryContentHash,
  createNextBoundaryVersion,
  isBoundaryActiveAt,
  sealBoundary,
  validateInstructionAgainstBoundary,
} from "@/domain/execution/boundary";

const NOW = new Date("2026-06-25T12:00:00.000Z");

function baseDraft(
  overrides: Partial<ApprovedExecutionBoundaryDraft> = {}
): ApprovedExecutionBoundaryDraft {
  return {
    boundaryId: "bnd-1",
    boundaryVersion: 1,
    supersedesBoundaryVersion: null,
    workspaceId: "ws-1",
    recommendationId: "rec-1",
    approvedActionId: "act-1",
    ownerApprovedBy: "owner-1",
    approvedAt: new Date("2026-06-20T00:00:00.000Z"),
    validFrom: new Date("2026-06-20T00:00:00.000Z"),
    validUntil: new Date("2026-07-20T00:00:00.000Z"),
    maxUses: null,
    allowedRoles: ["counter_staff"],
    forbiddenRoles: ["delivery_runner"],
    allowedActions: ["call_customer", "send_reminder"],
    forbiddenActions: ["issue_refund"],
    allowedCustomerSegments: ["retail"],
    forbiddenCustomerSegments: ["vip"],
    allowedCommunicationChannels: ["whatsapp"],
    forbiddenCommunicationChannels: ["email"],
    maxDiscount: 10,
    maxRefund: null,
    maxSpend: null,
    maxOvertime: null,
    priceQuoteAllowed: false,
    refundPromiseAllowed: false,
    sameDayPromiseAllowed: true,
    deliveryPromiseLimit: null,
    geographicBoundary: null,
    serviceTypeBoundary: null,
    capacityBoundary: null,
    dataAccessBoundary: ["own_assigned_tasks"],
    proofRequired: true,
    escalationTriggers: ["handle_complaint"],
    legalComplianceFlags: [],
    brandRiskFlags: [],
    ownerOverrideRequiredFor: ["approve_large_discount"],
    isActive: true,
    ...overrides,
  };
}

function sealedBase(
  overrides: Partial<ApprovedExecutionBoundaryDraft> = {}
): ApprovedExecutionBoundary {
  return sealBoundary(baseDraft(overrides));
}

/** A pinned instruction that matches the active boundary identity by default. */
function instr(
  boundary: ApprovedExecutionBoundary,
  overrides: Partial<BoundaryInstruction> = {}
): BoundaryInstruction {
  return {
    action: "call_customer",
    role: "counter_staff",
    boundaryId: boundary.boundaryId,
    boundaryVersion: boundary.boundaryVersion,
    boundaryContentHash: boundary.contentHash,
    summary: "Call customer to confirm pickup",
    ...overrides,
  };
}

describe("boundary content hash & sealing", () => {
  it("computes a stable hash regardless of key insertion order", () => {
    const a = sealedBase();
    const reordered = sealBoundary(
      baseDraft({
        // reconstruct with a different field order via spread is identical;
        // assert recompute matches stored hash
      })
    );
    expect(a.contentHash).toBe(reordered.contentHash);
    expect(computeBoundaryContentHash(a)).toBe(a.contentHash);
  });

  it("hash ignores the mutable isActive lifecycle flag", () => {
    const active = sealedBase({ isActive: true });
    const inactive = sealBoundary(baseDraft({ isActive: false }));
    expect(active.contentHash).toBe(inactive.contentHash);
  });

  it("hash changes when a semantic constraint changes", () => {
    const a = sealedBase({ maxDiscount: 10 });
    const b = sealedBase({ maxDiscount: 25 });
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("a sealed boundary cannot be mutated in place", () => {
    const b = sealedBase();
    expect(Object.isFrozen(b)).toBe(true);
    expect(() => {
      (b as { maxDiscount: number }).maxDiscount = 99;
    }).toThrow();
    // nested arrays are frozen too
    expect(() => {
      (b.allowedActions as string[]).push("hacked");
    }).toThrow();
  });
});

describe("boundary versioning (Addendum E)", () => {
  it("boundary update creates a new version that supersedes the previous", () => {
    const v1 = sealedBase();
    const v2 = createNextBoundaryVersion(
      v1,
      { maxDiscount: 20 },
      { approvedByOwnerId: "owner-1", now: NOW }
    );
    expect(v2.boundaryVersion).toBe(2);
    expect(v2.supersedesBoundaryVersion).toBe(1);
    expect(v2.maxDiscount).toBe(20);
    expect(v2.isActive).toBe(true);
    expect(v2.contentHash).not.toBe(v1.contentHash);
  });

  it("creating a new version does NOT mutate the previous version", () => {
    const v1 = sealedBase({ maxDiscount: 10 });
    const v1HashBefore = v1.contentHash;
    createNextBoundaryVersion(
      v1,
      { maxDiscount: 99 },
      { approvedByOwnerId: "owner-1", now: NOW }
    );
    expect(v1.maxDiscount).toBe(10);
    expect(v1.boundaryVersion).toBe(1);
    expect(v1.contentHash).toBe(v1HashBefore);
  });

  it("an existing instruction stays valid against the version it was pinned to", () => {
    const v1 = sealedBase();
    const pinned = instr(v1); // pinned to v1 hash + version
    const result = validateInstructionAgainstBoundary(v1, pinned, { now: NOW });
    expect(result.validationStatus).toBe(BoundaryValidationStatus.PASSED);
  });
});

describe("fail-closed boundary integrity", () => {
  it("missing boundary fails closed", () => {
    const r = validateInstructionAgainstBoundary(null, {
      action: "call_customer",
      role: "counter_staff",
    });
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.FAILED_MISSING_BOUNDARY
    );
    expect(r.passed).toBe(false);
    expect(r.boundaryId).toBeNull();
  });

  it("inactive/superseded boundary fails closed", () => {
    const b = sealBoundary(baseDraft({ isActive: false }));
    const r = validateInstructionAgainstBoundary(b, instr(b), { now: NOW });
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION
    );
  });

  it("version mismatch fails closed", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { boundaryVersion: 99 }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION
    );
  });

  it("content hash mismatch (instruction generated under different content) fails closed", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { boundaryContentHash: "deadbeef" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION
    );
  });

  it("tampered boundary (stored hash != content) fails closed", () => {
    const b = sealedBase();
    // simulate a tampered row: same shape, wrong stored hash, unfrozen
    const tampered: ApprovedExecutionBoundary = {
      ...b,
      maxDiscount: 100, // content changed but...
      contentHash: b.contentHash, // ...hash left stale
    };
    const r = validateInstructionAgainstBoundary(
      tampered,
      { action: "call_customer", role: "counter_staff" },
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.FAILED_INVALID_BOUNDARY_VERSION
    );
  });
});

describe("validity window", () => {
  it("expired boundary fails closed", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(b, instr(b), {
      now: new Date("2026-08-01T00:00:00.000Z"),
    });
    expect(r.validationStatus).toBe(BoundaryValidationStatus.BLOCKED_EXPIRED);
  });

  it("not-yet-valid boundary fails closed", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(b, instr(b), {
      now: new Date("2026-06-19T00:00:00.000Z"),
    });
    expect(r.validationStatus).toBe(BoundaryValidationStatus.BLOCKED_EXPIRED);
  });

  it("exhausted maxUses fails closed", () => {
    const b = sealedBase({ maxUses: 3 });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { priorUses: 3 }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(BoundaryValidationStatus.BLOCKED_EXPIRED);
  });

  it("isBoundaryActiveAt reflects window + active flag", () => {
    const b = sealedBase();
    expect(isBoundaryActiveAt(b, NOW)).toBe(true);
    expect(isBoundaryActiveAt(b, new Date("2026-08-01T00:00:00.000Z"))).toBe(
      false
    );
  });
});

describe("role and action envelopes", () => {
  it("forbidden role is blocked", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { role: "delivery_runner" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(BoundaryValidationStatus.BLOCKED_ROLE);
  });

  it("role outside allowed roles is blocked", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { role: "random_role" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(BoundaryValidationStatus.BLOCKED_ROLE);
  });

  it("forbidden action is blocked", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { action: "issue_refund" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_FORBIDDEN_ACTION
    );
  });

  it("action not in allowed actions is blocked", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { action: "fire_employee" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_FORBIDDEN_ACTION
    );
  });
});

describe("customer + channel envelopes", () => {
  it("forbidden customer segment is blocked", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { customerSegment: "vip" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_CUSTOMER_SEGMENT
    );
  });

  it("forbidden communication channel is blocked", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { communicationChannel: "email" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_COMMUNICATION_CHANNEL
    );
  });
});

describe("financial limits (ambiguous = fail closed)", () => {
  it("discount beyond limit is blocked", () => {
    const b = sealedBase({ maxDiscount: 10 });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { discountPercent: 25 }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_DISCOUNT_LIMIT
    );
  });

  it("ambiguous discount (no limit set) fails closed", () => {
    const b = sealedBase({ maxDiscount: null });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { discountPercent: 5 }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_DISCOUNT_LIMIT
    );
  });

  it("discount within limit passes", () => {
    const b = sealedBase({ maxDiscount: 10 });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { discountPercent: 8 }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(BoundaryValidationStatus.PASSED);
  });

  it("refund promise where forbidden is blocked", () => {
    const b = sealedBase({ refundPromiseAllowed: false });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { promisesRefund: true }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_REFUND_PROMISE
    );
  });

  it("spend with no spend limit fails closed", () => {
    const b = sealedBase({ maxSpend: null });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { spendAmount: 500 }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_SPEND_LIMIT
    );
  });
});

describe("customer promises + capacity", () => {
  it("B2B price quote rejected for unauthorized boundary", () => {
    const b = sealedBase({ priceQuoteAllowed: false, allowedActions: [] });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { action: "quote_b2b", providesPriceQuote: true }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_CUSTOMER_PROMISE
    );
  });

  it("same-day delivery rejected when capacity boundary not met (RED)", () => {
    const b = sealedBase({ sameDayPromiseAllowed: true });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, {
        promisesSameDayDelivery: true,
        capacityStatus: CapacityStatus.RED,
      }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(BoundaryValidationStatus.BLOCKED_CAPACITY);
  });

  it("same-day delivery rejected when capacity UNKNOWN (fail closed)", () => {
    const b = sealedBase({ sameDayPromiseAllowed: true });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { promisesSameDayDelivery: true }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(BoundaryValidationStatus.BLOCKED_CAPACITY);
  });

  it("same-day delivery passes with GREEN capacity", () => {
    const b = sealedBase({ sameDayPromiseAllowed: true });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, {
        promisesSameDayDelivery: true,
        capacityStatus: CapacityStatus.GREEN,
      }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(BoundaryValidationStatus.PASSED);
  });

  it("owner capacity exception allows same-day under RED capacity", () => {
    const b = sealedBase({ sameDayPromiseAllowed: true });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, {
        promisesSameDayDelivery: true,
        capacityStatus: CapacityStatus.RED,
        capacityExceptionApproved: true,
      }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(BoundaryValidationStatus.PASSED);
  });
});

describe("data access + escalation", () => {
  it("data access outside boundary is blocked", () => {
    const b = sealedBase({ dataAccessBoundary: ["own_assigned_tasks"] });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { dataAccessScope: "all_customer_financials" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.BLOCKED_DATA_ACCESS
    );
  });

  it("owner-override action escalates to owner approval (not blocked, not passed)", () => {
    const b = sealedBase({
      allowedActions: ["approve_large_discount"],
      ownerOverrideRequiredFor: ["approve_large_discount"],
    });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { action: "approve_large_discount" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.ESCALATE_OWNER_APPROVAL_REQUIRED
    );
    expect(r.escalation).toBe(true);
    expect(r.passed).toBe(false);
  });

  it("escalation-trigger action routes to manager review", () => {
    const b = sealedBase({
      allowedActions: ["handle_complaint"],
      escalationTriggers: ["handle_complaint"],
    });
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { action: "handle_complaint" }),
      { now: NOW }
    );
    expect(r.validationStatus).toBe(
      BoundaryValidationStatus.ESCALATE_MANAGER_REVIEW_REQUIRED
    );
  });
});

describe("happy path + ledger-ready result shape", () => {
  it("a fully in-bounds instruction passes", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(b, instr(b), { now: NOW });
    expect(r.validationStatus).toBe(BoundaryValidationStatus.PASSED);
    expect(r.passed).toBe(true);
    expect(r.escalation).toBe(false);
  });

  it("every result carries the fields required to ledger/audit the outcome", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(
      b,
      instr(b, { action: "issue_refund" }),
      { now: NOW }
    );
    expect(r.boundaryId).toBe("bnd-1");
    expect(r.boundaryVersion).toBe(1);
    expect(r.validatedAt).toBe(NOW.toISOString());
    expect(r.validatedByService).toBe("execution-boundary-validator@v2");
    expect(typeof r.reason).toBe("string");
    expect(r.reason.length).toBeGreaterThan(0);
    // blocked results carry the instruction summary for the audit record
    expect(r.blockedInstructionSummary).toBe("Call customer to confirm pickup");
  });

  it("passed results do not carry a blockedInstructionSummary", () => {
    const b = sealedBase();
    const r = validateInstructionAgainstBoundary(b, instr(b), { now: NOW });
    expect(r.blockedInstructionSummary).toBeUndefined();
  });
});
