/**
 * PR C — controlled-beta navigation/exposure consolidation. Contract tests for the new owner IA:
 * Money/Sales/Operations grouped under one "Business" section (not three unrelated top-level
 * peers), Evidence & Trust promoted to a top-level peer entry, Recovery/Strategy/Marketing/
 * Campaigns visibly marked Preview (real, working links), AI Copilot/Integrations visibly marked
 * Coming soon (non-interactive, no `<a>`, no invented placeholder page), and Customer records
 * demoted out of the core Money/Sales/Operations trio without being deleted.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CAPABILITIES } from "@/domain/constants/capabilities";

const OWNER_ONLY_PATHNAME = "/dashboard";

vi.mock("next/navigation", () => ({ usePathname: () => OWNER_ONLY_PATHNAME }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SidebarNav } from "@/ui/shell/sidebar-nav";

afterEach(() => cleanup());

function ownerNav() {
  return render(<SidebarNav canViewOwnerRecovery={true} />);
}

describe("PR C — Business section groups the core decision domains", () => {
  it("Money, Sales, and Operations are all present, each with its own real link", () => {
    const { getByText } = ownerNav();
    expect(getByText("Money").closest("a")!.getAttribute("href")).toBe("/owner/finance");
    expect(getByText("Sales").closest("a")!.getAttribute("href")).toBe("/owner/sales");
    expect(getByText("Operations").closest("a")!.getAttribute("href")).toBe("/owner/operations");
  });

  it("Money, Sales, and Operations sit in the same collapsible section (one disclosure, not three peers)", () => {
    const { getByText } = ownerNav();
    const moneyDetails = getByText("Money").closest("details");
    const salesDetails = getByText("Sales").closest("details");
    const opsDetails = getByText("Operations").closest("details");
    expect(moneyDetails).not.toBeNull();
    expect(moneyDetails).toBe(salesDetails);
    expect(moneyDetails).toBe(opsDetails);
  });

  it("that section is titled 'Business', not the old 'Business details'", () => {
    const { getByText, queryByText } = ownerNav();
    const summary = getByText("Money").closest("details")!.querySelector("summary")!;
    expect(summary.textContent?.trim().endsWith("Business")).toBe(true);
    expect(queryByText("Business details")).toBeNull();
  });
});

describe("PR C — Customer records demoted, distinct from any Customer Intelligence claim", () => {
  it("is reachable under the truthful label 'Customer records', not the old 'Customers'", () => {
    const { getByText, queryByText } = ownerNav();
    expect(getByText("Customer records").closest("a")!.getAttribute("href")).toBe("/owner/customers");
    expect(queryByText("Customers")).toBeNull();
  });

  it("never renders any 'Customer Intelligence' label or churn/retention/concentration claim", () => {
    const { container } = ownerNav();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/customer intelligence/i);
    expect(text).not.toMatch(/churn (prediction|risk|intelligence)/i);
    expect(text).not.toMatch(/retention (score|intelligence)/i);
    expect(text).not.toMatch(/concentration (risk|intelligence)/i);
  });
});

describe("PR C — Evidence & Trust is a top-level peer, not buried in a settings section", () => {
  it("renders ungrouped (not inside any collapsible <details>)", () => {
    const { getByText } = ownerNav();
    const link = getByText("Evidence & Trust").closest("a")!;
    expect(link.getAttribute("href")).toBe("/owner/trust");
    expect(link.closest("details")).toBeNull();
  });

  it("is not labelled 'History'", () => {
    const { queryByText } = ownerNav();
    expect(queryByText("History")).toBeNull();
  });
});

describe("PR C — Preview items are real, working links with a visible Preview pill", () => {
  it.each([
    ["Recovery", "/owner/recovery"],
    ["Strategy", "/owner/strategy"],
    ["Marketing", "/owner/marketing"],
    ["Campaigns", "/owner/marketing/campaigns"],
  ])("%s links to %s and carries a visible 'Preview' pill", (label, href) => {
    const { getByText } = ownerNav();
    const link = getByText(label).closest("a")!;
    expect(link.getAttribute("href")).toBe(href);
    expect(link.textContent).toMatch(/preview/i);
  });
});

describe("PR C — Coming Soon items are visible but never clickable or link-shaped", () => {
  it.each([
    ["AI Copilot"],
    ["Integrations"],
  ])("%s renders as a non-interactive row with a 'Coming soon' pill, no <a> anywhere", (label) => {
    const { getByText, container } = ownerNav();
    const labelEl = getByText(label);
    expect(labelEl.closest("a")).toBeNull();
    const row = labelEl.closest("div")!;
    expect(row.textContent).toMatch(/coming soon/i);
    // Sanity: neither label resolves to any anchor in the whole tree.
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.every((h) => h && !h.includes("copilot") && !h.includes("integration"))).toBe(true);
  });

  it("never claims a live QuickBooks/HubSpot connection or a working AI assistant", () => {
    const { container } = ownerNav();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/connected to quickbooks/i);
    expect(text).not.toMatch(/connected to hubspot/i);
    expect(text).not.toMatch(/ask opsiq anything/i);
  });
});

describe("PR C — User accounts truthfully framed as account administration, not HR/People", () => {
  it("renders 'User accounts' pointing at /users for a capability-holding user, never 'People'", () => {
    const { getByText, queryByText } = render(
      <SidebarNav canViewOwnerRecovery={true} capabilities={[CAPABILITIES.USER_VIEW]} />,
    );
    expect(getByText("User accounts").closest("a")!.getAttribute("href")).toBe("/users");
    expect(queryByText("People")).toBeNull();
  });
});

describe("PR C — no per-domain diagnosis nav concept was introduced", () => {
  it("a real self-serve owner (no ENGAGEMENT_CREATE) sees no 'Diagnosis' item at all", () => {
    const { queryByText } = ownerNav();
    expect(queryByText("Diagnosis")).toBeNull();
  });

  it("the one 'Diagnosis' item that exists (legacy consultant engagement diagnosis, ENGAGEMENT_CREATE-gated) is singular, not a per-domain sibling of Money/Sales/Operations", () => {
    const { getAllByText } = render(
      <SidebarNav canViewOwnerRecovery={true} capabilities={[CAPABILITIES.ENGAGEMENT_CREATE]} />,
    );
    const diagnosisLinks = getAllByText("Diagnosis").map((el) => el.closest("a")?.getAttribute("href"));
    expect(diagnosisLinks).toEqual(["/diagnosis"]);
  });
});

describe("PR C — Consulting and Administration sections are untouched", () => {
  it("still render exactly as before for a SYSTEM_ADMIN capability set", () => {
    const { queryByText } = render(
      <SidebarNav
        canViewOwnerRecovery={true}
        capabilities={[
          CAPABILITIES.ENGAGEMENT_VIEW,
          CAPABILITIES.CLIENT_VIEW,
          CAPABILITIES.LEAD_VIEW,
          CAPABILITIES.SYSTEM_ADMIN,
        ]}
      />,
    );
    expect(queryByText("Consulting")).not.toBeNull();
    expect(queryByText("Administration")).not.toBeNull();
  });
});
