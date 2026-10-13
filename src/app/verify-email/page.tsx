"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

type Status = "ready" | "verifying" | "redirecting" | "error";

// useSearchParams() requires a Suspense boundary above it — without one, Next's
// build-time prerender of this page's static shell fails outright (it's a hard
// build error, not just a warning), even with dynamic = "force-dynamic".
// (Same pattern as src/app/reset-password/page.tsx.)
//
// SCANNER-SAFE BY CONSTRUCTION: loading this page (a plain GET, a prefetch, a
// link-scanner or crawler that executes JavaScript) performs NO request at all.
// The single-use token is redeemed only by an explicit human click on the
// button below, which sends the one state-changing POST.
function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>(token ? "ready" : "error");
  const [message, setMessage] = useState<string>(
    token ? "" : "This verification link is missing its token."
  );

  // A verification token is single-use. The ref closes the window between a click and React re-rendering the
  // button as disabled, so a fast double-click (or double tap) can never send a second POST that would find the
  // token already used and show a false failure.
  const submitted = useRef(false);

  async function handleVerify() {
    if (!token || submitted.current) return;
    submitted.current = true;
    setStatus("verifying");
    setMessage("");

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        // A refused redemption (used / expired / 429 / capacity) must not leave the guard stuck: the owner can try again
        // (or move on) without reloading the page.
        submitted.current = false;
        setStatus("error");
        setMessage(typeof data?.error === "string" ? data.error : "Verification failed.");
        return;
      }
      setStatus("redirecting");
      if (data.next === "set-password" && typeof data.setupToken === "string") {
        // Mailbox ownership is now proven: the person chooses their password (and accepts the policies) next.
        router.replace(`/reset-password?token=${encodeURIComponent(data.setupToken)}&setup=1`);
      } else {
        router.replace("/login");
      }
    } catch {
      submitted.current = false;
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-background p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary">
          <Link href="/" className="inline-flex min-h-11 items-center">OpsIQ</Link>
        </h1>
        {(status === "ready" || status === "verifying") && (
          <>
            <p className="text-sm text-muted-foreground">
              Confirm that this email address is yours. You&rsquo;ll choose your password next.
            </p>
            <button
              type="button"
              onClick={handleVerify}
              disabled={status === "verifying"}
              data-testid="verify-email-button"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {status === "verifying" ? "Verifying…" : "Verify my email"}
            </button>
          </>
        )}
        {status === "redirecting" && (
          <p role="status" className="text-sm text-muted-foreground">Email verified. Taking you to the next step&hellip;</p>
        )}
        {status === "error" && (
          <>
            <div role="alert" className="rounded bg-destructive/10 p-3 text-sm text-destructive">{message}</div>
            <p className="text-sm text-muted-foreground" data-testid="verify-already-done">
              A link works once. If you already confirmed your email:{" "}
              <Link href="/login" className="inline-flex min-h-11 items-center text-[var(--primary-text)] hover:underline">
                Sign in
              </Link>
              {" "}or{" "}
              <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-[var(--primary-text)] hover:underline">
                reset your password
              </Link>
              .
            </p>
            <p className="text-sm text-muted-foreground">
              <Link href="/resend-verification" className="inline-flex min-h-11 items-center text-[var(--primary-text)] hover:underline">
                Request a new verification link
              </Link>
            </p>
            {token && (
              <button
                type="button"
                onClick={handleVerify}
                data-testid="verify-email-retry"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium"
              >
                Try this link again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
