/**
 * POST /api/webhooks/[id]/test
 *
 * Send a test payload to a webhook endpoint.
 * Verifies connectivity and signature verification.
 * Requires WEBHOOK_MANAGE capability.
 */

import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { WebhookTestRequestSchema } from "@/domain/webhooks/webhook-contracts";
import { testWebhookDelivery } from "@/services/webhooks.service";
import { assertCapability } from "@/services/entitlement.service";

export const POST = withEnforcementFull(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  // Auth enforcement (WEBHOOK_MANAGE capability)
  const { id: webhookId } = await params;
  if (!webhookId) {
    throw new Error("Webhook ID required");
  }

  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required");
  }

  // Check capability
  const capabilityCheck = await assertCapability(workspaceId, "webhook_manage");
  if (!capabilityCheck.allowed) {
    throw new Error("Insufficient permissions for webhook management");
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

  // Test webhook delivery
  const result = await testWebhookDelivery(webhookId, workspaceId, data);

  if (!result.success) {
    throw new Error(`Webhook test failed: ${result.error || "Unknown error"}`);
  }

  return result;
});
