/**
 * POST /api/webhooks/subscribe
 *
 * Register a webhook endpoint for event delivery.
 * Requires workspace context and WEBHOOK_MANAGE capability.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { WebhookRegistrationSchema } from "@/domain/webhooks/webhook-contracts";
import { registerWebhook } from "@/services/webhooks.service";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    // Auth enforcement (WEBHOOK_MANAGE capability)
    const { session, policy } = await withAuth({
      capability: CAPABILITIES.WEBHOOK_MANAGE,
    });
    if (!session || !policy) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Validate request body
    const validationResult = WebhookRegistrationSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
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

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Failed to register webhook:", error);
    return NextResponse.json({ error: "Failed to register webhook" }, { status: 500 });
  }
}
