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
  fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Acme" } });
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

/**
 * UX-06 Wave A1 (Section G10): the owner-visible field label changed from
 * "Workspace Name" to "Business name", but the internal workspaceName field and the
 * API payload it produces must not change — this proves the rename is UI-only.
 */
describe("SignupPage — Business name label (UX-06 Wave A1)", () => {
  it("shows a 'Business name' field and no 'Workspace Name' label anywhere", async () => {
    mockBetaStatus({ enabled: true, admissionMode: "OPEN_BETA" });
    render(<SignupPage />);
    await waitFor(() => expect(screen.getByLabelText(/email/i)).not.toBeDisabled());

    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace Name")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace Name")).not.toBeInTheDocument();
  });

  it("still submits the API payload's workspaceName field under the 'Business name' UI label", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/auth/beta-status")) {
          return { ok: true, json: async () => ({ enabled: true, admissionMode: "OPEN_BETA" }) } as Response;
        }
        if (url.includes("/api/auth/signup") && init?.body) {
          capturedBody = JSON.parse(init.body as string);
          return {
            ok: true,
            status: 201,
            json: async () => ({ success: true, pendingVerification: true, user: {}, workspace: {} }),
          } as Response;
        }
        return Promise.reject(new Error("unexpected fetch in this test"));
      })
    );

    render(<SignupPage />);
    await fillAndSubmit();

    await waitFor(() => expect(capturedBody).not.toBeNull());
    // Exactly email + business name: no password and no consent ever leaves the signup page.
    expect(capturedBody).toEqual({ email: "a@example.com", workspaceName: "Acme" });
  });
});

/**
 * Email ownership before credential trust: signup collects NO secret and NO consent. The password and the three
 * policy acceptances are chosen after the mailbox is proven (see reset-password setup mode).
 */
describe("SignupPage — no credential or consent before email ownership", () => {
  it("renders only the email and business name inputs: no password field, no consent checkboxes", async () => {
    mockBetaStatus({ enabled: true, admissionMode: "OPEN_BETA" });
    render(<SignupPage />);
    await waitFor(() => expect(screen.getByLabelText(/email/i)).not.toBeDisabled());

    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /show password/i })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByText(/after confirming your email/i)).toBeTruthy();
  });

  it("the submit button is enabled without any consent step", async () => {
    mockBetaStatus({ enabled: true, admissionMode: "OPEN_BETA" });
    render(<SignupPage />);
    await waitFor(() => expect(screen.getByLabelText(/email/i)).not.toBeDisabled());
    expect(screen.getByRole("button", { name: /create account/i })).not.toBeDisabled();
  });
});
