import { describe, it, expect } from "vitest";
import { betaApprovalEmailNotice } from "@/domain/admin/beta-approval-email-notice";

describe("betaApprovalEmailNotice", () => {
  it("SENT says accepted by provider — never delivered — and is the only success wording", () => {
    const sent = betaApprovalEmailNotice("SENT");
    expect(sent.tone).toBe("success");
    expect(sent.text).toBe("Invitation email accepted by provider.");
    expect(sent.text).not.toMatch(/deliver/i);
    for (const other of ["FAILED", "NO_PROVIDER", "NOT_ATTEMPTED", undefined, "bogus", null]) {
      const notice = betaApprovalEmailNotice(other, "some reason");
      expect(notice.tone).toBe("warning");
      expect(notice.text).not.toMatch(/accepted by provider/i);
    }
  });

  it("FAILED carries the safe reason and tells the operator how to retry", () => {
    const { text } = betaApprovalEmailNotice("FAILED", "the email provider rejected the request (HTTP 403)");
    expect(text).toContain("Invitation email could not be sent: the email provider rejected the request (HTTP 403).");
    expect(text).toMatch(/Resend invitation email/);
  });

  it("NO_PROVIDER and NOT_ATTEMPTED are described truthfully", () => {
    expect(betaApprovalEmailNotice("NO_PROVIDER").text).toBe("No email provider is configured.");
    expect(betaApprovalEmailNotice("NOT_ATTEMPTED", "this request is REVOKED, not INVITED").text).toBe(
      "No email was sent: this request is REVOKED, not INVITED."
    );
  });

  it("an unrecognised or missing outcome is reported as unconfirmed, never as sent", () => {
    expect(betaApprovalEmailNotice(undefined).text).toMatch(/could not be confirmed/i);
  });
});
