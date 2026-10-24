/**
 * QuickBooksConnectionCard — the owner lifecycle UI. The card holds no rules: every state/action below comes from the
 * server's status document, so these tests drive it with that document and assert what the owner can see and do.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { QuickBooksConnectionCard } from "@/components/owner/QuickBooksConnectionCard";

const BASE = {
  available: true, environment: "production", state: "NOT_CONNECTED", freshness: "NEVER", companyName: null, connectedAt: null,
  lastAttemptAt: null, lastSuccessAt: null, accountingBasis: "ACCRUAL", monthsRemaining: null, failure: null, staleNotice: null,
  actions: { connect: true, reconnect: false, disconnect: false, refresh: false }, periods: [], ownerControlledMonths: 0, notices: [], connectBlockedReason: null,
};
const A = (o: Record<string, unknown>) => ({ ...BASE, ...o });
const fetchMock = vi.fn();
const res = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
let statusBody: Record<string, unknown> = BASE;
const calls = () => fetchMock.mock.calls.map(([u, i]) => `${(i as RequestInit | undefined)?.method ?? "GET"} ${u}`);

beforeEach(() => {
  fetchMock.mockReset();
  statusBody = BASE;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/status")) return res(statusBody);
    if (url.includes("/connect")) return res({ authorizationUrl: "https://appcenter.intuit.com/connect/oauth2?x=1", stateExpiresAt: "2026-10-24T00:10:00Z" });
    if (url.includes("/disconnect")) return res({ changed: true, revocation: "REVOKED" });
    if (url.includes("/sync")) return res({ queued: true }, 202);
    return res({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/owner/data");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const mount = () => render(<QuickBooksConnectionCard businessId="11111111-1111-4111-8111-111111111111" />);
const state = () => screen.getByTestId("qbo-card").getAttribute("data-qbo-state");

describe("QuickBooksConnectionCard", () => {
  it("not connected: explains read-only access and offers Connect; Connect posts the governed route with the server's environment and follows Intuit's URL", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "", pathname: "/owner/data" });
    mount();
    expect(await screen.findByTestId("qbo-connect")).toBeTruthy();
    expect(screen.getByTestId("qbo-explainer").textContent).toMatch(/never changes anything in QuickBooks/);
    fireEvent.click(screen.getByTestId("qbo-connect"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://appcenter.intuit.com/connect/oauth2?x=1"));
    const post = fetchMock.mock.calls.find(([u]) => String(u).includes("/connect"));
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ businessId: "11111111-1111-4111-8111-111111111111", environment: "production" });
  });

  it("double click on Connect sends ONE request", async () => {
    vi.stubGlobal("location", { ...window.location, assign: vi.fn(), search: "", pathname: "/owner/data" });
    mount();
    const btn = await screen.findByTestId("qbo-connect");
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(calls().filter((c) => c.includes("POST") && c.includes("/connect"))).toHaveLength(1));
  });

  it("unavailable deployment: says so and offers no Connect", async () => {
    statusBody = A({ available: false, environment: null, actions: { connect: false, reconnect: false, disconnect: false, refresh: false } });
    mount();
    expect((await screen.findByTestId("qbo-explainer")).textContent).toMatch(/not set up/);
    expect(screen.queryByTestId("qbo-connect")).toBeNull();
  });

  it("connecting and importing are shown truthfully (with real months-to-go), no fake progress", async () => {
    statusBody = A({ state: "CONNECTING", actions: { connect: false, reconnect: false, disconnect: true, refresh: false } });
    mount();
    await waitFor(() => expect(state()).toBe("CONNECTING"));
    expect(screen.getByText(/Waiting for the first import/)).toBeTruthy();
    cleanup();
    statusBody = A({ state: "IMPORTING", companyName: "Acme Books", monthsRemaining: 9, actions: { connect: false, reconnect: false, disconnect: true, refresh: false } });
    mount();
    expect((await screen.findByTestId("qbo-importing")).textContent).toMatch(/from Acme Books — 9 months to go/);
    expect(screen.queryByTestId("qbo-refresh")).toBeNull();
  });

  it("connected: company, last-updated, basis; Refresh now queues a sync and tells the owner analysis is not auto-run", async () => {
    statusBody = A({ state: "CONNECTED", freshness: "FRESH", companyName: "Acme Books", lastSuccessAt: "2026-10-23T03:00:00.000Z", actions: { connect: false, reconnect: false, disconnect: true, refresh: true },
      periods: [{ periodStart: "2026-09-01", finance: "QUICKBOOKS", cashflow: "QUICKBOOKS" }, { periodStart: "2026-08-01", finance: "MANUAL", cashflow: null }] });
    mount();
    await waitFor(() => expect(state()).toBe("CONNECTED"));
    const facts = screen.getByTestId("qbo-facts").textContent as string;
    expect(facts).toContain("Acme Books");
    expect(facts).toContain("Accrual accounting");
    expect(screen.getByTestId("qbo-last-updated").textContent).not.toBe("not yet");
    expect(screen.getByTestId("qbo-sources").textContent).toMatch(/1 recent month from QuickBooks, 1 entered or changed by you/);
    fireEvent.click(screen.getByTestId("qbo-refresh"));
    await waitFor(() => expect(calls()).toContain("POST /api/owner/integrations/quickbooks/sync"));
    expect((await screen.findByTestId("qbo-notice")).textContent).toMatch(/not changed until you run it again/);
  });

  it("stale: explains the data is old", async () => {
    statusBody = A({ state: "STALE", freshness: "STALE", companyName: "Acme", lastSuccessAt: "2026-10-01T00:00:00.000Z", staleNotice: "Your QuickBooks figures were last refreshed more than 36 hours ago, so they may not reflect your latest books.", actions: { connect: false, reconnect: false, disconnect: true, refresh: true } });
    mount();
    expect((await screen.findByTestId("qbo-stale")).textContent).toMatch(/more than 36 hours ago/);
    expect(screen.getByTestId("qbo-refresh")).toBeTruthy();
  });

  it("sync error: bounded sentence from the server, retry action, no provider text", async () => {
    statusBody = A({ state: "SYNC_ERROR", companyName: "Acme", failure: "QuickBooks was unavailable. OpsIQ will try again automatically.", actions: { connect: false, reconnect: false, disconnect: true, refresh: true } });
    mount();
    expect((await screen.findByTestId("qbo-failure")).textContent).toMatch(/try again automatically/);
    expect(screen.getByTestId("qbo-refresh")).toBeTruthy();
  });

  it("reconnect required: explicit Reconnect action (not 'Connect'), Refresh hidden", async () => {
    statusBody = A({ state: "REAUTH_REQUIRED", failure: "QuickBooks needs you to sign in again.", actions: { connect: false, reconnect: true, disconnect: true, refresh: false } });
    mount();
    expect(await screen.findByTestId("qbo-reconnect")).toBeTruthy();
    expect(screen.queryByTestId("qbo-connect")).toBeNull();
    expect(screen.queryByTestId("qbo-refresh")).toBeNull();
    expect(screen.getByTestId("qbo-failure").textContent).toMatch(/sign in again/);
  });

  it("disconnect is a two-step confirm; confirming posts once and reloads status", async () => {
    statusBody = A({ state: "CONNECTED", freshness: "FRESH", companyName: "Acme", lastSuccessAt: "2026-10-23T03:00:00.000Z", actions: { connect: false, reconnect: false, disconnect: true, refresh: true } });
    mount();
    fireEvent.click(await screen.findByTestId("qbo-disconnect"));
    expect(calls().some((c) => c.includes("/disconnect"))).toBe(false);
    expect(screen.getByTestId("qbo-disconnect-confirm").textContent).toMatch(/Imported figures stay on record/);
    statusBody = A({ state: "DISCONNECTED", actions: { connect: true, reconnect: false, disconnect: false, refresh: false } });
    fireEvent.click(screen.getByText("Yes, disconnect"));
    await waitFor(() => expect(state()).toBe("DISCONNECTED"));
    expect(calls().filter((c) => c.includes("POST") && c.includes("/disconnect"))).toHaveLength(1);
    expect(screen.getByTestId("qbo-connect").textContent).toBe("Reconnect QuickBooks");
    expect(screen.getByTestId("qbo-notice").textContent).toMatch(/stay on record/);
  });

  it("a revocation failure is disclosed with the manual step; cancel leaves everything untouched", async () => {
    statusBody = A({ state: "CONNECTED", freshness: "FRESH", actions: { connect: false, reconnect: false, disconnect: true, refresh: true } });
    fetchMock.mockImplementation((url: string) => (url.includes("/status") ? res(statusBody) : url.includes("/disconnect") ? res({ changed: true, revocation: "FAILED" }) : res({})));
    mount();
    fireEvent.click(await screen.findByTestId("qbo-disconnect"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("qbo-disconnect-confirm")).toBeNull();
    fireEvent.click(screen.getByTestId("qbo-disconnect"));
    fireEvent.click(screen.getByText("Yes, disconnect"));
    expect((await screen.findByTestId("qbo-notice")).textContent).toMatch(/My Apps in QuickBooks/);
  });

  it("the OAuth round-trip outcome (closed token in the URL) is worded by the domain and removed from the address bar", async () => {
    window.history.replaceState(null, "", "/owner/data?quickbooks=connected&keep=1");
    mount();
    expect((await screen.findByTestId("qbo-notice")).textContent).toMatch(/QuickBooks is connected/);
    expect(window.location.search).toBe("?keep=1");
  });

  it("a denial is informational, an unknown token shows nothing, and no raw JSON is ever rendered", async () => {
    window.history.replaceState(null, "", "/owner/data?quickbooks=user_denied");
    const { container } = mount();
    expect((await screen.findByTestId("qbo-notice")).textContent).toMatch(/not approved/);
    cleanup();
    window.history.replaceState(null, "", "/owner/data?quickbooks=%3Cscript%3E");
    const second = mount();
    await screen.findByTestId("qbo-card");
    expect(screen.queryByTestId("qbo-notice")).toBeNull();
    for (const c of [container, second.container]) expect(c.textContent).not.toMatch(/\{"|"status"|authorizationUrl/);
  });

  it("a failed status load shows a bounded error with retry, and a malformed document is treated as a load failure", async () => {
    fetchMock.mockImplementation(() => res({ error: { message: "x" } }, 500));
    mount();
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    cleanup();
    fetchMock.mockImplementation(() => res({ nonsense: true }));
    mount();
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
  });

  it("mobile: every action is full-width below the sm breakpoint (no horizontal overflow classes)", async () => {
    statusBody = A({ state: "CONNECTED", freshness: "FRESH", actions: { connect: false, reconnect: false, disconnect: true, refresh: true } });
    mount();
    for (const id of ["qbo-refresh", "qbo-disconnect"]) expect((await screen.findByTestId(id)).className).toMatch(/w-full sm:w-auto/);
  });
});
