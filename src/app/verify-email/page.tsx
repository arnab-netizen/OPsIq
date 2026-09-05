"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
    }

    let cancelled = false;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "Verification failed.");
          return;
        }
        setStatus("success");
        // A verified visit already holds a fresh session cookie — send them
        // straight into the product rather than back through login.
        window.setTimeout(() => {
          window.location.href = "/owner/data";
        }, 1500);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setMessage("Something went wrong. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-background p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary">OpsIQ</h1>
        {status === "verifying" && (
          <p className="text-sm text-muted-foreground">Verifying your email&hellip;</p>
        )}
        {status === "success" && (
          <p className="text-sm text-muted-foreground">
            Email verified. Taking you to your workspace&hellip;
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
          </>
        )}
      </div>
    </div>
  );
}
