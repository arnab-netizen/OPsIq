/**
 * Owner activation surfaces — the dashboard activation panel and the intake upload prerequisite
 * explanation. (The quick-diagnosis honesty guarantees — reported figures labelled as not
 * independently verified, abstention when evidence is thin — are pinned in
 * src/__tests__/generic-diagnosis/.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/owner/intake" }));

import OwnerActivationPanel from "@/components/dashboard/OwnerActivationPanel";
import OwnerIntakePage from "@/app/(authenticated)/owner/intake/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

function renderWithProvider(ui: React.ReactElement) {
  return render(<ActiveBusinessProvider>{ui}</ActiveBusinessProvider>);
}

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard activation panel", () => {
  it("tells the owner what is missing and where to go when no business exists", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes("/api/owner/businesses") ? jsonResponse({ businesses: [] }) : jsonResponse({}),
    );
    render(<OwnerActivationPanel />);
    await waitFor(() => expect(screen.getByTestId("owner-activation-panel")).toBeTruthy());
    const panel = screen.getByTestId("owner-activation-panel");
    expect(panel.textContent).toMatch(
      /does not yet have enough reliable business information to generate a trustworthy diagnosis/i,
    );
    expect(panel.querySelector("a")!.getAttribute("href")).toBe("/owner/data");
  });

  it("shows real setup progress and the missing essentials from the onboarding contract", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/owner/businesses")) return jsonResponse({ businesses: [{ id: "b1" }] });
      return jsonResponse({
        minimumSuppliedCount: 2,
        minimumRequiredCount: 5,
        minimumComplete: false,
        canRunFirstDiagnosis: false,
        confidenceBeforeDiagnosis: "low",
        missingMinimum: [
          { category: "revenue_sales", label: "Revenue / sales records", severity: "critical", why: "Needed for margin." },
        ],
        firstAction: "Add last month's revenue.",
        found: true,
      });
    });
    render(<OwnerActivationPanel />);
    await waitFor(() => expect(screen.getByTestId("owner-activation-panel")).toBeTruthy());
    const panel = screen.getByTestId("owner-activation-panel");
    expect(panel.textContent).toContain("2 of 5 essentials added");
    expect(panel.textContent).toContain("Revenue / sales records");
    expect(panel.textContent).toContain("Add last month's revenue.");
    expect(screen.getByTestId("owner-activation-insufficient")).toBeTruthy();
    expect(panel.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("40");
  });

  it("removes itself once the minimum set is complete and a diagnosis can run", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/owner/businesses")) return jsonResponse({ businesses: [{ id: "b1" }] });
      return jsonResponse({
        minimumSuppliedCount: 5,
        minimumRequiredCount: 5,
        minimumComplete: true,
        canRunFirstDiagnosis: true,
        confidenceBeforeDiagnosis: "medium",
        missingMinimum: [],
        firstAction: "",
        found: true,
      });
    });
    const { container } = render(<OwnerActivationPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.querySelector('[data-testid="owner-activation-panel"]')).toBeNull();
  });

  it("does not break the dashboard when the onboarding call fails", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("network")));
    const { container } = render(<OwnerActivationPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="owner-activation-panel"]')).toBeNull();
  });
});

describe("intake upload prerequisite", () => {
  it("explains why upload is unavailable and links to the fix", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ businesses: [], intakes: [], selectedBusinessId: null }));
    renderWithProvider(<OwnerIntakePage />);
    await waitFor(() => expect(screen.getByTestId("intake-upload-blocked")).toBeTruthy());

    const notice = screen.getByTestId("intake-upload-blocked");
    expect(notice.textContent).toMatch(/need a business profile before you can add data/i);
    expect(screen.getByTestId("intake-upload-blocked-cta").getAttribute("href")).toBe("/owner/data");
  });

  it("keeps the disabled control described by its explanation for screen readers", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ businesses: [], intakes: [], selectedBusinessId: null }));
    const { container } = renderWithProvider(<OwnerIntakePage />);
    await waitFor(() => expect(screen.getByTestId("intake-upload-blocked")).toBeTruthy());

    const uploadButton = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Paste spreadsheet data"),
    );
    expect(uploadButton).toBeDefined();
    expect(uploadButton!.hasAttribute("disabled")).toBe(true);
    expect(uploadButton!.getAttribute("aria-describedby")).toBe("upload-blocked-reason");
    expect(screen.getByTestId("intake-upload-blocked").getAttribute("id")).toBe("upload-blocked-reason");
  });

  it("does not show the prerequisite notice once a business exists", async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({
        businesses: [{ id: "b1", name: "Test Co", currency: "GBP" }],
        intakes: [],
        selectedBusinessId: "b1",
      }),
    );
    const { container } = renderWithProvider(<OwnerIntakePage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(container.querySelector('[data-testid="intake-upload-blocked"]')).toBeNull(),
    );
    // The business list now resolves through the shared provider before the page's own
    // dashboard fetch even starts (an extra async hop the old single-response architecture
    // didn't have), so the enabled button may not exist yet at the first tick after the
    // notice disappears -- wait for it rather than asserting synchronously.
    await waitFor(() => {
      const uploadButton = Array.from(container.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes("Paste spreadsheet data"),
      );
      expect(uploadButton).toBeDefined();
      expect(uploadButton!.hasAttribute("disabled")).toBe(false);
    });
  });
});

