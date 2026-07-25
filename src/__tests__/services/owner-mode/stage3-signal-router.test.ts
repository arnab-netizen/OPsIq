/**
 * Bundle 4.1 — Stage 3 Signal Router tests.
 *
 * Verifies fire-and-forget bridging from Stage 3 operational events
 * to OwnerReassessmentEvent. All 4 router functions tested for:
 * - Correct event emission when businessId is present
 * - Silent skip when businessId is null/undefined
 * - Error swallowing (signal failures never propagate)
 * - Correct trigger type and description mapping
 * - Correct workspaceId / businessId / refs passed through
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockCreateReassessmentEvent = vi.fn();

vi.mock("@/services/owner-mode/reassessment-event.service", () => ({
  createReassessmentEvent: mockCreateReassessmentEvent,
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import {
  routeComplaintResolutionSignal,
  routeActionFailureSignal,
  routeApprovalRejectionSignal,
  routeSopComplianceSignal,
} from "@/services/owner-mode/stage3-signal-router.service";

// ─── Helpers ────────────────────────────────────────────────────────────────

function resetMock() {
  mockCreateReassessmentEvent.mockReset();
  mockCreateReassessmentEvent.mockResolvedValue({ id: "reassessment-1" });
}

// ─── routeComplaintResolutionSignal ──────────────────────────────────────────

describe("routeComplaintResolutionSignal", () => {
  beforeEach(resetMock);

  it("calls createReassessmentEvent with verified_outcome trigger", async () => {
    await routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-abc", "biz-1");
    expect(mockCreateReassessmentEvent).toHaveBeenCalledOnce();
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.trigger).toBe("verified_outcome");
  });

  it("passes correct workspaceId and businessId", async () => {
    await routeComplaintResolutionSignal("ws-99", "actor-1", "complaint-abc", "biz-99");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.workspaceId).toBe("ws-99");
    expect(call.businessId).toBe("biz-99");
  });

  it("passes actorId", async () => {
    await routeComplaintResolutionSignal("ws-1", "actor-xyz", "complaint-abc", "biz-1");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.actorId).toBe("actor-xyz");
  });

  it("includes complaintId in triggerDescription", async () => {
    await routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-SPECIAL", "biz-1");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.triggerDescription).toContain("complaint-SPECIAL");
  });

  it("does not emit when businessId is null", async () => {
    await routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-abc", null);
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("does not emit when businessId is undefined", async () => {
    await routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-abc", undefined);
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("does not emit when businessId is empty string", async () => {
    await routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-abc", "");
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("swallows error when createReassessmentEvent throws", async () => {
    mockCreateReassessmentEvent.mockRejectedValue(new Error("DB down"));
    await expect(
      routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-abc", "biz-1")
    ).resolves.toBeUndefined();
  });

  it("swallows error without propagating", async () => {
    mockCreateReassessmentEvent.mockRejectedValue(new Error("Network failure"));
    let threw = false;
    try {
      await routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-abc", "biz-1");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("passes null actionId and null sourceProofId", async () => {
    await routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-abc", "biz-1");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.actionId).toBeNull();
    expect(call.sourceProofId).toBeNull();
  });

  it("resolves to undefined even when createReassessmentEvent succeeds", async () => {
    const result = await routeComplaintResolutionSignal("ws-1", "actor-1", "complaint-abc", "biz-1");
    expect(result).toBeUndefined();
  });
});

// ─── routeActionFailureSignal ────────────────────────────────────────────────

describe("routeActionFailureSignal", () => {
  beforeEach(resetMock);

  it("calls createReassessmentEvent with failed_outcome trigger", async () => {
    await routeActionFailureSignal("ws-1", "actor-1", "assignment-abc", "biz-1");
    expect(mockCreateReassessmentEvent).toHaveBeenCalledOnce();
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.trigger).toBe("failed_outcome");
  });

  it("passes correct workspaceId and businessId", async () => {
    await routeActionFailureSignal("ws-55", "actor-1", "assignment-abc", "biz-55");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.workspaceId).toBe("ws-55");
    expect(call.businessId).toBe("biz-55");
  });

  it("passes actorId", async () => {
    await routeActionFailureSignal("ws-1", "actor-42", "assignment-abc", "biz-1");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.actorId).toBe("actor-42");
  });

  it("passes assignmentId as actionId ref", async () => {
    await routeActionFailureSignal("ws-1", "actor-1", "assignment-SPECIAL", "biz-1");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.actionId).toBe("assignment-SPECIAL");
  });

  it("includes assignmentId in triggerDescription", async () => {
    await routeActionFailureSignal("ws-1", "actor-1", "assignment-XYZ", "biz-1");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.triggerDescription).toContain("assignment-XYZ");
  });

  it("does not emit when businessId is null", async () => {
    await routeActionFailureSignal("ws-1", "actor-1", "assignment-abc", null);
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("does not emit when businessId is undefined", async () => {
    await routeActionFailureSignal("ws-1", "actor-1", "assignment-abc", undefined);
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("does not emit when businessId is empty string", async () => {
    await routeActionFailureSignal("ws-1", "actor-1", "assignment-abc", "");
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("swallows error when createReassessmentEvent throws", async () => {
    mockCreateReassessmentEvent.mockRejectedValue(new Error("Timeout"));
    await expect(
      routeActionFailureSignal("ws-1", "actor-1", "assignment-abc", "biz-1")
    ).resolves.toBeUndefined();
  });

  it("passes null sourceProofId", async () => {
    await routeActionFailureSignal("ws-1", "actor-1", "assignment-abc", "biz-1");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.sourceProofId).toBeNull();
  });
});

// ─── routeApprovalRejectionSignal ────────────────────────────────────────────

describe("routeApprovalRejectionSignal", () => {
  beforeEach(resetMock);

  it("calls createReassessmentEvent with external_event_invalidation trigger", async () => {
    await routeApprovalRejectionSignal("ws-1", "actor-1", "approval-abc", "biz-1", "action-1");
    expect(mockCreateReassessmentEvent).toHaveBeenCalledOnce();
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.trigger).toBe("external_event_invalidation");
  });

  it("passes correct workspaceId and businessId", async () => {
    await routeApprovalRejectionSignal("ws-77", "actor-1", "approval-abc", "biz-77", null);
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.workspaceId).toBe("ws-77");
    expect(call.businessId).toBe("biz-77");
  });

  it("passes actorId", async () => {
    await routeApprovalRejectionSignal("ws-1", "actor-99", "approval-abc", "biz-1", null);
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.actorId).toBe("actor-99");
  });

  it("passes actionId when provided", async () => {
    await routeApprovalRejectionSignal("ws-1", "actor-1", "approval-abc", "biz-1", "action-XYZ");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.actionId).toBe("action-XYZ");
  });

  it("passes undefined actionId as undefined (not null) when null", async () => {
    await routeApprovalRejectionSignal("ws-1", "actor-1", "approval-abc", "biz-1", null);
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    // null actionId → actionId passed as undefined to refs, then ?? null → null
    expect(call.actionId).toBeNull();
  });

  it("includes approvalId in triggerDescription", async () => {
    await routeApprovalRejectionSignal("ws-1", "actor-1", "approval-SPECIAL", "biz-1", null);
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.triggerDescription).toContain("approval-SPECIAL");
  });

  it("always emits even when actionId is null (businessId is always required)", async () => {
    await routeApprovalRejectionSignal("ws-1", "actor-1", "approval-abc", "biz-1", null);
    expect(mockCreateReassessmentEvent).toHaveBeenCalledOnce();
  });

  it("always emits even when actionId is undefined", async () => {
    await routeApprovalRejectionSignal("ws-1", "actor-1", "approval-abc", "biz-1", undefined);
    expect(mockCreateReassessmentEvent).toHaveBeenCalledOnce();
  });

  it("swallows error when createReassessmentEvent throws", async () => {
    mockCreateReassessmentEvent.mockRejectedValue(new Error("Service unavailable"));
    await expect(
      routeApprovalRejectionSignal("ws-1", "actor-1", "approval-abc", "biz-1", "action-1")
    ).resolves.toBeUndefined();
  });

  it("resolves to undefined", async () => {
    const result = await routeApprovalRejectionSignal("ws-1", "actor-1", "approval-abc", "biz-1", null);
    expect(result).toBeUndefined();
  });

  it("passes null sourceProofId", async () => {
    await routeApprovalRejectionSignal("ws-1", "actor-1", "approval-abc", "biz-1", "action-1");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.sourceProofId).toBeNull();
  });
});

// ─── routeSopComplianceSignal ─────────────────────────────────────────────────

describe("routeSopComplianceSignal", () => {
  beforeEach(resetMock);

  it("does not emit when businessId is null (SOP alerts lack businessId)", async () => {
    await routeSopComplianceSignal("ws-1", "actor-1", "alert-abc", null);
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("does not emit when businessId is undefined", async () => {
    await routeSopComplianceSignal("ws-1", "actor-1", "alert-abc", undefined);
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("does not emit when businessId is empty string", async () => {
    await routeSopComplianceSignal("ws-1", "actor-1", "alert-abc", "");
    expect(mockCreateReassessmentEvent).not.toHaveBeenCalled();
  });

  it("resolves cleanly to undefined when businessId is null", async () => {
    const result = await routeSopComplianceSignal("ws-1", "actor-1", "alert-abc", null);
    expect(result).toBeUndefined();
  });

  it("would emit new_contradicting_evidence trigger if businessId were present", async () => {
    await routeSopComplianceSignal("ws-1", "actor-1", "alert-abc", "biz-future");
    expect(mockCreateReassessmentEvent).toHaveBeenCalledOnce();
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.trigger).toBe("new_contradicting_evidence");
  });

  it("would pass correct workspaceId when businessId is present", async () => {
    await routeSopComplianceSignal("ws-future", "actor-1", "alert-abc", "biz-future");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.workspaceId).toBe("ws-future");
  });

  it("would include alertId in triggerDescription when businessId is present", async () => {
    await routeSopComplianceSignal("ws-1", "actor-1", "alert-SPECIAL", "biz-future");
    const call = mockCreateReassessmentEvent.mock.calls[0][0];
    expect(call.triggerDescription).toContain("alert-SPECIAL");
  });

  it("swallows error even when businessId is present and createReassessmentEvent throws", async () => {
    mockCreateReassessmentEvent.mockRejectedValue(new Error("Downstream failure"));
    await expect(
      routeSopComplianceSignal("ws-1", "actor-1", "alert-abc", "biz-future")
    ).resolves.toBeUndefined();
  });
});

// ─── Cross-cutting: workspace isolation ──────────────────────────────────────

describe("workspace isolation", () => {
  beforeEach(resetMock);

  it("complaint signal: workspaceId propagates exactly", async () => {
    await routeComplaintResolutionSignal("ws-EXACT", "actor-1", "c-1", "biz-1");
    expect(mockCreateReassessmentEvent.mock.calls[0][0].workspaceId).toBe("ws-EXACT");
  });

  it("action failure signal: workspaceId propagates exactly", async () => {
    await routeActionFailureSignal("ws-EXACT2", "actor-1", "a-1", "biz-1");
    expect(mockCreateReassessmentEvent.mock.calls[0][0].workspaceId).toBe("ws-EXACT2");
  });

  it("approval rejection signal: workspaceId propagates exactly", async () => {
    await routeApprovalRejectionSignal("ws-EXACT3", "actor-1", "ap-1", "biz-1", null);
    expect(mockCreateReassessmentEvent.mock.calls[0][0].workspaceId).toBe("ws-EXACT3");
  });

  it("businessId never cross-contaminates between different calls", async () => {
    await routeComplaintResolutionSignal("ws-1", "actor-1", "c-1", "biz-A");
    await routeActionFailureSignal("ws-1", "actor-1", "a-1", "biz-B");
    expect(mockCreateReassessmentEvent.mock.calls[0][0].businessId).toBe("biz-A");
    expect(mockCreateReassessmentEvent.mock.calls[1][0].businessId).toBe("biz-B");
  });
});
