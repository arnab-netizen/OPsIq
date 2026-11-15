/**
 * Business-context invariant: a business-scoped financial form defaults to the ACTIVE business.
 *
 * Root cause (hostile UX audit): /owner/onboarding kept its own `selected` state seeded from
 * `businesses[0]` (the newest business) and never read the shell's active-business context, so the header
 * showed one business/currency while the form wrote to another. The page now consumes the shared context;
 * an explicit switch in the form switches the active business everywhere.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import OwnerOnboardingPage from "@/app/(authenticated)/owner/onboarding/page";
import { ActiveBusinessProvider, useActiveBusiness } from "@/context/active-business-context";

const TRINITY = { id: "11111111-1111-4111-8111-111111111111", name: "Trinity Services", currency: "INR" };
const QA = { id: "22222222-2222-4222-8222-222222222222", name: "QA D9 REAUDIT", currency: "USD" };
// listBusinesses() orders newest first, so the QA business is businesses[0].
const LIST = [QA, TRINITY];

const STATE = {
  found: true, businessName: "x", steps: [], requirements: { minimumRequired: [], recommended: [], optional: [] },
  missingMinimum: [], minimumSuppliedCount: 0, minimumRequiredCount: 3, minimumComplete: false,
  confidenceBeforeDiagnosis: "none", canRunFirstDiagnosis: false, firstAction: "", whatNotToDo: [], nextBestUpload: null,
};

let requested: string[] = [];

function stubFetch() {
  requested = [];
  vi.stubGlobal("fetch", (input: string) => {
    const url = String(input);
    requested.push(url);
    const body = url.includes("/api/owner/businesses") ? { businesses: LIST } : url.includes("/api/owner/onboarding") ? STATE : { found: false };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  });
}

/** Currency text rendered by the form itself (the selector's own <option> labels legitimately list every business). */
function formCurrencyText(re: RegExp) {
  return screen.queryAllByText(re).filter((el) => el.tagName !== "OPTION");
}

function ActiveProbe() {
  const { activeBusinessId } = useActiveBusiness();
  return <span data-testid="active-id">{activeBusinessId}</span>;
}

function mount() {
  return render(
    <ActiveBusinessProvider>
      <ActiveProbe />
      <OwnerOnboardingPage />
    </ActiveBusinessProvider>,
  );
}

describe("onboarding form follows the active business context", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults to the stored active business, not the newest one", async () => {
    window.sessionStorage.setItem("opsiq.activeBusinessId", TRINITY.id);
    stubFetch();
    mount();
    await waitFor(() => expect(screen.getByTestId("owner-onboarding")).toBeTruthy());
    expect((screen.getByTestId("active-id") as HTMLElement).textContent).toBe(TRINITY.id);
    expect(requested.some((u) => u.includes(`/api/owner/onboarding?businessId=${TRINITY.id}`))).toBe(true);
    expect(requested.some((u) => u.includes(`businessId=${QA.id}`))).toBe(false);
    expect(formCurrencyText(/INR/).length).toBeGreaterThan(0);
    expect(formCurrencyText(/USD/)).toHaveLength(0);
  });

  it("an explicit switch in the form changes the global active business and the currency shown", async () => {
    window.sessionStorage.setItem("opsiq.activeBusinessId", TRINITY.id);
    stubFetch();
    mount();
    await waitFor(() => expect(screen.getByTestId("owner-onboarding")).toBeTruthy());
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe(TRINITY.id);
    fireEvent.change(select, { target: { value: QA.id } });
    await waitFor(() => expect((screen.getByTestId("active-id") as HTMLElement).textContent).toBe(QA.id));
    await waitFor(() => expect(requested.some((u) => u.includes(`/api/owner/onboarding?businessId=${QA.id}`))).toBe(true));
    await waitFor(() => expect(formCurrencyText(/USD/).length).toBeGreaterThan(0));
    expect(formCurrencyText(/INR/)).toHaveLength(0);
  });

  it("never falls back to USD for a business without a currency", async () => {
    const noCurrency = { id: "33333333-3333-4333-8333-333333333333", name: "No Currency Co" };
    vi.stubGlobal("fetch", (input: string) => {
      const url = String(input);
      const body = url.includes("/api/owner/businesses") ? { businesses: [noCurrency] } : url.includes("/api/owner/onboarding") ? STATE : { found: false };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("onboarding-currency-missing")).toBeTruthy());
    expect(formCurrencyText(/USD/)).toHaveLength(0);
  });
});
