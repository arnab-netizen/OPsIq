"use client";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

// useSearchParams() requires a Suspense boundary above it — without one, Next's
// build-time prerender of this page's static shell fails outright (it's a hard
// build error, not just a warning), even with dynamic = "force-dynamic".
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Named formError/setFormError, not error/setError: this holds only a fixed,
  // pre-approved copy string (a client-side check or the server's own governed
  // response), never a raw exception -- distinct naming keeps that obvious at
  // the call site.
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
        return;
      }

      setSuccess(true);
      // Every existing session for this account was just revoked server-side,
      // so this is a fresh sign-in, not a resumed session — send the user to
      // /login rather than logging them in automatically.
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm text-center">
          <h1 className="text-2xl font-bold text-primary">OpsIQ</h1>
          <p className="text-sm text-destructive">
            This password reset link is invalid or missing its token.
          </p>
          <Link href="/forgot-password" className="text-sm text-[var(--primary-text)] hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">OpsIQ</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set a new password</p>
        </div>

        {success ? (
          <p className="text-center text-sm text-foreground" role="status">
            Your password has been reset. Redirecting you to sign in&hellip;
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
              minLength={8}
              autoComplete="new-password"
            />

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <Button type="submit" isLoading={loading} className="w-full">
              Reset password
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
