/**
 * Owner navigation activation — proves the data path is visible in one click and that the
 * active-state defect (a parent route highlighting on a child route) is closed.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const pathnameMock = { current: "/dashboard" };
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock.current }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SidebarNav, resolveActiveHref } from "@/ui/shell/sidebar-nav";

afterEach(() => cleanup());

describe("active state — longest match, not startsWith", () => {
  it("does not highlight /dashboard when the user is on /dashboard/inbox", () => {
    expect(resolveActiveHref("/dashboard/inbox", ["/dashboard", "/dashboard/inbox"])).toBe(
      "/dashboard/inbox",
    );
  });

  it("highlights /dashboard on /dashboard itself", () => {
    expect(resolveActiveHref("/dashboard", ["/dashboard", "/dashboard/inbox"])).toBe("/dashboard");
  });

  it("matches a child route to its nearest registered parent", () => {
    expect(resolveActiveHref("/owner/risks/abc123", ["/owner/risks", "/owner"])).toBe("/owner/risks");
  });

  it("does not match on a shared prefix that is not a path boundary", () => {
    // "/owner/data" must not be considered active on "/owner/database-something"
    expect(resolveActiveHref("/owner/datastore", ["/owner/data"])).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(resolveActiveHref("/nowhere", ["/owner/data"])).toBeNull();
  });

  it("marks the matching nav link with aria-current=page", () => {
    pathnameMock.current = "/owner/data";
    const { getByText } = render(<SidebarNav canViewOwnerRecovery={true} />);
    const link = getByText("My Business").closest("a");
    expect(link!.getAttribute("aria-current")).toBe("page");
  });
});

describe("owner data path is visible in the primary navigation", () => {
  it("renders a 'My Business' entry pointing at /owner/data", () => {
    pathnameMock.current = "/dashboard";
    const { getByText } = render(<SidebarNav canViewOwnerRecovery={true} />);
    const link = getByText("My Business").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/owner/data");
  });

  it("places My Business among the first two owner entries", () => {
    pathnameMock.current = "/dashboard";
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.slice(0, 2)).toEqual(["/owner/cockpit", "/owner/data"]);
  });

  it("gates the data hub to OWNER_VIEW users", () => {
    pathnameMock.current = "/dashboard";
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} />);
    expect(queryByText("My Business")).toBeNull();
  });

  it("surfaces the previously unreachable owner routes in the navigation", () => {
    pathnameMock.current = "/dashboard";
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (const href of [
      "/owner/data",
      "/owner/execution",
      "/owner/strategy",
      "/owner/trust",
      "/owner/startup",
      // /diagnosis and /dashboard/inbox are intentionally excluded here: both require a
      // consulting-engagement capability (ENGAGEMENT_CREATE / ENGAGEMENT_VIEW respectively,
      // matching their own backing API's gate) that no self-serve owner holds, and are
      // correctly absent with no capabilities granted -- see
      // src/__tests__/components/sidebar-nav-capability-gating.test.tsx.
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("keeps exactly one home concept in the navigation", () => {
    pathnameMock.current = "/dashboard";
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    // The other four home surfaces remain reachable as deep links but must not compete in the nav.
    for (const duplicate of ["/owner", "/owner/home", "/owner/now"]) {
      expect(hrefs).not.toContain(duplicate);
    }
    expect(hrefs).toContain("/owner/cockpit");
  });

  it("gives every nav link a 44px minimum touch target", () => {
    pathnameMock.current = "/dashboard";
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} />);
    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(a.getAttribute("class") ?? "").toContain("min-h-[44px]");
    }
  });

  it("labels the navigation landmark", () => {
    pathnameMock.current = "/dashboard";
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} />);
    expect(container.querySelector("nav")!.getAttribute("aria-label")).toBe("Main");
  });
});
