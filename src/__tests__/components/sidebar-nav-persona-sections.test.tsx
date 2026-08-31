/**
 * Persona-sectioned nav (IA Model B) — contract tests.
 *
 * The nav is one sidebar, still filtered purely by `canViewOwnerRecovery` (OWNER_VIEW) and the
 * per-item `requiresCapability` gate — no parallel auth mechanism. What's new is that the former
 * "Records & settings" grab-bag was split into "Records" (owner), "Consulting" (consultant/
 * portfolio-manager capabilities), and "Administration" (SYSTEM_ADMIN). Because a section with
 * zero visible items renders nothing, a persona only ever sees the sections its real capability
 * set actually populates — this is a family-level contract test over that behavior, not one test
 * per nav item.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";

vi.mock("next/navigation", () => ({ usePathname: () => "/owner/cockpit" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SidebarNav } from "@/ui/shell/sidebar-nav";

afterEach(() => cleanup());

const CONSULTING_LABELS = ["Consulting workspace", "Clients", "Engagements", "Leads"];
const ADMIN_LABELS = ["Billing diagnostics"];

describe("persona sections — self-serve owner", () => {
  // The only production-reachable role-assignment path: POST /api/auth/signup grants
  // ADMIN_OR_PORTFOLIO_MANAGER on a WorkspaceMembership.role="owner" workspace, which
  // getCapabilitiesForRole narrows to OWNER_SCOPED_CAPABILITIES (see capability-check.ts).
  const caps = Array.from(getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner"));

  it("holds none of the Consulting- or Administration-section capabilities", () => {
    for (const cap of [
      CAPABILITIES.CLIENT_VIEW,
      CAPABILITIES.ENGAGEMENT_VIEW,
      CAPABILITIES.LEAD_VIEW,
      CAPABILITIES.SYSTEM_ADMIN,
    ]) {
      expect(caps).not.toContain(cap);
    }
  });

  it("sees primary owner nav but neither the Consulting nor the Administration section", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={true} capabilities={caps} />);
    expect(queryByText("Home")).not.toBeNull();
    expect(queryByText("Money")).not.toBeNull();
    for (const label of [...CONSULTING_LABELS, ...ADMIN_LABELS]) {
      expect(queryByText(label)).toBeNull();
    }
    expect(queryByText("Consulting")).toBeNull();
    expect(queryByText("Administration")).toBeNull();
  });
});

describe("persona sections — consultant / portfolio-manager capability fixture", () => {
  // Not reachable via any production signup path today (see file-level comment in
  // sidebar-nav.tsx) — only via an existing SYSTEM_ADMIN provisioning a non-owner-scoped
  // ADMIN_OR_PORTFOLIO_MANAGER, or the EXPERIENCED_CONSULTANT/BEGINNER_CONSULTANT roles, none of
  // which anything in production creates yet. Still a real, correctly-gated capability set the
  // nav must render correctly for.
  const caps = Array.from(getCapabilitiesForRole(ROLES.EXPERIENCED_CONSULTANT));

  it("sees the Consulting section and not Administration", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} capabilities={caps} />);
    for (const label of CONSULTING_LABELS) {
      expect(queryByText(label)).not.toBeNull();
    }
    expect(queryByText("Consulting")).not.toBeNull();
    for (const label of ADMIN_LABELS) {
      expect(queryByText(label)).toBeNull();
    }
    expect(queryByText("Administration")).toBeNull();
  });
});

describe("persona sections — SYSTEM_ADMIN", () => {
  const caps = Array.from(getCapabilitiesForRole(ROLES.SYSTEM_ADMIN));

  it("sees the Administration section (Billing diagnostics) alongside everything else", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={true} capabilities={caps} />);
    expect(queryByText("Administration")).not.toBeNull();
    expect(queryByText("Billing diagnostics")).not.toBeNull();
    const link = queryByText("Billing diagnostics")!.closest("a");
    expect(link!.getAttribute("href")).toBe("/admin/billing");
  });
});

describe("persona sections — shared/internal user with no elevated capability", () => {
  it("sees neither Consulting nor Administration, but keeps the shared ungated items", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} capabilities={[]} />);
    expect(queryByText("Consulting")).toBeNull();
    expect(queryByText("Administration")).toBeNull();
    expect(queryByText("Diagnosis")).not.toBeNull();
    expect(queryByText("Reports")).not.toBeNull();
  });
});

describe("group collapse/expand behavior is unregressed by the new sections", () => {
  it("a section with a collapsedByDefault flag starts closed when it doesn't contain the active route", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.SYSTEM_ADMIN));
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} capabilities={caps} />);
    const summaries = Array.from(container.querySelectorAll("summary"));
    const adminSummary = summaries.find((s) => s.textContent === "Administration")!;
    const adminDetails = adminSummary.closest("details")!;
    // Active route is /owner/cockpit (mocked above), which is not inside Administration.
    expect(adminDetails.hasAttribute("open")).toBe(false);
  });

  it("clicking a closed section's summary opens it, revealing its items", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.SYSTEM_ADMIN));
    const { container, queryByText } = render(
      <SidebarNav canViewOwnerRecovery={true} capabilities={caps} />,
    );
    const summaries = Array.from(container.querySelectorAll("summary"));
    const adminSummary = summaries.find((s) => s.textContent === "Administration")!;
    expect(queryByText("Billing diagnostics")).not.toBeNull(); // present in DOM even closed (native <details>)
    fireEvent.click(adminSummary);
    const adminDetails = adminSummary.closest("details")!;
    expect(adminDetails.hasAttribute("open")).toBe(true);
  });
});
