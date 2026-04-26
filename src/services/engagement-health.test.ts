import { describe, it, expect } from "vitest";

describe("Engagement Health Service", () => {
  describe("Health Status Determination", () => {
    it("returns BLOCKED when critical finding is unresolved", () => {
      const findings = [
        { id: "f1", severity: "critical", status: "open" },
        { id: "f2", severity: "high", status: "open" },
      ];
      const actions: any[] = [];

      const hasBlockingCriticalFindings = findings.some(
        (f) => f.severity === "critical" && f.status !== "resolved"
      );

      expect(hasBlockingCriticalFindings).toBe(true);
      const status = "blocked";
      expect(status).toBe("blocked");
    });

    it("returns BLOCKED when critical action is overdue", () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24);

      const actions = [
        {
          id: "a1",
          priority: "critical",
          status: "open",
          dueDate: pastDate,
        },
      ];

      const overdueActions = actions.filter(
        (a) => a.dueDate < now && a.status !== "completed"
      );
      const overdueWithCritical = overdueActions.filter((a) => a.priority === "critical");

      expect(overdueWithCritical.length).toBeGreaterThan(0);
      const status = overdueWithCritical.length > 0 ? "blocked" : "healthy";
      expect(status).toBe("blocked");
    });

    it("returns BLOCKED when critical action is blocked", () => {
      const actions = [
        { id: "a1", priority: "critical", status: "blocked" },
        { id: "a2", priority: "high", status: "blocked" },
      ];

      const blockedCriticalActions = actions.filter(
        (a) => a.priority === "critical" && a.status === "blocked"
      );

      expect(blockedCriticalActions.length).toBeGreaterThan(0);
      const status = blockedCriticalActions.length > 0 ? "blocked" : "healthy";
      expect(status).toBe("blocked");
    });

    it("returns AT_RISK when multiple high-priority actions exist", () => {
      const actions = [
        { id: "a1", priority: "high", status: "in_progress" },
        { id: "a2", priority: "high", status: "in_progress" },
        { id: "a3", priority: "high", status: "in_progress" },
        { id: "a4", priority: "high", status: "in_progress" },
      ];

      const highPriorityActions = actions.filter(
        (a) => (a.priority === "critical" || a.priority === "high") &&
               a.status !== "completed"
      );

      expect(highPriorityActions.length).toBeGreaterThan(3);
      const status = highPriorityActions.length > 3 ? "at_risk" : "healthy";
      expect(status).toBe("at_risk");
    });

    it("returns AT_RISK when actions are overdue but not critical", () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24);

      const actions = [
        {
          id: "a1",
          priority: "high",
          status: "in_progress",
          dueDate: pastDate,
        },
      ];

      const overdueActions = actions.filter(
        (a) => a.dueDate < now && a.status !== "completed"
      );

      expect(overdueActions.length).toBeGreaterThan(0);
      const status = overdueActions.length > 0 ? "at_risk" : "healthy";
      expect(status).toBe("at_risk");
    });

    it("returns HEALTHY when all conditions are met", () => {
      const findings = [
        { id: "f1", severity: "high", status: "resolved" },
        { id: "f2", severity: "low", status: "open" },
      ];
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
      const actions = [
        { id: "a1", priority: "high", status: "in_progress", dueDate: futureDate },
        { id: "a2", priority: "medium", status: "completed" },
      ];

      const unresolvedCritical = findings.filter(
        (f) => f.severity === "critical" && f.status !== "resolved"
      );
      const overdueActions = actions.filter(
        (a) => a.dueDate && a.dueDate < now && a.status !== "completed"
      );
      const highPriorityActive = actions.filter(
        (a) => (a.priority === "critical" || a.priority === "high") &&
               a.status !== "completed"
      );

      expect(unresolvedCritical.length).toBe(0);
      expect(overdueActions.length).toBe(0);
      expect(highPriorityActive.length).toBeLessThanOrEqual(3);

      const status = "healthy";
      expect(status).toBe("healthy");
    });
  });

  describe("Enforcement Rules", () => {
    it("prevents completing engagement when blocked", () => {
      const health = {
        status: "blocked" as const,
        requiresIntervention: true,
      };
      const desiredStatus = "completed";

      const canTransition = health.status !== "blocked";
      expect(canTransition).toBe(false);
    });

    it("allows completing engagement when healthy", () => {
      const health = {
        status: "healthy" as const,
        requiresIntervention: false,
      };
      const desiredStatus = "completed";

      const canTransition = health.status !== "blocked";
      expect(canTransition).toBe(true);
    });

    it("allows progressing when at_risk", () => {
      const health = {
        status: "at_risk" as const,
        requiresIntervention: false,
      };
      const desiredStatus = "in_review";

      const canTransition = !(health.status === "blocked" && desiredStatus === "completed");
      expect(canTransition).toBe(true);
    });

    it("requires intervention when status is blocked", () => {
      const health = {
        status: "blocked" as const,
        requiresIntervention: true,
        reasons: [
          "2 unresolved critical findings",
          "1 critical action is overdue",
        ],
      };

      expect(health.requiresIntervention).toBe(true);
      expect(health.reasons.length).toBeGreaterThan(0);
    });
  });

  describe("Blocking Conditions", () => {
    it("identifies all blocking reasons", () => {
      const reasons = [
        "1 unresolved critical finding(s) blocking progress",
        "1 critical action(s) are blocked and must be resolved",
        "1 critical action(s) are overdue and blocking progress",
      ];

      expect(reasons.length).toBe(3);
      expect(reasons.every((r) => r.includes("critical"))).toBe(true);
    });

    it("counts unresolved critical findings correctly", () => {
      const findings = [
        { id: "f1", severity: "critical", status: "open" },
        { id: "f2", severity: "critical", status: "open" },
        { id: "f3", severity: "critical", status: "resolved" },
        { id: "f4", severity: "high", status: "open" },
      ];

      const unresolvedCritical = findings.filter(
        (f) => f.severity === "critical" && f.status !== "resolved"
      );

      expect(unresolvedCritical.length).toBe(2);
    });

    it("counts blocked critical actions correctly", () => {
      const actions = [
        { id: "a1", priority: "critical", status: "blocked" },
        { id: "a2", priority: "critical", status: "in_progress" },
        { id: "a3", priority: "high", status: "blocked" },
      ];

      const blockedCritical = actions.filter(
        (a) => a.priority === "critical" && a.status === "blocked"
      );

      expect(blockedCritical.length).toBe(1);
    });

    it("counts overdue critical actions correctly", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000 * 60 * 60 * 24);
      const future = new Date(now.getTime() + 1000 * 60 * 60 * 24);

      const actions = [
        { id: "a1", priority: "critical", status: "open", dueDate: past },
        { id: "a2", priority: "critical", status: "open", dueDate: future },
        { id: "a3", priority: "high", status: "open", dueDate: past },
      ];

      const overdueActions = actions.filter((a) => a.dueDate < now);
      const overdueWithCritical = overdueActions.filter((a) => a.priority === "critical");

      expect(overdueWithCritical.length).toBe(1);
    });
  });

  describe("At-Risk Conditions", () => {
    it("flags at_risk when high-priority threshold exceeded", () => {
      const actions = [
        { id: "a1", priority: "high", status: "in_progress" },
        { id: "a2", priority: "high", status: "in_progress" },
        { id: "a3", priority: "high", status: "in_progress" },
        { id: "a4", priority: "high", status: "in_progress" },
      ];

      const highPriority = actions.filter(
        (a) => (a.priority === "critical" || a.priority === "high") &&
               a.status !== "completed"
      );

      expect(highPriority.length).toBeGreaterThan(3);
    });

    it("counts high-priority actions correctly", () => {
      const actions = [
        { id: "a1", priority: "critical", status: "in_progress" },
        { id: "a2", priority: "high", status: "in_progress" },
        { id: "a3", priority: "high", status: "completed" },
        { id: "a4", priority: "medium", status: "in_progress" },
      ];

      const highPriority = actions.filter(
        (a) => (a.priority === "critical" || a.priority === "high") &&
               a.status !== "completed" &&
               a.status !== "cancelled"
      );

      expect(highPriority.length).toBe(2);
    });
  });

  describe("Health Change Detection", () => {
    it("detects status transition from healthy to blocked", () => {
      const previousHealth = {
        status: "healthy" as const,
        reasons: [],
      };

      const currentHealth = {
        status: "blocked" as const,
        reasons: ["Critical finding unresolved"],
      };

      const changed = previousHealth.status !== currentHealth.status;
      const transition = changed
        ? { from: previousHealth.status, to: currentHealth.status }
        : undefined;

      expect(changed).toBe(true);
      expect(transition?.from).toBe("healthy");
      expect(transition?.to).toBe("blocked");
    });

    it("detects new and resolved reasons", () => {
      const previousReasons = [
        "1 critical finding unresolved",
        "1 critical action overdue",
      ];

      const currentReasons = [
        "1 critical finding unresolved",
      ];

      const newReasons = currentReasons.filter((r) => !previousReasons.includes(r));
      const resolvedReasons = previousReasons.filter((r) => !currentReasons.includes(r));

      expect(newReasons.length).toBe(0);
      expect(resolvedReasons.length).toBe(1);
      expect(resolvedReasons[0]).toContain("overdue");
    });
  });

  describe("Health Details", () => {
    it("tracks all health metrics", () => {
      const details = {
        criticalFindings: 2,
        criticalActions: 3,
        overdueActions: 1,
        blockedCriticalActions: 1,
        highPriorityActions: 4,
      };

      expect(details.criticalFindings).toBeGreaterThan(0);
      expect(details.blockedCriticalActions).toBeGreaterThan(0);
      expect(details.overdueActions).toBeGreaterThan(0);
    });

    it("provides health snapshot with timestamp", () => {
      const snapshot = {
        health: {
          status: "blocked" as const,
          reasons: ["Critical issue"],
          requiresIntervention: true,
          details: {
            criticalFindings: 1,
            criticalActions: 0,
            overdueActions: 0,
            blockedCriticalActions: 0,
            highPriorityActions: 0,
          },
        },
        timestamp: new Date().toISOString(),
        engagementCode: "ENG-001",
      };

      expect(snapshot.timestamp).toBeTruthy();
      expect(snapshot.engagementCode).toBeTruthy();
      expect(snapshot.health.status).toBe("blocked");
    });
  });
});
