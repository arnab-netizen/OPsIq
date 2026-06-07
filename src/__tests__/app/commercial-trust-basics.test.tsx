import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { AppHeader } from "@/ui/shell/app-header";
import DiagnosisBetaNotice from "@/components/diagnosis/DiagnosisBetaNotice";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import LandingPage from "@/components/landing/LandingPage";

afterEach(() => cleanup());

describe("Visible logout control", () => {
  it("renders a 'Log out' control in the authenticated header", () => {
    const { container } = render(<AppHeader userName="Ada" />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      /log out/i.test(b.textContent ?? "")
    );
    expect(btn).toBeDefined();
  });
});

describe("Diagnosis sensitive-data warning", () => {
  it("warns not to enter sensitive/confidential information", () => {
    const { container } = render(<DiagnosisBetaNotice />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/do not enter sensitive/i);
    expect(text).toMatch(/confidential business information/i);
  });
});

describe("Privacy page", () => {
  it("renders Rebilix branding and support@opsiq.com", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Rebilix/);
    expect(container.querySelector('a[href="mailto:support@opsiq.com"]')).not.toBeNull();
    expect(text).toMatch(/beta/i);
  });
});

describe("Terms page", () => {
  it("renders Rebilix, the not-advice disclaimer, and support@opsiq.com", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Rebilix/);
    expect(text).toMatch(/not financial, legal, accounting, or tax advice/i);
    expect(container.querySelector('a[href="mailto:support@opsiq.com"]')).not.toBeNull();
  });
});

describe("Landing footer legal/support links", () => {
  it("links to Privacy, Terms, and Support", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(container.querySelector('a[href="/terms"]')).not.toBeNull();
    expect(container.querySelector('a[href="mailto:support@opsiq.com"]')).not.toBeNull();
  });
});
