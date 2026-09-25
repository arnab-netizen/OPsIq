/**
 * /owner/integrations — QuickBooks Online connection card.
 *
 * Proves: the unavailable state shows the server's reason and no fake status; not-connected posts
 * {action:"connect", businessId} and navigates to the returned authorizeUrl (with a double-click
 * guard); the connected state renders the DTO's fields; Sync Now disables while in flight and
 * never double-posts; Disconnect requires confirmation (double-click guarded) and only posts
 * {action:"disconnect", confirm:true} on confirm; every control's visibility comes from
 * `connector.allowedActions`, never from `status` — including a post-disconnect DISCONNECTED
 * connector (Reconnect only) and a REFRESH_FAILED connector (Reconnect + Disconnect, no Sync);
 * the OAuth-callback query params render clear, owner-safe messages for every code in
 * QBO_CONNECT_ERROR_CODES plus an unmapped/garbage code (generic message, never reflected); a
 * slower, older status response never overwrites a newer one already applied; and no rendered
 * text ever contains "token".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

let searchParamsValue = "";
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

import OwnerIntegrationsPage from "@/app/(authenticated)/owner/integrations/page";
import type { QuickBooksStatusDTO } from "@/domain/quickbooks/qbo-contracts";
import { QBO_CONNECT_ERROR_CODES } from "@/domain/quickbooks/qbo-connect-outcome";

const BUSINESSES = [{ id: "biz-1", name: "Acme Bakery", businessType: "retail", currency: "USD" }];

const ACTIVE_ALLOWED = { sync: true, disconnect: true, reconnect: false };

function connectedDto(overrides: Partial<NonNullable<QuickBooksStatusDTO["connector"]>> = {}): QuickBooksStatusDTO {
  return {
    available: true,
    unavailableReason: null,
    environment: "production",
    webhooksEnabled: true,
    connector: {
      id: "conn-1",
      status: "ACTIVE",
      businessId: "biz-1",
      companyName: "Acme Bakery LLC",
      connectedAt: "2026-09-01T00:00:00.000Z",
      lastSyncAt: "2026-09-25T08:00:00.000Z",
      lastSyncRecords: 542,
      syncFailureMessage: null,
      needsReconnect: false,
      allowedActions: ACTIVE_ALLOWED,
      refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z",
      sync: {
        phase: "INCREMENTAL",
        running: false,
        lastRunStatus: "SUCCESS",
        lastRunAt: "2026-09-25T08:00:00.000Z",
        lastRunSummary: "Synced 12 invoices, 3 bills.",
        initialProgress: null,
        freshness: "FRESH",
      },
      ...overrides,
    },
  };
}

function notConnectedDto(): QuickBooksStatusDTO {
  return {
    available: true,
    unavailableReason: null,
    environment: "production",
    webhooksEnabled: true,
    connector: null,
  };
}

function unavailableDto(): QuickBooksStatusDTO {
  return {
    available: false,
    unavailableReason: "QuickBooks isn't enabled for this account yet. Contact support to turn it on.",
    environment: null,
    webhooksEnabled: false,
    connector: null,
  };
}

let currentDto: QuickBooksStatusDTO;
const posted: Array<{ body: unknown }> = [];
let assignMock: ReturnType<typeof vi.fn>;
/** Consumed in order for successive GET /quickbooks calls (poll-ordering test); falls back to
 *  `currentDto` once empty. */
let statusResponseQueue: Array<() => Promise<Response>>;

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (typeof path === "string" && path.includes("/api/owner/businesses")) {
        return { ok: true, json: async () => ({ businesses: BUSINESSES }) } as Response;
      }
      if (typeof path === "string" && path.includes("/api/owner/integrations/quickbooks")) {
        if (init?.method === "POST") {
          const body = init.body ? JSON.parse(String(init.body)) : {};
          posted.push({ body });
          if (body.action === "connect") {
            return { ok: true, json: async () => ({ authorizeUrl: "https://appcenter.intuit.com/connect/oauth2?x=1" }) } as Response;
          }
          if (body.action === "sync") {
            return { ok: true, json: async () => ({ taskId: "task-1", deduplicated: false }) } as Response;
          }
          if (body.action === "disconnect") {
            // Realistic server behavior: disconnect keeps the connector row (status DISCONNECTED,
            // allowedActions: reconnect only) rather than clearing it to null — the owner can
            // still see which QuickBooks company they were connected to and reconnect it.
            currentDto = connectedDto({
              status: "DISCONNECTED",
              needsReconnect: true,
              allowedActions: { sync: false, disconnect: false, reconnect: true },
            });
            return { ok: true, json: async () => ({ quickbooks: currentDto }) } as Response;
          }
        }
        if (statusResponseQueue.length > 0) {
          const next = statusResponseQueue.shift()!;
          return next();
        }
        return { ok: true, json: async () => ({ quickbooks: currentDto }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    })
  );
}

