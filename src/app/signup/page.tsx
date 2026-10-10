"use client";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { PasswordInput } from "@/ui/primitives/password-input";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { reportAnonymousProductEvent } from "@/lib/analytics/product-event-client";

export const dynamic = "force-dynamic";

// Fixed, public-safe fallback for any failure that isn't a governed server
// `error` string (a network failure, a non-JSON response body, etc.) — this
// route is Internet-facing, so a caught exception's own .message is never an
// acceptable source of user-facing text here.
const SIGNUP_FAILURE_FALLBACK = "We couldn't create your account right now. Please try again.";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptBetaNotice, setAcceptBetaNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [betaEnabled, setBetaEnabled] = useState<boolean | null>(null);
  const [admissionMode, setAdmissionMode] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState(false);
  // signup_started: the first time the visitor engages with the form (once per page load, name only).
  const startedReported = useRef(false);
  function reportSignupStarted() {
    if (startedReported.current) return;
    startedReported.current = true;
    reportAnonymousProductEvent("signup_started");
  }

  // Display-only: the server independently re-checks real admission on every
  // POST /api/auth/signup regardless of what this returns, so this check can
  // never be used to open a registration window the server has closed — it
  // only controls whether the form is shown/submittable or a "closed" notice
  // is, and (via `admissionMode`) which non-authoritative copy is shown above
  // the form. `enabled` reflects whether the FORM is worth attempting (true
  // under INVITE_ONLY or OPEN_BETA — an invited visitor must be able to
  // submit; the server decides per-email whether they're actually admitted),
  // not whether every visitor will succeed. `admissionMode` is read from the
  // same response only to pick which already-true copy to show (e.g. an
  // "invite required" note under INVITE_ONLY) — it never gates the form
  // itself and introduces no second admission decision.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/beta-status")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setBetaEnabled(Boolean(data?.enabled));
          setAdmissionMode(typeof data?.admissionMode === "string" ? data.admissionMode : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBetaEnabled(false);
          setAdmissionMode(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isInviteOnly = admissionMode === "INVITE_ONLY";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          workspaceName,
          acceptTerms,
          acceptPrivacy,
          acceptBetaNotice,
        }),
      });

      if (!res.ok) {
        // data.error is always a fixed, server-governed string on this route
        // (see /api/auth/signup/route.ts) — never raw internal/Prisma/stack
        // text — but a parse failure or an unexpected shape still falls back
        // to the fixed client-side copy rather than trusting the body blindly.
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === "string" ? data.error : SIGNUP_FAILURE_FALLBACK);
        return;
      }

      setPendingVerification(true);
    } catch {
      // Network failure, JSON parse failure, or anything else thrown before a
      // response body was safely read — never render the exception's own
      // .message, which is not a governed/public-safe string.
      setError(SIGNUP_FAILURE_FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  if (pendingVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-background p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-primary">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to <strong>{email}</strong>. Click it to activate your
            account and sign in.
          </p>
          <p className="text-xs text-muted-foreground">
            Didn&rsquo;t get it?{" "}
            <Link href="/resend-verification" className="text-[var(--primary-text)] hover:underline">
              Resend the verification email
            </Link>
            .
          </p>
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
          <p className="mt-1 text-sm text-muted-foreground">Create your account &mdash; beta access</p>
        </div>

        {betaEnabled === false && (
          <div className="rounded bg-muted p-3 text-sm text-muted-foreground">
            Beta registration isn&rsquo;t open right now. Please check back soon.
          </div>
        )}

        {betaEnabled !== false && (
          <>
            {isInviteOnly && (
              <div className="rounded border border-border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                OpsIQ is invite-only right now. If you&rsquo;ve been invited, enter your details
                below to finish creating your account. If you don&rsquo;t have an invite, you can{" "}
                <Link href="/" className="text-[var(--primary-text)] hover:underline">
                  request beta access from the homepage
                </Link>{" "}
                instead.
              </div>
            )}

            <div className="rounded border border-border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
              <strong>Do not upload:</strong> passwords, API keys, payment-card data, government
              IDs, health data, sensitive employee/customer personal data, or other regulated
              secrets. OpsIQ is for business operations, business metrics, and financial/business
              performance data. See{" "}
              <Link href="/beta" className="text-[var(--primary-text)] hover:underline">
                the Beta notice
              </Link>
              .
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={reportSignupStarted}
                placeholder="you@company.com"
                required
                autoComplete="email"
                disabled={betaEnabled === null}
              />
              <PasswordInput
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="new-password"
                minLength={8}
                disabled={betaEnabled === null}
              />
              <Input
                label="Business name"
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Your company name"
                required
                disabled={betaEnabled === null}
              />

              <div className="space-y-2 text-xs text-muted-foreground">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    required
                    className="mt-0.5"
                  />
                  <span>
                    I accept the{" "}
                    <Link href="/terms" target="_blank" className="text-[var(--primary-text)] hover:underline">
                      Terms
                    </Link>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(e) => setAcceptPrivacy(e.target.checked)}
                    required
                    className="mt-0.5"
                  />
                  <span>
                    I accept the{" "}
                    <Link href="/privacy" target="_blank" className="text-[var(--primary-text)] hover:underline">
                      Privacy notice
                    </Link>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acceptBetaNotice}
                    onChange={(e) => setAcceptBetaNotice(e.target.checked)}
                    required
                    className="mt-0.5"
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

              {error && (
                <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                isLoading={loading}
                className="w-full"
                disabled={betaEnabled !== true || !acceptTerms || !acceptPrivacy || !acceptBetaNotice}
              >
                Create Account
              </Button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--primary-text)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
