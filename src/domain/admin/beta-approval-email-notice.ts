/**
 * Operator-facing wording for the outcome of the applicant approval email that an invite / re-invite / re-open
 * attempts (the API's `emailDelivery` field). Pure: the pages only render what this returns, so a failed send can
 * never be presented as "invite sent". No provider text, address or token is ever part of the message.
 */
export type BetaApprovalEmailOutcome = "SENT" | "FAILED" | "NO_PROVIDER" | "NOT_ATTEMPTED";

export interface BetaApprovalEmailNotice {
  tone: "success" | "warning";
  text: string;
}

const NOTICES: Record<BetaApprovalEmailOutcome, BetaApprovalEmailNotice> = {
  SENT: { tone: "success", text: "Invitation email sent." },
  FAILED: {
    tone: "warning",
    text: "Access was granted, but the invitation email could not be delivered. Retry only after the email provider configuration is corrected.",
  },
  NO_PROVIDER: {
    tone: "warning",
    text: "Access was granted, but no email provider is configured, so no invitation email was sent.",
  },
  NOT_ATTEMPTED: {
    tone: "warning",
    text: "No change was made, so no invitation email was sent.",
  },
};

function isOutcome(value: unknown): value is BetaApprovalEmailOutcome {
  return value === "SENT" || value === "FAILED" || value === "NO_PROVIDER" || value === "NOT_ATTEMPTED";
}

/**
 * Notice for an invite/re-open response. A response without a recognised `emailDelivery` (for example a replay of a
 * response cached before the field existed) is reported as unknown rather than assumed sent.
 */
export function betaApprovalEmailNotice(emailDelivery: unknown): BetaApprovalEmailNotice {
  if (isOutcome(emailDelivery)) return NOTICES[emailDelivery];
  return {
    tone: "warning",
    text: "Access state was updated, but whether the invitation email was sent could not be confirmed.",
  };
}
