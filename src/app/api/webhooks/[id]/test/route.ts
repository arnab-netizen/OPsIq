/**
 * POST /api/webhooks/[id]/test
 *
 * Send a test payload to a webhook endpoint.
 * Verifies connectivity and signature verification.
 * Requires WEBHOOK_MANAGE capability.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { WebhookTestRequestSchema } from "@/domain/webhooks/webhook-contracts";
import { testWebhookDelivery } from "@/services/webhooks.service";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const webhookId = params.id;

    if (!webhookId) {
      throw new Error("Webhook ID required");
    }

    let body: any = {};
    try {
      body = await ctx.request?.json();
    } catch {
      // Empty body is OK
    }

    const validationResult = WebhookTestRequestSchema.safeParse(body);
    if (!validationResult.success) {
      throw new Error(`Invalid request body: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { data } = validationResult.data;

    const result = await testWebhookDelivery(webhookId, workspaceId, data);

    if (!result.success) {
      throw new Error(`Webhook test failed: ${result.message || "Unknown error"}`);
    }

    return result;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.WEBHOOK_MANAGE] }
);
