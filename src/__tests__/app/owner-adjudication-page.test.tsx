/**
 * Owner Adjudication page — jsdom integration test (browser-free).
 *
 * Stubs fetch to serve the server-built queue and asserts: the page loads the queue and renders items,
 * a link back to the Owner Now View exists (now-view integration), and submitting a decision POSTs to
 * the canonical /api/proof-risk/adjudicate route with the exact payload then refreshes the queue.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import OwnerAdjudicationPage from "@/app/(authenticated)/owner/adjudication/page";

const QUEUE_PAYLOAD = {
  items: [
    {
      id: "REUSED_HASH_FINDING::REUSED_HASH:op-1", sourceType: "REUSED_HASH_FINDING", sourceRef: "REUSED_HASH:op-1",
      findingType: "REUSED_PROOF", title: "Possible reused proof", severity: "HIGH", sourceCompleteness: "COMPLETE",
      ownerExplanation: "The same proof appears on more than one job for this operator.", supportingProofCount: 2,
      representativeProofRefs: ["r1", "r2"], proofIds: ["r1", "r2"], actorId: "op-1", actorRole: "staff",
      recommendedAction: "Require a fresh proof or dismiss if legitimate.", missingData: [], currentAdjudicationStatus: null, adjudicable: true,
    },
  ],
  summary: { totalItems: 1, adjudicableItems: 1, blockedByDataItems: 0, bySourceType: { REUSED_HASH_FINDING: 1 } },
  outcomeOptions: [
    { outcome: "DISMISS_FALSE_POSITIVE", label: "Dismiss — false positive", effect: "REDUCES_NOISE", note: "Clears these proofs." },
    { outcome: "REQUIRE_FRESH_PROOF", label: "Require fresh proof", effect: "KEEPS_ACTIVE", note: "Keeps active." },
  ],
  adjudicationSummary: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/owner/proof-risk/queue")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(QUEUE_PAYLOAD) } as Response);
    }
    if (url.includes("/api/proof-risk/adjudicate")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ adjudicationId: "adj-1", status: "CLEARED" }) } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OwnerAdjudicationPage", () => {
  it("loads the queue and renders a link back to the Owner Now View", async () => {
    const { container, findByTestId } = render(<OwnerAdjudicationPage />);
    await findByTestId("adjudication-queue");
    const back = container.querySelector('[data-testid="back-to-now"]') as HTMLAnchorElement;
    expect(back).not.toBeNull();
    expect(back.getAttribute("href")).toBe("/owner/now");
    expect(container.textContent ?? "").toMatch(/Possible reused proof/);
  });

  it("submits a decision to the canonical adjudicate route with the exact payload, then refreshes", async () => {
    const { container, findByTestId } = render(<OwnerAdjudicationPage />);
    await findByTestId("adjudication-queue");
    fireEvent.change(container.querySelector('[data-testid="item-outcome-select"]') as HTMLSelectElement, { target: { value: "DISMISS_FALSE_POSITIVE" } });
    fireEvent.change(container.querySelector('[data-testid="item-reason"]') as HTMLTextAreaElement, { target: { value: "Legitimate reuse for a VIP job." } });
    fireEvent.click(container.querySelector('[data-testid="item-submit"]') as HTMLButtonElement);

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/proof-risk/adjudicate"));
      expect(post).toBeTruthy();
    });
    const post = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/proof-risk/adjudicate"))!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      sourceType: "REUSED_HASH_FINDING",
      sourceRef: "REUSED_HASH:op-1",
      outcome: "DISMISS_FALSE_POSITIVE",
      reason: "Legitimate reuse for a VIP job.",
      proofIds: ["r1", "r2"],
      actorIds: ["op-1"],
      idempotencyKey: "REUSED_HASH_FINDING:REUSED_HASH:op-1:DISMISS_FALSE_POSITIVE",
    });
    // Success is shown and the queue is re-fetched (a second GET).
    await waitFor(() => expect(container.querySelector('[data-testid="item-result"]')?.textContent).toMatch(/recorded/i));
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/owner/proof-risk/queue")).length).toBeGreaterThanOrEqual(2);
  });

  it("shows a safe error (no raw internal detail) when the queue request fails", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response));
    const { findByTestId } = render(<OwnerAdjudicationPage />);
    const err = await findByTestId("queue-error");
    expect(err.textContent ?? "").toMatch(/not authorized/i);
    expect(err.textContent ?? "").not.toMatch(/stack|Prisma|undefined/i);
  });
});
