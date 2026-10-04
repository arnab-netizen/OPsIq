/**
 * Guided setup (/owner/onboarding) obeys the SAME canonical first-read sufficiency as My Business, Money
 * and QuickFinancialPicture: no Finance snapshot POST and no diagnosis until revenue, at least one cost
 * and cash in hand are KNOWN (a known 0 counts). Bank balance is a Cashflow-only extension and never
 * satisfies the cash requirement.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import OwnerOnboardingPage from "@/app/(authenticated)/owner/onboarding/page";
import { evaluateFirstReadSufficiency } from "@/domain/owner-finance/first-read-sufficiency";

const ID = "b1";
type Call = { method: string; url: string; body: Record<string, unknown> | undefined };
const json = (body: unknown, ok = true, status = ok ? 200 : 500) => Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

function setup() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (url.includes("/api/owner/businesses")) return json({ businesses: [{ id: ID, name: "Cafe", currency: "GBP" }] });
    if (url.startsWith("/api/owner/onboarding?")) {
      return json({ found: true, businessName: "Cafe", steps: [], requirements: { minimumRequired: [], recommended: [], optional: [] }, missingMinimum: [], minimumSuppliedCount: 0, minimumRequiredCount: 3, minimumComplete: false, confidenceBeforeDiagnosis: "none", canRunFirstDiagnosis: false, firstAction: "", whatNotToDo: [], nextBestUpload: null });
    }
    if (url.startsWith("/api/owner/readiness?")) return json({ found: false });
    if (method === "POST" && url.endsWith(`/finance/businesses/${ID}/snapshots`)) return json({ id: "snap-1" });
    if (method === "POST" && url.endsWith(`/cashflow/businesses/${ID}/snapshots`)) return json({ id: "cf-1" });
    if (method === "POST" && url.endsWith(`/finance/businesses/${ID}/diagnoses`)) return json({ findings: [], actions: [], dataConfidenceScore: 40 });
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }));
  return calls;
}

async function form() { return waitFor(() => screen.getByTestId("onboarding-essential-numbers")); }
async function enter(values: Record<string, string>) {
  const f = await form();
  for (const [name, v] of Object.entries(values)) {
    fireEvent.change(f.querySelector(`input[name="${name}"]`) as HTMLInputElement, { target: { value: v } });
  }
}
const button = () => screen.getByText("See my first result") as HTMLButtonElement;
const feedback = () => screen.getByTestId("onboarding-first-read-feedback").textContent ?? "";
const submit = async () => { fireEvent.submit((await form()).querySelector("form")!); };
const writes = (calls: Call[]) => calls.filter((c) => c.method === "POST");

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Guided setup canonical gate", () => {
  it("1. all blank → button disabled, submit posts nothing (no snapshot, no diagnosis)", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({});
    expect(button().disabled).toBe(true);
    await submit();
    expect(writes(calls)).toEqual([]);
  });

  it("2. revenue only → blocked; names the missing facts; no diagnosis", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "20000" });
    expect(button().disabled).toBe(true);
    expect(feedback()).toMatch(/one cost figure/);
    expect(feedback()).toMatch(/cash in hand/);
    await submit();
    expect(writes(calls)).toEqual([]);
  });

  it("3. revenue + cash → blocked: one cost figure still needed", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "20000", cashOnHand: "3000" });
    expect(button().disabled).toBe(true);
    expect(feedback()).toMatch(/Still needed for a first read: one cost figure\./);
    await submit();
    expect(writes(calls)).toEqual([]);
  });

  it("4. cost + cash → blocked: revenue needed", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ fixedCosts: "7000", cashOnHand: "3000" });
    expect(button().disabled).toBe(true);
    expect(feedback()).toMatch(/Still needed for a first read: revenue\./);
    await submit();
    expect(writes(calls)).toEqual([]);
  });

  it("revenue + cost → blocked: cash in hand needed", async () => {
    setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "20000", variableCosts: "5000" });
    expect(button().disabled).toBe(true);
    expect(feedback()).toMatch(/cash in hand/);
  });

  it("5. revenue + fixedCosts + cash → allowed; snapshot then diagnosis on that snapshot", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "20000", fixedCosts: "7000", cashOnHand: "3000" });
    expect(button().disabled).toBe(false);
    expect(feedback()).toMatch(/enough for a first read/i);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByTestId("onboarding-first-result")).toBeTruthy());
    const snap = writes(calls).find((c) => c.url.endsWith("/finance/businesses/b1/snapshots"))!;
    expect(snap.body).toMatchObject({ revenue: 20000, fixedCosts: 7000, cashOnHand: 3000, currency: "GBP" });
    expect("variableCosts" in snap.body!).toBe(false);
    expect(writes(calls).find((c) => c.url.endsWith("/diagnoses"))!.body).toEqual({ snapshotId: "snap-1" });
  });

  it("6. revenue + variableCosts + cash → allowed (sent as variableCosts, never relabelled)", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "20000", variableCosts: "5000", cashOnHand: "3000" });
    expect(button().disabled).toBe(false);
    fireEvent.click(button());
    await waitFor(() => expect(writes(calls).some((c) => c.url.endsWith("/diagnoses"))).toBe(true));
    const snap = writes(calls).find((c) => c.url.endsWith("/finance/businesses/b1/snapshots"))!;
    expect(snap.body).toMatchObject({ variableCosts: 5000 });
    expect("fixedCosts" in snap.body!).toBe(false);
  });

  it("7. zero revenue / zero cost / zero cash are valid KNOWN values and are sent as 0", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "0", fixedCosts: "0", cashOnHand: "0" });
    expect(button().disabled).toBe(false);
    fireEvent.click(button());
    await waitFor(() => expect(writes(calls).some((c) => c.url.endsWith("/diagnoses"))).toBe(true));
    expect(writes(calls).find((c) => c.url.endsWith("/finance/businesses/b1/snapshots"))!.body).toMatchObject({ revenue: 0, fixedCosts: 0, cashOnHand: 0 });
  });

  it("blank is never persisted as zero: blank fields are omitted from the payload", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "10", fixedCosts: "5", cashOnHand: "1" });
    fireEvent.click(button());
    await waitFor(() => expect(writes(calls).some((c) => c.url.endsWith("/diagnoses"))).toBe(true));
    const body = writes(calls).find((c) => c.url.endsWith("/finance/businesses/b1/snapshots"))!.body!;
    expect("variableCosts" in body).toBe(false);
    expect("bankBalance" in body).toBe(false);
  });

  it("8. invalid numeric input → explicit inline feedback, nothing persisted", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "six lakh", fixedCosts: "7000", cashOnHand: "3000" });
    expect(screen.getByText("Enter a number, like 150000.")).toBeTruthy();
    expect(button().disabled).toBe(true);
    await submit();
    expect(writes(calls)).toEqual([]);
    // an invalid bank balance blocks too, even with sufficient core facts
    cleanup(); setup(); render(<OwnerOnboardingPage />);
    await enter({ revenue: "1", fixedCosts: "1", cashOnHand: "1", bankBalance: "lots" });
    expect(button().disabled).toBe(true);
  });

  it("9. bank balance alone does NOT satisfy the Finance cash-in-hand requirement", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "20000", fixedCosts: "7000", bankBalance: "5000" });
    expect(button().disabled).toBe(true);
    expect(feedback()).toMatch(/cash in hand/);
    await submit();
    expect(writes(calls)).toEqual([]);
    // and the shared contract agrees (bankBalance is not a cash fact)
    expect(evaluateFirstReadSufficiency({ revenue: 1, fixedCosts: 1 }).missing).toEqual(["cashOnHand"]);
  });

  it("10/14/15. bankBalance is never in the Finance payload; it goes to Cashflow; the two stay distinct", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "20000", fixedCosts: "7000", cashOnHand: "3000", bankBalance: "5000" });
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByTestId("onboarding-first-result")).toBeTruthy());
    const fin = writes(calls).find((c) => c.url.endsWith("/finance/businesses/b1/snapshots"))!.body!;
    expect(fin.cashOnHand).toBe(3000);
    expect("bankBalance" in fin).toBe(false);
    const cf = writes(calls).find((c) => c.url.endsWith("/cashflow/businesses/b1/snapshots"))!.body!;
    expect(cf.bankBalance).toBe(5000);
    expect("cashOnHand" in cf).toBe(false);
  });

  it("double submit does not post twice", async () => {
    const calls = setup();
    render(<OwnerOnboardingPage />);
    await enter({ revenue: "1", fixedCosts: "1", cashOnHand: "1" });
    const f = await form();
    fireEvent.submit(f.querySelector("form")!);
    fireEvent.submit(f.querySelector("form")!);
    await waitFor(() => expect(screen.getByTestId("onboarding-first-result")).toBeTruthy());
    expect(writes(calls).filter((c) => c.url.endsWith("/finance/businesses/b1/snapshots"))).toHaveLength(1);
  });

  it("16. readiness comes from the shared contract — Guided setup defines no sufficiency of its own", () => {
    const src = readFileSync("src/app/(authenticated)/owner/onboarding/page.tsx", "utf8");
    expect(src).toContain("assessQuickEntry");
    expect(src).toContain("QUICK_ENTRY_FIELDS");
    expect(src).not.toMatch(/missingCriticalFinanceInputs|FIRST_DIAGNOSIS_GATE|const num = \(name: string\)/);
  });
});
