import { logEvent } from "@/lib/observability/log";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

export async function emitWebhook(
  url: string,
  payload: WebhookPayload
): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logEvent({
        type: "webhook_failed",
        workspaceId: payload.workspaceId,
        status: "error",
        error: `Webhook returned ${response.status}`,
        metadata: {
          url,
          event: payload.event,
          statusCode: response.status,
        },
      });
    } else {
      logEvent({
        type: "webhook_sent",
        workspaceId: payload.workspaceId,
        status: "ok",
        metadata: {
          url,
          event: payload.event,
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logEvent({
      type: "webhook_error",
      workspaceId: payload.workspaceId,
      status: "error",
      error: errorMessage,
      metadata: {
        url,
        event: payload.event,
      },
    });
  }
}

export async function emitWebhookAsync(
  url: string,
  payload: WebhookPayload
): Promise<void> {
  // Non-blocking webhook emission - fire and forget with error handling
  emitWebhook(url, payload).catch(() => {
    // Intentionally swallow errors to prevent blocking the main request
  });
}
