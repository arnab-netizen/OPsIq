/**
 * /privacy — copy accuracy regression.
 *
 * The page previously claimed a data access/correction/deletion request
 * could be made "via the 'Send beta feedback' link in the product" — but
 * that link (POST /api/feedback) writes to PlatformFeedback, a table with no
 * privacy/deletion category and no code path into PrivacyRequest (the table
 * the manual runbook instructs operators to check). A user following the
 * page's own instructions could never generate a record anyone would see.
 * This pins the corrected copy: it must promise only the mechanism that
 * actually works (emailing support), never the broken "Send beta feedback"
 * claim.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import PrivacyPage from "@/app/privacy/page";

afterEach(() => {
  cleanup();
});

describe("PrivacyPage — access/correction/deletion copy", () => {
  it("no longer claims 'Send beta feedback' can be used for a privacy request", () => {
    render(<PrivacyPage />);
    expect(screen.queryByText(/send beta feedback/i)).toBeNull();
  });

  it("still promises the one mechanism that actually works: emailing support", () => {
    render(<PrivacyPage />);
    const mailLinks = screen.getAllByRole("link", { name: /support@opsiq\.solutions/i });
    expect(mailLinks.length).toBeGreaterThan(0);
    expect(mailLinks[0].getAttribute("href")).toBe("mailto:support@opsiq.solutions");
  });

  it("still discloses that fulfillment is manual, not instant", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/fulfilled manually/i)).toBeTruthy();
  });
});
