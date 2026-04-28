import type { WebhookEvent } from "@/domain/integration/types";

export function sendWebhook(event: WebhookEvent): void {
  console.log("Webhook:", event);
}
