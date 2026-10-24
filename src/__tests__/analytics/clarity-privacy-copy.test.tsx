// @vitest-environment jsdom
/** The privacy notice discloses Clarity accurately and keeps the existing Vercel Web Analytics disclosure. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/privacy" }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function page(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const mod = await import("@/app/privacy/page");
  return render(<mod.default />).container;
}
const text = (c: HTMLElement) => c.textContent!.replace(/\s+/g, " ");

describe("/privacy", () => {
  it("states the new policy version", async () => {
    expect(text(await page({}))).toMatch(/Version 2026-10-17/);
  });

  it("discloses Microsoft Clarity: public pages only, behavioral analytics, optional/explicit consent, Strict masking", async () => {
    const t = text(await page({}));
    expect(t).toMatch(/Microsoft Clarity/);
    expect(t).toMatch(/public pages only/i);
    expect(t).toMatch(/clicks, taps, scrolling, mouse movement/);
    expect(t).toMatch(/only if you choose .?Allow analytics.?/i);
    expect(t).toMatch(/Strict masking mode/);
    expect(t).toMatch(/Nothing is sent to Clarity until you choose/);
    expect(t).toMatch(/does not prevent you from using OpsIQ/);
    expect(t).toMatch(/not run on the signed-in OpsIQ product, the sign-in and sign-up pages/);
    expect(t).toMatch(/change your choice at any time/);
    expect(t).toMatch(/third-party analytics provider/);
    expect(t).toMatch(/advertising storage is denied/);
    expect(t).toMatch(/_clck/);
  });

  it("lists Microsoft among third-party providers and keeps Vercel", async () => {
    const t = text(await page({}));
    expect(t).toMatch(/Microsoft \(Clarity behavioral analytics on our public pages, only if you allow it\)/);
    expect(t).toMatch(/Vercel \(application hosting, and page-visit analytics for our public pages\)/);
  });

  it("preserves the existing Vercel Web Analytics disclosure verbatim", async () => {
    const t = text(await page({}));
    expect(t).toContain("we also count page visits with Vercel Web Analytics: the page address (with any campaign tags, but no other link parameters), the referring website, and general browser, device, and country information. OpsIQ sets no cookies for this, sends it no name, email, or account information, and does not record visits to signed-in pages.");
    expect(t).toContain("This is separate from the Vercel Web Analytics described above, which does not use cookies and does not depend on this choice.");
  });

  it("offers the 'Analytics preferences' control only where Clarity is configured", async () => {
    expect((await page({ VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: "ymoglnln74" })).querySelector('[data-testid="analytics-preferences"]')).not.toBeNull();
    cleanup();
    expect((await page({ VERCEL_ENV: "preview", NEXT_PUBLIC_CLARITY_PROJECT_ID: "ymoglnln74" })).querySelector('[data-testid="analytics-preferences"]')).toBeNull();
  });

  it("anchors the analytics section for the banner's Details link", async () => {
    expect((await page({})).querySelector("#analytics")).not.toBeNull();
  });
});
