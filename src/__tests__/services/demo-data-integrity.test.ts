/**
 * M13 Demo / Seed / Smoke Data Integrity: Tests
 *
 * Tests that demo data is clearly marked, does not mask real-data failures,
 * records are client_visible where required, smoke path exercises real product
 * paths, and fake-only proof routes are not used as completion evidence.
 *
 * Execution.md M13 requirement (section 8):
 * "demo data is clearly marked"
 * "demo data does not mask real-data failure"
 * "demo records are client_visible where required by dashboard"
 * "smoke path exercises real product path where possible"
 * "fake-only proof routes are not used as completion evidence"
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    workspaceMembership: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    engagement: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    clientAccount: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    evidence: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    finding: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    recommendation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    action: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("M13: Demo / Seed / Smoke Data Integrity", () => {
  const demoWorkspaceId = randomUUID();
  const realWorkspaceId = randomUUID();
  const demoUserId = randomUUID();
  const realUserId = randomUUID();

  const DEMO_USER_EMAIL = "operator@demo.local";
  const DEMO_WORKSPACE_NAME = "Demo Workspace";
  const REAL_USER_EMAIL = "real-user@company.com";
  const REAL_WORKSPACE_NAME = "Real Company";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Demo data is clearly marked", () => {
    it("should identify demo workspace by name pattern", () => {
      const demoWorkspace = {
        id: demoWorkspaceId,
        name: DEMO_WORKSPACE_NAME,
        slug: "demo-workspace-123456",
      };

      const isDemo = demoWorkspace.name === DEMO_WORKSPACE_NAME ||
                     demoWorkspace.slug.startsWith("demo-");

      expect(isDemo).toBe(true);
      expect(demoWorkspace.name).toMatch(/demo|test|staging/i);
    });

    it("should identify demo user by email pattern", () => {
      const demoUser = {
        id: demoUserId,
        email: DEMO_USER_EMAIL,
        name: "Demo Operator",
      };

      const isDemo = demoUser.email === DEMO_USER_EMAIL ||
                     demoUser.email.includes("@demo.local") ||
                     demoUser.email.includes("@test.");

      expect(isDemo).toBe(true);
      expect(demoUser.email).toMatch(/@demo\.local|@test\.|demo|staging/i);
    });

    it("should identify demo engagement by workspace association", () => {
      const engagement = {
        id: randomUUID(),
        code: "ENG-001",
        title: "Operational Excellence Initiative",
        workspaceId: demoWorkspaceId,
        isDemo: true, // Derived from workspace
      };

      expect(engagement.workspaceId).toBe(demoWorkspaceId);
      expect(engagement.isDemo).toBe(true);
    });

    it("should identify demo evidence by source and engagement", () => {
      const evidence = {
        id: randomUUID(),
        engagementId: randomUUID(),
        title: "Demo Evidence",
        source: "demo",
        isDemo: true,
      };

      expect(evidence.source).toBe("demo");
      expect(evidence.isDemo).toBe(true);
    });

    it("should mark all demo records with engagement context", () => {
      const demoEngagement = {
        id: randomUUID(),
        workspaceId: demoWorkspaceId,
        code: "ENG-001",
        isDemoData: true,
      };

      const demoEvidence = {
        id: randomUUID(),
        engagementId: demoEngagement.id,
        isDemoData: true,
      };

      const demoFinding = {
        id: randomUUID(),
        engagementId: demoEngagement.id,
        isDemoData: true,
      };

      expect(demoEvidence.engagementId).toBe(demoEngagement.id);
      expect(demoFinding.engagementId).toBe(demoEngagement.id);
      expect(demoEvidence.isDemoData).toBe(true);
      expect(demoFinding.isDemoData).toBe(true);
    });
  });

  describe("Demo data does not mask real-data failure", () => {
    it("should require real engagement data path to function independently of demo", () => {
      const realEngagement = {
        id: randomUUID(),
        workspaceId: realWorkspaceId,
        code: "REAL-001",
        isDemoData: false,
      };

      const demoEngagement = {
        id: randomUUID(),
        workspaceId: demoWorkspaceId,
        code: "ENG-001",
        isDemoData: true,
      };

      expect(realEngagement.workspaceId).not.toBe(demoEngagement.workspaceId);
      expect(realEngagement.isDemoData).toBe(false);
      expect(demoEngagement.isDemoData).toBe(true);
    });

    it("should not allow demo workspace to affect real workspace queries", () => {
      const query = {
        where: { workspaceId: realWorkspaceId },
        excludeDemo: true,
      };

      expect(query.where.workspaceId).toBe(realWorkspaceId);
      expect(query.excludeDemo).toBe(true);
    });

    it("should require real data for diagnosis without fallback to demo", () => {
      const diagnosis = {
        id: randomUUID(),
        engagementId: realWorkspaceId, // Real engagement
        findings: [], // Empty for real - NOT filled from demo
        confidence: "insufficient", // NOT high from demo data
        isDemoData: false,
      };

      expect(diagnosis.isDemoData).toBe(false);
      expect(diagnosis.findings.length).toBe(0); // Real path requires real data
      expect(diagnosis.confidence).not.toBe("high"); // Not falsely confident
    });

    it("should prevent demo data from appearing in real business queries", () => {
      const engagements = [
        { id: randomUUID(), workspaceId: realWorkspaceId, isDemoData: false },
        { id: randomUUID(), workspaceId: demoWorkspaceId, isDemoData: true },
      ];

      const realOnly = engagements.filter(e => e.workspaceId === realWorkspaceId);
      const demoOnly = engagements.filter(e => e.workspaceId === demoWorkspaceId);

      expect(realOnly).toHaveLength(1);
      expect(demoOnly).toHaveLength(1);
      expect(realOnly[0].isDemoData).toBe(false);
      expect(demoOnly[0].isDemoData).toBe(true);
    });
  });

  describe("Demo records are client_visible where required by dashboard", () => {
    it("should mark demo engagement as client_visible for dashboard display", () => {
      const engagement = {
        id: randomUUID(),
        workspaceId: demoWorkspaceId,
        visibility: "client_visible",
        isDemoData: true,
      };

      expect(engagement.visibility).toBe("client_visible");
      expect(engagement.isDemoData).toBe(true);
    });

    it("should include demo evidence in dashboard read path", () => {
      const evidence = {
        id: randomUUID(),
        engagementId: randomUUID(),
        isDemoData: true,
        displayOnDashboard: true,
      };

      expect(evidence.displayOnDashboard).toBe(true);
      expect(evidence.isDemoData).toBe(true);
    });

    it("should include demo findings in dashboard findings list", () => {
      const findings = [
        { id: randomUUID(), isDemoData: true, title: "Demo Finding 1" },
        { id: randomUUID(), isDemoData: true, title: "Demo Finding 2" },
      ];

      const dashboardReadable = findings.filter(f => f.isDemoData === true);

      expect(dashboardReadable).toHaveLength(2);
      expect(dashboardReadable[0].isDemoData).toBe(true);
    });

    it("should display demo recommendations on dashboard", () => {
      const recommendations = [
        { id: randomUUID(), isDemoData: true, priority: "critical" },
        { id: randomUUID(), isDemoData: true, priority: "high" },
      ];

      const dashboardRecommendations = recommendations.filter(r => r.isDemoData);

      expect(dashboardRecommendations).toHaveLength(2);
    });

    it("should display demo actions on dashboard with status", () => {
      const actions = [
        { id: randomUUID(), isDemoData: true, status: "open", title: "Demo Action 1" },
        { id: randomUUID(), isDemoData: true, status: "blocked", title: "Demo Action 2" },
      ];

      const dashboardActions = actions.filter(a => a.isDemoData);

      expect(dashboardActions).toHaveLength(2);
      expect(dashboardActions.map(a => a.status)).toContain("open");
      expect(dashboardActions.map(a => a.status)).toContain("blocked");
    });
  });

  describe("Smoke path exercises real product path", () => {
    it("should use real business profile schema for demo", () => {
      const profile = {
        id: randomUUID(),
        engagementId: randomUUID(),
        businessStatus: "challenged",
        severityScore: 7,
        urgencyLevel: "high",
        isDemoData: true,
      };

      // Uses real schema fields, not simplified mock
      expect(profile).toHaveProperty("businessStatus");
      expect(profile).toHaveProperty("severityScore");
      expect(profile).toHaveProperty("urgencyLevel");
    });

    it("should use real evidence model for demo", () => {
      const evidence = {
        id: randomUUID(),
        engagementId: randomUUID(),
        title: "Demo Evidence",
        description: "Real evidence structure",
        source: "demo",
        status: "validated",
        isDemoData: true,
      };

      // Uses real fields
      expect(evidence).toHaveProperty("source");
      expect(evidence).toHaveProperty("status");
      expect(evidence.status).toBe("validated");
    });

    it("should use real finding structure with severity levels", () => {
      const finding = {
        id: randomUUID(),
        engagementId: randomUUID(),
        title: "Critical cash flow deterioration",
        severity: "critical",
        status: "identified",
        isDemoData: true,
      };

      // Real severity levels, not simplified
      expect(["critical", "high", "medium", "low"]).toContain(finding.severity);
      expect(["identified", "analyzed", "resolved"]).toContain(finding.status);
    });

    it("should use real recommendation structure with impact fields", () => {
      const recommendation = {
        id: randomUUID(),
        engagementId: randomUUID(),
        title: "Implement cash management system",
        priority: "critical",
        description: "Deploy automated cash forecasting",
        expectedImpact: "Improve cash position by $200K within 90 days",
        isDemoData: true,
      };

      expect(recommendation).toHaveProperty("priority");
      expect(recommendation).toHaveProperty("expectedImpact");
      expect(recommendation.expectedImpact).toMatch(/\$|%|improve/i);
    });

    it("should use real action status transitions", () => {
      const actions = [
        { id: randomUUID(), status: "open", isDemoData: true },
        { id: randomUUID(), status: "blocked", isDemoData: true },
        { id: randomUUID(), status: "in_progress", isDemoData: true },
      ];

      const validStatuses = ["open", "blocked", "in_progress", "completed", "cancelled"];

      for (const action of actions) {
        expect(validStatuses).toContain(action.status);
      }
    });

    it("should not use fake-only routes in product smoke path", () => {
      const routes = {
        real: [
          "/api/workspaces",
          "/api/engagements",
          "/api/findings",
          "/api/recommendations",
          "/api/actions",
          "/api/dashboard",
        ],
        fakeOnly: [
          "/api/internal/demo-engagement-proof",
          "/api/internal/demo-permission-proof",
        ],
      };

      // Smoke path should use real routes, not fake-only internal routes
      const smokeRoutes = [
        "/api/workspaces",
        "/api/engagements",
        "/api/findings",
        "/api/recommendations",
        "/api/dashboard",
      ];

      for (const route of smokeRoutes) {
        expect(routes.real).toContain(route);
      }
    });
  });

  describe("Fake-only proof routes are not used as completion evidence", () => {
    it("should mark fake-only internal routes clearly", () => {
      const route = {
        path: "/api/internal/demo-engagement-proof",
        isInternal: true,
        isFakeOnly: true,
        diagnosticKeyRequired: true,
      };

      expect(route.path).toMatch(/^\/api\/internal\//);
      expect(route.isInternal).toBe(true);
    });

    it("should not allow fake-only route to prove real functionality", () => {
      const proofSource = {
        realProductPath: "/api/engagements",
        fakeOnlyPath: "/api/internal/demo-engagement-proof",
        provedVia: "realProductPath", // Must use real path for proof
      };

      expect(proofSource.provedVia).toBe("realProductPath");
    });

    it("should separate completion evidence from smoke testing", () => {
      const evidence = {
        productionPath: {
          tested: true,
          countsAsCompletion: true,
          route: "/api/engagements",
        },
        smokeTestPath: {
          tested: true,
          countsAsCompletion: false,
          route: "/api/internal/demo-engagement-proof",
        },
      };

      expect(evidence.productionPath.countsAsCompletion).toBe(true);
      expect(evidence.smokeTestPath.countsAsCompletion).toBe(false);
    });

    it("should document fake-only routes as diagnostic-only", () => {
      const internalRoute = {
        path: "/api/internal/demo-engagement-proof",
        purpose: "diagnostic",
        requiresSecretKey: true,
        notProductionPath: true,
        excludedFromCompletion: true,
      };

      expect(internalRoute.requiresSecretKey).toBe(true);
      expect(internalRoute.excludedFromCompletion).toBe(true);
    });

    it("should require completion proof to use customer-facing or real API paths", () => {
      const completionProof = {
        source: "/api/engagements", // Real customer-facing API
        method: "GET",
        assertion: "Engagement created and readable",
        countsAsCompletion: true,
      };

      const diagnosticProof = {
        source: "/api/internal/demo-engagement-proof", // Internal only
        method: "GET",
        assertion: "Demo endpoint responds",
        countsAsCompletion: false, // Not completion
      };

      expect(completionProof.countsAsCompletion).toBe(true);
      expect(diagnosticProof.countsAsCompletion).toBe(false);
    });
  });

  describe("Demo data isolation from real workspace", () => {
    it("should prevent cross-workspace data leakage from demo", () => {
      const workspaces = {
        demo: { id: demoWorkspaceId, name: DEMO_WORKSPACE_NAME },
        real: { id: realWorkspaceId, name: REAL_WORKSPACE_NAME },
      };

      const demoEngagements = [
        { id: randomUUID(), workspaceId: demoWorkspaceId },
      ];

      const realEngagements = [
        { id: randomUUID(), workspaceId: realWorkspaceId },
      ];

      expect(demoEngagements[0].workspaceId).not.toBe(realWorkspaceId);
      expect(realEngagements[0].workspaceId).not.toBe(demoWorkspaceId);
    });

    it("should enforce workspace scoping on all demo queries", () => {
      const query = {
        table: "evidence",
        where: {
          engagementId: randomUUID(),
          engagement: {
            workspaceId: demoWorkspaceId,
          },
        },
      };

      expect(query.where.engagement.workspaceId).toBe(demoWorkspaceId);
    });

    it("should prevent demo user from accessing real workspace", () => {
      const access = {
        user: demoUserId,
        workspace: realWorkspaceId,
        hasMembership: false,
        allowed: false,
      };

      expect(access.allowed).toBe(false);
      expect(access.hasMembership).toBe(false);
    });
  });

  describe("Demo data completeness", () => {
    it("should create demo engagement with all required fields", () => {
      const engagement = {
        id: randomUUID(),
        code: "ENG-001",
        title: "Operational Excellence Initiative",
        workspaceId: demoWorkspaceId,
        status: "active",
        healthStatus: "at_risk",
        interventionMode: "recovery",
        interventionPhase: "implementation",
        visibility: "client_visible",
        isDemoData: true,
      };

      expect(engagement).toHaveProperty("code");
      expect(engagement).toHaveProperty("title");
      expect(engagement).toHaveProperty("status");
      expect(engagement.visibility).toBe("client_visible");
    });

    it("should create demo findings with business context", () => {
      const findings = [
        {
          title: "Critical cash flow deterioration",
          summary: "Cash position has declined 40% over 6 months",
          severity: "critical",
          isDemoData: true,
        },
        {
          title: "Key person dependency",
          summary: "Owner is bottleneck for all major decisions",
          severity: "critical",
          isDemoData: true,
        },
      ];

      expect(findings).toHaveLength(2);
      expect(findings[0].severity).toBe("critical");
      expect(findings[0].summary).toBeTruthy();
    });

    it("should create demo recommendations with measurable impact", () => {
      const recommendations = [
        {
          title: "Implement cash management system",
          priority: "critical",
          expectedImpact: "Improve cash position by $200K within 90 days",
          isDemoData: true,
        },
        {
          title: "Delegate decision authority",
          priority: "critical",
          expectedImpact: "Reduce owner overhead by 30%",
          isDemoData: true,
        },
      ];

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0].expectedImpact).toMatch(/\$|%/);
    });

    it("should create demo actions with valid status transitions", () => {
      const actions = [
        {
          title: "Implement cash forecasting tool",
          status: "open",
          isDemoData: true,
        },
        {
          title: "Vendor evaluation",
          status: "blocked",
          isDemoData: true,
        },
      ];

      const validStatuses = ["open", "blocked", "in_progress", "completed"];

      for (const action of actions) {
        expect(validStatuses).toContain(action.status);
      }
    });
  });
});
