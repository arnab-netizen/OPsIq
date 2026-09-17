import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import { AppHeader } from "@/ui/shell/app-header";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import DiagnosisBetaNotice from "@/components/diagnosis/DiagnosisBetaNotice";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import LandingPage from "@/components/landing/LandingPage";

beforeEach(() => {
  // AppHeader reads the shared ActiveBusinessContext (the always-visible active-business
  // indicator); stub fetch so its mount-time /api/owner/businesses call resolves harmlessly.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ businesses: [] }) } as Response))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Logout control, reached via the account menu", () => {
  it("is not exposed directly in the header — a lay owner must deliberately open the account menu first", () => {
    const { container } = render(
      <ActiveBusinessProvider>
        <AppHeader userName="Ada" />
      </ActiveBusinessProvider>
    );
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      /log out/i.test(b.textContent ?? "")
    );
    expect(btn).toBeUndefined();
  });

  it("appears once the account menu is opened", () => {
    const { container, getByTestId } = render(
      <ActiveBusinessProvider>
        <AppHeader userName="Ada" />
      </ActiveBusinessProvider>
    );
    fireEvent.click(getByTestId("account-menu-trigger"));
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
  it("renders OpsIQ branding and support@opsiq.solutions", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/OpsIQ/);
    expect(container.querySelector('a[href="mailto:support@opsiq.solutions"]')).not.toBeNull();
    expect(text).toMatch(/beta/i);
  });
});

describe("Terms page", () => {
  it("renders OpsIQ, the not-advice disclaimer, and support@opsiq.solutions", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/OpsIQ/);
    expect(text).toMatch(/not financial, legal, accounting, or tax advice/i);
    expect(container.querySelector('a[href="mailto:support@opsiq.solutions"]')).not.toBeNull();
  });
});

describe("Landing footer legal/support links", () => {
  it("links to Privacy, Terms, and Support", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(container.querySelector('a[href="/terms"]')).not.toBeNull();
    expect(container.querySelector('a[href="mailto:support@opsiq.solutions"]')).not.toBeNull();
  });
});
