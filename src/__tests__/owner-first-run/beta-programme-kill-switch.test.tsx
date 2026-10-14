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

beforeEach(() => { requests = []; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

let requests: unknown[] = [];

function route(overrides: Record<string, () => Promise<unknown>> = {}) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    if (overrides[key]) return overrides[key]();
    if (url === "/api/admin/platform-settings" && !init?.method) return ok(settings);
    if (url === "/api/admin/platform-settings/bootstrap" && !init?.method) return ok(bootstrap);
    if (url === "/api/admin/overview") return ok({ capacity: { admitted: 7, verified: 4, pending: 3, ledger: 12, limit: 10, admissionMode: "OPEN_BETA", source: "database" } });
    if (url === "/api/admin/beta-requests") return ok({ betaRequests: requests });
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

  it("shows the current mode and capacity (verified vs waiting) right at the top, loaded independently", async () => {
    route();
    render(<AdminBetaProgrammePage />);
    expect((await screen.findByTestId("beta-state-mode-value")).textContent).toBe("OPEN to anyone");
    await waitFor(() => expect(screen.getByTestId("beta-state-capacity").textContent).toMatch(/7 of 10.*4 verified.*3 waiting to verify/));
  });

  it("capacity numbers failing to load never hide or disable the stop control", async () => {
    route({ "GET /api/admin/overview": () => fail(500) });
    render(<AdminBetaProgrammePage />);
    await waitFor(() => expect(screen.getByText(/capacity numbers couldn.t load/i)).toBeTruthy());
    expect((screen.getByTestId("stop-signups-button") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("beta-state-mode-value").textContent).toBe("OPEN to anyone");
  });

  it("a successful stop updates the visible state from the server's answer and re-reads capacity", async () => {
    route();
    render(<AdminBetaProgrammePage />);
    fireEvent.click(await screen.findByTestId("stop-signups-button"));
    await waitFor(() => expect(screen.getByTestId("beta-state-mode-value").textContent).toBe("CLOSED"));
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/admin/overview").length).toBeGreaterThanOrEqual(2);
  });

  it("phones get one card per request with full-width actions (no sideways-scrolling table); wider screens keep the table", async () => {
    requests = [
      { id: "r1", email: "a-very-long-address-for-wrapping@example.com", firstName: "Asha", status: "REQUESTED", utmSource: null, utmCampaign: null, invitedAt: null, invitedBy: null, createdAt: "2026-10-01T10:00:00Z" },
      { id: "r2", email: "b@example.com", firstName: null, status: "INVITED", utmSource: "x", utmCampaign: "y", invitedAt: null, invitedBy: null, createdAt: "2026-10-02T10:00:00Z" },
    ];
    route();
    render(<AdminBetaProgrammePage />);
    const cards = await screen.findAllByTestId("beta-request-card");
    expect(cards).toHaveLength(2);
    const list = screen.getByTestId("beta-requests-cards");
    expect(list.className).toMatch(/sm:hidden/);
    expect(list.closest("section")?.querySelector(".hidden.sm\\:block table")).toBeTruthy();
    const invite = cards[0].querySelector("button") as HTMLButtonElement;
    expect(invite.className).toMatch(/\bw-full\b/);
    expect(invite.className).toMatch(/\bh-11\b/); // 44px below the sm breakpoint
    expect(cards[0].textContent).toContain("a-very-long-address-for-wrapping@example.com");
    expect(cards[0].querySelector("p.break-all")).toBeTruthy();
  });
});

describe("beta programme — invitation email outcome", () => {
  const row = (status: string) => ({
    id: "r1", email: "ada@example.com", firstName: "Ada", status, utmSource: null, utmCampaign: null,
    invitedAt: null, invitedBy: null, createdAt: "2026-01-01T00:00:00.000Z",
  });

  async function act(status: string, button: RegExp, endpoint: string, emailDelivery?: string) {
    requests = [row(status)];
    route({
      [`POST /api/admin/beta-requests/r1/${endpoint}`]: () =>
        ok({ id: "r1", status: "INVITED", invitedAt: "2026-01-02T00:00:00.000Z", invitedBy: "a", ...(emailDelivery ? { emailDelivery } : {}) }),
    });
    render(<AdminBetaProgrammePage />);
    const buttons = await screen.findAllByRole("button", { name: button });
    fireEvent.click(buttons[0]);
    return (await screen.findAllByTestId("invite-email-notice"))[0];
  }

  it("a failed re-invite send is reported as not delivered, never as sent", async () => {
    const notice = await act("REVOKED", /re-invite/i, "invite", "FAILED");
    expect(notice.textContent).toMatch(/could not be sent/i);
    expect(notice.textContent).not.toMatch(/accepted by provider/i);
  });

  it("re-open & invite reports a successful send", async () => {
    const notice = await act("REJECTED", /re-open/i, "reopen", "SENT");
    expect(notice.textContent).toMatch(/accepted by provider/i);
  });

  it("no provider and not-attempted outcomes are described truthfully", async () => {
    expect((await act("REQUESTED", /^invite$/i, "invite", "NO_PROVIDER")).textContent).toMatch(/no email provider is configured/i);
    cleanup();
    expect((await act("REQUESTED", /^invite$/i, "invite", "NOT_ATTEMPTED")).textContent).toMatch(/no email was sent/i);
  });

  it("an active INVITED request shows Resend invitation email; an expired one shows Re-invite; resend reports its explicit outcome", async () => {
    requests = [{ ...row("INVITED"), invitedAt: "2026-01-02T00:00:00.000Z", inviteExpired: false }];
    route({
      "POST /api/admin/beta-requests/r1/resend-invite": () =>
        ok({ id: "r1", status: "INVITED", invitedAt: "2026-01-02T00:00:00.000Z", invitedBy: "a", emailDelivery: "NOT_ATTEMPTED", emailDeliveryReason: "an email attempt was just made; wait 30 seconds before resending" }),
    });
    render(<AdminBetaProgrammePage />);
    const resend = (await screen.findAllByRole("button", { name: /resend invitation email/i }))[0];
    expect(screen.queryAllByRole("button", { name: /re-invite/i })).toHaveLength(0);
    fireEvent.click(resend);
    const notice = (await screen.findAllByTestId("invite-email-notice"))[0];
    expect(notice.textContent).toMatch(/No email was sent: an email attempt was just made/);
    cleanup();

    requests = [{ ...row("INVITED"), inviteExpired: true }];
    route();
    render(<AdminBetaProgrammePage />);
    expect((await screen.findAllByRole("button", { name: /re-invite/i })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /resend invitation email/i })).toHaveLength(0);
  });
});
