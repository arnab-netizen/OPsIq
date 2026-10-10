"use client";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

// Fixed, public-safe copy for any failed resend attempt. This is an anonymous,
// unauthenticated identity endpoint — the response body is never rendered here,
// regardless of status code or failure reason, so a server/provider/database
// detail can never reach this client.
const RESEND_FAILURE_MESSAGE =
  "We couldn't send a verification email right now. Please try again shortly.";

export default function ResendVerificationPage() {
  return (
    // useSearchParams() requires a Suspense boundary above it, same as
    // src/app/verify-email/page.tsx and src/app/reset-password/page.tsx.
    <Suspense fallback={null}>
      <ResendVerificationForm />
    </Suspense>
  );
}

function ResendVerificationForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams?.get("email") ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFailed(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setSubmitted(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm">
        <div className="text-center">
          <p className="text-sm font-bold text-primary">
            <Link href="/" className="inline-flex min-h-11 items-center">OpsIQ</Link>
          </p>
          <h1 className="mt-1 text-2xl font-bold text-primary">Resend verification email</h1>
        </div>

        {submitted ? (
          <p className="text-center text-sm text-muted-foreground">
            If an account is awaiting verification for that email, we&rsquo;ve sent a new link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
            {failed && (
              <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                {RESEND_FAILURE_MESSAGE}
              </div>
            )}
            <Button type="submit" isLoading={loading} className="w-full">
              Resend link
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="inline-flex min-h-11 items-center text-[var(--primary-text)] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
