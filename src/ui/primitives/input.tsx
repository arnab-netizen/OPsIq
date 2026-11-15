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
    // The hint/error text previously had no programmatic description association with the input.
    // One description id covers both, since only one of the two is ever rendered at a time.
    //
    // The id is derived from `generatedId` (useId(), guaranteed unique per rendered instance),
    // never from `inputId` -- `inputId` falls back to a label-derived slug when no explicit `id`
    // prop is given, so two Inputs sharing a label with neither passing `id` (e.g. two "Complaints"
    // fields on different pages rendered in the same tree, or a future repeated-row form) would
    // otherwise collide on the same `${inputId}-description` id and each could end up describing
    // the wrong field, or two elements sharing one id (invalid HTML, ambiguous for assistive tech).
    const descriptionId = error || hint ? `${generatedId}-description` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {/* Required fields get a visible "*" via a pseudo-element, so the accessible name is unchanged. */}
        {label && (
          <label
            htmlFor={inputId}
            className={`text-sm font-medium text-foreground${props.required ? " after:ml-0.5 after:text-destructive after:content-['*']" : ""}`}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={[descriptionId, ariaDescribedBy].filter(Boolean).join(" ") || undefined}
          // Below the sm breakpoint: a 44px tap target and 16px text (smaller text makes iOS Safari zoom the page on focus).
          className={`h-11 w-full rounded-md border bg-background px-3 py-2 text-base transition-colors sm:h-10 sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
            error
              ? "border-destructive focus:ring-destructive"
              : "border-border"
          } ${className}`}
          aria-invalid={error ? true : undefined}
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
