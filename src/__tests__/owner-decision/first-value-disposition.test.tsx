/**
 * /owner/first-value disposition: RETIRED. It had no navigation entry or deep link and no self-serve
 * owner job of its own; it presented consulting-engagement data (and exported the engagement's own
 * "recommended first action") beside the canonical owner decision. It now redirects to the Cockpit,
 * where the canonical decision is the owner's first action — it cannot publish or export a second one.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

afterEach(() => {
  redirect.mockClear();
  vi.unstubAllGlobals();
});

describe("/owner/first-value is retired to the canonical owner destination", () => {
  it("redirects to the Cockpit without fetching engagement data", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { default: FirstValuePage } = await import("@/app/(authenticated)/owner/first-value/page");
    expect(() => FirstValuePage()).toThrow("NEXT_REDIRECT:/owner/cockpit");
    expect(redirect).toHaveBeenCalledWith("/owner/cockpit");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the page source can no longer render or export an engagement 'first action'", () => {
    const src = readFileSync(join(process.cwd(), "src/app/(authenticated)/owner/first-value/page.tsx"), "utf8");
    expect(src).not.toMatch(/recommendedFirstAction/);
    expect(src).not.toMatch(/PILOT_PROOF_PACKET|Export Proof Packet/);
    expect(src).not.toMatch(/\/api\/owner\/first-value/);
  });

  it("no owner surface links to the retired page", () => {
    const nav = readFileSync(join(process.cwd(), "src/ui/shell/sidebar-nav.tsx"), "utf8");
    expect(nav).not.toMatch(/owner\/first-value/);
  });
});
