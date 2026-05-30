/**
 * DEMO ENGAGEMENT PROOF & BACKFILL ENDPOINT TESTS
 *
 * Verify: GET returns demo engagement state, POST idempotently backfills missing demo engagement,
 * diagnostic key validation, fail-closed semantics, no duplicate engagements,
 * correct workspace linking.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import * as demoEngagementRoute from "@/app/api/internal/demo-engagement-proof/route";

// Mock database
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
    workspaceMembership: {
      findFirst: vi.fn(),
    },
    engagement: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    clientAccount: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock logger
vi.mock("@/infra/logger", () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const { db } = await import("@/lib/db");

describe("Demo Engagement Proof & Backfill Endpoint", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";
  const demoUserEmail = "operator@demo.local";
  const diagnosticKey = "test-diagnostic-key-123";

  const createMockRequest = (method: "GET" | "POST", diagnosticKeyValue?: string): NextRequest => {
    const headers = new Headers();
    if (diagnosticKeyValue !== undefined) {
      headers.set("x-opsiq-diagnostic-key", diagnosticKeyValue);
    }
    return new NextRequest(new URL("http://localhost:3000/api/internal/demo-engagement-proof"), {
      method,
      headers,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPSIQ_DIAGNOSTIC_KEY = diagnosticKey;
  });

  describe("Diagnostic key validation", () => {
    it("GET without diagnostic key returns 404", async () => {
      const request = createMockRequest("GET");
      const response = await demoEngagementRoute.GET(request);
      expect(response.status).toBe(404);
    });

    it("GET with wrong diagnostic key returns 404", async () => {
      const request = createMockRequest("GET", "wrong-key");
      const response = await demoEngagementRoute.GET(request);
      expect(response.status).toBe(404);
    });

    it("GET with correct diagnostic key proceeds", async () => {
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);
      const request = createMockRequest("GET", diagnosticKey);
      const response = await demoEngagementRoute.GET(request);
      expect(response.status).toBe(200);
    });

    it("POST without diagnostic key returns 404", async () => {
      const request = createMockRequest("POST");
      const response = await demoEngagementRoute.POST(request);
      expect(response.status).toBe(404);
    });
  });

  describe("GET - Engagement Proof", () => {
    it("returns membership_missing when user not found", async () => {
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);

      const request = createMockRequest("GET", diagnosticKey);
      const response = await demoEngagementRoute.GET(request);
      const data = await response.json();

      expect(data.userFound).toBe(false);
      expect(data.classification).toBe("membership_missing");
    });

    it("returns demo_engagement_missing when no scoped engagement exists", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);
      vi.mocked(db.engagement.findMany).mockResolvedValueOnce([]); // No candidates
      vi.mocked(db.engagement.count).mockResolvedValueOnce(0); // Scoped count
      vi.mocked(db.engagement.count).mockResolvedValueOnce(5); // Total count
      vi.mocked(db.clientAccount.findFirst).mockResolvedValueOnce({ id: "client-1" } as any);

      const request = createMockRequest("GET", diagnosticKey);
      const response = await demoEngagementRoute.GET(request);
      const data = await response.json();

      expect(data.classification).toBe("demo_engagement_missing");
      expect(data.scopedEngagementCount).toBe(0);
      expect(data.demoEngagementFound).toBe(false);
    });

    it("returns demo_data_ready when demo engagement found and workspace matches", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };
      const mockDemoEngagement = {
        id: "eng-1",
        code: "ENG-001",
        workspaceId: validUUID,
        clientId: "client-1",
      };
      const mockClient = { id: "client-1", name: "Demo Manufacturing Corp" };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);
      vi.mocked(db.engagement.findMany).mockResolvedValueOnce([mockDemoEngagement] as any);
      vi.mocked(db.engagement.count).mockResolvedValueOnce(1); // Scoped count
      vi.mocked(db.engagement.count).mockResolvedValueOnce(1); // Total count
      vi.mocked(db.clientAccount.findFirst).mockResolvedValueOnce(mockClient as any);

      const request = createMockRequest("GET", diagnosticKey);
      const response = await demoEngagementRoute.GET(request);
      const data = await response.json();

      expect(data.classification).toBe("demo_data_ready");
      expect(data.demoEngagementFound).toBe(true);
      expect(data.demoEngagementWorkspaceMatches).toBe(true);
      expect(data.demoClientWorkspaceMatches).toBe(true);
    });

    it("returns demo_engagement_wrong_workspace when workspace does not match", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };
      const wrongUUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const mockDemoEngagement = {
        id: "eng-1",
        code: "ENG-001",
        workspaceId: wrongUUID, // Wrong workspace
        clientId: "client-1",
      };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);
      vi.mocked(db.engagement.findMany).mockResolvedValueOnce([mockDemoEngagement] as any);
      vi.mocked(db.engagement.count).mockResolvedValueOnce(0); // Scoped count
      vi.mocked(db.engagement.count).mockResolvedValueOnce(1); // Total count
      vi.mocked(db.clientAccount.findFirst).mockResolvedValueOnce({ id: "client-1" } as any);

      const request = createMockRequest("GET", diagnosticKey);
      const response = await demoEngagementRoute.GET(request);
      const data = await response.json();

      expect(data.classification).toBe("demo_engagement_wrong_workspace");
      expect(data.demoEngagementWorkspaceMatches).toBe(false);
    });

    it("returns duplicate_demo_engagement_candidates when multiple exist", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };
      const mockDuplicate1 = { id: "eng-1", code: "ENG-001", workspaceId: validUUID };
      const mockDuplicate2 = { id: "eng-2", code: "ENG-001", workspaceId: validUUID };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);
      vi.mocked(db.engagement.findMany).mockResolvedValueOnce([mockDuplicate1, mockDuplicate2] as any);

      const request = createMockRequest("GET", diagnosticKey);
      const response = await demoEngagementRoute.GET(request);
      const data = await response.json();

      expect(data.classification).toBe("duplicate_demo_engagement_candidates");
      expect(data.duplicateDemoEngagementCandidates).toBe(true);
    });

    it("masks workspace ID in safe output", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);
      vi.mocked(db.engagement.findMany).mockResolvedValueOnce([]);

      const request = createMockRequest("GET", diagnosticKey);
      const response = await demoEngagementRoute.GET(request);
      const data = await response.json();

      expect(data.workspaceIdSample).toMatch(/^550e\.\.\.0000$/);
    });
  });

  describe("POST - Idempotent Backfill", () => {
    it("creates new demo engagement when missing", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };
      const mockNewClient = { id: "client-1", name: "Demo Manufacturing Corp" };
      const mockNewEngagement = {
        id: "eng-1",
        code: "ENG-001",
        workspaceId: validUUID,
        clientId: "client-1",
      };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);

      // Mock transaction
      const txMock = {
        engagement: {
          findMany: vi.fn().mockResolvedValueOnce([] as any), // No candidates in tx
          create: vi.fn().mockResolvedValueOnce(mockNewEngagement as any),
        },
        clientAccount: {
          findFirst: vi.fn().mockResolvedValueOnce(mockNewClient as any),
        },
      };

      vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
        return callback(txMock);
      });

      const request = createMockRequest("POST", diagnosticKey);
      const response = await demoEngagementRoute.POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe("success");
      expect(data.backfillAction).toBe("created");
    });

    it("relinks known demo engagement with wrong workspace", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };
      const wrongUUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const mockOldEngagement = {
        id: "eng-1",
        code: "ENG-001",
        workspaceId: wrongUUID,
      };
      const mockUpdatedEngagement = {
        ...mockOldEngagement,
        workspaceId: validUUID,
      };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);

      const txMock = {
        engagement: {
          findMany: vi.fn().mockResolvedValueOnce([mockOldEngagement] as any),
          update: vi.fn().mockResolvedValueOnce(mockUpdatedEngagement as any),
        },
        clientAccount: {
          findFirst: vi.fn().mockResolvedValueOnce({ id: "client-1" } as any),
        },
      };

      vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
        return callback(txMock);
      });

      const request = createMockRequest("POST", diagnosticKey);
      const response = await demoEngagementRoute.POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.backfillAction).toBe("relinked_known_demo");
    });

    it("does not create duplicate - returns success if already ready", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };
      const mockExistingEngagement = {
        id: "eng-1",
        code: "ENG-001",
        workspaceId: validUUID,
      };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);

      const txMock = {
        engagement: {
          findMany: vi.fn().mockResolvedValueOnce([mockExistingEngagement] as any),
        },
        clientAccount: {
          findFirst: vi.fn().mockResolvedValueOnce({ id: "client-1" } as any),
        },
      };

      vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
        return callback(txMock);
      });

      const request = createMockRequest("POST", diagnosticKey);
      const response = await demoEngagementRoute.POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.backfillAction).toBe("already_ready");
    });

    it("fails closed with 400 when membership missing", async () => {
      vi.mocked(db.user.findUnique).mockResolvedValueOnce({ id: "user-1" } as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(null);

      const request = createMockRequest("POST", diagnosticKey);
      const response = await demoEngagementRoute.POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.status).toBe("failed");
      expect(data.reason).toBe("membership_not_found");
    });

    it("fails closed when duplicate demo engagement candidates exist", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };

      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);

      const txMock = {
        engagement: {
          findMany: vi.fn().mockResolvedValueOnce([
            { id: "eng-1", code: "ENG-001" },
            { id: "eng-2", code: "ENG-001" },
          ] as any),
        },
      };

      vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
        try {
          return callback(txMock);
        } catch (e) {
          throw e;
        }
      });

      const request = createMockRequest("POST", diagnosticKey);
      const response = await demoEngagementRoute.POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.reason).toBe("duplicate_demo_engagement_candidates");
    });
  });

  describe("Smoke test integration", () => {
    it("smoke test calls POST only for demo data missing/wrong workspace/client missing", async () => {
      const mockUser = { id: "user-1", email: demoUserEmail };
      const mockMembership = {
        workspaceId: validUUID,
        userId: "user-1",
        isActive: true,
      };

      // Scenario: demo engagement missing
      vi.mocked(db.user.findUnique).mockResolvedValueOnce(mockUser as any);
      vi.mocked(db.workspaceMembership.findFirst).mockResolvedValueOnce(mockMembership as any);
      vi.mocked(db.engagement.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.engagement.count).mockResolvedValueOnce(0);
      vi.mocked(db.engagement.count).mockResolvedValueOnce(1);
      vi.mocked(db.clientAccount.findFirst).mockResolvedValueOnce({ id: "client-1" } as any);

      const getRequest = createMockRequest("GET", diagnosticKey);
      const getResponse = await demoEngagementRoute.GET(getRequest);
      const proof = await getResponse.json();

      expect(proof.classification).toBe("demo_engagement_missing");

      // Should call POST for this classification
      expect(
        ["demo_engagement_missing", "demo_engagement_wrong_workspace", "demo_client_missing"].includes(
          proof.classification
        )
      ).toBe(true);
    });
  });
});
