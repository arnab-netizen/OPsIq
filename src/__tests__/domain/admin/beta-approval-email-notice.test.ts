import { describe, it, expect } from "vitest";
import { betaApprovalEmailNotice } from "@/domain/admin/beta-approval-email-notice";

describe("betaApprovalEmailNotice", () => {
  it("SENT is the only outcome that claims an email was sent", () => {
    const sent = betaApprovalEmailNotice("SENT");
    expect(sent.tone).toBe("success");
    expect(sent.text).toMatch(/email sent/i);
    for (const other of ["FAILED", "NO_PROVIDER", "NOT_ATTEMPTED", undefined, "bogus", null]) {
      const notice = betaApprovalEmailNotice(other);
      expect(notice.tone).toBe("warning");
      expect(notice.text).not.toMatch(/email sent|invitation sent|invite sent/i);
    }
  });

  it("FAILED says access was granted but the email was not delivered, and when a retry makes sense", () => {
    const { text } = betaApprovalEmailNotice("FAILED");
    expect(text).toMatch(/access was granted/i);
    expect(text).toMatch(/could not be delivered/i);
    expect(text).toMatch(/retry only after/i);
  });

  it("NO_PROVIDER says no email provider is configured", () => {
    expect(betaApprovalEmailNotice("NO_PROVIDER").text).toMatch(/no email provider is configured/i);
  });

  it("NOT_ATTEMPTED and an unrecognised value never imply a send", () => {
    expect(betaApprovalEmailNotice("NOT_ATTEMPTED").text).toMatch(/no invitation email was sent/i);
    expect(betaApprovalEmailNotice(undefined).text).toMatch(/could not be confirmed/i);
  });
});
