/**
 * POST /api/webhooks/subscribe
 *
 * Register a webhook endpoint for event delivery.
 * Requires workspace context and WEBHOOK_MANAGE capability.
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { WebhookRegistrationSchema } from "@/domain/webhooks/webhook-contracts";
import { registerWebhook } from "@/services/webhooks.service";
import { z } from "zod";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Auth enforcement (WEBHOOK_MANAGE capability)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.WEBHOOK_MANAGE,
  });
  if (!session || !policy) {
    throw new UnauthorizedError("Unauthorized");
  }

  const workspaceId = ctx.verifiedWorkspaceId;
  if (!workspaceId) {
    throw new Error("Workspace ID required");
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    throw new Error("Invalid JSON");
  }

  // Validate request body
  const validationResult = WebhookRegistrationSchema.safeParse(body);
  if (!validationResult.success) {
    throw new Error(`Invalid request body: ${JSON.stringify(validationResult.error.issues)}`);
  }

  const { url, events, secret } = validationResult.data;

  // Register webhook
  const webhook = await registerWebhook(workspaceId, url, events, session.user.id, secret);

  const response = {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    active: webhook.active,
    createdAt: webhook.createdAt.toISOString(),
    secret: webhook.secret,
  };

  return response;
});
