import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { CommercialGateHost } from "@/components/commercial/CommercialGateHost";
import { UpgradeRequiredNotice } from "@/components/commercial/UpgradeRequiredNotice";
import { COMMERCIAL_DENIED_EVENT, isCommercialDenialStatus } from "@/domain/commercial/commercial-denial";
import { PUBLIC_PRICE_DISPLAY } from "@/domain/billing/public-pricing";

afterEach(cleanup);

describe("upgrade-state UX (presentation only)", () => {
  it("is dormant: renders nothing until the server denies a continuation step", () => {
    const { container } = render(<CommercialGateHost />);
    expect(container.textContent).toBe("");
  });

  it("appears after a commercial denial event and can be dismissed", () => {
    const { container, getByText } = render(<CommercialGateHost />);
    act(() => {
      window.dispatchEvent(new CustomEvent(COMMERCIAL_DENIED_EVENT));
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    act(() => getByText("Dismiss").click());
    expect(container.textContent).toBe("");
  });

  it("links back to the diagnosis, to billing and to the cancellation policy; no countdown or urgency", () => {
    const { container } = render(<UpgradeRequiredNotice onDismiss={() => undefined} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/owner/billing", "/owner/home", "/refund-policy"]));
    const t = container.textContent ?? "";
    expect(t).toMatch(/cancel any time/i);
    expect(t).not.toMatch(/hurry|limited time|last chance|only \d+ left|expires in/i);
  });

  it("takes the price only from the canonical source and invents none while it is unset", () => {
    const { container } = render(<UpgradeRequiredNotice />);
    const t = container.textContent ?? "";
    if (PUBLIC_PRICE_DISPLAY === null) expect(t).not.toMatch(/[$€£₹]\s?\d|US\$|\d+\s?(USD|INR|EUR)/);
    else expect(t).toContain(PUBLIC_PRICE_DISPLAY);
  });

  it("only HTTP 402 is a commercial denial", () => {
    expect(isCommercialDenialStatus(402)).toBe(true);
    for (const s of [undefined, 200, 400, 401, 403, 404, 429, 500]) expect(isCommercialDenialStatus(s)).toBe(false);
  });
});
