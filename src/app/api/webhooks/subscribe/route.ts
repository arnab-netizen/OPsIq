/**
 * POST /api/webhooks/subscribe
 *
 * Register a webhook endpoint for event delivery.
 * Requires workspace context and WEBHOOK_MANAGE capability.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { WebhookRegistrationSchema } from "@/domain/webhooks/webhook-contracts";
import { registerWebhook } from "@/services/webhooks.service";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    let body: any = {};
    try {
      body = await ctx.request?.json();
    } catch {
      throw new Error("Invalid JSON");
    }

    const validationResult = WebhookRegistrationSchema.safeParse(body);
    if (!validationResult.success) {
      throw new Error(`Invalid request body: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { url, events, secret } = validationResult.data;

    const webhook = await registerWebhook(workspaceId, url, events, ctx.verifiedActorId, secret);

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      createdAt: webhook.createdAt.toISOString(),
      secret: webhook.secret,
    };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.WEBHOOK_MANAGE] }
);
