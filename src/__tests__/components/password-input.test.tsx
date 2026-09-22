/**
 * PasswordInput (UX-06 Section P) — Show/Hide password behavior contract.
 *
 * Frozen behavior under test: defaults hidden, a type="button" toggle with a
 * dynamic accessible name ("Show password" / "Hide password"), the typed value
 * survives every toggle, and two instances on the same page keep independent
 * visibility state (no shared/module-level toggle flag).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { PasswordInput } from "@/ui/primitives/password-input";

afterEach(() => {
  cleanup();
});

describe("PasswordInput", () => {
  it("defaults to type=password", () => {
    render(<PasswordInput label="Password" />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("renders a Show password control with the exact accessible name", () => {
    render(<PasswordInput label="Password" />);
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("toggles type to text and the accessible name to Hide password on click", () => {
    render(<PasswordInput label="Password" />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show password" })).not.toBeInTheDocument();
  });

  it("returns to type=password and Show password on a second click", () => {
    render(<PasswordInput label="Password" />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("preserves the typed value across both toggles", () => {
    render(<PasswordInput label="Password" />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "correct-horse-battery-staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.value).toBe("correct-horse-battery-staple");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.value).toBe("correct-horse-battery-staple");
  });

  it("uses type=button on the toggle so it can never submit an enclosing form", () => {
    render(<PasswordInput label="Password" />);
    const toggle = screen.getByRole("button", { name: "Show password" }) as HTMLButtonElement;
    expect(toggle.type).toBe("button");
  });

  it("forwards autoComplete to the underlying input and preserves it across toggles", () => {
    render(<PasswordInput label="Password" autoComplete="new-password" />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.autocomplete).toBe("new-password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.autocomplete).toBe("new-password");
  });

  it("forwards the disabled prop to the underlying input", () => {
    render(<PasswordInput label="Password" disabled />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("maintains independent visibility state across two separate instances", () => {
    render(
      <>
        <PasswordInput label="New password" />
        <PasswordInput label="Confirm new password" />
      </>
    );
    const first = screen.getByLabelText("New password") as HTMLInputElement;
    const second = screen.getByLabelText("Confirm new password") as HTMLInputElement;

    fireEvent.click(screen.getAllByRole("button", { name: "Show password" })[0]!);

    expect(first.type).toBe("text");
    expect(second.type).toBe("password");
    expect(screen.getAllByRole("button", { name: "Show password" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Hide password" })).toHaveLength(1);
  });
});
