// @vitest-environment jsdom
/**
 * Cashflow edit UI states: the CURRENT values are visible before editing; replacing a recorded figure shows an explicit
 * "Replace X with Y?" step that resends with confirmReplace AND the same expectedUpdatedAt; a stale entry shows the fresh
 * values; a create refused because the period already has an entry offers "Edit the existing entry". The decisions are
 * the server's (409 + machine code); the screen only renders them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActiveBusinessProvider } from "@/context/active-business-context";
import OwnerCashflowPage from "@/app/(authenticated)/owner/cashflow/page";
import { CashflowEntryEditor } from "@/components/owner/cashflow/CashflowEntryEditor";

const BIZ = { id: "biz-a", name: "Alpha Bakery", currency: "INR", isActive: true };
const SNAP_ID = "d4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7";
const T0 = "2026-10-01T10:00:00.000Z";
const T1 = "2026-10-01T10:05:00.000Z";

const row = (over: Record<string, unknown> = {}) => ({
  id: SNAP_ID, businessId: BIZ.id, currency: "INR", periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z",
  bankBalance: 1500, cashInHand: null, updatedAt: T0, ...over,
});
const res = (status: number, body: unknown): Response => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

type Call = { url: string; method: string; body: Record<string, unknown> | null };
function stubFetch(handler: (c: Call) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const call: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return handler(call) ?? res(200, {});
  }));
  return calls;
}
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); window.history.replaceState(null, "", "/owner/cashflow"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const get = (c: Call) => c.method === "GET" && c.url === `/api/owner/cashflow/snapshots/${SNAP_ID}`;

describe("CashflowEntryEditor", () => {
  function open(onSaved = vi.fn(), onClose = vi.fn()) {
    return { onSaved, onClose, ...render(<CashflowEntryEditor snapshotId={SNAP_ID} onClose={onClose} onSaved={onSaved} />) };
  }

  it("shows the period, currency and the CURRENT values before anything is edited (a blank is 'Not recorded', never 0)", async () => {
    stubFetch((c) => (get(c) ? res(200, row()) : undefined));
    open();
    await screen.findByTestId("cashflow-edit-form");
    expect(screen.getByTestId("cashflow-edit-period").textContent).toMatch(/September 2026 · INR/);
    expect(screen.getByTestId("cashflow-current-bankBalance").textContent).toMatch(/INR 1,500/);
    expect(screen.getByTestId("cashflow-current-cashInHand").textContent).toMatch(/Not recorded/);
    expect((screen.getByLabelText(/Bank balance \(INR\)/) as HTMLInputElement).value).toBe("1500");
    expect((screen.getByLabelText(/Cash in hand \(INR\)/) as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("cashflow-edit-save") as HTMLButtonElement).disabled).toBe(true); // nothing to save yet
    // Period and currency are shown, never editable.
    expect(document.querySelector('input[name="periodStart"], input[name="periodEnd"], input[name="currency"]')).toBeNull();
  });

  it("filling a blank figure saves directly (no confirmation) with the freshness token", async () => {
    const calls = stubFetch((c) => (get(c) ? res(200, row()) : c.method === "POST" ? res(200, { changed: true, changedFields: {}, snapshot: row({ cashInHand: 40, updatedAt: T1 }) }) : undefined));
    const { onSaved } = open();
    fireEvent.change(await screen.findByLabelText(/Cash in hand \(INR\)/), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("cashflow-edit-save"));
    await screen.findByTestId("cashflow-edit-saved");
    const patch = calls.find((c) => c.method === "POST")!;
    expect(patch.url).toBe(`/api/owner/cashflow/snapshots/${SNAP_ID}/amend`);
    expect(patch.body).toEqual({ expectedUpdatedAt: T0, cashInHand: 40 }); // only the changed figure; no period/currency
    expect(onSaved).toHaveBeenCalled();
    expect(screen.queryByTestId("cashflow-edit-confirm")).toBeNull();
  });

  it("replacing a recorded figure: the SERVER asks, the screen shows 'Replace X with Y?', and 'Yes' resends confirmReplace with the SAME expectedUpdatedAt", async () => {
    let n = 0;
    const calls = stubFetch((c) => {
      if (get(c)) return res(200, row());
      if (c.method !== "POST") return undefined;
      n++;
      return n === 1
        ? res(409, { error: "A figure is already recorded here.", code: "CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED", snapshotId: SNAP_ID, updatedAt: T0, current: { bankBalance: 1500, cashInHand: null }, proposed: { bankBalance: 2000 } })
        : res(200, { changed: true, changedFields: {}, snapshot: row({ bankBalance: 2000, updatedAt: T1 }) });
    });
    open();
    fireEvent.change(await screen.findByLabelText(/Bank balance \(INR\)/), { target: { value: "2000" } });
    fireEvent.click(screen.getByTestId("cashflow-edit-save"));
    const confirm = await screen.findByTestId("cashflow-edit-confirm");
    expect(confirm.textContent).toMatch(/Replace Bank balance INR 1,500 with INR 2,000\?/);
    expect(calls.filter((c) => c.method === "POST")[0].body).toEqual({ expectedUpdatedAt: T0, bankBalance: 2000 }); // never pre-confirmed by the client
    fireEvent.click(screen.getByTestId("cashflow-edit-confirm-yes"));
    await screen.findByTestId("cashflow-edit-saved");
    expect(calls.filter((c) => c.method === "POST")[1].body).toEqual({ expectedUpdatedAt: T0, confirmReplace: true, bankBalance: 2000 });
    expect(screen.getByTestId("cashflow-current-bankBalance").textContent).toMatch(/INR 2,000/);
  });

  it("declining the confirmation sends nothing more and keeps the draft", async () => {
    const calls = stubFetch((c) => (get(c) ? res(200, row()) : c.method === "POST" ? res(409, { error: "x", code: "CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED" }) : undefined));
    open();
    fireEvent.change(await screen.findByLabelText(/Bank balance \(INR\)/), { target: { value: "2000" } });
    fireEvent.click(screen.getByTestId("cashflow-edit-save"));
    await screen.findByTestId("cashflow-edit-confirm");
    fireEvent.click(screen.getByRole("button", { name: /no, go back/i }));
    expect(screen.queryByTestId("cashflow-edit-confirm")).toBeNull();
    expect((screen.getByLabelText(/Bank balance \(INR\)/) as HTMLInputElement).value).toBe("2000");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("a stale entry shows the reload prompt with the FRESH values the server holds, and the next save uses the fresh token", async () => {
    let n = 0;
    const calls = stubFetch((c) => {
      if (get(c)) return res(200, row());
      if (c.method !== "POST") return undefined;
      n++;
      return n === 1
        ? res(409, { error: "This entry changed since you opened it.", code: "CASHFLOW_STALE", snapshotId: SNAP_ID, updatedAt: T1, current: { bankBalance: 1800, cashInHand: 5 } })
        : res(200, { changed: true, changedFields: {}, snapshot: row({ bankBalance: 1800, cashInHand: 9, updatedAt: "2026-10-01T10:09:00.000Z" }) });
    });
    open();
    fireEvent.change(await screen.findByLabelText(/Bank balance \(INR\)/), { target: { value: "2000" } });
    fireEvent.click(screen.getByTestId("cashflow-edit-save"));
    const stale = await screen.findByTestId("cashflow-edit-stale");
    expect(stale.textContent).toMatch(/changed since you opened it/);
    expect(screen.getByTestId("cashflow-current-bankBalance").textContent).toMatch(/INR 1,800/);
    expect(screen.getByTestId("cashflow-current-cashInHand").textContent).toMatch(/INR 5/);
    expect((screen.getByLabelText(/Bank balance \(INR\)/) as HTMLInputElement).value).toBe("1800"); // draft reset to what is recorded now
    fireEvent.change(screen.getByLabelText(/Cash in hand \(INR\)/), { target: { value: "9" } });
    fireEvent.click(screen.getByTestId("cashflow-edit-save"));
    await screen.findByTestId("cashflow-edit-saved");
    expect(calls.filter((c) => c.method === "POST")[1].body).toMatchObject({ expectedUpdatedAt: T1, cashInHand: 9 });
    expect(calls.filter((c) => c.method === "POST")[1].body).not.toHaveProperty("confirmReplace");
  });

  it("a no-op result says nothing changed (it does not claim a save)", async () => {
    stubFetch((c) => (get(c) ? res(200, row()) : c.method === "POST" ? res(200, { changed: false, changedFields: {}, snapshot: row() }) : undefined));
    open();
    fireEvent.change(await screen.findByLabelText(/Cash in hand \(INR\)/), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("cashflow-edit-save"));
    expect((await screen.findByTestId("cashflow-edit-saved")).textContent).toMatch(/Nothing changed/);
  });

  it("junk input is an inline error and nothing is sent", async () => {
    const calls = stubFetch((c) => (get(c) ? res(200, row()) : undefined));
    open();
    fireEvent.change(await screen.findByLabelText(/Bank balance \(INR\)/), { target: { value: "-5" } });
    expect((screen.getByTestId("cashflow-edit-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/can.t be negative/i)).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("an unknown entry is a calm dead end with a way back", async () => {
    stubFetch((c) => (get(c) ? res(404, { error: "not found" }) : undefined));
    const { onClose } = open();
    expect((await screen.findByTestId("cashflow-edit-load-failed")).textContent).toMatch(/wasn.t found/);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("a double tap on save sends one request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls: Call[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const c: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
      calls.push(c);
      if (c.method === "POST") { await gate; return res(200, { changed: true, changedFields: {}, snapshot: row({ cashInHand: 4, updatedAt: T1 }) }); }
      return res(200, row());
    }));
    open();
    fireEvent.change(await screen.findByLabelText(/Cash in hand \(INR\)/), { target: { value: "4" } });
    const save = screen.getByTestId("cashflow-edit-save");
    fireEvent.click(save);
    fireEvent.click(save);
    release();
    await screen.findByTestId("cashflow-edit-saved");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

describe("Owner Cashflow page — edit mode and an existing period", () => {
  const dashboard = { businesses: [BIZ], selectedBusinessId: BIZ.id, hasData: false, latestSnapshot: null, cycleHistory: [], missingCriticalData: [], cashPosition: null };
  function mountPage(handler: (c: Call) => Response | undefined) {
    window.sessionStorage.setItem("opsiq.activeBusinessId", BIZ.id);
    const calls = stubFetch((c) => {
      if (c.url === "/api/owner/businesses") return res(200, { businesses: [BIZ] });
      if (c.url.startsWith("/api/owner/cashflow/dashboard")) return res(200, dashboard);
      return handler(c);
    });
    render(<ActiveBusinessProvider><OwnerCashflowPage /></ActiveBusinessProvider>);
    return calls;
  }

  it("?edit=<id> opens that entry's editor with its current values (and keeps the first-read return marker)", async () => {
    window.history.replaceState(null, "", `/owner/cashflow?edit=${SNAP_ID}&returnTo=first-run`);
    mountPage((c) => (get(c) ? res(200, row()) : undefined));
    await screen.findByTestId("cashflow-entry-editor");
    expect((await screen.findByTestId("cashflow-current-bankBalance")).textContent).toMatch(/INR 1,500/);
    expect(screen.queryByTestId("cashflow-prefilled-period")).toBeNull();
  });

  it("a malformed ?edit= is ignored (the normal page opens)", async () => {
    window.history.replaceState(null, "", "/owner/cashflow?edit=not-an-id");
    mountPage(() => undefined);
    await screen.findByText(/No cashflow snapshot yet/);
    expect(screen.queryByTestId("cashflow-entry-editor")).toBeNull();
  });

  it("CASHFLOW_PERIOD_EXISTS from the add form offers 'Edit the existing entry', which opens THAT entry", async () => {
    window.history.replaceState(null, "", "/owner/cashflow?periodStart=2026-09-01&periodEnd=2026-09-30&returnTo=first-run");
    const calls = mountPage((c) => {
      if (c.method === "POST" && c.url.endsWith("/snapshots"))
        return res(409, { error: "You already have a cashflow entry for this period. Open it to edit.", code: "CASHFLOW_PERIOD_EXISTS", snapshotId: SNAP_ID, updatedAt: T0 });
      if (get(c)) return res(200, row({ bankBalance: null }));
      return undefined;
    });
    await screen.findByTestId("cashflow-prefilled-period");
    fireEvent.change(document.querySelector('input[name="bankBalance"]')!, { target: { value: "700" } });
    fireEvent.click(screen.getByRole("button", { name: /save snapshot/i }));
    const notice = await screen.findByTestId("cashflow-period-exists");
    expect(notice.textContent).toBe("You already have a cashflow entry for this period. Open it to edit.Edit the existing entry");
    expect(screen.queryByTestId("cashflow-page-error")).toBeNull(); // not an error banner: a next step
    fireEvent.click(screen.getByTestId("cashflow-open-existing"));
    await screen.findByTestId("cashflow-entry-editor");
    await waitFor(() => expect(calls.some(get)).toBe(true));
    expect(window.location.search).toBe(`?edit=${SNAP_ID}&returnTo=first-run`);
    expect(screen.queryByTestId("cashflow-period-exists")).toBeNull();
  });
});

describe("add form: mobile layout and the two essential figures first", () => {
  const dashboard = { businesses: [BIZ], selectedBusinessId: BIZ.id, hasData: false, latestSnapshot: null, cycleHistory: [], missingCriticalData: [], cashPosition: null };
  function mountPage() {
    window.sessionStorage.setItem("opsiq.activeBusinessId", BIZ.id);
    stubFetch((c) => {
      if (c.url === "/api/owner/businesses") return res(200, { businesses: [BIZ] });
      if (c.url.startsWith("/api/owner/cashflow/dashboard")) return res(200, dashboard);
      return undefined;
    });
    render(<ActiveBusinessProvider><OwnerCashflowPage /></ActiveBusinessProvider>);
  }
  const inputNames = (root: ParentNode) => Array.from(root.querySelectorAll("input[name]")).map((i) => i.getAttribute("name"));

  it("opened from the first read: only bank balance and cash in hand are shown; the rest sit behind 'More cashflow details' (min-h-11), still inside the form", async () => {
    window.history.replaceState(null, "", "/owner/cashflow?periodStart=2026-09-01&periodEnd=2026-09-30&returnTo=first-run");
    mountPage();
    const essential = await screen.findByTestId("cashflow-fields-essential");
    expect(inputNames(essential)).toEqual(["bankBalance", "cashInHand"]);
    const more = screen.getByTestId("cashflow-more-details") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    const summary = more.querySelector("summary")!;
    expect(summary.textContent).toBe("More cashflow details");
    expect(summary.className).toMatch(/min-h-11/);
    expect(inputNames(more)).toHaveLength(11);
    // Same form, so opening the disclosure and filling a figure still submits it.
    expect(screen.getByTestId("cashflow-fields-essential-first").closest("form")).toBe(more.closest("form"));
  });
  it("no single fixed 4-column grid: one column on a phone, two from sm, four from lg (all 13 figures when not opened from the read)", async () => {
    window.history.replaceState(null, "", "/owner/cashflow");
    mountPage();
    fireEvent.click(await screen.findByRole("button", { name: /add cashflow snapshot/i }));
    const all = await screen.findByTestId("cashflow-fields-all");
    expect(all.className).toMatch(/\bgrid-cols-1\b/);
    expect(all.className).toMatch(/sm:grid-cols-2/);
    expect(all.className).toMatch(/lg:grid-cols-4/);
    expect(all.className).not.toMatch(/(^|\s)grid-cols-4/);
    expect(inputNames(all)).toHaveLength(13);
  });
  it("the bank balance field says what to do about an overdraft", async () => {
    window.history.replaceState(null, "", "/owner/cashflow?periodStart=2026-09-01&periodEnd=2026-09-30&returnTo=first-run");
    mountPage();
    const essential = await screen.findByTestId("cashflow-fields-essential");
    expect(essential.textContent).toContain("If your account is overdrawn, leave the bank balance blank and record the overdraft under money owed (debt).");
  });
});

describe("CashflowEntryEditor — Save and saved-message copy", () => {
  function open() {
    return render(<CashflowEntryEditor snapshotId={SNAP_ID} onClose={vi.fn()} onSaved={vi.fn()} />);
  }
  it("a disabled Save says why ('Change a figure to save') and goes away once something differs", async () => {
    stubFetch((c) => (get(c) ? res(200, row()) : undefined));
    open();
    const hint = await screen.findByTestId("cashflow-edit-save-hint");
    expect(hint.textContent).toBe("Change a figure to save");
    expect(screen.getByTestId("cashflow-edit-save").getAttribute("aria-describedby")).toBe(hint.id);
    fireEvent.change(screen.getByLabelText(/Cash in hand \(INR\)/), { target: { value: "5" } });
    expect(screen.queryByTestId("cashflow-edit-save-hint")).toBeNull();
  });
  it("a cash-in-hand-only edit does not say a read needs updating for a balance", async () => {
    stubFetch((c) => (get(c) ? res(200, row()) : c.method === "POST" ? res(200, { changed: true, changedFields: { cashInHand: { before: null, after: 40 } }, snapshot: row({ cashInHand: 40, updatedAt: T1 }) }) : undefined));
    open();
    fireEvent.change(await screen.findByLabelText(/Cash in hand \(INR\)/), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("cashflow-edit-save"));
    const saved = await screen.findByTestId("cashflow-edit-saved");
    expect(saved.textContent).not.toMatch(/needs updating/);
    expect(saved.textContent).toMatch(/Saved/);
  });
  it("a bank-balance edit keeps the sentence about a read that used the balance", async () => {
    stubFetch((c) => (get(c) ? res(200, row()) : c.method === "POST" ? res(200, { changed: true, changedFields: { bankBalance: { before: 1500, after: 1600 } }, snapshot: row({ bankBalance: 1600, updatedAt: T1 }) }) : undefined));
    open();
    fireEvent.change(await screen.findByLabelText(/Bank balance \(INR\)/), { target: { value: "1600" } });
    fireEvent.click(screen.getByTestId("cashflow-edit-save"));
    expect((await screen.findByTestId("cashflow-edit-saved")).textContent).toMatch(/A read that used this balance now needs updating/);
  });
  it("a negative bank balance explains the overdraft route instead of saying 'enter 0'", async () => {
    stubFetch((c) => (get(c) ? res(200, row()) : undefined));
    open();
    fireEvent.change(await screen.findByLabelText(/Bank balance \(INR\)/), { target: { value: "-50" } });
    const text = document.body.textContent ?? "";
    expect(text).toContain("If your account is overdrawn, leave the bank balance blank and record the overdraft under money owed (debt).");
    expect(text).not.toMatch(/Enter 0 if there was none/);
  });
});
