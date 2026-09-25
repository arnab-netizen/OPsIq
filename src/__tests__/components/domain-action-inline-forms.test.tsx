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
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("non-empty evidence becomes exactly one array entry, and whitespace is preserved verbatim (never trimmed)", () => {
    // The old window.prompt()-based flow this replaces preserved whatever the owner typed exactly
    // (`window.prompt("Completion notes:") || ""`; evidence was `ev ? [ev] : []` on the raw,
    // untrimmed string) -- the frozen contract (UX-06 Section Z) requires the same payload
    // semantics for a valid submission, so this form must not introduce trimming.
    const onSave = vi.fn();
    render(<CompletionActionForm onCancel={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Completion notes"), { target: { value: "  done  " } });
    fireEvent.change(screen.getByLabelText("Completion evidence"), { target: { value: "  photo.png  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
    expect(onSave).toHaveBeenCalledWith({ completionNotes: "  done  ", completionEvidence: ["  photo.png  "] });
  });

  it("busy disables both fields and the Save/Cancel controls", () => {
    render(<CompletionActionForm busy onCancel={() => {}} onSave={() => {}} />);
    expect(screen.getByLabelText("Completion notes")).toBeDisabled();
    expect(screen.getByLabelText("Completion evidence")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("in isolation (not busy), two rapid clicks call onSave twice -- this component does NOT itself prevent duplicate submission", () => {
    // This test does not prove duplicate-submit prevention; it proves the opposite baseline: an
    // uncontrolled-busy form calls onSave once per click, so two rapid clicks call it twice. Real
    // duplicate-submit prevention has two layers, neither of which this isolated render exercises:
    // (1) the `busy` prop disables the Save button once a submit is in flight (proven above), and
    // (2) each domain page's own synchronous actionMutationInFlightRef collapses this to exactly
    // one real network request even if a second click somehow lands before disabling paints --
    // proven as an actual integration assertion of `toHaveLength(1)` on the mocked network layer
    // in every owner-<domain>-inline-actions.test.tsx (Test M).
    const onSave = vi.fn();
    render(<CompletionActionForm onCancel={() => {}} onSave={onSave} />);
    const button = screen.getByRole("button", { name: "Save completion" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("accepts an optional formId that becomes the <form> element's own id, and gives the form an accessible name tied to its visible heading", () => {
    const { container } = render(
      <CompletionActionForm formId="my-complete-form" onCancel={() => {}} onSave={() => {}} />
    );
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("id", "my-complete-form");
    const heading = screen.getByText("Complete action");
    expect(form).toHaveAttribute("aria-labelledby", heading.id);
    expect(heading.id).not.toBe("");
  });

  it("two simultaneously mounted instances never share the same heading id -- no duplicate IDs even without a caller-supplied formId", () => {
    const { container } = render(
      <>
        <CompletionActionForm onCancel={() => {}} onSave={() => {}} />
        <CompletionActionForm onCancel={() => {}} onSave={() => {}} />
      </>
    );
    const headings = container.querySelectorAll("h4");
    expect(headings).toHaveLength(2);
    const [firstId, secondId] = [headings[0]!.id, headings[1]!.id];
    expect(firstId).not.toBe("");
    expect(secondId).not.toBe("");
    expect(firstId).not.toBe(secondId);
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

  it("blank Before/After submit null, never 0/NaN/\"\" (blank Before = use the measured baseline)", async () => {
    const onSave = vi.fn();
    render(
      <VerificationActionForm defaultDirection="up" metricLabel="Revenue" measuredBaseline={1200} onCancel={() => {}} onSave={onSave} />
    );
    expect(screen.getByText(/Measured by the diagnosis: 1200/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ beforeValue: null, afterValue: null, targetDirection: "up" }));
  });

  it("without a measured baseline the Before value is required: blank is blocked inline, never sent", async () => {
    const onSave = vi.fn();
    render(
      <VerificationActionForm defaultDirection="up" metricLabel="Revenue" onCancel={() => {}} onSave={onSave} />
    );
    expect(screen.getByLabelText("Before value")).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    expect(await screen.findByText(/Enter the before value/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a server error resolved by onSave is shown inside the form", async () => {
    render(
      <VerificationActionForm
        defaultDirection="up"
        metricLabel="Revenue"
        measuredBaseline={5}
        onCancel={() => {}}
        onSave={() => Promise.resolve("Start this action before recording its outcome.")}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Save verification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Start this action before recording its outcome.");
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

  it("parseOptionalNumericField's own invalid branch is correct by direct call; a blank rendered submit succeeds with no crash", () => {
    // This test does NOT exercise the rendered form's invalid-submit path -- real Chromium makes
    // that path unreachable via normal typing, by two distinct mechanisms documented on
    // parseOptionalNumericField's own doc comment: (1) DOM value sanitization clears an
    // unparseable entry back to "" the instant it's typed -- jsdom reproduces this one via
    // fireEvent.change -- and (2), confirmed separately via real Chromium keyboard input (not
    // reproducible in jsdom), Chromium's own native constraint validation blocks the "submit"
    // event itself for a badInput field, via either a real click or a real Enter keypress, before
    // this component's onSubmit ever runs. Because jsdom does not compute `validity.badInput` from
    // a value assigned via fireEvent.change, mechanism (2) cannot be driven through the rendered
    // form here -- this proves the pure function directly instead.
    const onSave = vi.fn();
    render(
      <VerificationActionForm defaultDirection="up" metricLabel="Revenue" measuredBaseline={1} onCancel={() => {}} onSave={onSave} />
    );
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

  it("accepts an optional formId that becomes the <form> element's own id, and gives the form an accessible name tied to its visible heading", () => {
    const { container } = render(
      <VerificationActionForm
        formId="my-verify-form"
        defaultDirection="up"
        metricLabel="Revenue"
        onCancel={() => {}}
        onSave={() => {}}
      />
    );
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("id", "my-verify-form");
    const heading = screen.getByText("Verify outcome");
    expect(form).toHaveAttribute("aria-labelledby", heading.id);
    expect(heading.id).not.toBe("");
  });

  it("two simultaneously mounted instances never share the same heading id -- no duplicate IDs even without a caller-supplied formId", () => {
    const { container } = render(
      <>
        <VerificationActionForm defaultDirection="up" metricLabel="Revenue" onCancel={() => {}} onSave={() => {}} />
        <VerificationActionForm defaultDirection="down" metricLabel="Orders" onCancel={() => {}} onSave={() => {}} />
      </>
    );
    const headings = container.querySelectorAll("h4");
    expect(headings).toHaveLength(2);
    const [firstId, secondId] = [headings[0]!.id, headings[1]!.id];
    expect(firstId).not.toBe("");
    expect(secondId).not.toBe("");
    expect(firstId).not.toBe(secondId);
  });
});
