/**
 * Owner canonical navigation — route consolidation proof (PASS 38).
 *
 * Proves /owner/cockpit is the canonical owner entry: the primary owner sidebar entry points to
 * /owner/cockpit (not the older /owner/recovery), it is gated to OWNER_VIEW users, and the CanonicalCockpitLink
 * banner (placed on the legacy owner surfaces) links to /owner/cockpit — so an owner has one obvious daily
 * entry point without any page being deleted.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { SidebarNav } from "@/ui/shell/sidebar-nav";
import { CanonicalCockpitLink } from "@/components/owner/CanonicalCockpitLink";

afterEach(() => cleanup());

describe("owner canonical navigation", () => {
  it("1. the primary owner nav entry points to /owner/cockpit (canonical), labelled 'Owner Cockpit'", () => {
    const { getByText } = render(<SidebarNav canViewOwnerRecovery={true} />);
    const link = getByText("Owner Cockpit").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/owner/cockpit");
  });

  it("2. the old 'Owner Recovery' label is no longer the owner nav entry", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={true} />);
    expect(queryByText("Owner Recovery")).toBeNull();
  });

  it("3. the owner cockpit entry is gated to OWNER_VIEW users", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} />);
    expect(queryByText("Owner Cockpit")).toBeNull();
  });

  it("4. the canonical cockpit link banner points to /owner/cockpit", () => {
    const { getByTestId } = render(<CanonicalCockpitLink from="Now View" />);
    expect(getByTestId("canonical-cockpit-href").getAttribute("href")).toBe("/owner/cockpit");
    expect(getByTestId("canonical-cockpit-link").textContent).toMatch(/go to your cockpit/i);
  });

  it("5. the canonical link carries no forbidden/marketing copy and no fabricated money", () => {
    const { getByTestId } = render(<CanonicalCockpitLink from="command center" />);
    const html = getByTestId("canonical-cockpit-link").innerHTML.toLowerCase();
    expect(html).not.toMatch(/guaranteed|best|#1|roi|[$£€]\s?\d|sign up|pricing|upgrade/);
  });
});
