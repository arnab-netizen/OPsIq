/**
 * Operator-facing wording for the outcome of a beta invitation email attempt (the API's `emailDelivery` field and its
 * human-readable `emailDeliveryReason`). Pure: the pages only render what this returns, so a failed or skipped send can
 * never be presented as sent. "Accepted by provider" is deliberately NOT "delivered". The reason is supplied by the
 * server and is already safe (no provider text, address or token).
 */
export type BetaApprovalEmailOutcome = "SENT" | "FAILED" | "NO_PROVIDER" | "NOT_ATTEMPTED";

export interface BetaApprovalEmailNotice {
  tone: "success" | "warning";
  text: string;
}

function isOutcome(value: unknown): value is BetaApprovalEmailOutcome {
  return value === "SENT" || value === "FAILED" || value === "NO_PROVIDER" || value === "NOT_ATTEMPTED";
}

function withReason(prefix: string, reason: unknown, fallback: string): string {
  const text = typeof reason === "string" && reason.trim().length > 0 ? reason.trim().replace(/\.+$/, "") : fallback;
  return `${prefix}${text}.`;
}

/**
 * Notice for an invite / re-invite / re-open / resend response. A response without a recognised `emailDelivery` (for
 * example a replay of a response cached before the field existed) is reported as unconfirmed rather than assumed sent.
 */
export function betaApprovalEmailNotice(emailDelivery: unknown, reason?: unknown): BetaApprovalEmailNotice {
  if (!isOutcome(emailDelivery)) {
    return {
      tone: "warning",
      text: "Access state was updated, but whether the invitation email was sent could not be confirmed.",
    };
  }
  switch (emailDelivery) {
    case "SENT":
      return { tone: "success", text: "Invitation email accepted by provider." };
    case "FAILED":
      return {
        tone: "warning",
        text:
          withReason("Invitation email could not be sent: ", reason, "the email provider reported an error") +
          " The invitation itself is still active; use Resend invitation email once the provider issue is fixed.",
      };
    case "NO_PROVIDER":
      return { tone: "warning", text: "No email provider is configured." };
    case "NOT_ATTEMPTED":
      return { tone: "warning", text: withReason("No email was sent: ", reason, "nothing needed to be sent") };
  }
}
