/**
 * B13-S3: Token Lifecycle Management
 *
 * Handles:
 * - OAuth token refresh with expiration detection
 * - Token revocation and disconnect flows
 * - Token storage and retrieval from encrypted database
 * - Refresh token rotation
 * - Automatic cleanup of expired/revoked tokens
 *
 * Security:
 * - Tokens stored encrypted in database
 * - Tokens never returned to frontend
 * - Refresh operations are server-side only
 * - Workspace-scoped token access
 */

import { randomBytes } from "crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  decryptOAuthToken,
  encryptOAuthToken,
  isTokenExpired,
  type OAuthToken,
  type EncryptedOAuthToken,
} from "./oauth-token.service";

export interface StoredOAuthToken extends OAuthToken {
  connectionId: string;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface SyncJobTrackingRequest {
  connectionId: string;
  workspaceId: string;
  recordsImported: number;
  errorMessage?: string;
}

export interface DisconnectRequest {
  connectionId: string;
  workspaceId: string;
}

export interface DisconnectResponse {
  success: boolean;
  revokeToken?: boolean;
  message: string;
}

/**
 * Store encrypted OAuth token in database.
 * Workspace-scoped access.
 */
export async function storeOAuthToken(
  prisma: PrismaClient,
  connectionId: string,
  workspaceId: string,
  token: OAuthToken,
): Promise<EncryptedOAuthToken> {
  // Verify connection belongs to workspace
  const connection = await prisma.externalConnection.findUnique({
    where: { id: connectionId },
    select: { workspaceId: true },
  });

  if (!connection || connection.workspaceId !== workspaceId) {
    throw new Error("Connection not found or access denied");
  }

  // Encrypt token for storage
  const encrypted = encryptOAuthToken(token, workspaceId);

  // Store in database (upsert - update if exists, create if not)
  await prisma.externalOAuthToken.upsert({
    where: { connectionId },
    create: {
      id: `oauth_${connectionId}_${randomBytes(8).toString("hex")}`,
      connectionId,
      accessToken: encrypted.accessToken,
      refreshToken: encrypted.refreshToken,
      expiresAt: encrypted.expiresAt,
      tokenType: encrypted.tokenType,
    },
    update: {
      accessToken: encrypted.accessToken,
      refreshToken: encrypted.refreshToken,
      expiresAt: encrypted.expiresAt,
      tokenType: encrypted.tokenType,
      updatedAt: new Date(),
    },
  });

  return encrypted;
}

/**
 * Retrieve encrypted OAuth token from database.
 * Workspace-scoped access.
 */
export async function retrieveOAuthToken(
  prisma: PrismaClient,
  connectionId: string,
  workspaceId: string,
): Promise<OAuthToken | null> {
  // Verify connection belongs to workspace
  const connection = await prisma.externalConnection.findUnique({
    where: { id: connectionId },
    select: { workspaceId: true },
  });

  if (!connection || connection.workspaceId !== workspaceId) {
    return null;
  }

  // Retrieve encrypted token
  const storedToken = await prisma.externalOAuthToken.findUnique({
    where: { connectionId },
  });

  if (!storedToken) {
    return null;
  }

  // Decrypt for use
  const decrypted = decryptOAuthToken(
    {
      accessToken: storedToken.accessToken,
      refreshToken: storedToken.refreshToken || undefined,
      expiresAt: storedToken.expiresAt || undefined,
      tokenType: storedToken.tokenType,
    },
    workspaceId,
  );

  return decrypted;
}

/**
 * Check if stored token needs refresh.
 * Returns token if still valid, null if expired/needs refresh.
 */
export async function getValidOAuthToken(
  prisma: PrismaClient,
  connectionId: string,
  workspaceId: string,
  gracePeriodSeconds: number = 300,
): Promise<OAuthToken | null> {
  const token = await retrieveOAuthToken(prisma, connectionId, workspaceId);

  if (!token) {
    return null;
  }

  if (isTokenExpired(token, gracePeriodSeconds)) {
    return null;
  }

  return token;
}

/**
 * Contract: Exchange refresh token for new access token.
 * Actual implementation calls provider's token endpoint.
 */
export async function exchangeRefreshTokenForAccessToken(
  providerId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenRefreshResponse> {
  // In production, this would call provider's token endpoint
  // POST https://provider.oauth/token with:
  // - grant_type: "refresh_token"
  // - refresh_token: refreshToken
  // - client_id: clientId
  // - client_secret: clientSecret

  // For now, return contract structure
  throw new Error(
    `Token refresh for provider ${providerId} not implemented in this service layer`,
  );
}

/**
 * Update sync job status in database.
 * Tracks import progress and handles errors.
 */
export async function updateSyncJobStatus(
  prisma: PrismaClient,
  workspaceId: string,
  request: SyncJobTrackingRequest,
): Promise<void> {
  // Verify connection belongs to workspace
  const connection = await prisma.externalConnection.findUnique({
    where: { id: request.connectionId },
    select: { workspaceId: true },
  });

  if (!connection || connection.workspaceId !== workspaceId) {
    throw new Error("Connection not found or access denied");
  }

  // Create or update sync job
  const now = new Date();

  // If request has error, create failed job
  if (request.errorMessage) {
    await prisma.externalSyncJob.create({
      data: {
        id: `sync_${request.connectionId}_${randomBytes(8).toString("hex")}`,
        connectionId: request.connectionId,
        status: "failed",
        recordsImported: request.recordsImported,
        errorMessage: request.errorMessage,
        startedAt: now,
        completedAt: now,
      },
    });

    // Update connection to mark error
    await prisma.externalConnection.update({
      where: { id: request.connectionId },
      data: {
        lastErrorAt: now,
        lastErrorMessage: request.errorMessage,
      },
    });
  } else {
    // Create successful job
    await prisma.externalSyncJob.create({
      data: {
        id: `sync_${request.connectionId}_${randomBytes(8).toString("hex")}`,
        connectionId: request.connectionId,
        status: "completed",
        recordsImported: request.recordsImported,
        startedAt: now,
        completedAt: now,
      },
    });

    // Update connection to mark successful sync
    await prisma.externalConnection.update({
      where: { id: request.connectionId },
      data: {
        lastSyncAt: now,
      },
    });
  }
}

/**
 * Disconnect/revoke OAuth connection.
 * Marks connection as revoked, invalidates token, prevents future syncs.
 */
export async function disconnectOAuthConnection(
  prisma: PrismaClient,
  request: DisconnectRequest,
): Promise<DisconnectResponse> {
  // Verify connection belongs to workspace
  const connection = await prisma.externalConnection.findUnique({
    where: { id: request.connectionId },
    select: { workspaceId: true, status: true, token: true },
  });

  if (!connection || connection.workspaceId !== request.workspaceId) {
    return {
      success: false,
      message: "Connection not found or access denied",
    };
  }

  // If already revoked, nothing to do
  if (connection.status === "revoked") {
    return {
      success: true,
      message: "Connection already revoked",
    };
  }

  // In production, would call provider to revoke token here
  // POST https://provider.oauth/revoke?token={accessToken}

  // Mark connection as revoked in database
  await prisma.externalConnection.update({
    where: { id: request.connectionId },
    data: {
      status: "revoked",
    },
  });

  // Delete token from database (cleanup)
  if (connection.token) {
    await prisma.externalOAuthToken.delete({
      where: { connectionId: request.connectionId },
    });
  }

  return {
    success: true,
    revokeToken: true,
    message: "Connection revoked successfully",
  };
}

/**
 * Mark connection as expired (token needs refresh).
 */
export async function markConnectionExpired(
  prisma: PrismaClient,
  connectionId: string,
  workspaceId: string,
  errorMessage?: string,
): Promise<void> {
  // Verify connection belongs to workspace
  const connection = await prisma.externalConnection.findUnique({
    where: { id: connectionId },
    select: { workspaceId: true },
  });

  if (!connection || connection.workspaceId !== workspaceId) {
    throw new Error("Connection not found or access denied");
  }

  await prisma.externalConnection.update({
    where: { id: connectionId },
    data: {
      status: "expired",
      lastErrorAt: new Date(),
      lastErrorMessage: errorMessage || "Token expired",
    },
  });
}

/**
 * Get recent sync jobs for a connection.
 * Used for status display and error diagnosis.
 */
export async function getRecentSyncJobs(
  prisma: PrismaClient,
  connectionId: string,
  workspaceId: string,
  limit: number = 10,
): Promise<
  Array<{
    id: string;
    status: string;
    recordsImported: number;
    errorMessage: string | null;
    completedAt: Date | null;
  }>
> {
  // Verify connection belongs to workspace
  const connection = await prisma.externalConnection.findUnique({
    where: { id: connectionId },
    select: { workspaceId: true },
  });

  if (!connection || connection.workspaceId !== workspaceId) {
    return [];
  }

  return prisma.externalSyncJob.findMany({
    where: { connectionId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      recordsImported: true,
      errorMessage: true,
      completedAt: true,
    },
  });
}
