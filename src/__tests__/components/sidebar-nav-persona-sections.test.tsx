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
    expect(queryByText("Settings")).not.toBeNull();
    // Diagnosis (ENGAGEMENT_CREATE) and Reports (SYSTEM_VIEW_AUDIT) each match their own
    // backing API's real capability requirement and are correctly hidden here, unlike a
    // genuinely ungated item such as Settings (/api/me, session-only).
    expect(queryByText("Diagnosis")).toBeNull();
    expect(queryByText("Reports")).toBeNull();
  });
});

describe("group collapse/expand behavior is unregressed by the new sections", () => {
  it("a section with a collapsedByDefault flag starts closed when it doesn't contain the active route", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.SYSTEM_ADMIN));
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} capabilities={caps} />);
    const summaries = Array.from(container.querySelectorAll("summary"));
    // The summary's textContent also carries the P0-B disclosure indicator glyph, so match by
    // trailing text rather than strict equality.
    const adminSummary = summaries.find((s) => s.textContent?.trim().endsWith("Administration"))!;
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
    const adminSummary = summaries.find((s) => s.textContent?.trim().endsWith("Administration"))!;
    expect(queryByText("Billing diagnostics")).not.toBeNull(); // present in DOM even closed (native <details>)
    fireEvent.click(adminSummary);
    const adminDetails = adminSummary.closest("details")!;
    expect(adminDetails.hasAttribute("open")).toBe(true);
  });
});

describe("collapsed section summaries expose a visible disclosure affordance", () => {
  // P0-B: closed groups previously rendered as plain text with no indication they were
  // expandable. Every collapsible summary must carry a rotating indicator and keep native
  // <details>/<summary> keyboard behavior — this is shared by both the desktop sidebar and
  // the mobile drawer, since both render this same SidebarNav component (see app-shell.tsx).
  const caps = Array.from(getCapabilitiesForRole(ROLES.SYSTEM_ADMIN));

  it("every collapsible summary renders a disclosure indicator that rotates on open", () => {
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} capabilities={caps} />);
    const detailsEls = Array.from(container.querySelectorAll("details"));
    // Sanity: this render includes multiple collapsible sections (Business details, Growth,
    // More, Consulting, Administration), so this isn't a vacuous pass.
    expect(detailsEls.length).toBeGreaterThan(1);

    for (const details of detailsEls) {
      const summary = details.querySelector("summary")!;
      const indicator = summary.querySelector('[aria-hidden="true"]');
      expect(indicator).not.toBeNull();
      expect(indicator!.className).toContain("transition-transform");
      expect(indicator!.className).toContain("group-open:rotate-90");
      // Native browser marker must stay suppressed so only our indicator shows.
      expect(summary.className).toContain("list-none");
    }
  });

  it("a summary is a native focusable/keyboard-operable control with a visible focus style", () => {
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} capabilities={caps} />);
    const summary = container.querySelector("summary")!;
    expect(summary.className).toContain("cursor-pointer");
    expect(summary.className).toContain("focus-visible:ring-2");
  });
});
