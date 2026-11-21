/**
 * /support, and the QuickBooks sections of /privacy and /terms.
 * Pins that the copy matches shipped behavior: read-only V1, disconnect keeps
 * imported history, deletion is a manual email request (no self-service delete).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import SupportPage, { metadata } from "@/app/support/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

afterEach(() => cleanup());

describe("SupportPage", () => {
  it("has metadata, the support email, and no invented SLA", () => {
    expect(metadata.title).toBe("Support | OpsIQ");
    const { container } = render(<SupportPage />);
    expect(container.querySelector('a[href="mailto:support@opsiq.solutions"]')).not.toBeNull();
    expect(container.textContent).toMatch(/do not publish a guaranteed response time/i);
    expect(container.textContent).not.toMatch(/within \d+ (hours|business days)/i);
    expect(container.textContent).toMatch(/QuickBooks/);
    expect(container.textContent).toMatch(/deletion/i);
  });
});

describe("Privacy and Terms QuickBooks copy", () => {
  it("privacy describes read-only reports, token encryption, disconnect semantics and manual deletion", () => {
    const t = render(<PrivacyPage />).container.textContent ?? "";
    expect(t).toMatch(/Profit and Loss, Balance Sheet, Aged Receivables, and Aged Payables/);
    expect(t).toMatch(/does not create, edit, or delete anything in your QuickBooks company/);
    expect(t).toMatch(/AES-256-GCM/);
    expect(t).toMatch(/Disconnecting does not delete figures that were already imported/);
    expect(t).toMatch(/no self-service button to delete imported QuickBooks data/);
    expect(t).toMatch(/not been reviewed by a lawyer/);
  });
  it("terms cover third-party integration, read-only, Intuit dependency and not-an-accountant", () => {
    const t = render(<TermsPage />).container.textContent ?? "";
    expect(t).toMatch(/Connected services \(QuickBooks Online\)/);
    expect(t).toMatch(/read-only/);
    expect(t).toMatch(/not your accounting system of record/);
    expect(t).toMatch(/not an accountant, bookkeeper, tax preparer, or financial adviser/);
  });
});
