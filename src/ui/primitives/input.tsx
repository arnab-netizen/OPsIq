"use client";

import { type InputHTMLAttributes, forwardRef, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, hint, className = "", id, "aria-describedby": ariaDescribedBy, ...props }, ref) {
    const generatedId = useId();
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-") ?? generatedId;
    // The visible hint/error text below was previously rendered with no programmatic link to the
    // input, so a screen-reader user never heard it (visual-only affordance). One description id
    // covers both, since only one of the two is ever rendered at a time.
    const descriptionId = error || hint ? `${inputId}-description` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={[descriptionId, ariaDescribedBy].filter(Boolean).join(" ") || undefined}
          className={`h-10 w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
            error
              ? "border-destructive focus:ring-destructive"
              : "border-border"
          } ${className}`}
          {...props}
        />
        {error && (
          <p id={descriptionId} className="text-sm text-destructive">{error}</p>
        )}
        {hint && !error && (
          <p id={descriptionId} className="text-sm text-muted-foreground">{hint}</p>
        )}
      </div>
    );
  }
);
