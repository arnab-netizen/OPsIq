"use client";

import { type SelectHTMLAttributes, forwardRef } from "react";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, error, hint, options, placeholder, className = "", id, ...props },
    ref
  ) {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {/* Required fields get a visible "*" via a pseudo-element, so the accessible name is unchanged. */}
        {label && (
          <label
            htmlFor={selectId}
            className={`text-sm font-medium text-foreground${props.required ? " after:ml-0.5 after:text-destructive after:content-['*']" : ""}`}
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`min-h-[44px] w-full rounded-md border bg-background px-3 py-2 text-base transition-colors sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
            error
              ? "border-destructive focus:ring-destructive"
              : "border-border"
          } ${className}`}
          aria-invalid={error ? true : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {hint && !error && (
          <p className="text-sm text-muted-foreground">{hint}</p>
        )}
      </div>
    );
  }
);
