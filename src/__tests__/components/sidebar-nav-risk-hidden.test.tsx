/**
 * D2 — controlled-beta launch-blocker closure. Live production browser acceptance proved
 * `/owner/risks` (BusinessRiskEntry) has no businessId column at all: it is workspace-wide, and the
 * SAME risk record IDs render under every business selected in a multi-business workspace. Per the
 * mission's "prefer hiding over expanding scope" rule, Risk is removed from normal beta navigation
 * (route/page/service code untouched) rather than broadened into a schema migration. This file
 * proves the nav-only removal: no link to /owner/risks, and no visible "Risk" label, anywhere in
 * the rendered owner sidebar.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

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

describe("D2 — Risk removed from normal beta navigation", () => {
  it("renders no link to /owner/risks anywhere in the sidebar", () => {
    const { container } = ownerNav();
    const riskLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/owner/risks"
    );
    expect(riskLink).toBeUndefined();
  });

  it("renders no visible 'Risk' nav label", () => {
    const { queryByText } = ownerNav();
    expect(queryByText("Risk")).toBeNull();
  });
});
