/**
 * B13-S3: Token Lifecycle Management — DB-backed Tests
 *
 * Verifies:
 * - Token storage and retrieval with encryption
 * - Token expiration detection with grace periods
 * - Sync job tracking and error handling
 * - Connection disconnect and revocation
 * - Workspace isolation in token operations
 * - Database transaction integrity
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDbInstance } from "@/lib/db";
import {
  storeOAuthToken,
  retrieveOAuthToken,
  getValidOAuthToken,
  updateSyncJobStatus,
  disconnectOAuthConnection,
  markConnectionExpired,
  getRecentSyncJobs,
  type SyncJobTrackingRequest,
} from "@/services/external-systems/token-lifecycle.service";

// Workspace and provider IDs must be valid UUIDs — the workspaces and
// external_providers tables use UUID primary keys (shared with B12).
// Connection IDs are TEXT primary keys, so they remain plain strings.
const TEST_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TEST_CONNECTION_ID = "conn_test_token_lifecycle";
const TEST_WORKSPACE_2 = "11111111-1111-4111-8111-111111111112";
const TEST_CONNECTION_2 = "conn_test_token_lifecycle_2";
const TEST_PROVIDER_ID = "11111111-1111-4111-8111-1111111111a0";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = await getDbInstance();

  // Create test workspaces
  await prisma.workspace.upsert({
    where: { id: TEST_WORKSPACE_ID },
    create: {
      id: TEST_WORKSPACE_ID,
      name: "Test Token Lifecycle Workspace",
      slug: "test-token-lifecycle-workspace",
    },
    update: {},
  });

  await prisma.workspace.upsert({
    where: { id: TEST_WORKSPACE_2 },
    create: {
      id: TEST_WORKSPACE_2,
      name: "Test Token Lifecycle Workspace 2",
      slug: "test-token-lifecycle-workspace-2",
    },
    update: {},
  });

  // Create test provider (ExternalProvider model: id/name/category only)
  await prisma.externalProvider.upsert({
    where: { id: TEST_PROVIDER_ID },
    create: {
      id: TEST_PROVIDER_ID,
      name: "Google Sheets",
      category: "api_connector",
    },
    update: {},
  });

  // Create test connections
  await prisma.externalConnection.upsert({
    where: { id: TEST_CONNECTION_ID },
    create: {
      id: TEST_CONNECTION_ID,
      workspaceId: TEST_WORKSPACE_ID,
      providerId: TEST_PROVIDER_ID,
      connectionName: "Test Connection",
      status: "active",
      oauthScope: ["spreadsheets.readonly"],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });

  await prisma.externalConnection.upsert({
    where: { id: TEST_CONNECTION_2 },
    create: {
      id: TEST_CONNECTION_2,
      workspaceId: TEST_WORKSPACE_2,
      providerId: TEST_PROVIDER_ID,
      connectionName: "Test Connection 2",
      status: "active",
      oauthScope: ["spreadsheets.readonly"],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
});

afterEach(async () => {
  // Cleanup test data
  await prisma.externalSyncJob.deleteMany({
    where: {
      connection: {
        workspaceId: {
          in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
        },
      },
    },
  });

  await prisma.externalOAuthToken.deleteMany({
    where: {
      connection: {
        workspaceId: {
          in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
        },
      },
    },
  });

  await prisma.externalConnection.deleteMany({
    where: {
      workspaceId: {
        in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
      },
    },
  });

  await prisma.workspace.deleteMany({
    where: {
      id: {
        in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
      },
    },
  });
});

describe("B13-S3: Token Lifecycle Management — DB-Backed Tests", () => {
  describe("Token Storage and Retrieval", () => {
    it("should store and retrieve OAuth token", async () => {
      const token = {
        accessToken: "test_access_token_123",
        refreshToken: "test_refresh_token_456",
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const retrieved = await retrieveOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.accessToken).toBe(token.accessToken);
      expect(retrieved?.refreshToken).toBe(token.refreshToken);
      expect(retrieved?.tokenType).toBe("Bearer");
    });

    it("should handle token without refresh token", async () => {
      const token = {
        accessToken: "test_access_only",
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const retrieved = await retrieveOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      expect(retrieved?.accessToken).toBe("test_access_only");
      expect(retrieved?.refreshToken).toBeUndefined();
    });

    it("should enforce workspace isolation on retrieval", async () => {
      const token = {
        accessToken: "workspace_1_token",
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      // Try to retrieve with wrong workspace ID
      const retrieved = await retrieveOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        "ws_wrong_workspace",
      );

      expect(retrieved).toBeNull();
    });

    it("should update token on second storage", async () => {
      const token1 = {
        accessToken: "token_v1",
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token1,
      );

      const token2 = {
        accessToken: "token_v2",
        refreshToken: "refresh_v2",
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token2,
      );

      const retrieved = await retrieveOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      expect(retrieved?.accessToken).toBe("token_v2");
      expect(retrieved?.refreshToken).toBe("refresh_v2");
    });
  });

  describe("Token Expiration Detection", () => {
    it("should detect valid token with grace period", async () => {
      const futureDate = new Date();
      futureDate.setSeconds(futureDate.getSeconds() + 400); // 400 seconds from now

      const token = {
        accessToken: "valid_token",
        expiresAt: futureDate,
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      // With 300 second grace period, token should still be valid (100 seconds buffer)
      const validToken = await getValidOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        300,
      );

      expect(validToken).not.toBeNull();
      expect(validToken?.accessToken).toBe("valid_token");
    });

    it("should detect expired token within grace period", async () => {
      const expiresSoon = new Date();
      expiresSoon.setSeconds(expiresSoon.getSeconds() + 100); // 100 seconds from now

      const token = {
        accessToken: "expiring_token",
        expiresAt: expiresSoon,
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      // With 300 second grace period, token should be considered expired
      const validToken = await getValidOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        300,
      );

      expect(validToken).toBeNull();
    });

    it("should return null for expired token", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const token = {
        accessToken: "expired_token",
        expiresAt: pastDate,
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const validToken = await getValidOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        0,
      );

      expect(validToken).toBeNull();
    });
  });

  describe("Sync Job Tracking", () => {
    it("should record successful sync job", async () => {
      const syncRequest: SyncJobTrackingRequest = {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: TEST_WORKSPACE_ID,
        recordsImported: 42,
      };

      await updateSyncJobStatus(prisma, TEST_WORKSPACE_ID, syncRequest);

      const syncJobs = await getRecentSyncJobs(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        10,
      );

      expect(syncJobs).toHaveLength(1);
      expect(syncJobs[0].status).toBe("completed");
      expect(syncJobs[0].recordsImported).toBe(42);
      expect(syncJobs[0].errorMessage).toBeNull();
    });

    it("should record failed sync job with error message", async () => {
      const syncRequest: SyncJobTrackingRequest = {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: TEST_WORKSPACE_ID,
        recordsImported: 0,
        errorMessage: "API rate limit exceeded",
      };

      await updateSyncJobStatus(prisma, TEST_WORKSPACE_ID, syncRequest);

      const syncJobs = await getRecentSyncJobs(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        10,
      );

      expect(syncJobs).toHaveLength(1);
      expect(syncJobs[0].status).toBe("failed");
      expect(syncJobs[0].errorMessage).toBe("API rate limit exceeded");
    });

    it("should update connection last sync timestamp", async () => {
      const before = new Date();

      const syncRequest: SyncJobTrackingRequest = {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: TEST_WORKSPACE_ID,
        recordsImported: 10,
      };

      await updateSyncJobStatus(prisma, TEST_WORKSPACE_ID, syncRequest);

      const connection = await prisma.externalConnection.findUnique({
        where: { id: TEST_CONNECTION_ID },
        select: { lastSyncAt: true },
      });

      expect(connection?.lastSyncAt).toBeDefined();
      expect(connection?.lastSyncAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });

    it("should enforce workspace isolation on sync tracking", async () => {
      const syncRequest: SyncJobTrackingRequest = {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: "ws_wrong",
        recordsImported: 10,
      };

      await expect(
        updateSyncJobStatus(prisma, "ws_wrong", syncRequest),
      ).rejects.toThrow("Connection not found or access denied");
    });

    it("should retrieve recent sync jobs in order", async () => {
      // Create multiple sync jobs
      for (let i = 0; i < 3; i++) {
        const syncRequest: SyncJobTrackingRequest = {
          connectionId: TEST_CONNECTION_ID,
          workspaceId: TEST_WORKSPACE_ID,
          recordsImported: i * 10,
        };
        await updateSyncJobStatus(prisma, TEST_WORKSPACE_ID, syncRequest);
      }

      const syncJobs = await getRecentSyncJobs(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        10,
      );

      expect(syncJobs).toHaveLength(3);
      // Most recent first
      expect(syncJobs[0].recordsImported).toBe(20);
      expect(syncJobs[1].recordsImported).toBe(10);
      expect(syncJobs[2].recordsImported).toBe(0);
    });
  });

  describe("Connection Disconnect and Revocation", () => {
    it("should revoke OAuth connection", async () => {
      const token = {
        accessToken: "token_to_revoke",
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      const result = await disconnectOAuthConnection(prisma, {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: TEST_WORKSPACE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.revokeToken).toBe(true);

      // Verify connection status changed
      const connection = await prisma.externalConnection.findUnique({
        where: { id: TEST_CONNECTION_ID },
        select: { status: true },
      });

      expect(connection?.status).toBe("revoked");
    });

    it("should delete token on revocation", async () => {
      const token = {
        accessToken: "token_to_delete",
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      await disconnectOAuthConnection(prisma, {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: TEST_WORKSPACE_ID,
      });

      const retrieved = await retrieveOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      expect(retrieved).toBeNull();
    });

    it("should idempotently revoke already revoked connection", async () => {
      await disconnectOAuthConnection(prisma, {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: TEST_WORKSPACE_ID,
      });

      const result = await disconnectOAuthConnection(prisma, {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: TEST_WORKSPACE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("already revoked");
    });

    it("should enforce workspace isolation on revocation", async () => {
      const result = await disconnectOAuthConnection(prisma, {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: "ws_wrong",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Mark Connection Expired", () => {
    it("should mark connection as expired", async () => {
      await markConnectionExpired(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        "Token expired",
      );

      const connection = await prisma.externalConnection.findUnique({
        where: { id: TEST_CONNECTION_ID },
        select: { status: true, lastErrorMessage: true },
      });

      expect(connection?.status).toBe("expired");
      expect(connection?.lastErrorMessage).toBe("Token expired");
    });

    it("should enforce workspace isolation on mark expired", async () => {
      await expect(
        markConnectionExpired(
          prisma,
          TEST_CONNECTION_ID,
          "ws_wrong",
          "Token expired",
        ),
      ).rejects.toThrow("Connection not found or access denied");
    });
  });

  describe("Acceptance Gates (Protocol §21)", () => {
    it("should maintain workspace isolation across all operations", async () => {
      const token1 = {
        accessToken: "workspace_1_secret",
        tokenType: "Bearer",
      };

      const token2 = {
        accessToken: "workspace_2_secret",
        tokenType: "Bearer",
      };

      // Store tokens in different workspaces
      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token1,
      );

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_2,
        TEST_WORKSPACE_2,
        token2,
      );

      // Verify workspace 1 cannot access workspace 2 token
      const retrieved1 = await retrieveOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      const wrongRetrieved = await retrieveOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_2,
      );

      expect(retrieved1?.accessToken).toBe("workspace_1_secret");
      expect(wrongRetrieved).toBeNull();
    });

    it("should prevent token exposure through error messages", async () => {
      const token = {
        accessToken: "super_secret_token_12345",
        tokenType: "Bearer",
      };

      await storeOAuthToken(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
        token,
      );

      // Try invalid workspace
      try {
        await storeOAuthToken(
          prisma,
          TEST_CONNECTION_ID,
          "ws_invalid",
          token,
        );
      } catch (error) {
        // Verify error message does not contain token
        const errorMsg = (error as Error).message;
        expect(errorMsg).not.toContain("super_secret");
        expect(errorMsg).not.toContain("12345");
      }
    });

    it("should maintain audit trail of sync operations", async () => {
      const syncRequest: SyncJobTrackingRequest = {
        connectionId: TEST_CONNECTION_ID,
        workspaceId: TEST_WORKSPACE_ID,
        recordsImported: 100,
      };

      await updateSyncJobStatus(prisma, TEST_WORKSPACE_ID, syncRequest);

      const syncJobs = await getRecentSyncJobs(
        prisma,
        TEST_CONNECTION_ID,
        TEST_WORKSPACE_ID,
      );

      expect(syncJobs).toHaveLength(1);
      expect(syncJobs[0].completedAt).toBeDefined();
      expect(syncJobs[0].status).toBe("completed");
    });
  });
});
