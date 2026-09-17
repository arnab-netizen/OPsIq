/**
 * /signup — client-side error-rendering safety regression.
 *
 * This is a public, Internet-facing registration endpoint. Its route
 * (/api/auth/signup) only ever returns a fixed, governed `error` string in
 * its JSON body (verified by reading every response branch in
 * src/app/api/auth/signup/route.ts — beta-disabled, beta-cap, validation,
 * conflict, and the generic fallback are all fixed strings; no Prisma/stack
 * text is ever placed in the `error` field). This test proves the client
 * still never trusts a caught exception's own .message (a JSON-parse
 * failure, a network failure) and falls back to a fixed, public-safe string
 * instead.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import SignupPage from "@/app/signup/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FIXED_FALLBACK = "We couldn't create your account right now. Please try again.";

async function fillAndSubmit() {
  await waitFor(() => expect(screen.getByLabelText(/email/i)).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@example.com" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: "Acme" } });
  fireEvent.click(screen.getByLabelText(/Terms/i));
  fireEvent.click(screen.getByLabelText(/Privacy notice/i));
  fireEvent.click(screen.getByLabelText(/Beta notice/i));
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

function mockBetaStatusThen(handler: (input: RequestInfo | URL) => Promise<unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/beta-status")) {
        return Promise.resolve({ ok: true, json: async () => ({ enabled: true }) });
      }
      return handler(input) as never;
    })
  );
}

function mockBetaStatus(response: { enabled: boolean; admissionMode?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/beta-status")) {
        return Promise.resolve({ ok: true, json: async () => response });
      }
      return Promise.reject(new Error("unexpected fetch in this test"));
    })
  );
}

describe("SignupPage — governed error rendering", () => {
  it("renders the server's fixed governed error string on a 4xx/5xx JSON response", async () => {
    mockBetaStatusThen(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ success: false, error: "Email already in use" }),
      })
    );

    render(<SignupPage />);
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("Email already in use")).toBeTruthy();
    });
  });

  it("never renders a raw thrown Error#message when the response body isn't valid JSON", async () => {
    mockBetaStatusThen(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError("Unexpected token I in JSON at position 0 (Internal Server Error)");
        },
      })
    );

    render(<SignupPage />);
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(FIXED_FALLBACK)).toBeTruthy();
    });
    expect(screen.queryByText(/Unexpected token/i)).toBeNull();
  });

  it("never renders a raw thrown Error#message on a network failure", async () => {
    mockBetaStatusThen(() =>
      Promise.reject(new TypeError("Failed to fetch: internal-auth-db.corp.local unreachable"))
    );

    render(<SignupPage />);
    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText(FIXED_FALLBACK)).toBeTruthy();
    });
    expect(screen.queryByText(/internal-auth-db/i)).toBeNull();
  });
});

/**
 * Root cause under regression test here: /signup previously showed a static
 * "Create your account — open beta" heading and a fully-fillable form
 * regardless of the real runtime admission mode, so an uninvited visitor
 * under INVITE_ONLY saw no indication an invite was required until after
 * submitting the whole form. The page now derives an invite-only notice from
 * the same GET /api/auth/beta-status response that already gates form
 * enablement (`admissionMode`), without adding a second client-side
 * admission decision, and never renders "open beta" copy.
 */
describe("SignupPage — admission-mode wording", () => {
  it("shows an invite-only notice and never says 'open beta' when the mode is INVITE_ONLY", async () => {
    mockBetaStatus({ enabled: true, admissionMode: "INVITE_ONLY" });
    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText(/invite-only right now/i)).toBeTruthy();
    });
    expect(screen.getByText(/request beta access from the homepage/i)).toBeTruthy();
    expect(screen.queryByText(/open beta/i)).toBeNull();
  });

  it("does not show the invite-only notice when the mode is OPEN_BETA, and never says 'open beta'", async () => {
    mockBetaStatus({ enabled: true, admissionMode: "OPEN_BETA" });
    render(<SignupPage />);

    await waitFor(() => expect(screen.getByLabelText(/email/i)).not.toBeDisabled());
    expect(screen.queryByText(/invite-only right now/i)).toBeNull();
    expect(screen.queryByText(/open beta/i)).toBeNull();
  });

  it("shows a mode-neutral closed notice (not 'open beta registration is closed') when the form is disabled", async () => {
    mockBetaStatus({ enabled: false, admissionMode: "CLOSED" });
    render(<SignupPage />);

    await waitFor(() => {
      expect(screen.getByText(/beta registration isn.t open right now/i)).toBeTruthy();
    });
    expect(screen.queryByText(/open beta/i)).toBeNull();
  });
});
