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
              <p className="text-xs text-muted-foreground">{loginMutation.error.recovery}</p>
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
