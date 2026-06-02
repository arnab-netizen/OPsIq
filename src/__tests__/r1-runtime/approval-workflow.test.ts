import { describe, it, expect } from "vitest";
import {
  requiresApproval,
  APPROVAL_THRESHOLD,
} from "@/services/approval/workflow";

describe("Phase R1: Approval Workflow Service", () => {
  describe("requiresApproval", () => {
    it("requires approval for decisions exceeding 100k threshold", async () => {
      const requires = await requiresApproval(150000);
      expect(requires).toBe(true);
    });

    it("does not require approval for decisions below threshold", async () => {
      const requires = await requiresApproval(50000);
      expect(requires).toBe(false);
    });

    it("requires approval at threshold boundary", async () => {
      const requires = await requiresApproval(APPROVAL_THRESHOLD + 1);
      expect(requires).toBe(true);
    });

    it("does not require approval at boundary - 1", async () => {
      const requires = await requiresApproval(APPROVAL_THRESHOLD - 1);
      expect(requires).toBe(false);
    });
  });
});
