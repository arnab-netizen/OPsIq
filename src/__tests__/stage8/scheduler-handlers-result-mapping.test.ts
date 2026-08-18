/**
 * F-SCHED-FALSE-SUCCESS — handler result-mapping proof.
 *
 * scheduler-handlers.ts's three production handlers each wrap a domain
 * function that already returns a truthful per-item result object
 * (RetryEmailAlertResult / ReconcileResult / DueScanResult) — the defect
 * this closes was that the HANDLER discarded that object and let
 * processDue() see only "the Promise resolved," so a resolved-but-partially-
 * failed domain call was recorded as an undifferentiated "completed"
 * ScheduledTask, identical to a fully successful one.
 *
 * This file unit-tests exactly what changed — the mapping from each domain
 * function's real return shape to the handler's own HandlerResult — by
 * mocking the domain functions themselves. It does not re-prove the domain
 * functions' own internal correctness (covered by their existing test
 * suites) or the scheduler's claim/lease/retry mechanics (covered by
 * scheduler-p0-08-hostile.db.test.ts). The reassessment-scan case additionally
 * has full real-Postgres DB proof in
 * reassessment-scan-p0-09-hostile.db.test.ts (tests 21/22) since it is the
 * handler most directly tied to a governed critical operation
 * (CLAUDE.md's mandatory adaptive-rule reassessment); this file covers the
 * mapping logic for all three handlers uniformly, including the two that do
 * not have a dedicated real-Postgres hostile suite of their own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const retryEmailAlert = vi.fn();
const reconcileMissingFinanceLearningSignals = vi.fn();
const scanDueReassessments = vi.fn();

vi.mock("@/services/alerts/alert-email-retry.service", () => ({ retryEmailAlert }));
vi.mock("@/services/owner-finance/learning-bridge.service", () => ({ reconcileMissingFinanceLearningSignals }));
vi.mock("@/services/owner-budget/due-reassessment.service", () => ({ scanDueReassessments }));
vi.mock("@/domain/owner-budget/system-actor", () => ({ SCHEDULER_SYSTEM_ACTOR: "system-actor-stub" }));

async function loadHandlers() {
  const mod = await import("@/infra/scheduler-handlers");
  return mod.getProductionTaskHandlers();
}

const ctx = (workspaceId: string) => ({ taskId: "t1", taskName: "x", workspaceId, attempt: 1 });

describe("[unit] F-SCHED-FALSE-SUCCESS — handler result mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("alert-email-retry handler", () => {
    it("maps a SENT delivery to SUCCESS", async () => {
      retryEmailAlert.mockResolvedValue({ alertId: "a1", status: "SENT", attemptCount: 1 });
      const handler = (await loadHandlers()).get("alert-email-retry")!;
      const result = await handler({ alertId: "a1" }, ctx("ws1"));
      expect(result).toEqual({ status: "SUCCESS" });
    });

    it("maps a FAILED delivery to PARTIAL_FAILURE with an owner-visible summary — NOT silent completion", async () => {
      retryEmailAlert.mockResolvedValue({ alertId: "a1", status: "FAILED", attemptCount: 2, message: "provider 503" });
      const handler = (await loadHandlers()).get("alert-email-retry")!;
      const result = await handler({ alertId: "a1" }, ctx("ws1"));
      expect(result?.status).toBe("PARTIAL_FAILURE");
      expect(result?.summary).toContain("a1");
      expect(result?.summary).toContain("provider 503");
      expect(result?.counts).toEqual({ failed: 1 });
    });

    it("maps ALREADY_TERMINAL/SKIPPED to SUCCESS (nothing outstanding, not a failure)", async () => {
      retryEmailAlert.mockResolvedValue({ alertId: "a1", status: "ALREADY_TERMINAL", attemptCount: 1 });
      const handler = (await loadHandlers()).get("alert-email-retry")!;
      expect(await handler({ alertId: "a1" }, ctx("ws1"))).toEqual({ status: "SUCCESS" });
    });
  });

  describe("finance-learning-bridge handler", () => {
    it("maps zero gaps to NO_WORK", async () => {
      reconcileMissingFinanceLearningSignals.mockResolvedValue({ gapsFound: 0, gapsBridged: 0, gapsSkipped: 0, errors: [] });
      const handler = (await loadHandlers()).get("finance-learning-bridge")!;
      expect(await handler(null, ctx("ws1"))).toEqual({ status: "NO_WORK" });
    });

    it("maps all-bridged gaps to SUCCESS", async () => {
      reconcileMissingFinanceLearningSignals.mockResolvedValue({ gapsFound: 3, gapsBridged: 3, gapsSkipped: 0, errors: [] });
      const handler = (await loadHandlers()).get("finance-learning-bridge")!;
      const result = await handler(null, ctx("ws1"));
      expect(result?.status).toBe("SUCCESS");
      expect(result?.counts).toEqual({ gapsFound: 3, gapsBridged: 3 });
    });

    it("maps a non-empty errors[] to PARTIAL_FAILURE — one failed item does not disappear into a 'completed' task", async () => {
      reconcileMissingFinanceLearningSignals.mockResolvedValue({
        gapsFound: 5, gapsBridged: 4, gapsSkipped: 0,
        errors: ["verificationId=v1: NotFoundError: business missing"],
      });
      const handler = (await loadHandlers()).get("finance-learning-bridge")!;
      const result = await handler(null, ctx("ws1"));
      expect(result?.status).toBe("PARTIAL_FAILURE");
      expect(result?.summary).toContain("1 of 5");
      expect(result?.summary).toContain("v1");
      expect(result?.counts).toEqual({ gapsFound: 5, gapsBridged: 4, gapsSkipped: 0, errors: 1 });
    });

    it("truncates the summary to the first 3 errors so it stays owner-readable", async () => {
      reconcileMissingFinanceLearningSignals.mockResolvedValue({
        gapsFound: 6, gapsBridged: 2, gapsSkipped: 0,
        errors: ["e1", "e2", "e3", "e4"],
      });
      const handler = (await loadHandlers()).get("finance-learning-bridge")!;
      const result = await handler(null, ctx("ws1"));
      expect(result?.summary).toContain("+1 more");
    });
  });

  describe("reassessment-scan handler", () => {
    it("maps zero-scanned to NO_WORK", async () => {
      scanDueReassessments.mockResolvedValue({ scanned: 0, reassessed: 0, skipped: 0, businesses: [] });
      const handler = (await loadHandlers()).get("reassessment-scan")!;
      expect(await handler(null, ctx("ws1"))).toEqual({ status: "NO_WORK" });
    });

    it("maps all-reassessed to SUCCESS", async () => {
      scanDueReassessments.mockResolvedValue({
        scanned: 2, reassessed: 2, skipped: 0,
        businesses: [{ workspaceId: "ws1", businessId: "b1", ok: true }, { workspaceId: "ws1", businessId: "b2", ok: true }],
      });
      const handler = (await loadHandlers()).get("reassessment-scan")!;
      const result = await handler(null, ctx("ws1"));
      expect(result?.status).toBe("SUCCESS");
    });

    it("maps a mixed ok/not-ok business result to PARTIAL_FAILURE identifying the failed business — the false-success case", async () => {
      scanDueReassessments.mockResolvedValue({
        scanned: 2, reassessed: 1, skipped: 1,
        businesses: [
          { workspaceId: "ws1", businessId: "b-ok", ok: true },
          { workspaceId: "ws1", businessId: "b-fail", ok: false },
        ],
      });
      const handler = (await loadHandlers()).get("reassessment-scan")!;
      const result = await handler(null, ctx("ws1"));
      expect(result?.status).toBe("PARTIAL_FAILURE");
      expect(result?.summary).toContain("b-fail");
      expect(result?.summary).not.toContain("b-ok"); // only the failing business is named
      expect(result?.counts).toEqual({ scanned: 2, reassessed: 1, skipped: 1 });
    });
  });
});
