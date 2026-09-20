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
import * as fs from "fs";
import * as path from "path";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { SidebarNav } from "@/ui/shell/sidebar-nav";
import { CanonicalCockpitLink } from "@/components/owner/CanonicalCockpitLink";

afterEach(() => cleanup());

function readOwnerPage(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../app/(authenticated)/owner", rel), "utf8");
}

describe("owner canonical navigation", () => {
  it("1. the primary owner nav entry points to /owner/cockpit (canonical), labelled 'Home'", () => {
    // The href is the canonical contract; the label was renamed from "Owner Cockpit" to "Home"
    // because owners do not navigate by aircraft metaphor. The route is unchanged.
    const { getByText } = render(<SidebarNav canViewOwnerRecovery={true} />);
    const link = getByText("Home").closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/owner/cockpit");
  });

  it("2. the old 'Owner Recovery' label is no longer the owner nav entry", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={true} />);
    expect(queryByText("Owner Recovery")).toBeNull();
  });

  it("3. the owner cockpit entry is gated to OWNER_VIEW users", () => {
    const { queryByText } = render(<SidebarNav canViewOwnerRecovery={false} />);
    expect(queryByText("Home")).toBeNull();
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

  it("6. the hidden Priorities route (/owner/priorities) stays out of the sidebar nav", () => {
    const { container } = render(<SidebarNav canViewOwnerRecovery={true} />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/owner/priorities");
  });
});

/**
 * UX-01 stale-link fixes: Trust's header action and Help's "What should I do next?" topic both
 * pointed at surfaces other than canonical Home (Trust → /owner, a non-canonical alias; Help →
 * /owner/priorities, a route deliberately hidden from navigation per test 6 above). Both are
 * fixed to /owner/cockpit, proven here via source-contract assertions (consistent with this
 * repo's convention for pages that fetch on mount — see business-context-selector-migration.test.ts).
 */
describe("owner canonical navigation — UX-01 stale-link fixes", () => {
  it("Trust's header action links to /owner/cockpit labelled 'Home', not the non-canonical /owner", () => {
    const src = readOwnerPage("trust/page.tsx");
    expect(src).toMatch(/<Link href="\/owner\/cockpit"><Button>Home<\/Button><\/Link>/);
    expect(src).not.toMatch(/<Link href="\/owner"><Button>/);
  });

  it("Help's 'What should I do next?' topic links to /owner/cockpit labelled 'Go to Home', not the hidden /owner/priorities", () => {
    const src = readOwnerPage("help/page.tsx");
    const topicMatch = src.match(/question:\s*"What should I do next\?"[\s\S]*?linkLabel:\s*"([^"]*)"/);
    expect(topicMatch).not.toBeNull();
    const topicBlock = src.slice(src.indexOf('"What should I do next?"'), src.indexOf('"What should I do next?"') + 400);
    expect(topicBlock).toContain('linkHref: "/owner/cockpit"');
    expect(topicBlock).toContain('linkLabel: "Go to Home"');
    expect(topicBlock).not.toContain("/owner/priorities");
  });

  it("Help no longer links anywhere to the hidden /owner/priorities route", () => {
    const src = readOwnerPage("help/page.tsx");
    expect(src).not.toContain("/owner/priorities");
  });
});
