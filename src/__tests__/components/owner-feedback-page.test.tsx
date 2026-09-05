/**
 * /owner/feedback — error-rendering safety regression.
 *
 * The save-error path already runs through classifyOperatorError(...)
 * .operatorMessage (see src/app/(authenticated)/owner/feedback/page.tsx).
 * This proves the guarantee end-to-end: whatever raw text a failed
 * POST /api/feedback carries, only the governed operator-safe message ever
 * reaches the DOM — never the server's own error string or a raw
 * Error#message.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import FeedbackPage from "@/app/(authenticated)/owner/feedback/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const RAW_SERVER_TEXT =
  "PrismaClientKnownRequestError: connection to database at 10.0.4.12:5432 refused";

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "BUG" } });
  fireEvent.change(screen.getByLabelText(/what happened/i), {
    target: { value: "Something broke on the goals page." },
  });
}

describe("FeedbackPage — governed error rendering", () => {
  it("never renders the server's raw error string on a failed submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: RAW_SERVER_TEXT }),
      }))
    );

    render(<FeedbackPage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(screen.queryByText(RAW_SERVER_TEXT)).toBeNull();
    });
    // A governed, non-empty message is still shown to the user.
    expect(document.querySelector(".text-destructive")?.textContent?.length).toBeGreaterThan(0);
  });

  it("never renders a raw thrown Error#message (e.g. a network failure) on submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch: ENOTFOUND internal-db-host.corp.local");
      })
    );

    render(<FeedbackPage />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(screen.queryByText(/internal-db-host\.corp\.local/i)).toBeNull();
      expect(screen.queryByText(/ENOTFOUND/i)).toBeNull();
    });
    expect(document.querySelector(".text-destructive")?.textContent?.length).toBeGreaterThan(0);
  });
});
