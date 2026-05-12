/**
 * POST /api/webhooks/[id]/test
 *
 * Send a test payload to a webhook endpoint.
 * Verifies connectivity and signature verification.
 * Requires WEBHOOK_MANAGE capability.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { WebhookTestRequestSchema } from "@/domain/webhooks/webhook-contracts";
import { testWebhookDelivery } from "@/services/webhooks.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: webhookId } = await params;
    if (!webhookId) {
      return NextResponse.json({ error: "Webhook ID required" }, { status: 400 });
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
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { event, data } = validationResult.data;

    // Test webhook delivery
    const result = await testWebhookDelivery(webhookId, workspaceId, data);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("Failed to test webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to test webhook" },
      { status: 500 }
    );
  }
}
