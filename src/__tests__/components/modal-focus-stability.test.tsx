/**
 * Modal primitive (src/ui/primitives/modal.tsx) — focus-stability regression suite.
 *
 * Production bug: on the public "Request beta access" modal (BetaAccessCta), every
 * keystroke in a controlled `<input>` moved focus to the Close button and the input's
 * value collapsed to effectively the last keystroke. Root cause: Modal's own focus
 * effect depended on `[isOpen, onClose]`. `BetaAccessCta` passes an inline
 * `resetAndClose` function as `onClose`, which is a fresh closure on every render (not
 * memoized), and every keystroke into a controlled input re-renders the parent. That
 * gave the effect a new `onClose` reference on every keystroke, so React tore down and
 * re-ran it — including the "focus the dialog's first focusable element" step — on
 * every keystroke, throwing focus at the Close button (the first focusable element in
 * the dialog markup) instead of leaving it on the input.
 *
 * Fix: Modal now delegates focus/trap/escape/scroll-lock behavior to the shared
 * `useDialogA11y` hook (./use-dialog-a11y.ts), whose initial-focus effect depends only
 * on `isOpen` (plus the stable `containerRef`) -- not on `onClose` -- so it fires once
 * per open/close cycle regardless of how many times the parent re-renders while the
 * modal stays open.
 *
 * These tests exercise the shared `Modal` component directly, with a harness that
 * reproduces the exact conditions that triggered the bug: a controlled input plus an
 * inline (freshly-created-every-render) `onClose` callback, matching BetaAccessCta's
 * actual pattern. Modal-consumer-specific behavior (BetaAccessCta's own submit/success/
 * error flow) is covered separately in BetaAccessCta.test.tsx.
 *
 * jsdom-only: no native Tab traversal, so the trap moves focus programmatically on
 * Tab/Shift+Tab (same approach as app-shell-mobile-drawer.test.tsx). A true
 * mobile-viewport variant is not exercised here -- Modal's focus/trap logic has no
 * viewport-dependent branch (no matchMedia / window.innerWidth check anywhere in
 * modal.tsx or use-dialog-a11y.ts), so the jsdom-width-independent coverage below is
 * representative of mobile width too; this is noted rather than assumed silently.
 */
import { useRef, useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { Modal } from "@/ui/primitives/modal";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

/**
 * Reproduces BetaAccessCta's exact shape: a controlled input whose `onChange` updates
 * parent state (forcing a re-render on every keystroke), and an `onClose` prop that is
 * a *new inline closure every render* -- not wrapped in useCallback -- exactly like
 * BetaAccessCta's `resetAndClose`.
 */
function ControlledModalHarness({ onCloseCount }: { onCloseCount?: (n: number) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [unrelated, setUnrelated] = useState(0);
  // A ref, not a plain local, so incrementing it across calls doesn't mutate render-scoped
  // state outside React's render/commit lifecycle (refs are the sanctioned escape hatch for
  // exactly this "persists across renders, doesn't affect output" counter shape).
  const closeCallsRef = useRef(0);

  // Deliberately NOT useCallback-wrapped: a fresh function identity every render,
  // matching the real `resetAndClose` in BetaAccessCta.tsx.
  function closeModal() {
    closeCallsRef.current += 1;
    onCloseCount?.(closeCallsRef.current);
    setIsOpen(false);
    setEmail("");
    setFirstName("");
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open
      </button>
      <Modal isOpen={isOpen} onClose={closeModal} title="Test modal">
        <label htmlFor="harness-email">Email</label>
        <input id="harness-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="harness-first-name">First name</label>
        <input
          id="harness-first-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <button type="button" onClick={() => setUnrelated((n) => n + 1)}>
          Trigger unrelated rerender
        </button>
        <span data-testid="unrelated-count">{unrelated}</span>
      </Modal>
    </>
  );
}

function openHarness() {
  render(<ControlledModalHarness />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  return screen.getByLabelText("Email") as HTMLInputElement;
}

/** Types a string one character at a time via discrete fireEvent.change calls, each of
 * which drives a full React re-render with a fresh `onClose` closure -- the same
 * mechanism a real keystroke-by-keystroke typing session drives in the browser. */
function typeCharByChar(input: HTMLInputElement, text: string) {
  let value = "";
  for (const ch of text) {
    value += ch;
    fireEvent.change(input, { target: { value } });
  }
}

describe("Modal focus stability (controlled-input regression)", () => {
  it("preserves the full typed value across multiple keystrokes in a controlled input", () => {
    const input = openHarness();
    typeCharByChar(input, "person@example.com");
    expect(input.value).toBe("person@example.com");
  });

  it("keeps document.activeElement on the input (not the Close button) after each keystroke", () => {
    const input = openHarness();
    input.focus();
    expect(document.activeElement).toBe(input);

    for (const ch of "abc") {
      fireEvent.change(input, { target: { value: input.value + ch } });
      expect(document.activeElement).toBe(input);
      expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Close" }));
    }
  });

  it("preserves the full typed value and focus for a second controlled field (first name) too", () => {
    render(<ControlledModalHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const firstName = screen.getByLabelText("First name") as HTMLInputElement;
    firstName.focus();
    typeCharByChar(firstName, "Ada");

    expect(firstName.value).toBe("Ada");
    expect(document.activeElement).toBe(firstName);
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("a rerender while the modal is open (unrelated state change) does not refocus Close", () => {
    const input = openHarness();
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.click(screen.getByRole("button", { name: "Trigger unrelated rerender" }));
    fireEvent.click(screen.getByRole("button", { name: "Trigger unrelated rerender" }));

    expect(document.activeElement).toBe(input);
  });

  it("initial focus on open still lands on the dialog's first focusable element (Close)", () => {
    render(<ControlledModalHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("Tab from the last focusable element wraps to the first, staying inside the dialog", () => {
    render(<ControlledModalHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Test modal" });
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])"),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab from the first focusable element wraps to the last, staying inside the dialog", () => {
    render(<ControlledModalHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Test modal" });
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])"),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("Escape closes the modal", () => {
    render(<ControlledModalHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape after typing (fresh onClose identity) still closes and calls the latest onClose", () => {
    let calls = 0;
    render(<ControlledModalHarness onCloseCount={(n) => (calls = n)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const input = screen.getByLabelText("Email") as HTMLInputElement;
    typeCharByChar(input, "ab");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls).toBe(1);
  });

  it("restores focus to the trigger element after close", () => {
    render(<ControlledModalHarness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    // jsdom's fireEvent.click does not itself move focus the way a real browser click
    // does, so focus the trigger explicitly first -- this is what "had focus when the
    // modal opened" means, and it's exactly the state a real click leaves behind.
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });

  it("clicking the overlay closes the modal", () => {
    render(<ControlledModalHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement!;
    fireEvent.click(overlay);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("locks background scroll while open and releases it on close", () => {
    render(<ControlledModalHarness />);
    expect(document.body.style.overflow).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });
});
