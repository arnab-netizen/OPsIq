/**
 * Input primitive — accessible hint/error association.
 *
 * `hint` and `error` were previously rendered as plain, visually-adjacent paragraphs with no
 * programmatic link to the input, so a screen-reader user landing on the field never heard them
 * (a sighted-only affordance). This locks in the `aria-describedby` wiring added alongside the
 * Sales/Operations hint-text pass, since that pass depends on it to make the new hints
 * accessible, and the fix applies to every Input call site, not just Sales/Operations.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/ui/primitives/input";

describe("Input — hint/error accessible association", () => {
  it("associates a hint with its input via aria-describedby", () => {
    render(<Input label="Qualified leads" hint="A subset of the leads above." />);
    const input = screen.getByLabelText("Qualified leads");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const description = document.getElementById(describedById!);
    expect(description).toHaveTextContent("A subset of the leads above.");
  });

  it("associates an error with its input via aria-describedby", () => {
    render(<Input label="Revenue" error="Value cannot be negative" />);
    const input = screen.getByLabelText("Revenue");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const description = document.getElementById(describedById!);
    expect(description).toHaveTextContent("Value cannot be negative");
  });

  it("prefers the error over the hint when both are supplied, without a duplicate announcement", () => {
    render(<Input label="Revenue" hint="Total revenue for this period." error="Value cannot be negative" />);
    const input = screen.getByLabelText("Revenue");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    // Only one description node should exist for this input -- the hint is suppressed while an
    // error is present, so there is exactly one id for aria-describedby to point at.
    expect(document.querySelectorAll(`#${describedById}`)).toHaveLength(1);
    expect(document.getElementById(describedById!)).toHaveTextContent("Value cannot be negative");
    expect(screen.queryByText("Total revenue for this period.")).not.toBeInTheDocument();
  });

  it("has no aria-describedby when neither hint nor error is supplied", () => {
    render(<Input label="Orders" />);
    const input = screen.getByLabelText("Orders");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("merges a caller-supplied aria-describedby with the generated description id", () => {
    render(<Input label="Orders" hint="Completed orders in this period." aria-describedby="external-note" />);
    const input = screen.getByLabelText("Orders");
    const describedBy = input.getAttribute("aria-describedby")!;
    expect(describedBy.split(" ")).toContain("external-note");
  });
});
