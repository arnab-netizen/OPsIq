"use client";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { useState } from "react";
import { useOperatorMutation, type MutationOptions } from "@/hooks/useOperatorMutation";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await loginMutation.mutate({ email, password });
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
            disabled={loginMutation.isLoading}
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            disabled={loginMutation.isLoading}
          />

          {loginMutation.isError && loginMutation.error && (
            <div className="rounded-lg border border-destructive bg-destructive/5 p-3 space-y-2">
              <p className="text-sm font-medium text-destructive">{loginMutation.error.operatorMessage}</p>
              {loginMutation.error.recovery && (
                <p className="text-xs text-muted-foreground">{loginMutation.error.recovery}</p>
              )}
            </div>
          )}

          {loginMutation.isLoading && (
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Authenticating... this may take a moment.</p>
            </div>
          )}

          <Button type="submit" isLoading={loginMutation.isLoading} className="w-full">
            {loginMutation.isLoading ? "Signing in..." : "Sign in"}
          </Button>

          <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">Need help?</p>
            <p className="text-xs text-muted-foreground">
              If you don't have login credentials, contact your system administrator. For account recovery, reach out to support.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