function statusResponse(dto: QuickBooksStatusDTO): Response {
  return { ok: true, json: async () => ({ quickbooks: dto }) } as Response;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  posted.length = 0;
  searchParamsValue = "";
  statusResponseQueue = [];
  replaceMock.mockClear();
  assignMock = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: assignMock },
  });
  currentDto = connectedDto();
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function renderReady() {
  render(<OwnerIntegrationsPage />);
  await waitFor(() => expect(screen.getByTestId("quickbooks-card")).toBeTruthy());
}

describe("OwnerIntegrationsPage — QuickBooks", () => {
  it("unavailable: shows the server's reason and no fake status", async () => {
    currentDto = unavailableDto();
    await renderReady();
    const el = screen.getByTestId("quickbooks-unavailable");
    expect(el.textContent).toMatch(/QuickBooks isn't enabled for this account yet/);
    expect(screen.queryByRole("button", { name: /connect/i })).toBeNull();
  });

  it("not connected: Connect posts {action:'connect', businessId} and navigates to authorizeUrl", async () => {
    currentDto = notConnectedDto();
    await renderReady();
    expect(screen.getByTestId("quickbooks-not-connected")).toBeTruthy();

    const connectBtn = await screen.findByRole("button", { name: /connect quickbooks/i });
    await waitFor(() => expect(connectBtn).not.toBeDisabled());
    fireEvent.click(connectBtn);

    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "connect", businessId: "biz-1" });
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("https://appcenter.intuit.com/connect/oauth2?x=1"));
  });

  it("not connected: double-clicking Connect posts exactly once", async () => {
    currentDto = notConnectedDto();
    await renderReady();
    const connectBtn = await screen.findByRole("button", { name: /connect quickbooks/i });
    await waitFor(() => expect(connectBtn).not.toBeDisabled());
    fireEvent.click(connectBtn);
    fireEvent.click(connectBtn);
    await waitFor(() => expect(assignMock).toHaveBeenCalledTimes(1));
    expect(posted.length).toBe(1);
  });

  it("F8: Connecting… releases after 15s when navigation never actually happens", async () => {
    vi.useFakeTimers();
    currentDto = notConnectedDto();
    render(<OwnerIntegrationsPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const connectBtn = screen.getByRole("button", { name: /connect quickbooks/i });
    fireEvent.click(connectBtn);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: /connecting…/i })).toBeTruthy();
    expect(assignMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole("button", { name: /^connect quickbooks$/i })).not.toBeDisabled();
  });

  it("F8: a pageshow event (bfcache return) releases a stuck Connecting…", async () => {
    currentDto = notConnectedDto();
    await renderReady();
    const connectBtn = await screen.findByRole("button", { name: /connect quickbooks/i });
    fireEvent.click(connectBtn);
    await waitFor(() => expect(screen.getByRole("button", { name: /connecting…/i })).toBeTruthy());
    expect(assignMock).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event("pageshow"));
    await waitFor(() => expect(screen.getByRole("button", { name: /^connect quickbooks$/i })).not.toBeDisabled());
  });

  it("connected: renders company, business, status, freshness, last sync, records", async () => {
    await renderReady();
    const card = screen.getByTestId("quickbooks-connected");
    expect(within(card).getByText("Acme Bakery LLC")).toBeTruthy();
    expect(within(card).getByText("Acme Bakery")).toBeTruthy();
    expect(within(card).getByText("Connected")).toBeTruthy();
    expect(within(card).getByText("Up to date")).toBeTruthy();
    expect(within(card).getByText("542")).toBeTruthy();
  });

  it("Sync Now disables while in flight and posts exactly once on a double click", async () => {
    await renderReady();
    const syncBtn = screen.getByRole("button", { name: /sync now/i });
    fireEvent.click(syncBtn);
    fireEvent.click(syncBtn);
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "sync" });
  });

  it("Disconnect requires confirmation; cancel does nothing", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: /^disconnect$/i }));
    const dialog = await screen.findByRole("dialog", { name: /disconnect quickbooks/i });
    expect(within(dialog).getByText(/stops opsiq from syncing/i)).toBeTruthy();
    expect(within(dialog).getByText(/revoked at intuit/i)).toBeTruthy();
    expect(within(dialog).getByText(/already imported stays in opsiq/i)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posted.length).toBe(0);
  });

  it("Disconnect: confirm posts {action:'disconnect', confirm:true}", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: /^disconnect$/i }));
    const dialog = await screen.findByRole("dialog", { name: /disconnect quickbooks/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^disconnect$/i }));

    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "disconnect", confirm: true });

    // Immediate post-disconnect render: the POST response's DTO is applied directly (no extra
    // GET needed) — the card now shows DISCONNECTED with Reconnect only, not Sync/Disconnect.
    await waitFor(() => expect(screen.getByRole("button", { name: /reconnect quickbooks/i })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /sync now/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^disconnect$/i })).toBeNull();
  });

  it("Disconnect: double-clicking the confirm button posts exactly once", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: /^disconnect$/i }));
    const dialog = await screen.findByRole("dialog", { name: /disconnect quickbooks/i });
    const confirmBtn = within(dialog).getByRole("button", { name: /^disconnect$/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "disconnect", confirm: true });
  });

  it("a DISCONNECTED connector (allowedActions: reconnect only) shows Reconnect, no Sync/Disconnect, and still shows company/business", async () => {
    currentDto = connectedDto({
      status: "DISCONNECTED",
      needsReconnect: true,
      allowedActions: { sync: false, disconnect: false, reconnect: true },
    });
    await renderReady();
    const card = screen.getByTestId("quickbooks-connected");
    expect(within(card).getByText("Acme Bakery LLC")).toBeTruthy();
    expect(within(card).getByText("Acme Bakery")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reconnect quickbooks/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sync now/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^disconnect$/i })).toBeNull();
  });

  it("a REFRESH_FAILED connector shows Reconnect AND Disconnect, but not Sync Now", async () => {
    currentDto = connectedDto({
      status: "REFRESH_FAILED",
      needsReconnect: true,
      allowedActions: { sync: false, disconnect: true, reconnect: true },
    });
    await renderReady();
    expect(screen.getByRole("button", { name: /reconnect quickbooks/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^disconnect$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sync now/i })).toBeNull();
  });

  it("Reconnect (allowedActions.reconnect) with businessId set posts connect for that business directly, no picker", async () => {
    currentDto = connectedDto({
      status: "DISCONNECTED",
      needsReconnect: true,
      allowedActions: { sync: false, disconnect: false, reconnect: true },
    });
    await renderReady();
    expect(screen.queryByLabelText(/^business$/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /reconnect quickbooks/i }));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "connect", businessId: "biz-1" });
  });

  it("Reconnect with no businessId on the connector shows a business picker before allowing reconnect", async () => {
    currentDto = connectedDto({
      businessId: null,
      status: "DISCONNECTED",
      needsReconnect: true,
      allowedActions: { sync: false, disconnect: false, reconnect: true },
    });
    await renderReady();
    const picker = await screen.findByLabelText(/^business$/i);
    fireEvent.change(picker, { target: { value: "biz-1" } });
    fireEvent.click(screen.getByRole("button", { name: /reconnect quickbooks/i }));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toEqual({ action: "connect", businessId: "biz-1" });
  });

  describe.each(QBO_CONNECT_ERROR_CODES)("?quickbooks_error=%s", (code) => {
    it("shows a clear, owner-safe message and never reflects the raw code", async () => {
      searchParamsValue = `quickbooks_error=${code}`;
      await renderReady();
      const notice = screen.getByRole("alert");
      expect(notice.textContent).toBeTruthy();
      expect(notice.textContent).not.toMatch(new RegExp(`\\b${code}\\b`));
    });
  });

  it("?quickbooks_error=invalid_state shows a clear, actionable message", async () => {
    searchParamsValue = "quickbooks_error=invalid_state";
    await renderReady();
    const notice = screen.getByRole("alert");
    expect(notice.textContent).toMatch(/expired or was already used/i);
    expect(notice.textContent).not.toMatch(/invalid_state/);
  });

  it("an unmapped/garbage ?quickbooks_error value shows the generic message and is never reflected", async () => {
    searchParamsValue = `quickbooks_error=${encodeURIComponent("<script>alert(1)</script>")}`;
    await renderReady();
    const notice = screen.getByRole("alert");
    expect(notice.textContent).toMatch(/something went wrong connecting to quickbooks/i);
    expect(notice.textContent).not.toMatch(/script/i);
    expect(document.querySelectorAll("script").length).toBe(0);
  });

  it("?quickbooks=connected shows a success message", async () => {
    searchParamsValue = "quickbooks=connected";
    await renderReady();
    const notice = screen.getByRole("status", { name: undefined });
    expect(notice.textContent).toMatch(/quickbooks is connected/i);
  });

  it("never renders the word 'token' anywhere on the page", async () => {
    await renderReady();
    fireEvent.click(screen.getByRole("button", { name: /^disconnect$/i }));
    await screen.findByRole("dialog", { name: /disconnect quickbooks/i });
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/token/);
  });

  it("poll ordering: a slower, older status response never overwrites a newer one already applied", async () => {
    vi.useFakeTimers();
    currentDto = connectedDto({
      lastSyncRecords: 1,
      sync: {
        phase: "INCREMENTAL",
        running: true,
        lastRunStatus: null,
        lastRunAt: null,
        lastRunSummary: null,
        initialProgress: null,
        freshness: "STALE",
      },
    });

    render(<OwnerIntegrationsPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("quickbooks-card")).toBeTruthy();
    expect(screen.getByText(/syncing with quickbooks/i)).toBeTruthy();

    // Two poll ticks fire (5s apart) before either of their GET responses resolves — the second
    // (newer) request's response arrives and is applied first; the first (older, seq-stale)
    // request's response arrives afterwards and must be dropped, not overwrite it.
    const older = createDeferred<Response>();
    const newer = createDeferred<Response>();
    statusResponseQueue.push(() => older.promise, () => newer.promise);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    const newerDto = connectedDto({
      lastSyncRecords: 999,
      sync: {
        phase: "INCREMENTAL",
        running: false,
        lastRunStatus: "SUCCESS",
        lastRunAt: "2026-09-25T09:00:00.000Z",
        lastRunSummary: "Synced.",
        initialProgress: null,
        freshness: "FRESH",
      },
    });
    await act(async () => {
      newer.resolve(statusResponse(newerDto));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(within(screen.getByTestId("quickbooks-connected")).getByText("999")).toBeTruthy();

    const olderDto = connectedDto({ lastSyncRecords: 1 });
    await act(async () => {
      older.resolve(statusResponse(olderDto));
      await Promise.resolve();
      await Promise.resolve();
    });
    // Still 999 — the older/stale response must have been dropped, not applied.
    expect(within(screen.getByTestId("quickbooks-connected")).getByText("999")).toBeTruthy();
    expect(screen.queryByText("1")).toBeNull();
  });

  it("F6: a background poll tick that fails shows a subtle refresh note, keeping the last good DTO on screen", async () => {
    vi.useFakeTimers();
    currentDto = connectedDto({
      companyName: "Acme Bakery LLC",
      sync: {
        phase: "INCREMENTAL",
        running: true,
        lastRunStatus: null,
        lastRunAt: null,
        lastRunSummary: null,
        initialProgress: null,
        freshness: "STALE",
      },
    });

    render(<OwnerIntegrationsPage />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(within(screen.getByTestId("quickbooks-connected")).getByText("Acme Bakery LLC")).toBeTruthy();
    expect(screen.queryByTestId("quickbooks-refresh-note")).toBeNull();

    statusResponseQueue.push(() =>
      Promise.resolve({ ok: false, json: async () => ({ error: { message: "Couldn't reach QuickBooks." } }) } as Response),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const note = screen.getByTestId("quickbooks-refresh-note");
    expect(note.textContent).toMatch(/couldn't refresh status/i);
    // The last good DTO is still shown underneath — never replaced by an error screen.
    expect(within(screen.getByTestId("quickbooks-connected")).getByText("Acme Bakery LLC")).toBeTruthy();
  });
});
