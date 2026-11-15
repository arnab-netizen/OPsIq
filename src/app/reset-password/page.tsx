"use client";

import { Button } from "@/ui/primitives/button";
import { PasswordInput } from "@/ui/primitives/password-input";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** The guided way forward for a link that no longer works. Static copy: it reveals nothing about any account. */
function NewLinkHelp() {
  return (
    <div className="space-y-2 text-center" data-testid="new-link-help">
      <p className="text-xs text-muted-foreground">Links work once and expire after an hour.</p>
      <Link
        href="/forgot-password"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Send me a new link
      </Link>
    </div>
  );
}

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
  // `setup=1` only selects which copy/fields the page shows. It grants nothing: the server decides from the
  // account's real state whether this is a first-time password setup (and then demands the three consents).
  const setupParam = searchParams.get("setup") === "1";
  const [serverRequiresSetup, setServerRequiresSetup] = useState(false);
  const isSetup = setupParam || serverRequiresSetup;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Named formError/setFormError, not error/setError: this holds only a fixed,
  // pre-approved copy string (a client-side check or the server's own governed
  // response), never a raw exception -- distinct naming keeps that obvious at
  // the call site.
  const [formError, setFormError] = useState<string | null>(null);
  // True when the failure is about the LINK itself (invalid / expired / already used, or the server could not process
  // it), not a fixable form mistake: the owner then gets the guided way forward instead of a dead end.
  const [linkProblem, setLinkProblem] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptBetaNotice, setAcceptBetaNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLinkProblem(false);

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    if (isSetup && !(acceptTerms && acceptPrivacy && acceptBetaNotice)) {
      setFormError("Please accept the Terms, the Privacy notice and the Beta notice to continue.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSetup ? { token, password, acceptTerms, acceptPrivacy, acceptBetaNotice } : { token, password }
        ),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "consent_required") setServerRequiresSetup(true);
        setFormError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
        setLinkProblem(
          res.status >= 500 || (res.status === 400 && data.code !== "consent_required" && /invalid or has expired/i.test(String(data.error ?? "")))
        );
        return;
      }

      const data = await res.json().catch(() => ({}));
      setSuccess(true);
      // First-time setup: the server has already signed the proven owner in, so go straight into the product.
      if (typeof data.redirectTo === "string" && data.redirectTo.startsWith("/") && !data.redirectTo.startsWith("//")) {
        router.replace(data.redirectTo);
        return;
      }
      // Every existing session for this account was just revoked server-side,
      // so this is a fresh sign-in, not a resumed session — send the user to
      // /login rather than logging them in automatically.
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setFormError("Something went wrong. Please try again.");
      setLinkProblem(true);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm text-center">
          <h1 className="text-2xl font-bold text-primary">
            <Link href="/">OpsIQ</Link>
          </h1>
          <p className="text-sm text-destructive">
            This password reset link is invalid or missing its token.
          </p>
          <NewLinkHelp />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">
            <Link href="/">OpsIQ</Link>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{isSetup ? "Choose your password" : "Set a new password"}</p>
        </div>

        {success ? (
          <p className="text-center text-sm text-foreground" role="status">
            {isSetup ? "Your password is set. Taking you in\u2026" : "Your password has been reset. Redirecting you to sign in\u2026"}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordInput
              label={isSetup ? "Password" : "New password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <PasswordInput
              label={isSetup ? "Confirm password" : "Confirm new password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
              minLength={8}
              autoComplete="new-password"
            />

            {isSetup && (
              <div className="space-y-1 text-sm text-muted-foreground">
                <label className="flex min-h-11 items-start gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    required
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    I accept the{" "}
                    <Link href="/terms" target="_blank" className="text-[var(--primary-text)] hover:underline">
                      Terms
                    </Link>
                  </span>
                </label>
                <label className="flex min-h-11 items-start gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(e) => setAcceptPrivacy(e.target.checked)}
                    required
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    I accept the{" "}
                    <Link href="/privacy" target="_blank" className="text-[var(--primary-text)] hover:underline">
                      Privacy notice
                    </Link>
                  </span>
                </label>
                <label className="flex min-h-11 items-start gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={acceptBetaNotice}
                    onChange={(e) => setAcceptBetaNotice(e.target.checked)}
                    required
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    I accept the{" "}
                    <Link href="/beta" target="_blank" className="text-[var(--primary-text)] hover:underline">
                      Beta notice
                    </Link>{" "}
                    (free during beta, no guaranteed outcomes)
                  </span>
                </label>
              </div>
            )}

            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
            {linkProblem && <NewLinkHelp />}

            <Button
              type="submit"
              isLoading={loading}
              className="w-full"
              disabled={isSetup && !(acceptTerms && acceptPrivacy && acceptBetaNotice)}
            >
              {isSetup ? "Set password and continue" : "Reset password"}
            </Button>
            {isSetup && !(acceptTerms && acceptPrivacy && acceptBetaNotice) && (
              <p className="text-center text-xs text-muted-foreground" data-testid="setup-consent-hint">
                Tick all three boxes to continue
              </p>
            )}
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
