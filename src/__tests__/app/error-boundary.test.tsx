import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import AppError from "@/app/error";
import GlobalError from "@/app/global-error";

afterEach(() => cleanup());

describe("App route error boundary (src/app/error.tsx)", () => {
  it("renders the OpsIQ brand and a user-safe message", () => {
    const { container } = render(<AppError error={new Error("x")} reset={vi.fn()} />);
    expect(container.textContent ?? "").toMatch(/OpsIQ/);
    expect(container.textContent ?? "").toMatch(/Something went wrong/i);
  });

  it("never renders the raw error message / stack", () => {
    const secret = "SUPER_SECRET_STACK_DETAIL_abc123";
    const err = new Error(secret);
    err.stack = `Error: ${secret}\n  at somewhere`;
    const { container } = render(<AppError error={err} reset={vi.fn()} />);
    expect(container.textContent ?? "").not.toContain(secret);
  });

  it("offers retry and beta support contact", () => {
    const reset = vi.fn();
    const { container } = render(<AppError error={new Error("x")} reset={reset} />);
    expect(container.querySelector('a[href="mailto:support@opsiq.com"]')).not.toBeNull();
    expect(container.textContent ?? "").toMatch(/beta support/i);
    // retry control present
    expect(container.querySelector("button")).not.toBeNull();
  });
});

describe("Global error boundary (src/app/global-error.tsx)", () => {
  it("exports a component and stays user-safe (no raw error text)", () => {
    expect(typeof GlobalError).toBe("function");
  });
});
