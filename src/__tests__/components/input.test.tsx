/**
 * Input primitive — accessible hint/error association.
 *
 * `hint` and `error` were previously rendered as plain, visually-adjacent paragraphs with no
 * programmatic description association with the input. This locks in the `aria-describedby`
 * wiring added alongside the Sales/Operations hint-text pass, since that pass depends on it to
 * make the new hints accessible, and the fix applies to every Input call site, not just
 * Sales/Operations.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/ui/primitives/input";

describe("Input — hint/error accessible association", () => {
  it("associates a hint with its input via aria-describedby", () => {
    render(<Input label="Qualified leads" hint="Tracked as its own number." />);
    const input = screen.getByLabelText("Qualified leads");
    const describedById = input.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    const description = document.getElementById(describedById!);
    expect(description).toHaveTextContent("Tracked as its own number.");
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

  it("keeps each field's description id unique even when two inputs share the same label and neither passes an explicit id", () => {
    // inputId falls back to a label-derived slug when no `id` prop is given, so two Inputs with
    // the same label and no `id` would collide on that slug -- the description id must not be
    // derived from inputId for exactly this reason (see the comment in input.tsx). Querying by
    // label text would itself be ambiguous here, so this locates each input via the container.
    const { container } = render(
      <>
        <Input label="Complaints" hint="Sales-side complaints for this period." />
        <Input label="Complaints" hint="Operations-side complaints for this period." />
      </>
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs).toHaveLength(2);

    const describedById1 = inputs[0].getAttribute("aria-describedby");
    const describedById2 = inputs[1].getAttribute("aria-describedby");
    expect(describedById1).toBeTruthy();
    expect(describedById2).toBeTruthy();
    expect(describedById1).not.toBe(describedById2);

    expect(document.getElementById(describedById1!)).toHaveTextContent("Sales-side complaints for this period.");
    expect(document.getElementById(describedById2!)).toHaveTextContent("Operations-side complaints for this period.");
  });

  it("keeps aria-describedby valid and non-duplicated when a hint is replaced by an error on rerender", () => {
    const { rerender } = render(<Input label="Revenue" hint="Total revenue for this period." />);
    const input = screen.getByLabelText("Revenue");
    const hintDescribedById = input.getAttribute("aria-describedby");
    expect(hintDescribedById).toBeTruthy();
    expect(document.getElementById(hintDescribedById!)).toHaveTextContent("Total revenue for this period.");

    rerender(<Input label="Revenue" hint="Total revenue for this period." error="Value cannot be negative" />);
    const errorDescribedById = input.getAttribute("aria-describedby");
    expect(errorDescribedById).toBeTruthy();
    // useId() is stable across re-renders of the same component instance, so the id itself
    // should not change -- only the content and element it labels (p vs p) should.
    expect(errorDescribedById).toBe(hintDescribedById);
    expect(document.getElementById(errorDescribedById!)).toHaveTextContent("Value cannot be negative");
    // Exactly one node carries that id -- no orphaned hint paragraph left behind from the
    // previous render still holding the same id.
    expect(document.querySelectorAll(`#${errorDescribedById}`)).toHaveLength(1);
    expect(screen.queryByText("Total revenue for this period.")).not.toBeInTheDocument();

    // And the reverse transition: clearing the error should restore the hint under the same id.
    rerender(<Input label="Revenue" hint="Total revenue for this period." />);
    const restoredDescribedById = input.getAttribute("aria-describedby");
    expect(restoredDescribedById).toBe(hintDescribedById);
    expect(document.getElementById(restoredDescribedById!)).toHaveTextContent("Total revenue for this period.");
    expect(document.querySelectorAll(`#${restoredDescribedById}`)).toHaveLength(1);
  });
});
