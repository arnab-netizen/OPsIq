/** The callback never leaves the browser on raw JSON: the page hops to My Business with ONE closed token. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import {
  QBO_OUTCOME_TOKENS, QBO_CONNECT_FAILURE_CODES, isQboOutcomeToken, qboOutcomeMessage, qboOutcomeRedirectPath, qboOutcomeTokenFromCallbackResponse,
} from "@/domain/quickbooks/qbo-connect-outcomes";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));
import QuickBooksCallbackPage from "@/app/(authenticated)/owner/integrations/quickbooks/callback/page";

describe("callback outcome tokens (domain)", () => {
  it("success / reconnect / every closed failure code map to their own lowercase token", () => {
    expect(qboOutcomeTokenFromCallbackResponse(200, { status: "CONNECTED", reconnected: false })).toBe("connected");
    expect(qboOutcomeTokenFromCallbackResponse(200, { status: "CONNECTED", reconnected: true })).toBe("reconnected");
    for (const code of QBO_CONNECT_FAILURE_CODES) {
      expect(qboOutcomeTokenFromCallbackResponse(400, { status: "FAILED", code, message: "x" })).toBe(code.toLowerCase());
    }
  });
  it("401/403 => signin_required; 5xx, unknown bodies and unknown codes => unavailable", () => {
    expect(qboOutcomeTokenFromCallbackResponse(401, { error: "x" })).toBe("signin_required");
    expect(qboOutcomeTokenFromCallbackResponse(403, null)).toBe("signin_required");
    expect(qboOutcomeTokenFromCallbackResponse(500, { error: "x" })).toBe("unavailable");
    expect(qboOutcomeTokenFromCallbackResponse(200, null)).toBe("unavailable");
    expect(qboOutcomeTokenFromCallbackResponse(400, { code: "<script>" })).toBe("unavailable");
    expect(qboOutcomeTokenFromCallbackResponse(200, { status: "CONNECTED_BUT_EVIL", message: "SECRET" })).toBe("unavailable");
  });
  it("tokens are a closed set with fixed owner sentences and fixed destination", () => {
    for (const tkn of QBO_OUTCOME_TOKENS) {
      expect(isQboOutcomeToken(tkn)).toBe(true);
      expect(qboOutcomeRedirectPath(tkn)).toBe(`/owner/data?quickbooks=${tkn}`);
      expect(qboOutcomeMessage(tkn)?.text.length).toBeGreaterThan(10);
    }
    expect(isQboOutcomeToken("<script>")).toBe(false);
    expect(qboOutcomeMessage("<script>")).toBeNull();
    expect(qboOutcomeMessage("user_denied")).toMatchObject({ tone: "info" });
  });
});

describe("callback page", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { replace.mockReset(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const at = (qs: string) => window.history.replaceState(null, "", `/owner/integrations/quickbooks/callback${qs}`);
  const json = (status: number, body: unknown) => Promise.resolve({ status, ok: status < 400, json: () => Promise.resolve(body) });

  it("forwards the query to the API ONCE and replaces to My Business with the success token", async () => {
    at("?code=C1&state=S1&realmId=1234");
    fetchMock.mockReturnValue(json(200, { status: "CONNECTED", reconnected: false, businessId: "b" }));
    const { rerender } = render(<QuickBooksCallbackPage />);
    rerender(<QuickBooksCallbackPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/owner/data?quickbooks=connected"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/owner/integrations/quickbooks/callback?code=C1&state=S1&realmId=1234");
  });
  it("a denial / failure body becomes its closed token; nothing from the query or body reaches the destination", async () => {
    at("?error=access_denied&state=S2&error_description=%3Cscript%3EEVIL");
    fetchMock.mockReturnValue(json(400, { status: "DENIED", code: "USER_DENIED", message: "SECRET-PROVIDER-TEXT" }));
    render(<QuickBooksCallbackPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const dest = replace.mock.calls[0][0] as string;
    expect(dest).toBe("/owner/data?quickbooks=user_denied");
    for (const s of ["EVIL", "SECRET", "S2", "state="]) expect(dest).not.toContain(s);
  });
  it("network failure and an expired session are handled with closed tokens", async () => {
    at("?code=C3&state=S3&realmId=1");
    fetchMock.mockRejectedValue(new Error("offline with secret-token"));
    render(<QuickBooksCallbackPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/owner/data?quickbooks=unavailable"));
    cleanup(); replace.mockReset();
    at("?code=C4&state=S4&realmId=1");
    fetchMock.mockReturnValue(json(401, { error: "Unauthorized" }));
    render(<QuickBooksCallbackPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/owner/data?quickbooks=signin_required"));
  });
  it("shows a plain-language interstitial, never JSON", async () => {
    at("?code=C5&state=S5&realmId=1");
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<QuickBooksCallbackPage />);
    expect(container.textContent).toMatch(/Finishing your QuickBooks connection/);
    expect(container.textContent).not.toMatch(/\{"|"status"/);
  });
});
