/**
 * /admin/beta-requests — minimal owner review page.
 *
 * Authorization is enforced server-side by the underlying APIs
 * (BETA_REQUEST_REVIEW / BETA_REQUEST_INVITE); this page only renders
 * whatever those APIs return, including a 403. These tests stub `fetch`
 * directly (same pattern as owner-feedback-page.test.tsx) rather than
 * hitting a real API route.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminBetaRequestsPage from "@/app/(authenticated)/admin/beta-requests/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ONE_ROW = {
  betaRequests: [
    {
      id: "req-1",
      email: "ada@example.com",
      firstName: "Ada",
      status: "REQUESTED",
      utmSource: "google",
      utmCampaign: "launch",
      invitedAt: null,
      invitedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  pagination: { limit: 25, cursor: null, nextCursor: null, hasMore: false },
};

describe("AdminBetaRequestsPage", () => {
  it("shows a loading state before data arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AdminBetaRequestsPage />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("renders the list once loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(ONE_ROW)));
    render(<AdminBetaRequestsPage />);
    await waitFor(() => {
      expect(screen.getByText("ada@example.com")).toBeTruthy();
    });
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByRole("button", { name: /invite/i })).toBeTruthy();
  });

  it("renders an empty state when there are no requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ betaRequests: [], pagination: { limit: 25, cursor: null, nextCursor: null, hasMore: false } }))
    );
    render(<AdminBetaRequestsPage />);
    await waitFor(() => {
      expect(screen.getByText(/no beta requests/i)).toBeTruthy();
    });
  });

  it("renders a permission-denied state on a 403, not a generic error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "forbidden" }, 403)));
    render(<AdminBetaRequestsPage />);
    await waitFor(() => {
      expect(screen.getByText(/access restricted/i)).toBeTruthy();
    });
  });

  it("renders a governed error state (with retry) on an unexpected failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "boom" }, 500)));
    render(<AdminBetaRequestsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    });
  });

  it("invites a request: sends an idempotency-key header and updates the row on success", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/beta-requests") return jsonResponse(ONE_ROW);
      if (url.includes("/invite")) {
        expect(init?.headers).toMatchObject({ "idempotency-key": expect.stringContaining("beta-invite-req-1") });
        return jsonResponse({ id: "req-1", status: "INVITED", invitedAt: "2026-01-02T00:00:00.000Z", invitedBy: "actor-1" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminBetaRequestsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /invite/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    await waitFor(() => {
      expect(screen.getByText("INVITED")).toBeTruthy();
    });
    // Never claims the email was delivered -- only that the status changed.
    expect(screen.queryByText(/email sent/i)).toBeNull();
  });

  it("shows a per-row error and re-enables the button when the invite call fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/admin/beta-requests") return jsonResponse(ONE_ROW);
      if (url.includes("/invite")) return jsonResponse({ error: "boom" }, 500);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminBetaRequestsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /invite/i })).toBeTruthy());

    const button = screen.getByRole("button", { name: /invite/i }) as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => {
      expect(button.disabled).toBe(false);
    });
    // Row status is unchanged -- still shows the original REQUESTED state, not INVITED.
    expect(screen.queryByText("INVITED")).toBeNull();
  });
});
