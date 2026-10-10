"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

type Status = "verifying" | "success" | "error";

// useSearchParams() requires a Suspense boundary above it — without one, Next's
// build-time prerender of this page's static shell fails outright (it's a hard
// build error, not just a warning), even with dynamic = "force-dynamic".
// (Same pattern as src/app/reset-password/page.tsx.)
function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  // Derived directly from the URL at first render rather than set from
  // inside the effect below — the missing-token case needs no network call
  // and no effect at all, it's just the token's absence reflected as state.
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [message, setMessage] = useState<string>(
    token ? "" : "This verification link is missing its token."
  );

  // A verification token is single-use. The request is made exactly once per page load: React StrictMode (dev)
  // runs this effect twice, and a second POST would find the token already used and show a false failure.
  const requested = useRef(false);

  useEffect(() => {
    if (!token || requested.current) return;
    requested.current = true;

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "Verification failed.");
          return;
        }
        setStatus("success");
        // A verified visit already holds a fresh session cookie — send them
        // straight into the product rather than back through login.
        window.setTimeout(() => {
          window.location.href = "/owner/first-run";
        }, 1500);
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-background p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary">
          <Link href="/">OpsIQ</Link>
        </h1>
        {status === "verifying" && (
          <p className="text-sm text-muted-foreground">Verifying your email&hellip;</p>
        )}
        {status === "success" && (
          <p className="text-sm text-muted-foreground">
            Email verified. Taking you to your first read&hellip;
          </p>
        )}
        {status === "error" && (
          <>
            <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">{message}</div>
            <p className="text-sm text-muted-foreground">
              <Link href="/resend-verification" className="text-[var(--primary-text)] hover:underline">
                Request a new verification link
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              Already verified? A link can only be used once &mdash;{" "}
              <Link href="/login" className="text-[var(--primary-text)] hover:underline">
                sign in
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
