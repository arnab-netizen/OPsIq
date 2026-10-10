// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const api = vi.hoisted(() => ({
  createBusiness: vi.fn(),
  correct: vi.fn(),
  nextQuestion: vi.fn(),
  improve: vi.fn(),
  feedback: vi.fn(),
}));
vi.mock("@/lib/owner-first-run-client", () => ({
  firstRunApi: api,
  newIdempotencyKey: () => "test-key-0001",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { FirstRunBusinessStep } from "@/components/owner/first-run/FirstRunBusinessStep";
import { FirstMoneyReadCard } from "@/components/owner/first-run/FirstMoneyReadCard";
import { FirstResultCorrection } from "@/components/owner/first-run/FirstResultCorrection";
import { FirstResultImprovement } from "@/components/owner/first-run/FirstResultImprovement";
import { FirstValueFeedback } from "@/components/owner/first-run/FirstValueFeedback";
import { buildFirstMoneyRead, findOverclaims } from "@/domain/owner-first-run/first-money-read";

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("FirstRunBusinessStep — business name entered once", () => {
  it("shows the signup name, asks only type and currency, and posts without re-asking the name", async () => {
    api.createBusiness.mockResolvedValue({ business: { id: "b1", name: "Maple Street Laundry" }, replayed: false });
    const onCreated = vi.fn();
    render(<FirstRunBusinessStep suggestedName="Maple Street Laundry" onCreated={onCreated} />);
    expect(screen.getByTestId("first-run-business-name").textContent).toBe("Maple Street Laundry");
    expect(screen.queryByLabelText(/business name/i)).toBeNull(); // no name field unless the owner chooses to change it
    expect(screen.getByLabelText(/what kind of business/i)).toBeTruthy();
    expect(screen.getByLabelText(/which currency/i)).toBeTruthy();

    const submit = screen.getByTestId("first-run-business-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/what kind of business/i), { target: { value: "laundry_local_service" } });
    fireEvent.change(screen.getByLabelText(/which currency/i), { target: { value: "GBP" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(api.createBusiness).toHaveBeenCalledWith({ businessType: "laundry_local_service", currency: "GBP" });
  });

  it("lets the owner explicitly correct the display name", async () => {
    api.createBusiness.mockResolvedValue({ business: { id: "b1", name: "Maple St Ltd" }, replayed: false });
    render(<FirstRunBusinessStep suggestedName="Maple Street Laundry" onCreated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("first-run-rename"));
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Maple St Ltd" } });
    fireEvent.change(screen.getByLabelText(/what kind of business/i), { target: { value: "retail_storefront" } });
    fireEvent.change(screen.getByLabelText(/which currency/i), { target: { value: "USD" } });
    fireEvent.click(screen.getByTestId("first-run-business-submit"));
    await waitFor(() => expect(api.createBusiness).toHaveBeenCalled());
    expect(api.createBusiness).toHaveBeenCalledWith({ businessType: "retail_storefront", currency: "USD", name: "Maple St Ltd" });
  });

  it("a double click submits once", async () => {
    let resolve!: (v: unknown) => void;
    api.createBusiness.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<FirstRunBusinessStep suggestedName="Maple" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/what kind of business/i), { target: { value: "retail_storefront" } });
    fireEvent.change(screen.getByLabelText(/which currency/i), { target: { value: "USD" } });
    const btn = screen.getByTestId("first-run-business-submit");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(api.createBusiness).toHaveBeenCalledTimes(1);
    resolve({ business: { id: "b1", name: "Maple" }, replayed: false });
  });

  it("a failure keeps the form and gives a recovery path, not a dead end", async () => {
    api.createBusiness.mockRejectedValue(new Error("boom"));
    render(<FirstRunBusinessStep suggestedName="Maple" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/what kind of business/i), { target: { value: "retail_storefront" } });
    fireEvent.change(screen.getByLabelText(/which currency/i), { target: { value: "USD" } });
    fireEvent.click(screen.getByTestId("first-run-business-submit"));
    await waitFor(() => expect(screen.getByTestId("first-run-business-error")).toBeTruthy());
    expect(screen.getByTestId("first-run-business-error").textContent).toMatch(/nothing was lost/i);
    expect((screen.getByTestId("first-run-business-submit") as HTMLButtonElement).disabled).toBe(false);
  });
});

const read = buildFirstMoneyRead({
  finding: { title: "Cash covers about 12 days of costs", summary: "A late payment could stop you paying suppliers.", sourceMetric: "Cash days of costs", sourceValue: 12, evidence: ["Cash is small next to monthly costs"], missingData: [] },
  action: { title: "Chase overdue payments this week", description: "List unpaid invoices, contact the largest first.", ownerRole: "Owner", expectedTimeframeDays: 7, verificationMetric: "Cash in hand" },
  confidenceScore: 55,
  evidenceQuality: "ROUGH_ESTIMATE",
  missingEvidence: ["Receivables"],
});

describe("FirstMoneyReadCard", () => {
  const props = { read, stale: false, decisionState: null, busy: false, onAccept: vi.fn(), onCorrect: vi.fn(), onImprove: vi.fn() };
  it("answers the eleven first-value questions", () => {
    render(<FirstMoneyReadCard {...props} />);
    expect(screen.getByRole("heading", { name: "Your first Money read" })).toBeTruthy();
    expect(screen.getByTestId("first-money-read-scope").textContent).toMatch(/money figures only/);
    expect(screen.getByTestId("first-money-read-noticed").textContent).toBe("Cash covers about 12 days of costs");
    expect(screen.getByTestId("first-money-read-value").textContent).toBe("12");
    expect(screen.getByTestId("first-money-read-action").textContent).toMatch(/Chase overdue payments this week/);
    expect(screen.getByTestId("first-money-read-action").textContent).toMatch(/Owner: Owner · When: Within 7 days/);
    expect(screen.getByTestId("first-money-read-action").textContent).toMatch(/Watch: Cash in hand/);
    expect(screen.getByTestId("first-money-read-confidence").textContent).toMatch(/directional only/i);
    expect(screen.getByTestId("first-money-read-quality").textContent).toMatch(/A rough guess/);
    expect(screen.getByTestId("first-money-read-missing").textContent).toMatch(/Receivables/);
  });
  it("shows exactly three post-result paths and never overclaims", () => {
    const { container } = render(<FirstMoneyReadCard {...props} />);
    const buttons = screen.getByTestId("first-money-read-actions").querySelectorAll("button");
    expect([...buttons].map((b) => b.textContent)).toEqual(["Use this as my next move", "Something here is wrong", "Improve this recommendation"]);
    expect(findOverclaims([container.textContent ?? ""])).toEqual([]);
  });
  it("accepting is disabled while the read is stale, and the stale warning is shown", () => {
    render(<FirstMoneyReadCard {...props} stale />);
    expect((screen.getByTestId("first-run-accept") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("first-money-read-stale")).toBeTruthy();
  });
  it("after acceptance the primary path becomes a confirmation, with the other two still available", () => {
    render(<FirstMoneyReadCard {...props} decisionState="ACCEPTED" />);
    expect(screen.getByTestId("first-money-read-accepted")).toBeTruthy();
    expect(screen.queryByTestId("first-run-accept")).toBeNull();
    expect(screen.getByTestId("first-run-correct")).toBeTruthy();
    expect(screen.getByTestId("first-run-improve")).toBeTruthy();
  });
  it("calls the right handlers", () => {
    const h = { onAccept: vi.fn(), onCorrect: vi.fn(), onImprove: vi.fn() };
    render(<FirstMoneyReadCard {...props} {...h} />);
    fireEvent.click(screen.getByTestId("first-run-accept"));
    fireEvent.click(screen.getByTestId("first-run-correct"));
    fireEvent.click(screen.getByTestId("first-run-improve"));
    expect([h.onAccept, h.onCorrect, h.onImprove].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
  it("with nothing to act on, the accept path is unavailable rather than inventing an action", () => {
    const empty = buildFirstMoneyRead({ finding: null, action: null, confidenceScore: 80, evidenceQuality: "ACTUAL", missingEvidence: [] });
    render(<FirstMoneyReadCard {...props} read={empty} />);
    expect((screen.getByTestId("first-run-accept") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("first-money-read-action")).toBeNull();
  });
});

describe("FirstResultCorrection", () => {
  it("sends only what changed (blank = unchanged, 0 = a real zero), with the evidence quality", async () => {
    api.correct.mockResolvedValue({ changedFields: ["cashOnHand"] });
    const onDone = vi.fn();
    render(<FirstResultCorrection businessId="b1" snapshotId="s1" currency="GBP" onDone={onDone} onCancel={vi.fn()} />);
    const submit = screen.getByTestId("first-result-correction-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/cash in hand/i), { target: { value: "0" } });
    fireEvent.click(screen.getByLabelText("From my records"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.correct).toHaveBeenCalledWith({
      businessId: "b1",
      snapshotId: "s1",
      amendmentReason: expect.any(String),
      cashOnHand: 0,
      evidenceQuality: "ACTUAL",
    });
  });
  it("rejects negative or non-numeric text inline and does not submit", () => {
    render(<FirstResultCorrection businessId="b1" snapshotId="s1" currency="GBP" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash in hand/i), { target: { value: "-5" } });
    expect((screen.getByTestId("first-result-correction-submit") as HTMLButtonElement).disabled).toBe(true);
  });
  it("a failed correction says the earlier numbers are unchanged", async () => {
    api.correct.mockRejectedValue(new Error("nope"));
    render(<FirstResultCorrection businessId="b1" snapshotId="s1" currency="GBP" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/cash in hand/i), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("first-result-correction-submit"));
    await waitFor(() => expect(screen.getByTestId("first-result-correction-error").textContent).toMatch(/earlier numbers are unchanged/i));
  });
});

describe("FirstResultImprovement — progressive OBQ", () => {
  const question = (category: string) => ({
    result: { done: false, question: { category, label: "Fixed costs", request: "Fixed costs", why: "Fixed costs decide your break-even.", couldChange: "the break-even recommendation", effort: "low", effortLabel: "About a minute" } },
    inputHref: "/owner/finance",
    inputActionLabel: "Add snapshot",
  });
  it("records the request once, shows one explained question, and never repeats a skipped category", async () => {
    api.improve.mockResolvedValue({ replayed: false });
    api.nextQuestion.mockResolvedValueOnce(question("fixed_costs")).mockResolvedValueOnce({ result: { done: true, reason: "NOTHING_WORTH_ASKING" }, inputHref: null, inputActionLabel: null });
    render(<FirstResultImprovement businessId="b1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("first-result-improvement-question")).toBeTruthy());
    const q = screen.getByTestId("first-result-improvement-question").textContent ?? "";
    expect(q).toMatch(/break-even/);
    expect(q).toMatch(/It could change/);
    expect(q).toMatch(/About a minute/);
    expect(api.improve).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("first-result-improvement-skip"));
    await waitFor(() => expect(screen.getByTestId("first-result-improvement-done")).toBeTruthy());
    expect(api.nextQuestion).toHaveBeenLastCalledWith("b1", ["fixed_costs"], 0);
  });
  it("lets the owner continue later at any point", async () => {
    api.improve.mockResolvedValue({ replayed: false });
    api.nextQuestion.mockResolvedValue(question("fixed_costs"));
    const onClose = vi.fn();
    render(<FirstResultImprovement businessId="b1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId("first-result-improvement-later")).toBeTruthy());
    fireEvent.click(screen.getByTestId("first-result-improvement-later"));
    expect(onClose).toHaveBeenCalled();
  });
  it("a load failure offers a retry", async () => {
    api.improve.mockResolvedValue({ replayed: false });
    api.nextQuestion.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(question("fixed_costs"));
    render(<FirstResultImprovement businessId="b1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByTestId("first-result-improvement-question")).toBeTruthy());
  });
});

describe("FirstValueFeedback", () => {
  it("USEFUL sends immediately with no survey", async () => {
    api.feedback.mockResolvedValue({ replayed: false });
    render(<FirstValueFeedback businessId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Useful" }));
    await waitFor(() => expect(screen.getByTestId("first-value-feedback-thanks")).toBeTruthy());
    expect(api.feedback).toHaveBeenCalledWith({ businessId: "b1", rating: "USEFUL", idempotencyKey: "test-key-0001" });
  });
  it("partly/not useful offers one optional structured reason", async () => {
    api.feedback.mockResolvedValue({ replayed: false });
    render(<FirstValueFeedback businessId="b1" />);
    fireEvent.click(screen.getByRole("button", { name: "Partly useful" }));
    expect(screen.getByTestId("first-value-feedback-reasons").textContent).toMatch(/Wrong priority.*Missing information.*Recommendation impractical.*Explanation unclear.*Other/);
    fireEvent.click(screen.getByRole("button", { name: "Missing information" }));
    await waitFor(() => expect(api.feedback).toHaveBeenCalledWith({ businessId: "b1", rating: "PARTLY_USEFUL", reason: "MISSING_INFORMATION", idempotencyKey: "test-key-0001" }));
  });
});
