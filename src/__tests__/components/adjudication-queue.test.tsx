/**
 * AdjudicationQueue — jsdom component test (browser-free UI proof).
 *
 * Proves the owner can review proof-risk findings and decide: items render (reused/anti-gaming/
 * credibility/timing) with their supporting-proof count; a reason is required before submit; the
 * seven governed outcomes are offered; submitting delegates to onAdjudicate with the exact
 * sourceType/sourceRef/proofIds/outcome/reason payload; success + safe error render; and the UI shows
 * no fraud/theft/negligence label and no hidden staff score.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { AdjudicationQueue, type QueueItemView, type OutcomeOption } from "@/components/owner/AdjudicationQueue";

afterEach(() => cleanup());

const OUTCOMES: OutcomeOption[] = [
  { outcome: "DISMISS_FALSE_POSITIVE", label: "Dismiss — false positive", effect: "REDUCES_NOISE", note: "Clears these proofs." },
  { outcome: "ACCEPT_AS_VALID", label: "Accept as valid", effect: "REDUCES_NOISE", note: "Marks acceptable." },
  { outcome: "REQUIRE_FRESH_PROOF", label: "Require fresh proof", effect: "KEEPS_ACTIVE", note: "Keeps active." },
  { outcome: "CONFIRM_SUSPICIOUS_PATTERN", label: "Confirm — needs owner review", effect: "KEEPS_ACTIVE", note: "Keeps active." },
  { outcome: "ESCALATE_FOR_TRAINING", label: "Escalate for training", effect: "KEEPS_ACTIVE", note: "Routes to coaching." },
  { outcome: "ESCALATE_FOR_OWNER_REVIEW", label: "Escalate for owner review", effect: "KEEPS_ACTIVE", note: "Owner review." },
  { outcome: "MARK_INCONCLUSIVE_NEEDS_DATA", label: "Mark inconclusive — needs data", effect: "INCONCLUSIVE", note: "Not enough evidence." },
];

const item = (over: Partial<QueueItemView> = {}): QueueItemView => ({
  id: "REUSED_HASH_FINDING::REUSED_HASH:op-1", sourceType: "REUSED_HASH_FINDING", sourceRef: "REUSED_HASH:op-1",
  findingType: "REUSED_PROOF", title: "Possible reused proof", severity: "HIGH", sourceCompleteness: "COMPLETE",
  ownerExplanation: "The same proof appears on more than one job for this operator.", supportingProofCount: 3,
  representativeProofRefs: ["r1", "r2"], proofIds: ["r1", "r2", "r3"], actorId: "op-1", actorRole: "staff",
  recommendedAction: "Require a fresh proof or dismiss if legitimate.", missingData: [], currentAdjudicationStatus: null,
  adjudicable: true, ...over,
});

const ok = () => Promise.resolve({ ok: true, message: "Decision recorded (CLEARED)." });

describe("AdjudicationQueue component", () => {
  it("renders active reused-proof + anti-gaming + credibility + timing items with proof counts", () => {
    const { container, getAllByTestId } = render(
      <AdjudicationQueue
        outcomeOptions={OUTCOMES}
        onAdjudicate={ok}
        items={[
          item(),
          item({ id: "a", sourceType: "ANTI_GAMING_SIGNAL", sourceRef: "SELF_REVIEW_ATTEMPT:op-1", findingType: "SELF_REVIEW_ATTEMPT", title: "Self-review — separation of duty", supportingProofCount: 2 }),
          item({ id: "c", sourceType: "CREDIBILITY_CONCERN", sourceRef: "REVIEW_QUALITY_CONCERN:mgr", findingType: "REVIEW_QUALITY_CONCERN", title: "Review quality concern" }),
          item({ id: "t", sourceType: "ANTI_GAMING_SIGNAL", sourceRef: "SUSPICIOUS_FAST_COMPLETION:op-fast", findingType: "SUSPICIOUS_FAST_COMPLETION", title: "Timing concern — fast completion" }),
        ]}
      />
    );
    expect(getAllByTestId("adjudication-item").length).toBe(4);
    expect(container.textContent ?? "").toMatch(/Supporting proofs: 3/);
    expect(container.textContent ?? "").toMatch(/Self-review/);
    expect(container.textContent ?? "").toMatch(/Review quality concern/);
    expect(container.textContent ?? "").toMatch(/Timing concern/);
  });

  it("offers all seven governed outcomes", () => {
    const { container } = render(<AdjudicationQueue items={[item()]} outcomeOptions={OUTCOMES} onAdjudicate={ok} />);
    const select = container.querySelector('[data-testid="item-outcome-select"]') as HTMLSelectElement;
    // 7 outcomes + the placeholder option.
    expect(select.querySelectorAll("option").length).toBe(OUTCOMES.length + 1);
  });

  it("requires a reason before submit is enabled", () => {
    const { container } = render(<AdjudicationQueue items={[item()]} outcomeOptions={OUTCOMES} onAdjudicate={ok} />);
    const select = container.querySelector('[data-testid="item-outcome-select"]') as HTMLSelectElement;
    const submit = container.querySelector('[data-testid="item-submit"]') as HTMLButtonElement;
    fireEvent.change(select, { target: { value: "DISMISS_FALSE_POSITIVE" } });
    expect(submit.disabled).toBe(true); // no reason yet
    expect(container.querySelector('[data-testid="item-reason-required"]')).not.toBeNull();
    const reason = container.querySelector('[data-testid="item-reason"]') as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "Authorised solo shift." } });
    expect(submit.disabled).toBe(false);
  });

  it("submits DISMISS_FALSE_POSITIVE with the exact backend payload", async () => {
    const onAdjudicate = vi.fn(ok);
    const { container } = render(<AdjudicationQueue items={[item()]} outcomeOptions={OUTCOMES} onAdjudicate={onAdjudicate} />);
    fireEvent.change(container.querySelector('[data-testid="item-outcome-select"]') as HTMLSelectElement, { target: { value: "DISMISS_FALSE_POSITIVE" } });
    fireEvent.change(container.querySelector('[data-testid="item-reason"]') as HTMLTextAreaElement, { target: { value: "Legitimate reuse." } });
    fireEvent.click(container.querySelector('[data-testid="item-submit"]') as HTMLButtonElement);
    await waitFor(() => expect(onAdjudicate).toHaveBeenCalledTimes(1));
    const [passedItem, outcome, reason] = onAdjudicate.mock.calls[0];
    expect(passedItem.sourceType).toBe("REUSED_HASH_FINDING");
    expect(passedItem.sourceRef).toBe("REUSED_HASH:op-1");
    expect(passedItem.proofIds).toEqual(["r1", "r2", "r3"]);
    expect(outcome).toBe("DISMISS_FALSE_POSITIVE");
    expect(reason).toBe("Legitimate reuse.");
  });

  it("submits REQUIRE_FRESH_PROOF with the correct outcome", async () => {
    const onAdjudicate = vi.fn(ok);
    const { container } = render(<AdjudicationQueue items={[item()]} outcomeOptions={OUTCOMES} onAdjudicate={onAdjudicate} />);
    fireEvent.change(container.querySelector('[data-testid="item-outcome-select"]') as HTMLSelectElement, { target: { value: "REQUIRE_FRESH_PROOF" } });
    fireEvent.change(container.querySelector('[data-testid="item-reason"]') as HTMLTextAreaElement, { target: { value: "Need a fresh job-specific photo." } });
    fireEvent.click(container.querySelector('[data-testid="item-submit"]') as HTMLButtonElement);
    await waitFor(() => expect(onAdjudicate).toHaveBeenCalled());
    expect(onAdjudicate.mock.calls[0][1]).toBe("REQUIRE_FRESH_PROOF");
  });

  it("shows a success message after a successful decision", async () => {
    const { container } = render(<AdjudicationQueue items={[item()]} outcomeOptions={OUTCOMES} onAdjudicate={ok} />);
    fireEvent.change(container.querySelector('[data-testid="item-outcome-select"]') as HTMLSelectElement, { target: { value: "DISMISS_FALSE_POSITIVE" } });
    fireEvent.change(container.querySelector('[data-testid="item-reason"]') as HTMLTextAreaElement, { target: { value: "Legit reuse." } });
    fireEvent.click(container.querySelector('[data-testid="item-submit"]') as HTMLButtonElement);
    await waitFor(() => expect(container.querySelector('[data-testid="item-result"]')?.textContent).toMatch(/recorded/i));
  });

  it("shows a safe error when the backend rejects (no raw internal error)", async () => {
    const fail = () => Promise.resolve({ ok: false, message: "Could not complete the request (400)." });
    const { container } = render(<AdjudicationQueue items={[item()]} outcomeOptions={OUTCOMES} onAdjudicate={fail} />);
    fireEvent.change(container.querySelector('[data-testid="item-outcome-select"]') as HTMLSelectElement, { target: { value: "DISMISS_FALSE_POSITIVE" } });
    fireEvent.change(container.querySelector('[data-testid="item-reason"]') as HTMLTextAreaElement, { target: { value: "reasoning here" } });
    fireEvent.click(container.querySelector('[data-testid="item-submit"]') as HTMLButtonElement);
    await waitFor(() => expect(container.querySelector('[data-testid="item-result"]')?.textContent).toMatch(/Could not complete/));
    expect(container.textContent ?? "").not.toMatch(/stack|Prisma|undefined is not/i);
  });

  it("keeps a BLOCKED_BY_DATA item visible but not adjudicable", () => {
    const { container } = render(
      <AdjudicationQueue items={[item({ adjudicable: false, sourceCompleteness: "BLOCKED_BY_DATA", missingData: ["no persisted proof-level source"] })]} outcomeOptions={OUTCOMES} onAdjudicate={ok} />
    );
    expect(container.querySelector('[data-testid="item-not-adjudicable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="item-submit"]')).toBeNull(); // no submit control
  });

  it("shows no fraud/theft/negligence label on findings and no hidden staff score", () => {
    const { container, getAllByTestId } = render(
      <AdjudicationQueue
        outcomeOptions={OUTCOMES}
        onAdjudicate={ok}
        items={[item(), item({ id: "a", sourceType: "ANTI_GAMING_SIGNAL", sourceRef: "SELF_REVIEW_ATTEMPT:op-1", findingType: "SELF_REVIEW_ATTEMPT", title: "Self-review — separation of duty" })]}
      />
    );
    // The finding bodies themselves carry no accusatory label…
    for (const el of getAllByTestId("adjudication-item")) {
      expect(el.textContent ?? "").not.toMatch(/\b(fraud|theft|thief|negligent|negligence|stole|stealing|liar)\b/i);
    }
    // …no hidden staff score is surfaced…
    expect(container.textContent ?? "").not.toMatch(/score/i);
    // …and the standing fairness note (which explicitly negates those words) is present.
    expect(container.textContent ?? "").toMatch(/not a fraud, theft, or negligence accusation/i);
  });
});
