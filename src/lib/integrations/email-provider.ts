/**
 * Email provider contract and Resend implementation.
 *
 * Uses the Resend HTTP API directly (no npm package required — just fetch).
 * Set RESEND_API_KEY and ALERT_FROM_EMAIL env vars to activate delivery.
 * Without RESEND_API_KEY the provider returns null and callers fall back
 * to in-app-only delivery.
 */

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  /**
   * Stable key passed as Idempotency-Key header to Resend.
   * Same key → Resend deduplicates within a 24-hour window (network-level duplicate prevention).
   * Callers should derive this as "alert:{workspaceId}:{alertId}:{attemptCount}" so each
   * delivery attempt uses a unique key while a single attempt is idempotent under transient retries.
   */
  idempotencyKey?: string;
}

export interface EmailDeliveryResult {
  /** Provider message id when the provider returned one. Internal/operator use only. */
  id?: string;
  /** True only means the provider accepted the submission (2xx); it is NOT a delivery confirmation. */
  accepted: boolean;
  /** HTTP status of the provider's response. */
  httpStatus?: number;
}

/** A non-2xx provider response. `status` is the HTTP status; the message keeps the existing "Resend API error <status>: ..." shape. */
export class EmailProviderError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`Resend API error ${status}: ${detail}`);
    this.name = "EmailProviderError";
    this.status = status;
  }
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailDeliveryResult>;
}

class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly apiUrl = "https://api.resend.com/emails";

  constructor(apiKey: string, fromAddress: string) {
    this.apiKey = apiKey;
    this.fromAddress = fromAddress;
  }

  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    const payload = {
      from: message.from ?? this.fromAddress,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      ...(message.text && { text: message.text }),
    };

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey && { "Idempotency-Key": message.idempotencyKey }),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new EmailProviderError(response.status, String(body?.message ?? "unknown error"));
    }

    const result = await response.json().catch(() => ({}));
    return { id: typeof result?.id === "string" ? result.id : undefined, accepted: true, httpStatus: response.status };
  }
}

let _provider: EmailProvider | null | undefined = undefined;

export function getEmailProvider(): EmailProvider | null {
  if (_provider !== undefined) return _provider;

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.ALERT_FROM_EMAIL ?? "alerts@opsiq.app";

  if (!apiKey) {
    _provider = null;
    return null;
  }

  _provider = new ResendEmailProvider(apiKey, fromAddress);
  return _provider;
}

export function resetEmailProvider(): void {
  _provider = undefined;
}
