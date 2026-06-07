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
});
