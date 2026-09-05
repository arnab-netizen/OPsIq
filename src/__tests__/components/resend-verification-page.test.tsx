/**
 * /resend-verification — error-rendering safety + enumeration-resistance
 * regression.
 *
 * This is a public, unauthenticated identity endpoint's client page. It must
 * never render a server response body or a caught exception's own message —
 * only a fixed, generic failure string — and its success copy must stay
 * byte-identical to the API route's GENERIC_RESPONSE regardless of whether
 * the submitted email corresponds to a real account (enumeration
 * resistance), since a page that showed different text for the two cases
 * would itself be the leak.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import ResendVerificationPage from "@/app/resend-verification/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SUCCESS_COPY =
  "If an account is awaiting verification for that email, we’ve sent a new link.";
const FIXED_FAILURE_COPY =
  "We couldn't send a verification email right now. Please try again shortly.";

function submit(email: string) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /resend link/i }));
}

describe("ResendVerificationPage — governed error rendering", () => {
  it("never renders the server's raw error body on a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "ECONNREFUSED 10.0.0.9:5432 — pg pool exhausted" }),
      }))
    );

    render(<ResendVerificationPage />);
    submit("someone@example.com");

    await waitFor(() => {
      expect(screen.getByText(FIXED_FAILURE_COPY)).toBeTruthy();
    });
    expect(screen.queryByText(/ECONNREFUSED/i)).toBeNull();
    expect(screen.queryByText(/10\.0\.0\.9/)).toBeNull();
  });

  it("never renders a raw thrown Error#message on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch: internal-smtp-relay.corp.local unreachable");
      })
    );

    render(<ResendVerificationPage />);
    submit("someone@example.com");

    await waitFor(() => {
      expect(screen.getByText(FIXED_FAILURE_COPY)).toBeTruthy();
    });
    expect(screen.queryByText(/internal-smtp-relay/i)).toBeNull();
  });

  it("shows the exact same success copy for a 200 response regardless of the (never observable) account-existence outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: SUCCESS_COPY,
        }),
      }))
    );

    render(<ResendVerificationPage />);
    submit("real-account@example.com");

    await waitFor(() => {
      expect(screen.getByText(SUCCESS_COPY)).toBeTruthy();
    });
  });
});
