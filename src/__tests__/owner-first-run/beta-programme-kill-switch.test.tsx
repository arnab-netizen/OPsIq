// @vitest-environment jsdom
/**
 * The kill switch must work when everything else is broken: the admission controls load independently of the
 * request list, "Stop new signups now" sends the mode ALONE, and a stale form can never overwrite a newer value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import AdminBetaProgrammePage from "@/app/(authenticated)/admin/beta-programme/page";

const fetchMock = vi.fn();
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const fail = (status = 500) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error: "boom" }) });
const settings = { admissionMode: "OPEN_BETA", capacityLimit: 10, source: "database" };
const bootstrap = { admissionMode: "OPEN_BETA", capacityLimit: 10, alreadyInitialized: true, qaContaminationDetected: false };

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function route(overrides: Record<string, () => Promise<unknown>> = {}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    if (overrides[key]) return overrides[key]();
    if (url === "/api/admin/platform-settings" && !init?.method) return ok(settings);
    if (url === "/api/admin/platform-settings/bootstrap" && !init?.method) return ok(bootstrap);
    if (url === "/api/admin/beta-requests") return ok({ betaRequests: [] });
    if (url === "/api/admin/platform-settings" && init?.method === "POST") return ok({ ...settings, admissionMode: "CLOSED" });
    return ok({});
  });
}

describe("beta programme — kill switch", () => {
  it("the admission controls stay usable when the request list fails to load", async () => {
    route({ "GET /api/admin/beta-requests": () => fail(500) });
    render(<AdminBetaProgrammePage />);
    await waitFor(() => expect(screen.getByTestId("stop-signups-button")).toBeTruthy());
    expect((screen.getByTestId("stop-signups-button") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/request list couldn.t load/i)).toBeTruthy();
  });

  it("Stop new signups now sends the mode alone — never a stale capacity", async () => {
    route();
    render(<AdminBetaProgrammePage />);
    const btn = await screen.findByTestId("stop-signups-button");
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ admissionMode: "CLOSED" });
    await waitFor(() => expect((screen.getByTestId("stop-signups-button") as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId("stop-signups-button").textContent).toMatch(/closed/i);
  });

  it("Save sends only the changed field", async () => {
    route();
    render(<AdminBetaProgrammePage />);
    await screen.findByTestId("stop-signups-button");
    const capacity = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(capacity, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ capacityLimit: 25 });
  });

  it("explains the one thing that blocks the switch when settings were never initialised", async () => {
    route({ "GET /api/admin/platform-settings/bootstrap": () => ok({ ...bootstrap, alreadyInitialized: false }) });
    render(<AdminBetaProgrammePage />);
    const btn = await screen.findByTestId("stop-signups-button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/initialize platform settings first/i).length).toBeGreaterThan(0);
  });
});
