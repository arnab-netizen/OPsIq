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
