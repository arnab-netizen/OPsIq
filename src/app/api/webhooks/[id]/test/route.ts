/**
 * POST /api/webhooks/[id]/test
 *
 * Send a test payload to a webhook endpoint.
 * Verifies connectivity and signature verification.
 * Requires WEBHOOK_MANAGE capability.
 */

import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { WebhookTestRequestSchema } from "@/domain/webhooks/webhook-contracts";
import { testWebhookDelivery } from "@/services/webhooks.service";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate user with capability (fail-closed)
  await withAuth({ capability: CAPABILITIES.WEBHOOK_MANAGE });

  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required");
  }

  // SECURITY: verify the authenticated user is an active member of the
  // header-supplied workspace before test-delivering a webhook scoped to it
  // (prevents cross-tenant probing of another workspace's webhooks). GAP-TEN-02.
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new UnauthorizedError("Unauthorized or invalid workspace");
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is OK
  }

  // Validate request body
  const validationResult = WebhookTestRequestSchema.safeParse(body);
  if (!validationResult.success) {
    throw new Error(`Invalid request body: ${JSON.stringify(validationResult.error.issues)}`);
  }

  const { event, data } = validationResult.data;

  // Extract webhook ID from URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const webhookIdIndex = pathParts.findIndex((p) => p === "webhooks") + 1;
  const webhookId = webhookIdIndex > 0 && pathParts[webhookIdIndex] ? pathParts[webhookIdIndex] : null;

  if (!webhookId) {
    throw new Error("Webhook ID required");
  }

  // Test webhook delivery
  const result = await testWebhookDelivery(webhookId, workspaceId, data);

  if (!result.success) {
    throw new Error(`Webhook test failed: ${result.message || "Unknown error"}`);
  }

  return result;
});
