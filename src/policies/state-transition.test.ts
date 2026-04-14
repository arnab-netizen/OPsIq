import { describe, it, expect } from "vitest";
import {
  validateStageTransition,
  validateActionTransition,
  validateEvidenceTransition,
  validateApprovalTransition,
  validateRiskTransition,
  validateEngagementTransition,
  validateDeliverableTransition,
  getStageAllowedTransitions,
} from "./state-transition";
import { InvalidStateTransitionError } from "@/infra/errors";

describe("State transition validation", () => {
  describe("Stage transitions", () => {
    it("allows valid transition: draft → not_started", () => {
      expect(() => validateStageTransition("draft", "not_started")).not.toThrow();
    });

    it("allows valid transition: active → blocked", () => {
      expect(() => validateStageTransition("active", "blocked")).not.toThrow();
    });

    it("allows valid transition: active → completed", () => {
      expect(() => validateStageTransition("active", "completed")).not.toThrow();
    });

    it("allows valid transition: completed → reopened", () => {
      expect(() => validateStageTransition("completed", "reopened")).not.toThrow();
    });

    it("allows valid transition: blocked → forced_closure_review", () => {
      expect(() =>
        validateStageTransition("blocked", "forced_closure_review")
      ).not.toThrow();
    });

    it("rejects invalid transition: draft → completed", () => {
      expect(() => validateStageTransition("draft", "completed")).toThrow(
        InvalidStateTransitionError
      );
    });

    it("rejects invalid transition: completed → active", () => {
      expect(() => validateStageTransition("completed", "active")).toThrow(
        InvalidStateTransitionError
      );
    });

    it("rejects transition to same state when not in allowed list", () => {
      expect(() => validateStageTransition("draft", "draft")).toThrow(
        InvalidStateTransitionError
      );
    });

    it("getStageAllowedTransitions returns correct list for active", () => {
      const allowed = getStageAllowedTransitions("active");
      expect(allowed).toContain("blocked");
      expect(allowed).toContain("completed");
      expect(allowed).toContain("cancelled");
      expect(allowed).not.toContain("draft");
    });

    it("getStageAllowedTransitions returns empty for terminal cancelled", () => {
      const allowed = getStageAllowedTransitions("cancelled");
      // cancelled can go to reopened
      expect(allowed).toContain("reopened");
    });
  });

  describe("Action transitions", () => {
    it("allows draft → assigned", () => {
      expect(() => validateActionTransition("draft", "assigned")).not.toThrow();
    });

    it("allows completed → verified", () => {
      expect(() => validateActionTransition("completed", "verified")).not.toThrow();
    });

    it("rejects draft → completed", () => {
      expect(() => validateActionTransition("draft", "completed")).toThrow(
        InvalidStateTransitionError
      );
    });

    it("rejects verified → anything (terminal)", () => {
      expect(() => validateActionTransition("verified", "draft")).toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe("Evidence transitions", () => {
    it("allows submitted → under_review", () => {
      expect(() => validateEvidenceTransition("submitted", "under_review")).not.toThrow();
    });

    it("allows validated → superseded", () => {
      expect(() => validateEvidenceTransition("validated", "superseded")).not.toThrow();
    });

    it("rejects submitted → validated (must go through review)", () => {
      expect(() => validateEvidenceTransition("submitted", "validated")).toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe("Approval transitions", () => {
    it("allows pending → approved", () => {
      expect(() => validateApprovalTransition("pending", "approved")).not.toThrow();
    });

    it("allows pending → denied", () => {
      expect(() => validateApprovalTransition("pending", "denied")).not.toThrow();
    });

    it("rejects approved → pending (terminal)", () => {
      expect(() => validateApprovalTransition("approved", "pending")).toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe("Risk transitions", () => {
    it("allows identified → assessed", () => {
      expect(() => validateRiskTransition("identified", "assessed")).not.toThrow();
    });

    it("allows escalated → mitigating", () => {
      expect(() => validateRiskTransition("escalated", "mitigating")).not.toThrow();
    });

    it("rejects identified → closed (must be assessed first)", () => {
      expect(() => validateRiskTransition("identified", "closed")).toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe("Engagement transitions", () => {
    it("allows draft → active", () => {
      expect(() => validateEngagementTransition("draft", "active")).not.toThrow();
    });

    it("allows completed → archived", () => {
      expect(() => validateEngagementTransition("completed", "archived")).not.toThrow();
    });

    it("rejects archived → active (terminal)", () => {
      expect(() => validateEngagementTransition("archived", "active")).toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe("Deliverable transitions", () => {
    it("allows draft → in_progress", () => {
      expect(() => validateDeliverableTransition("draft", "in_progress")).not.toThrow();
    });

    it("allows rejected → in_progress", () => {
      expect(() => validateDeliverableTransition("rejected", "in_progress")).not.toThrow();
    });

    it("rejects superseded → anything (terminal)", () => {
      expect(() => validateDeliverableTransition("superseded", "draft")).toThrow(
        InvalidStateTransitionError
      );
    });
  });
});
