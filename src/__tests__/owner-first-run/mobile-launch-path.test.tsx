// @vitest-environment jsdom
/**
 * MOBILE launch-path standards, asserted where they are defined. Real 390px layout/size proof is in
 * tests/browser/public-beta-obq-journey.spec.ts; these pin the design-system classes and the return bar so a regression
 * in a primitive fails in unit tests too.
 *   - controls are >= 44px tall below the `sm` breakpoint, desktop sizes unchanged
 *   - text inputs are >= 16px below `sm` (iOS Safari zooms the page on focus otherwise)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/owner/finance", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { Button, Input, Select, Textarea } from "@/ui/primitives";
import { FirstRunReturnBar } from "@/components/owner/first-run/FirstRunReturnBar";
import { EvidenceQualityFieldset } from "@/components/owner/EvidenceQualityFieldset";
import { readFileSync } from "fs";

afterEach(() => cleanup());
beforeEach(() => { window.sessionStorage.clear(); nav.pathname = "/owner/finance"; nav.search = ""; });

describe("primitives meet the mobile standard", () => {
  it("Input: 44px tall and 16px text on phones; desktop 40px / 14px", () => {
    render(<Input label="Revenue" />);
    const cls = screen.getByLabelText("Revenue").className;
    expect(cls).toMatch(/\bh-11\b/);
    expect(cls).toMatch(/\bsm:h-10\b/);
    expect(cls).toMatch(/\btext-base\b/);
    expect(cls).toMatch(/\bsm:text-sm\b/);
    expect(cls).not.toMatch(/(^|\s)h-10(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)text-sm(\s|$)/);
  });
  it("Select and Textarea: 16px text on phones", () => {
    render(<><Select label="Currency" options={[{ value: "GBP", label: "GBP" }]} /><Textarea label="Note" /></>);
    for (const el of [screen.getByLabelText("Currency"), screen.getByLabelText("Note")]) {
      expect(el.className).toMatch(/\btext-base\b/);
      expect(el.className).toMatch(/\bsm:text-sm\b/);
    }
    expect(screen.getByLabelText("Currency").className).toMatch(/min-h-\[44px\]/);
  });
  it("Button: sm and md are 44px on phones and keep their desktop heights", () => {
    render(<><Button size="sm">Small</Button><Button>Medium</Button></>);
    expect(screen.getByText("Small").className).toMatch(/\bh-11\b.*\bsm:h-8\b/);
    expect(screen.getByText("Medium").className).toMatch(/\bh-11\b.*\bsm:h-10\b/);
  });
  it("the shared evidence-quality control uses 44px targets and a 20px radio", () => {
    render(<EvidenceQualityFieldset value={null} onChange={() => undefined} testId="eq" />);
    for (const label of screen.getAllByRole("radio").map((r) => r.closest("label")!)) expect(label.className).toMatch(/\bmin-h-11\b/);
    expect(screen.getAllByRole("radio")[0].className).toMatch(/\bh-5\b.*\bw-5\b/);
  });
});

describe("launch-path surfaces avoid sub-standard tap targets in source", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("cockpit inline controls are 44px and inputs 16px", () => {
    const src = read("src/components/owner/MinimumOwnerCockpit.tsx");
    expect(src).not.toMatch(/padding: "4px 10px"/);
    expect(src).not.toMatch(/padding: "4px 8px", border: "1px solid var\(--border\)", borderRadius: 4, fontSize: 12/);
    expect(src).toMatch(/minHeight: 44/);
  });
  it("signup consent checkboxes sit in 44px rows and the recovery link is a 44px control", () => {
    const src = read("src/app/signup/page.tsx");
    expect(src).toMatch(/label className="flex min-h-11/);
    expect(src).toMatch(/data-testid="signup-resend-link"/);
  });
  it("the admin request list never relies on a sideways-scrolling table on phones", () => {
    const src = read("src/app/(authenticated)/admin/beta-programme/page.tsx");
    expect(src).toMatch(/sm:hidden/);
    expect(src).toMatch(/hidden sm:block/);
    expect(src).toMatch(/min-h-11 w-full sm:w-auto/);
  });
});

describe("FirstRunReturnBar", () => {
  it("is hidden by default, shown for the return marker, and offers one 44px way back", async () => {
    const { container, rerender } = render(<FirstRunReturnBar />);
    await waitFor(() => expect(container.querySelector('[data-testid="first-run-return-bar"]')).toBeNull());
    nav.search = "returnTo=first-run";
    rerender(<FirstRunReturnBar />);
    const link = await screen.findByTestId("first-run-return-link");
    expect(link.getAttribute("href")).toBe("/owner/first-run?update=1");
    expect(link.className).toMatch(/\bmin-h-11\b/);
  });
  it("stays visible on the next page of the same round trip via per-viewer session state, never on the first-run page", async () => {
    window.sessionStorage.setItem("opsiq:first-run:round-trip", "1");
    const { rerender } = render(<FirstRunReturnBar />);
    expect(await screen.findByTestId("first-run-return-bar")).toBeTruthy();
    nav.pathname = "/owner/first-run";
    rerender(<FirstRunReturnBar />);
    await waitFor(() => expect(screen.queryByTestId("first-run-return-bar")).toBeNull());
  });
  it("works (silently absent) when session storage is unavailable", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<FirstRunReturnBar />);
    await waitFor(() => expect(screen.queryByTestId("first-run-return-bar")).toBeNull());
    spy.mockRestore();
  });
});
