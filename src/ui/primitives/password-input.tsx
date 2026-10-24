"use client";

import { type InputHTMLAttributes, forwardRef, useId, useState } from "react";

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

/**
 * Dedicated password field with a Show/Hide toggle (UX-06 Section P). Kept separate
 * from the shared `Input` primitive so this one behavior does not widen the blast
 * radius of every other text/number field the app renders through `Input`.
 *
 * Deliberately carries no generic `error`/`hint` prop: every current call site
 * (Login/Signup/Reset-password) already renders its own governed, page-level error
 * text independently, and a bare `{error}` render here would bypass
 * operator-error-governance (UX-06A1 hostile-audit remediation).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { label, className = "", id, disabled, ...props },
    ref
  ) {
    const generatedId = useId();
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-") ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            disabled={disabled}
            className={`h-11 w-full rounded-md border border-border bg-background px-3 py-2 pr-16 text-base transition-colors sm:h-10 sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            disabled={disabled}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
      </div>
    );
  }
);
