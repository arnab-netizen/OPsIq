/**
 * Owner Finance — "Add financial snapshot" form draft resilience (P0-D) and save-failure UX
 * (P0-E) — jsdom integration tests.
 *
 * ROOT_CAUSE (P0-D): the snapshot form's fields were plain uncontrolled DOM inputs read once via
 * `new FormData(e.currentTarget)` on submit -- there was no React state, storage, or any other
 * persistence layer backing them, so a reload (or the form unmounting) discarded everything the
 * owner had typed. ROOT_CAUSE (P0-E): a failed save set the page's *shared* `error` state (used
 * by four other mutations on this page) rendered in a banner at the very top of the page, and on
 * a genuine network failure that state held the raw browser `TypeError: Failed to fetch` text
 * verbatim (`e.message` straight into JSX), far from the Save button and unreadable to an owner.
 *
 * These tests drive the real page component (not a source-string proof) because the fix is
 * genuinely behavioral: debounced localStorage writes, restore-on-mount, business-scoped keys,
 * and a scoped/governed error render.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import OwnerFinancePage from "@/app/(authenticated)/owner/finance/page";
import { ActiveBusinessProvider } from "@/context/active-business-context";

const BIZ_A = { id: "biz-a", name: "Acme Bakery", currency: "USD" };
const BIZ_B = { id: "biz-b", name: "Acme Landscaping", currency: "INR" };

function renderPage() {
  return render(
    <ActiveBusinessProvider>
      <OwnerFinancePage />
    </ActiveBusinessProvider>
  );
}

function dashboardFor(businesses: Array<{ id: string; name: string; currency: string }>, selectedBusinessId: string) {
  return {
    businesses,
    selectedBusinessId,
    hasData: false,
    latestSnapshot: null,
    missingCriticalData: [],
  };
}

let snapshotPostMode: "success" | "reject" = "success";
let posted: Array<{ businessId: string; body: unknown }> = [];

function installFetchMock(businesses: Array<{ id: string; name: string; currency: string }>, initialSelected: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/api/owner/businesses") && method === "GET") {
        return { ok: true, status: 200, json: async () => ({ businesses }) } as Response;
      }
      if (url.includes("/api/owner/finance/dashboard")) {
        const businessId = url.includes("businessId=") ? url.split("businessId=")[1] : initialSelected;
        return { ok: true, status: 200, json: async () => dashboardFor(businesses, businessId) } as Response;
      }
      if (url.match(/\/api\/owner\/finance\/businesses\/[^/]+\/snapshots$/) && method === "POST") {
        if (snapshotPostMode === "reject") {
          throw new TypeError("Failed to fetch");
        }
        const businessId = url.match(/businesses\/([^/]+)\/snapshots$/)![1];
        posted.push({ businessId, body: init?.body ? JSON.parse(String(init.body)) : null });
        return { ok: true, status: 201, json: async () => ({ id: "snap-1" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  snapshotPostMode = "success";
  posted = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openSnapshotForm() {
  await waitFor(() => expect(screen.getByText("+ Add financial snapshot").closest("button")).not.toBeDisabled());
  fireEvent.click(screen.getByText("+ Add financial snapshot"));
  await waitFor(() => expect(screen.getByLabelText("Period start")).toBeInTheDocument());
}

async function flushDebounce() {
  // DRAFT_DEBOUNCE_MS is 400ms; wait comfortably past it on real timers.
  await new Promise((r) => setTimeout(r, 600));
}

describe("Money 'Add financial snapshot' draft persistence (P0-D)", () => {
  it("save/restore: a typed-but-unsaved value survives a full remount (simulated reload)", async () => {
    installFetchMock([BIZ_A], BIZ_A.id);
    const { unmount } = renderPage();
    await openSnapshotForm();

    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "15000" } });
    await flushDebounce();
    unmount();

    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    expect((screen.getByLabelText("Revenue") as HTMLInputElement).value).toBe("15000");
  });

  it("business isolation: a draft typed for one business does not appear when viewing another business", async () => {
    installFetchMock([BIZ_A, BIZ_B], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "999" } });
    await flushDebounce();

    fireEvent.change(screen.getByRole("combobox", { name: "Business" }), { target: { value: BIZ_B.id } });
    await waitFor(() => expect(screen.getByText(`Financial snapshot (${BIZ_B.currency})`)).toBeInTheDocument());
    expect((screen.getByLabelText("Revenue") as HTMLInputElement).value).toBe("");
  });

  it("business isolation: switching back to the original business restores its own draft", async () => {
    installFetchMock([BIZ_A, BIZ_B], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "777" } });
    await flushDebounce();

    fireEvent.change(screen.getByRole("combobox", { name: "Business" }), { target: { value: BIZ_B.id } });
    await waitFor(() => expect(screen.getByText(`Financial snapshot (${BIZ_B.currency})`)).toBeInTheDocument());

    fireEvent.change(screen.getByRole("combobox", { name: "Business" }), { target: { value: BIZ_A.id } });
    await waitFor(() => expect((screen.getByLabelText("Revenue") as HTMLInputElement).value).toBe("777"));
  });

  it("successful-save clear: the draft is removed only after a confirmed successful save", async () => {
    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-01-31" } });
    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "42" } });
    await flushDebounce();
    expect(window.localStorage.getItem(`opsiq:finance-draft:${BIZ_A.id}`)).not.toBeNull();

    fireEvent.click(screen.getByText("Save snapshot"));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(window.localStorage.getItem(`opsiq:finance-draft:${BIZ_A.id}`)).toBeNull();
  });

  it("failed-save retention: the draft (and on-screen values) survive a failed save, uncleared", async () => {
    snapshotPostMode = "reject";
    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-01-31" } });
    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "42" } });
    await flushDebounce();

    fireEvent.click(screen.getByText("Save snapshot"));
    await waitFor(() => expect(screen.getByTestId("snapshot-save-error")).toBeInTheDocument());

    expect((screen.getByLabelText("Revenue") as HTMLInputElement).value).toBe("42");
    expect(window.localStorage.getItem(`opsiq:finance-draft:${BIZ_A.id}`)).not.toBeNull();
  });

  it("malformed local draft: garbage stored JSON fails closed to an empty form, not a crash", async () => {
    window.localStorage.setItem(`opsiq:finance-draft:${BIZ_A.id}`, "{not valid json");
    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    expect((screen.getByLabelText("Revenue") as HTMLInputElement).value).toBe("");
  });

  it("malformed local draft: a non-object stored value (e.g. a bare string) also fails closed", async () => {
    window.localStorage.setItem(`opsiq:finance-draft:${BIZ_A.id}`, JSON.stringify("not-an-object"));
    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    expect((screen.getByLabelText("Revenue") as HTMLInputElement).value).toBe("");
  });
});

describe("Money 'Add financial snapshot' save-failure UX (P0-E)", () => {
  it("a fetch rejection never leaks the raw exception text to the owner", async () => {
    snapshotPostMode = "reject";
    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByText("Save snapshot"));

    const banner = await waitFor(() => screen.getByTestId("snapshot-save-error"));
    expect(banner.textContent).not.toMatch(/Failed to fetch/i);
    expect(banner.textContent).not.toMatch(/TypeError/i);
  });

  it("the error message renders in the submit area (adjacent to Save), not the page-top banner", async () => {
    snapshotPostMode = "reject";
    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByText("Save snapshot"));

    const banner = await waitFor(() => screen.getByTestId("snapshot-save-error"));
    const saveButton = screen.getByText("Save snapshot");
    // Both live inside the same <form> element -- the error is not the separate page-top banner.
    expect(banner.closest("form")).toBe(saveButton.closest("form"));
    expect(banner.textContent).toMatch(/couldn.t save this snapshot/i);
    expect(banner.textContent).toMatch(/entries are still here/i);
  });

  it("all entered values remain populated after a failed save", async () => {
    snapshotPostMode = "reject";
    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-02-28" } });
    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("Fixed costs"), { target: { value: "1200" } });
    fireEvent.click(screen.getByText("Save snapshot"));
    await waitFor(() => expect(screen.getByTestId("snapshot-save-error")).toBeInTheDocument());

    expect((screen.getByLabelText("Period start") as HTMLInputElement).value).toBe("2026-02-01");
    expect((screen.getByLabelText("Period end") as HTMLInputElement).value).toBe("2026-02-28");
    expect((screen.getByLabelText("Revenue") as HTMLInputElement).value).toBe("5000");
    expect((screen.getByLabelText("Fixed costs") as HTMLInputElement).value).toBe("1200");
  });

  it("retry succeeds: clicking Save again after fixing connectivity saves normally and clears the error", async () => {
    snapshotPostMode = "reject";
    installFetchMock([BIZ_A], BIZ_A.id);
    renderPage();
    await openSnapshotForm();
    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByText("Save snapshot"));
    await waitFor(() => expect(screen.getByTestId("snapshot-save-error")).toBeInTheDocument());

    snapshotPostMode = "success";
    fireEvent.click(screen.getByText("Save snapshot"));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(screen.queryByTestId("snapshot-save-error")).not.toBeInTheDocument();
  });
});
