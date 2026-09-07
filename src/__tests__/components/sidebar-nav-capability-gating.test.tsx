/**
 * Sidebar nav capability gating — closes the ungated-consultant-nav defect.
 *
 * Before this change, Clients (/clients), Engagements (/engagements), Leads (/leads), the
 * "Consulting dashboard" (/dashboard), and People (/users) rendered for every signed-in user
 * with no gate at all, regardless of role — unlike the owner-only items, which were already
 * correctly gated behind `canViewOwnerRecovery` (OWNER_VIEW).
 *
 * Root cause found while diagnosing: those five items are each backed by an API route that
 * already requires a specific capability (CLIENT_VIEW, ENGAGEMENT_VIEW, LEAD_VIEW, USER_VIEW —
 * see src/app/api/clients/route.ts, src/app/api/engagements/route.ts, src/app/api/leads/route.ts,
 * src/app/api/users/route.ts). The nav simply never read any of those capabilities. The fix wires
 * the SAME role -> ROLE_CAPABILITIES resolution `canViewOwnerRecovery` already uses (see
 * src/app/(authenticated)/layout.tsx) into a generic per-item `requiresCapability` gate — no new
 * capability, no new role, no parallel model.
 *
 * IMPORTANT — an honest limitation this suite documents rather than papers over: self-serve owner
 * signup (src/app/api/auth/signup/route.ts) grants ROLES.ADMIN_OR_PORTFOLIO_MANAGER, and
 * ROLE_CAPABILITIES[ADMIN_OR_PORTFOLIO_MANAGER] (src/policies/capability-check.ts) genuinely
 * grants CLIENT_VIEW/ENGAGEMENT_VIEW/LEAD_VIEW/USER_VIEW alongside OWNER_VIEW — by design, the
 * same role is used for both a self-serve SMB owner and a real internal admin/portfolio manager.
 * There is no existing capability, role, or workspace-type flag anywhere in the schema that
 * distinguishes those two populations. So this fix correctly hides the five items from any role
 * that actually lacks the matching capability (CLIENT_OWNER, CLIENT_TEAM_MEMBER, VIEWER, and any
 * signed-in user with no resolvable capability set) — but an ADMIN_OR_PORTFOLIO_MANAGER-role
 * self-serve owner still sees them, because they hold the same capabilities a real portfolio
 * manager does. That residual gap is a backend/role-model limitation, not a nav-gating bug, and
 * is out of scope for a UX-only visibility fix.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SidebarNav } from "@/ui/shell/sidebar-nav";

afterEach(() => cleanup());

const CONSULTANT_LABELS = ["Consulting workspace", "Clients", "Engagements", "Leads", "People"];

function hrefsOf(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
}

describe("sidebar nav — consultant-facing items are capability-gated, not ungated", () => {
  it("renders none of the consultant-facing items when no capabilities are granted (matches prior unauthenticated-shape default)", () => {
    const { container, queryByText } = render(<SidebarNav canViewOwnerRecovery={false} />);
    for (const label of CONSULTANT_LABELS) {
      expect(queryByText(label)).toBeNull();
    }
    const hrefs = hrefsOf(container);
    expect(hrefs).not.toContain("/clients");
    expect(hrefs).not.toContain("/engagements");
    expect(hrefs).not.toContain("/leads");
    expect(hrefs).not.toContain("/dashboard");
    expect(hrefs).not.toContain("/users");
  });

  it("hides Clients, Leads, and People from a client-side role (CLIENT_TEAM_MEMBER) that genuinely lacks CLIENT_VIEW/LEAD_VIEW/USER_VIEW", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.CLIENT_TEAM_MEMBER));
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} capabilities={caps} />);
    expect(queryByText("Clients")).toBeNull();
    expect(queryByText("Leads")).toBeNull();
    expect(queryByText("People")).toBeNull();
  });

  it("still shows Engagements/Consulting workspace to a client-side role that legitimately holds ENGAGEMENT_VIEW (parity with what the /engagements API route actually allows)", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.CLIENT_TEAM_MEMBER));
    expect(caps).toContain(CAPABILITIES.ENGAGEMENT_VIEW);
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} capabilities={caps} />);
    expect(queryByText("Engagements")).not.toBeNull();
    expect(queryByText("Consulting workspace")).not.toBeNull();
  });

  it("hides all five consultant-facing items from VIEWER except Engagements/dashboard, matching VIEWER's real capability set", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.VIEWER));
    expect(caps).not.toContain(CAPABILITIES.CLIENT_VIEW);
    expect(caps).not.toContain(CAPABILITIES.LEAD_VIEW);
    expect(caps).not.toContain(CAPABILITIES.USER_VIEW);
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} capabilities={caps} />);
    expect(queryByText("Clients")).toBeNull();
    expect(queryByText("Leads")).toBeNull();
    expect(queryByText("People")).toBeNull();
  });

  it("shows all five consultant-facing items to an authorized internal role (EXPERIENCED_CONSULTANT) that holds every backing capability", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.EXPERIENCED_CONSULTANT));
    for (const cap of [
      CAPABILITIES.CLIENT_VIEW,
      CAPABILITIES.ENGAGEMENT_VIEW,
      CAPABILITIES.LEAD_VIEW,
      CAPABILITIES.USER_VIEW,
    ]) {
      expect(caps).toContain(cap);
    }
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} capabilities={caps} />);
    for (const label of CONSULTANT_LABELS) {
      expect(queryByText(label)).not.toBeNull();
    }
  });

  it("shows all five consultant-facing items to SYSTEM_ADMIN (holds every capability)", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.SYSTEM_ADMIN));
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={true} capabilities={caps} />);
    for (const label of CONSULTANT_LABELS) {
      expect(queryByText(label)).not.toBeNull();
    }
  });

  it("documents the known residual: ADMIN_OR_PORTFOLIO_MANAGER (the role self-serve owner signup grants) still sees the consultant-facing items, because that role genuinely carries CLIENT_VIEW/ENGAGEMENT_VIEW/LEAD_VIEW/USER_VIEW by design alongside OWNER_VIEW — there is no existing signal that separates a self-serve owner from a real portfolio manager within this role", () => {
    const caps = Array.from(getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER));
    expect(caps).toContain(CAPABILITIES.OWNER_VIEW);
    expect(caps).toContain(CAPABILITIES.CLIENT_VIEW);
    expect(caps).toContain(CAPABILITIES.ENGAGEMENT_VIEW);
    expect(caps).toContain(CAPABILITIES.LEAD_VIEW);
    expect(caps).toContain(CAPABILITIES.USER_VIEW);

    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={true} capabilities={caps} />);
    for (const label of CONSULTANT_LABELS) {
      expect(queryByText(label)).not.toBeNull();
    }
  });
});

describe("sidebar nav — owner-only and shared/ungated items are unaffected by the capability gate", () => {
  it("owner-only nav remains visible to owners regardless of consultant capabilities", () => {
    const { queryByText } = render(
      <SidebarNav canViewOwnerRecovery={true} capabilities={[CAPABILITIES.OWNER_VIEW]} />,
    );
    expect(queryByText("Home")).not.toBeNull();
    expect(queryByText("My Business")).not.toBeNull();
    expect(queryByText("Money")).not.toBeNull();
  });

  it("owner-only nav stays hidden without OWNER_VIEW, independent of the new capabilities prop", () => {
    const { queryByText } = render(
      <SidebarNav
        canViewOwnerRecovery={false}
        capabilities={[CAPABILITIES.CLIENT_VIEW, CAPABILITIES.ENGAGEMENT_VIEW]}
      />,
    );
    expect(queryByText("Home")).toBeNull();
    expect(queryByText("Money")).toBeNull();
  });

  it("truly shared, ungated items (Check a decision... no — see below; Settings) remain visible to everyone with no capabilities at all", () => {
    // Settings (/api/me) is session-only -- genuinely the last ungated item in the nav.
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} capabilities={[]} />);
    expect(queryByText("Settings")).not.toBeNull();
  });

  /**
   * Dead-nav closure: Diagnosis, What if…, Check a decision, Decision Inbox, and Reports were
   * ALL previously ungated despite each being backed by an API route that requires a
   * consulting-engagement-only capability (ENGAGEMENT_CREATE, ACTION_VIEW, ENGAGEMENT_VIEW,
   * ENGAGEMENT_VIEW, SYSTEM_VIEW_AUDIT respectively) -- none of which survive the
   * self-serve-owner OWNER_SCOPED_CAPABILITIES narrowing. Every one of these asserts against
   * the exact two-arg call the real app renders with (src/app/(authenticated)/layout.tsx:
   * getCapabilitiesForRole(r.role, policy.workspaceRole)), which correctly narrows
   * ADMIN_OR_PORTFOLIO_MANAGER + workspaceRole="owner" (the self-serve signup shape) down to
   * OWNER_SCOPED_CAPABILITIES. This is NOT the same as the CONSULTANT_LABELS residual gap
   * documented above (which is measured via the single-arg call and intentionally left open) --
   * these five items are fully closed for the persona that matters for beta.
   */
  it("Diagnosis, What if…, Check a decision, Decision Inbox, and Reports are gated on their real backing API capability, and correctly hidden for a real self-serve owner", () => {
    const selfServeOwnerCaps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner");
    for (const cap of [
      CAPABILITIES.ENGAGEMENT_CREATE,
      CAPABILITIES.ACTION_VIEW,
      CAPABILITIES.ENGAGEMENT_VIEW,
      CAPABILITIES.SYSTEM_VIEW_AUDIT,
    ]) {
      expect(selfServeOwnerCaps).not.toContain(cap);
    }

    const { queryByText } = render(
      <SidebarNav canViewOwnerRecovery={true} capabilities={Array.from(selfServeOwnerCaps)} />,
    );
    expect(queryByText("Diagnosis")).toBeNull();
    expect(queryByText("What if…")).toBeNull();
    expect(queryByText("Check a decision")).toBeNull();
    expect(queryByText("Decision Inbox")).toBeNull();
    expect(queryByText("Reports")).toBeNull();
  });

  it("Diagnosis, What if…, Check a decision, Decision Inbox, and Reports remain visible to roles that genuinely hold the matching capability", () => {
    const consultantCaps = Array.from(getCapabilitiesForRole(ROLES.EXPERIENCED_CONSULTANT));
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} capabilities={consultantCaps} />);
    expect(queryByText("Diagnosis")).not.toBeNull();
    expect(queryByText("What if…")).not.toBeNull();
    expect(queryByText("Check a decision")).not.toBeNull();
    expect(queryByText("Decision Inbox")).not.toBeNull();

    const adminCaps = Array.from(getCapabilitiesForRole(ROLES.SYSTEM_ADMIN));
    const { queryByText: queryByTextAdmin } = render(
      <SidebarNav canViewOwnerRecovery={true} capabilities={adminCaps} />,
    );
    expect(queryByTextAdmin("Reports")).not.toBeNull();
  });

  it("omitting the capabilities prop entirely behaves the same as an empty array (safe default for any caller not yet updated)", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} />);
    expect(queryByText("Settings")).not.toBeNull();
    expect(queryByText("Diagnosis")).toBeNull();
    expect(queryByText("Clients")).toBeNull();
  });
});
