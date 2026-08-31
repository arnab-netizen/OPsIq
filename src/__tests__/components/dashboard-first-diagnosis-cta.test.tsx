import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import FirstDiagnosisCta from "@/components/dashboard/FirstDiagnosisCta";

afterEach(() => cleanup());

describe("Dashboard first-diagnosis CTA (empty state)", () => {
  it("shows a 'Run your first diagnosis' CTA linking to /diagnosis", () => {
    const { container } = render(<FirstDiagnosisCta />);
    const link = container.querySelector('a[href="/diagnosis"]');
    expect(link).not.toBeNull();
    expect(container.textContent ?? "").toMatch(/Run your first diagnosis/i);
  });

  it("explains what a diagnosis returns (risks, findings, action plan)", () => {
    const { container } = render(<FirstDiagnosisCta />);
    expect(container.textContent ?? "").toMatch(/risks, findings, and a prioritized action plan/i);
  });

  it("introduces no payment / network dependency (presentational only)", () => {
    const { container } = render(<FirstDiagnosisCta />);
    expect(container.textContent ?? "").not.toMatch(/payment|upgrade|stripe/i);
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  // F2: /diagnosis requires CAPABILITIES.ENGAGEMENT_CREATE, which a self-serve owner never holds
  // (policies/capability-check.ts's INTERNAL_ONLY_CAPABILITIES) — 403 for every owner who clicked
  // this CTA. The caller (dashboard/page.tsx) resolves the correct target server-side via the
  // centralized isSelfServeOwnerContext policy check and passes it in; this component stays
  // presentation-only and just renders whatever href it is given.
  it("renders the caller-supplied href instead of the default when provided (no permission logic in this component)", () => {
    const { container } = render(<FirstDiagnosisCta href="/owner/finance" />);
    const link = container.querySelector('a[href="/owner/finance"]');
    expect(link).not.toBeNull();
    expect(container.querySelector('a[href="/diagnosis"]')).toBeNull();
  });
});
