"use client";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { useState } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Fixed, public-safe copy for any failed resend attempt. This is an anonymous,
// unauthenticated identity endpoint — the response body is never rendered here,
// regardless of status code or failure reason, so a server/provider/database
// detail can never reach this client.
const RESEND_FAILURE_MESSAGE =
  "We couldn't send a verification email right now. Please try again shortly.";

export default function ResendVerificationPage() {
  const [email, setEmail] = useState("");
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
          <h1 className="text-2xl font-bold text-primary">Resend verification email</h1>
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
          <Link href="/login" className="text-[var(--primary-text)] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
