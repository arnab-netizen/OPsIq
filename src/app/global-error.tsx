"use client";

import { useEffect } from "react";
import { captureError } from "@/infra/observability";

/**
 * Global (root) error boundary. Must render its own <html>/<body>.
 *
 * Presentational only and user-safe: it never renders error.message,
 * error.stack, or any internal detail. Offers a retry and beta support contact.
 * The error is captured to observability (never rendered).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureError(error, { category: "UNEXPECTED_ERROR" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <div style={{ fontWeight: 700, fontSize: "1.25rem", color: "#4f46e5" }}>OpsIQ</div>
          <h1 style={{ fontWeight: 700, fontSize: "1.5rem", marginTop: "0.75rem" }}>Something went wrong</h1>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.5rem" }}>
            OpsIQ hit an unexpected error. You can try again, or return to the app. If it keeps
            happening, contact beta support and we&rsquo;ll help.
          </p>
          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ height: "2.75rem", padding: "0 1.5rem", borderRadius: "0.5rem", background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", fontWeight: 500 }}
            >
              Try again
            </button>
          </div>
          <p style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "1rem" }}>
            Contact beta support:{" "}
            <a href="mailto:support@opsiq.solutions" style={{ color: "#4f46e5" }}>
              support@opsiq.solutions
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
