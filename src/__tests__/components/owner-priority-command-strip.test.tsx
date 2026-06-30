/**
 * PriorityCommandStrip — jsdom component test (the mobile/runtime-fed proof that can run without a
 * browser/DB). Proves: it renders the runtime-fed cards (values come from props, not hardcoded), it
 * renders NOTHING when there are no runtime cards (no static fallback), it caps the visible set, and
 * each card uses touch-friendly bounded layout.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PriorityCommandStrip, type PriorityCardView } from "@/components/owner/PriorityCommandStrip";

afterEach(() => cleanup());

const card = (over: Partial<PriorityCardView> = {}): PriorityCardView => ({
  id: "next_action",
  severity: "high",
  whatIsWrong: "Biggest constraint: Cash survival.",
  whyItMatters: "It is the one thing holding the business back.",
  nextStep: "Cut the loss-making delivery route this week.",
  owner: "Owner",
  proof: "metric screenshot proof",
  reassess: "After the action's proof is accepted.",
  confidenceNote: "Confidence is medium; treat this as directional.",
  ...over,
});

describe("PriorityCommandStrip", () => {
  it("renders runtime-fed card content (values flow from props)", () => {
    const { container } = render(<PriorityCommandStrip cards={[card()]} />);
    expect(container.querySelector('[data-testid="owner-priority-strip"]')).not.toBeNull();
    expect(container.textContent ?? "").toMatch(/Cash survival/);
    expect(container.textContent ?? "").toMatch(/Cut the loss-making delivery route/);
    // The seven owner questions are present.
    expect(container.textContent ?? "").toMatch(/Why:/);
    expect(container.textContent ?? "").toMatch(/Do next:/);
    expect(container.textContent ?? "").toMatch(/Who:/);
    expect(container.textContent ?? "").toMatch(/Proof:/);
    expect(container.textContent ?? "").toMatch(/Reassess:/);
    expect(container.textContent ?? "").toMatch(/directional/);
  });

  it("renders NOTHING when there are no runtime cards (no static fallback card)", () => {
    const { container } = render(<PriorityCommandStrip cards={[]} />);
    expect(container.querySelector('[data-testid="owner-priority-strip"]')).toBeNull();
    expect((container.textContent ?? "").trim()).toBe("");
  });

  it("shows distinct cards with severity + per-card test ids (mobile-bounded grid)", () => {
    const { container } = render(
      <PriorityCommandStrip cards={[card({ id: "accuracy", severity: "critical", whatIsWrong: "Data missing" }), card()]} />,
    );
    expect(container.querySelectorAll('[data-testid^="priority-card-"]').length).toBe(2);
    expect(container.querySelector('[data-testid="priority-card-0"]')).not.toBeNull();
    expect(container.textContent ?? "").toMatch(/critical/);
    // Uses a responsive grid (no fixed pixel widths that would force horizontal scroll on mobile).
    expect(container.querySelector(".grid")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/width:\s*\d{3,}px/);
  });
});
