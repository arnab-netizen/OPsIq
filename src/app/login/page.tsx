"use client";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { useRef, useState } from "react";
import { useOperatorMutation } from "@/hooks/useOperatorMutation";

export const dynamic = "force-dynamic";

// The exact operator-safe message useOperatorMutation/toOperatorSafeError produces
// for an AbortError (client timeout). Login creates a Session row unconditionally on
// success, so — unlike the hook's other retryable error classes, which never actually
// trigger its internal auto-retry — this is the one case that DID retry automatically
// before maxRetries was disabled below. Its stock "recovery" copy ("Automatic retry
// will attempt again") is no longer true for login and would invite an unsafe manual
// resubmit of a request that may have already succeeded server-side.
const TIMEOUT_OPERATOR_MESSAGE = "That took too long. Please try again.";
const TIMEOUT_RECOVERY_FOR_LOGIN =
  "Sign-in is taking longer than expected. Check whether you're already signed in before trying again.";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Synchronous guard against a second submit while one is in flight. React's
  // isLoading state (used to disable the button) updates asynchronously, so two
  // rapid submits (double-click, Enter pressed twice) can both fire before a
  // re-render disables it. A ref is checked and set synchronously within the same
  // event-handler call, so the second submit is ignored outright — it never reaches
  // mutate(), so it can neither replay the non-idempotent login POST nor abort the
  // first request that's still in flight.
  const submitInFlightRef = useRef(false);

  interface LoginResponse {
    success: boolean;
  }

  const loginMutation = useOperatorMutation<LoginResponse, { email: string; password: string }>({
    url: "/api/auth/login",
    method: "POST",
    operationName: "login",
    onSuccess: () => {
      window.location.href = "/dashboard";
    },
    timeoutMs: 15000,
    // Login is a non-idempotent create (each call unconditionally creates a new
    // Session row). A client-side abort does not stop the server from finishing an
    // already-dispatched request, so automatically re-sending on timeout can leave a
    // second, orphaned, unrevoked session with no cookie ever pointing to it. A
    // deliberate later retry by the user remains a distinct, independent action.
    maxRetries: 0,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    try {
      await loginMutation.mutate({ email, password });
    } finally {
      submitInFlightRef.current = false;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-background p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">OpsIQ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to continue
          </p>
        </div>

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
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
          />

          {loginMutation.isError && loginMutation.error && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{loginMutation.error.operatorMessage}</p>
              <p className="text-xs text-muted-foreground">
                {loginMutation.error.operatorMessage === TIMEOUT_OPERATOR_MESSAGE
                  ? TIMEOUT_RECOVERY_FOR_LOGIN
                  : loginMutation.error.recovery}
              </p>
            </div>
          )}

          <Button type="submit" isLoading={loginMutation.isLoading} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
