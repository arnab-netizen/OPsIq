/**
 * Evidence quality on the Quick Money Picture: estimates are allowed but never silently equal to actuals.
 * The quality is sent as an explicit field (not in notes); first-run requires the owner to choose one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));

import { QuickFinancialPicture } from "@/components/owner/QuickFinancialPicture";

const fetchMock = vi.fn();
const json = (body: unknown, ok = true, status = ok ? 200 : 500) => Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url.endsWith("/snapshots")) return json({ id: "snap-1" }, true, 201);
    if (init?.method === "POST" && url.endsWith("/diagnoses")) return json({ id: "cycle-1" }, true, 201);
    return json({});
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const type = (name: string, value: string) =>
  fireEvent.change(document.querySelector(`input[name="${name}"]`) as HTMLInputElement, { target: { value } });
const fillEnough = () => { type("revenue", "12000"); type("fixedCosts", "7000"); type("cashOnHand", "0"); };
const primary = () => screen.getByTestId("quick-primary-action") as HTMLButtonElement;
const snapshotBody = () => {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/snapshots") && (c[1] as RequestInit | undefined)?.method === "POST");
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
};

describe("QuickFinancialPicture evidence quality", () => {
  it("offers the three owner-friendly choices", () => {
    render(<QuickFinancialPicture businessId="b1" currency="GBP" />);
    const group = screen.getByTestId("quick-evidence-quality");
    expect([...group.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["From my records", "A good estimate", "A rough guess"]);
  });
  it("first-run mode will not make a read until the owner says how reliable the numbers are", async () => {
    render(<QuickFinancialPicture businessId="b1" currency="GBP" requireEvidenceQuality />);
    fillEnough();
    expect(primary().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("A rough guess"));
    expect(primary().disabled).toBe(false);
    fireEvent.submit(screen.getByTestId("quick-financial-picture-form"));
    await waitFor(() => expect(snapshotBody()).not.toBeNull());
    expect(snapshotBody()).toMatchObject({ revenue: 12000, fixedCosts: 7000, cashOnHand: 0, evidenceQuality: "ROUGH_ESTIMATE" });
    expect(JSON.stringify(snapshotBody())).not.toMatch(/notes/);
  });
  it("other hosts keep the control optional; an unanswered one is left out (stored as unspecified, not as actual)", async () => {
    render(<QuickFinancialPicture businessId="b1" currency="GBP" />);
    fillEnough();
    expect(primary().disabled).toBe(false);
    fireEvent.submit(screen.getByTestId("quick-financial-picture-form"));
    await waitFor(() => expect(snapshotBody()).not.toBeNull());
    expect(snapshotBody()).not.toHaveProperty("evidenceQuality");
  });
  it("explains each choice", () => {
    render(<QuickFinancialPicture businessId="b1" currency="GBP" />);
    fireEvent.click(screen.getByLabelText("A good estimate"));
    expect(screen.getByTestId("quick-evidence-quality-note").textContent).toMatch(/probably close/);
    fireEvent.click(screen.getByLabelText("A rough guess"));
    expect(screen.getByTestId("quick-evidence-quality-note").textContent).toMatch(/directional only/);
  });
});
