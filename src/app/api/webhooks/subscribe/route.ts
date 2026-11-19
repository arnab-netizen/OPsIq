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
import { parseOrThrow } from "@/lib/validation";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // A malformed body raises the canonical ValidationError (400) from the wrapper-provided request; it must not be
    // caught and re-thrown as a plain Error (an unknown 500).
    const body: unknown = ctx.request ? await ctx.request.json() : {};

    // A body failing the schema is a ValidationError (400) carrying only {path, message} field errors.
    const { url, events, secret } = parseOrThrow(WebhookRegistrationSchema, body);

    const webhook = await registerWebhook(workspaceId, url, events, ctx.verifiedActorId, secret);

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      createdAt: webhook.createdAt.toISOString(),
      secret: webhook.secret,
      dispatchStatus: webhook.dispatchStatus,
      dispatchNote:
        webhook.dispatchStatus === "not_configured"
          ? "Registered, but no live OpsIQ event currently dispatches to it. " +
            "POST /api/webhooks/{id}/test proves connectivity and signing only " +
            "— it does not mean you will receive real production events yet."
          : undefined,
    };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.WEBHOOK_MANAGE] }
);
