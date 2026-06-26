/**
 * Customer communication control (Slice 20, pure logic).
 *
 * Prevents unauthorized customer promises. Fail-closed: the MVP default is
 * TEMPLATE_ONLY; AI drafts require explicit owner/manager approval; refund and
 * discount promises are blocked unless the owner-approved boundary permits them;
 * expired templates, wrong role/channel/segment, and forbidden claims are blocked.
 */

export enum CommunicationMode {
  TEMPLATE_ONLY = "TEMPLATE_ONLY",
  AI_DRAFT_OWNER_APPROVAL_REQUIRED = "AI_DRAFT_OWNER_APPROVAL_REQUIRED",
  AI_DRAFT_MANAGER_APPROVAL_REQUIRED = "AI_DRAFT_MANAGER_APPROVAL_REQUIRED",
  EMPLOYEE_FREE_TEXT_ALLOWED_LOW_RISK = "EMPLOYEE_FREE_TEXT_ALLOWED_LOW_RISK",
  NO_CUSTOMER_COMMUNICATION = "NO_CUSTOMER_COMMUNICATION",
}

/** MVP default communication mode. */
export const DEFAULT_COMMUNICATION_MODE = CommunicationMode.TEMPLATE_ONLY;

export interface MessageTemplate {
  templateId: string;
  version: number;
  approvedByOwnerId: string;
  validFrom: Date;
  validUntil: Date;
  allowedRoles: string[];
  allowedChannels: string[];
  allowedCustomerSegments: string[];
  editableByEmployee: boolean;
  maxEditableFields: number;
  /** Lower-cased phrases that may never appear in an outgoing message. */
  forbiddenClaims: string[];
}

export enum CustomerMessageStatus {
  ALLOWED = "ALLOWED",
  NEEDS_OWNER_APPROVAL = "NEEDS_OWNER_APPROVAL",
  NEEDS_MANAGER_APPROVAL = "NEEDS_MANAGER_APPROVAL",
  BLOCKED_MODE = "BLOCKED_MODE",
  BLOCKED_NO_TEMPLATE = "BLOCKED_NO_TEMPLATE",
  BLOCKED_TEMPLATE_EXPIRED = "BLOCKED_TEMPLATE_EXPIRED",
  BLOCKED_ROLE = "BLOCKED_ROLE",
  BLOCKED_CHANNEL = "BLOCKED_CHANNEL",
  BLOCKED_SEGMENT = "BLOCKED_SEGMENT",
  BLOCKED_FORBIDDEN_CLAIM = "BLOCKED_FORBIDDEN_CLAIM",
  BLOCKED_UNAPPROVED_AI = "BLOCKED_UNAPPROVED_AI",
  BLOCKED_REFUND_PROMISE = "BLOCKED_REFUND_PROMISE",
  BLOCKED_DISCOUNT_PROMISE = "BLOCKED_DISCOUNT_PROMISE",
}

export interface CustomerMessageContext {
  mode: CommunicationMode;
  template?: MessageTemplate | null;
  message: string;
  role: string;
  channel: string;
  segment?: string | null;
  /** For AI-draft modes: whether the required human approval has been granted. */
  approved?: boolean;
  boundaryAllowsRefundPromise: boolean;
  boundaryAllowsDiscount: boolean;
  now: Date;
}

export interface CustomerMessageDecision {
  status: CustomerMessageStatus;
  allowed: boolean;
  reason: string;
}

const REFUND_PATTERNS = [/\brefund\b/i, /money back/i, /\breimburse/i];
const DISCOUNT_PATTERNS = [/\bdiscount\b/i, /\b\d+%\s*off\b/i, /\bfor free\b/i, /\bwaive/i];

export function detectPromises(message: string): {
  promisesRefund: boolean;
  promisesDiscount: boolean;
} {
  return {
    promisesRefund: REFUND_PATTERNS.some((p) => p.test(message)),
    promisesDiscount: DISCOUNT_PATTERNS.some((p) => p.test(message)),
  };
}

function block(status: CustomerMessageStatus, reason: string): CustomerMessageDecision {
  return { status, allowed: false, reason };
}

/**
 * Fail-closed validation of an outgoing customer message.
 */
export function validateCustomerMessage(
  ctx: CustomerMessageContext
): CustomerMessageDecision {
  if (ctx.mode === CommunicationMode.NO_CUSTOMER_COMMUNICATION) {
    return block(CustomerMessageStatus.BLOCKED_MODE, "Customer communication is disabled.");
  }

  // Refund / discount promises are blocked everywhere unless the boundary permits.
  const { promisesRefund, promisesDiscount } = detectPromises(ctx.message);
  if (promisesRefund && !ctx.boundaryAllowsRefundPromise) {
    return block(
      CustomerMessageStatus.BLOCKED_REFUND_PROMISE,
      "Message promises a refund the boundary does not permit."
    );
  }
  if (promisesDiscount && !ctx.boundaryAllowsDiscount) {
    return block(
      CustomerMessageStatus.BLOCKED_DISCOUNT_PROMISE,
      "Message promises a discount the boundary does not permit."
    );
  }

  // AI-draft modes require explicit human approval before sending.
  if (ctx.mode === CommunicationMode.AI_DRAFT_OWNER_APPROVAL_REQUIRED) {
    if (!ctx.approved) {
      return block(
        CustomerMessageStatus.BLOCKED_UNAPPROVED_AI,
        "AI-drafted message requires owner approval before sending."
      );
    }
  }
  if (ctx.mode === CommunicationMode.AI_DRAFT_MANAGER_APPROVAL_REQUIRED) {
    if (!ctx.approved) {
      return block(
        CustomerMessageStatus.BLOCKED_UNAPPROVED_AI,
        "AI-drafted message requires manager approval before sending."
      );
    }
  }

  // TEMPLATE_ONLY mode: an approved, valid, in-scope template is mandatory.
  if (ctx.mode === CommunicationMode.TEMPLATE_ONLY) {
    const t = ctx.template;
    if (!t) {
      return block(CustomerMessageStatus.BLOCKED_NO_TEMPLATE, "No approved template supplied.");
    }
    if (ctx.now < t.validFrom || ctx.now > t.validUntil) {
      return block(CustomerMessageStatus.BLOCKED_TEMPLATE_EXPIRED, "Template is expired or not yet valid.");
    }
    if (!t.allowedRoles.includes(ctx.role)) {
      return block(CustomerMessageStatus.BLOCKED_ROLE, `Role ${ctx.role} may not use this template.`);
    }
    if (!t.allowedChannels.includes(ctx.channel)) {
      return block(CustomerMessageStatus.BLOCKED_CHANNEL, `Channel ${ctx.channel} not allowed for this template.`);
    }
    if (ctx.segment && !t.allowedCustomerSegments.includes(ctx.segment)) {
      return block(CustomerMessageStatus.BLOCKED_SEGMENT, `Segment ${ctx.segment} not allowed for this template.`);
    }
  }

  // Forbidden-claim enforcement (all modes that reach here).
  const lower = ctx.message.toLowerCase();
  const claims = ctx.template?.forbiddenClaims ?? [];
  for (const claim of claims) {
    if (claim && lower.includes(claim.toLowerCase())) {
      return block(
        CustomerMessageStatus.BLOCKED_FORBIDDEN_CLAIM,
        `Message contains a forbidden claim: "${claim}".`
      );
    }
  }

  return { status: CustomerMessageStatus.ALLOWED, allowed: true, reason: "Message is within communication policy." };
}
