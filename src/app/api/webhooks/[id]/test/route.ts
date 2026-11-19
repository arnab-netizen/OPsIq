/**
 * POST /api/webhooks/[id]/test
 *
 * Send a test payload to a webhook endpoint.
 * Verifies connectivity and signature verification.
 * Requires WEBHOOK_MANAGE capability.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ValidationError } from "@/infra/errors";
import { parseOrThrow } from "@/lib/validation";
import { WebhookTestRequestSchema } from "@/domain/webhooks/webhook-contracts";
import { testWebhookDelivery } from "@/services/webhooks.service";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const webhookId = params.id;

    if (!webhookId) {
      throw new ValidationError("Webhook ID required");
    }

    let body: unknown = {};
    try {
      body = await ctx.request?.json();
    } catch {
      // Empty body is OK
    }

    // A body failing the schema is a ValidationError (400) carrying only {path, message} field errors.
    const { data } = parseOrThrow(WebhookTestRequestSchema, body);

    const result = await testWebhookDelivery(webhookId, workspaceId, data);

    if (!result.success) {
      throw new Error(`Webhook test failed: ${result.message || "Unknown error"}`);
    }

    return result;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.WEBHOOK_MANAGE] }
);
