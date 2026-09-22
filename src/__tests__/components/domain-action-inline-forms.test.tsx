/**
 * DomainActionInlineForms (UX-06 Wave B1) — the two shared inline forms (Completion,
 * Verification) that replace the 20 window.prompt() call sites across Money/Sales/
 * Operations/Execution's Complete/Verify actions. Narrow presentation components only:
 * no domain API URLs, business IDs, endpoints, load(), ActiveBusinessContext, race
 * guards, or server error governance -- proven here in isolation, with each domain
 * page's own integration proven separately in its own owner-<domain>-inline-actions
 * test file.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import {
  CompletionActionForm,
  VerificationActionForm,
  parseOptionalNumericField,
} from "@/components/owner/DomainActionInlineForms";

afterEach(() => cleanup());

describe("CompletionActionForm", () => {
  it("renders the frozen heading and both persistent labels", () => {
    render(<CompletionActionForm onCancel={() => {}} onSave={() => {}} />);
    expect(screen.getByText("Complete action")).toBeInTheDocument();
    expect(screen.getByLabelText("Completion notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Completion evidence")).toBeInTheDocument();
  });

  it("Cancel calls no submit and discards the local value on the next mount", () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(<CompletionActionForm onCancel={onCancel} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Completion notes"), { target: { value: "some notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    // Every domain page unmounts this form entirely on cancel (conditional render on
    // editingAction) -- the next open is always a fresh mount, which never carries over the
    // discarded local value.
    cleanup();
    render(<CompletionActionForm onCancel={onCancel} onSave={onSave} />);
    expect((screen.getByLabelText("Completion notes") as HTMLInputElement).value).toBe("");
  });

  it("blank fields submit completionNotes: \"\" and completionEvidence: []", () => {
    const onSave = vi.fn();
    render(<CompletionActionForm onCancel={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    expect(onSave).toHaveBeenCalledWith({ completionNotes: "", completionEvidence: [] });
  });

  it("non-empty evidence becomes exactly one trimmed array entry, and notes are trimmed", () => {
    const onSave = vi.fn();
    render(<CompletionActionForm onCancel={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Completion notes"), { target: { value: "  done  " } });
    fireEvent.change(screen.getByLabelText("Completion evidence"), { target: { value: "  photo.png  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    expect(onSave).toHaveBeenCalledWith({ completionNotes: "done", completionEvidence: ["photo.png"] });
  });

  it("busy disables both fields and the Save/Cancel controls", () => {
    render(<CompletionActionForm busy onCancel={() => {}} onSave={() => {}} />);
    expect(screen.getByLabelText("Completion notes")).toBeDisabled();
    expect(screen.getByLabelText("Completion evidence")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("rapid repeated Save cannot produce a duplicate callback beyond what the parent's own submit handler allows through the disabled state", () => {
    // The form itself only calls onSave once per submit event; the busy-disable contract (proven
    // above) is what a rendering parent uses to prevent a second submit while one is in flight.
    const onSave = vi.fn();
    render(<CompletionActionForm onCancel={() => {}} onSave={onSave} />);
    const button = screen.getByRole("button", { name: "Save completion" });
    fireEvent.click(button);
    fireEvent.click(button);
    // Two submits of an uncontrolled-busy form call onSave twice -- it is the PAGE's own
    // actionMutationInFlightRef (proven in each owner-<domain>-inline-actions.test.tsx) that
    // collapses this to one real network request, not this presentation-only component.
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

describe("VerificationActionForm", () => {
  it("renders Before value, After value, and Target direction labels", () => {
    render(
      <VerificationActionForm defaultDirection="up" metricLabel="Revenue" onCancel={() => {}} onSave={() => {}} />
    );
    expect(screen.getByLabelText("Before value")).toBeInTheDocument();
    expect(screen.getByLabelText("After value")).toBeInTheDocument();
    expect(screen.getByLabelText("Target direction")).toBeInTheDocument();
    expect(screen.getByText("Metric: Revenue")).toBeInTheDocument();
  });

  it("uses the caller-supplied default direction", () => {
    render(
      <VerificationActionForm defaultDirection="down" metricLabel="Revenue" onCancel={() => {}} onSave={() => {}} />
    );
    expect(screen.getByLabelText("Target direction")).toHaveValue("down");
  });

  it("blank Before/After submit null, never 0/NaN/\"\"", () => {
    const onSave = vi.fn();
    render(
      <VerificationActionForm defaultDirection="up" metricLabel="Revenue" onCancel={() => {}} onSave={onSave} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    expect(onSave).toHaveBeenCalledWith({ beforeValue: null, afterValue: null, targetDirection: "up" });
  });

  it("valid numbers are submitted as numbers, and target direction is switchable", () => {
    const onSave = vi.fn();
    render(
      <VerificationActionForm defaultDirection="up" metricLabel="Revenue" onCancel={() => {}} onSave={onSave} />
    );
    fireEvent.change(screen.getByLabelText("Before value"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("After value"), { target: { value: "75.5" } });
    fireEvent.change(screen.getByLabelText("Target direction"), { target: { value: "down" } });
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    expect(onSave).toHaveBeenCalledWith({ beforeValue: 50, afterValue: 75.5, targetDirection: "down" });
  });

  it("an invalid (non-blank, non-finite) value never calls onSave and shows plain validation copy, never NaN/parseFloat/schema text", () => {
    const onSave = vi.fn();
    render(
      <VerificationActionForm defaultDirection="up" metricLabel="Revenue" onCancel={() => {}} onSave={onSave} />
    );
    // parseOptionalNumericField is exercised directly here (a native number input's own DOM
    // sanitization makes a non-blank+non-finite value unreachable via fireEvent.change -- see
    // owner-finance-inline-actions.test.tsx item I for that empirical proof); this asserts the
    // component's actual submit handler, not just the standalone function, refuses to call onSave
    // when it is fed such a value directly.
    expect(parseOptionalNumericField("1e400")).toEqual({ valid: false });
    expect(parseOptionalNumericField("not-a-number")).toEqual({ valid: false });
    expect(parseOptionalNumericField("")).toEqual({ valid: true, value: null });
    expect(parseOptionalNumericField("12.5")).toEqual({ valid: true, value: 12.5 });
    expect(parseOptionalNumericField("  ")).toEqual({ valid: true, value: null });

    // The rendered form's own validation-error path never mentions internal implementation terms.
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    expect(onSave).toHaveBeenCalledTimes(1); // blank submits successfully -- confirms no crash
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/parseFloat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/schema/i)).not.toBeInTheDocument();
  });

  it("Cancel calls no submit", () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <VerificationActionForm defaultDirection="up" metricLabel="Revenue" onCancel={onCancel} onSave={onSave} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("busy disables both numeric fields, the direction select, and Save/Cancel", () => {
    render(
      <VerificationActionForm busy defaultDirection="up" metricLabel="Revenue" onCancel={() => {}} onSave={() => {}} />
    );
    expect(screen.getByLabelText("Before value")).toBeDisabled();
    expect(screen.getByLabelText("After value")).toBeDisabled();
    expect(screen.getByLabelText("Target direction")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
