import { describe, it, expect } from "vitest";
import {
  CommunicationMode as M,
  CustomerMessageStatus as S,
  DEFAULT_COMMUNICATION_MODE,
  MessageTemplate,
  detectPromises,
  validateCustomerMessage,
  CustomerMessageContext,
} from "@/domain/execution/customer-comms";

const NOW = new Date("2026-06-25T12:00:00.000Z");

const template: MessageTemplate = {
  templateId: "tpl-1",
  version: 1,
  approvedByOwnerId: "owner-1",
  validFrom: new Date("2026-06-20T00:00:00.000Z"),
  validUntil: new Date("2026-07-20T00:00:00.000Z"),
  allowedRoles: ["counter_staff"],
  allowedChannels: ["whatsapp"],
  allowedCustomerSegments: ["retail"],
  editableByEmployee: true,
  maxEditableFields: 2,
  forbiddenClaims: ["guaranteed same day", "lifetime warranty"],
};

const base: CustomerMessageContext = {
  mode: M.TEMPLATE_ONLY,
  template,
  message: "Hi, your order is ready for pickup.",
  role: "counter_staff",
  channel: "whatsapp",
  segment: "retail",
  boundaryAllowsRefundPromise: false,
  boundaryAllowsDiscount: false,
  now: NOW,
};
const v = (over: Partial<CustomerMessageContext>) => validateCustomerMessage({ ...base, ...over });

describe("defaults + promise detection", () => {
  it("MVP default mode is TEMPLATE_ONLY", () => {
    expect(DEFAULT_COMMUNICATION_MODE).toBe(M.TEMPLATE_ONLY);
  });
  it("detects refund and discount promises", () => {
    expect(detectPromises("we will refund you").promisesRefund).toBe(true);
    expect(detectPromises("take 20% off today").promisesDiscount).toBe(true);
    expect(detectPromises("your order is ready").promisesRefund).toBe(false);
  });
});

describe("validateCustomerMessage", () => {
  it("allows a clean template message", () => {
    expect(v({}).status).toBe(S.ALLOWED);
  });
  it("blocks an expired template", () => {
    expect(v({ now: new Date("2026-08-01T00:00:00.000Z") }).status).toBe(S.BLOCKED_TEMPLATE_EXPIRED);
  });
  it("blocks a disallowed role / channel / segment", () => {
    expect(v({ role: "runner" }).status).toBe(S.BLOCKED_ROLE);
    expect(v({ channel: "sms" }).status).toBe(S.BLOCKED_CHANNEL);
    expect(v({ segment: "vip" }).status).toBe(S.BLOCKED_SEGMENT);
  });
  it("enforces forbidden claims", () => {
    expect(v({ message: "This comes with a lifetime warranty!" }).status).toBe(S.BLOCKED_FORBIDDEN_CLAIM);
  });
  it("blocks a refund promise unless the boundary permits it", () => {
    expect(v({ message: "We will refund your payment." }).status).toBe(S.BLOCKED_REFUND_PROMISE);
    expect(
      v({ message: "We will refund your payment.", boundaryAllowsRefundPromise: true }).status
    ).toBe(S.ALLOWED);
  });
  it("blocks a discount promise unless the boundary permits it", () => {
    expect(v({ message: "Here is 30% off your next order." }).status).toBe(S.BLOCKED_DISCOUNT_PROMISE);
    expect(
      v({ message: "Here is 30% off your next order.", boundaryAllowsDiscount: true }).status
    ).toBe(S.ALLOWED);
  });
  it("an unapproved AI-draft message cannot be used", () => {
    expect(v({ mode: M.AI_DRAFT_OWNER_APPROVAL_REQUIRED, template: null, approved: false }).status).toBe(
      S.BLOCKED_UNAPPROVED_AI
    );
    expect(v({ mode: M.AI_DRAFT_OWNER_APPROVAL_REQUIRED, template: null, approved: true }).status).toBe(
      S.ALLOWED
    );
  });
  it("NO_CUSTOMER_COMMUNICATION blocks everything", () => {
    expect(v({ mode: M.NO_CUSTOMER_COMMUNICATION }).status).toBe(S.BLOCKED_MODE);
  });
  it("TEMPLATE_ONLY without a template is blocked", () => {
    expect(v({ template: null }).status).toBe(S.BLOCKED_NO_TEMPLATE);
  });
});
