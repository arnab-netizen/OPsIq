/**
 * /agency is a PUBLIC ACQUISITION tool (NON_COMMERCIAL_PUBLIC_ACQUISITION): no subscription, no workspace allowance,
 * no persisted owner-loop state, no coupling to authenticated Owner Mode. Verified from the implementation, and it
 * renders normally with enforcement OFF and ON (the flag is irrelevant to it).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import AgencyPage from "@/app/agency/page";

afterEach(() => {
  cleanup();
  delete process.env.BILLING_PAYWALL_ENFORCEMENT;
});

const files = [
  ...readdirSync(join(process.cwd(), "src/app/agency")).map((f) => join("src/app/agency", f)),
  ...readdirSync(join(process.cwd(), "src/lib/agency-diagnostic")).filter((f) => !/\.test\./.test(f)).map((f) => join("src/lib/agency-diagnostic", f)),
];

describe("public /agency acquisition tool", () => {
  it("imports no database, auth, session, billing, owner-service (public SEO constants excepted) or network code and stores nothing", () => {
    const forbidden = /@\/lib\/db|@\/services\/(?!resources\/resource-seo|public-site\/)|prisma|getSession|getPolicyContext|withCanonicalEnforcement|commercial|billing|\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|\$transaction/;
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src.match(forbidden)?.[0] ?? null, f).toBeNull();
    }
  });

  it("is registered in no owner API surface: it has no API route", () => {
    expect(() => readdirSync(join(process.cwd(), "src/app/api/agency"))).toThrow();
  });

  it.each([undefined, "off", "on"])("renders for an anonymous visitor with enforcement flag = %j", (flag) => {
    if (flag !== undefined) process.env.BILLING_PAYWALL_ENFORCEMENT = flag;
    const { container } = render(<AgencyPage />);
    expect(container.textContent?.length ?? 0).toBeGreaterThan(100);
    expect(container.textContent).not.toMatch(/subscription is required|upgrade|PLAN_LIMIT/i);
  });
});
